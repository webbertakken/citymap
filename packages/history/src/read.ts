import { spawn } from "node:child_process";
import { once } from "node:events";
import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { CitymapError, MAX_PATH_BYTES, compareKeys, type FileEntry, type Snapshot } from "@citymap/ground-plan";
import { countCommits, resolveCommit } from "./ancestry";
import { BlobReader } from "./blobs";
import { gitEnvironment } from "./env";
import type { FileHistory } from "./file-history";
import { emailOf, readMailmap, type Author, type Mailmap, type MailmapRead } from "./mailmap";
import { foldSchedule, isLaid, laidCount, type Strides } from "./schedule";
import { GITLINK_MODE, Pins, SubmoduleReader, type SubmoduleRead, type SubmoduleUnavailable } from "./submodules";
import { Workspaces, type ManifestUnavailable } from "./workspaces";

/** One changed path of a commit, from git's raw diff against the first parent. */
interface RawEntry {
  readonly mode: string;
  readonly blob: string;
  readonly status: string;
  readonly path: string;
}

/** One first-parent commit: its id, its committer time (epoch seconds), its author as written, and its changes. */
export interface RawCommit {
  readonly sha: string;
  readonly time: number;
  readonly author: Author;
  readonly entries: readonly RawEntry[];
}

/** The fold schedule a read follows: the history's length, its zone boundaries, the first index and how many it lays. */
export interface ScheduleChosen {
  readonly code: "history/schedule";
  readonly detail: {
    readonly commits: number;
    readonly coarse: number;
    readonly tail: number;
    readonly from: number;
    readonly laid: number;
  };
}

export type HistoryEvent = SubmoduleUnavailable | SubmoduleRead | ManifestUnavailable | MailmapRead | ScheduleChosen;

/**
 * A commit's header, "<sha>\x02<time>\x02<email>\x02<name>" after its \x01 mark: the name is the rest, so one holding a
 * \x02 stays whole; a time that is no number reads 0.
 */
function headerOf(token: string): { sha: string; time: number; author: Author; entries: RawEntry[] } {
  const [sha = "", time = "", email = "", ...name] = token.slice(1).split("\u0002");
  const seconds = /^\d+$/.test(time) ? Number(time) : 0;
  return {
    sha,
    time: Number.isSafeInteger(seconds) ? seconds : 0,
    author: { name: name.join("\u0002"), email },
    entries: [],
  };
}

/** Parses git's `log --raw -z` tokens (split at NUL) into commits. */
export function* parseRawLog(tokens: Iterable<string>): Generator<RawCommit> {
  let current: { sha: string; time: number; author: Author; entries: RawEntry[] } | null = null;
  let meta: string | null = null;
  for (const raw of tokens) {
    const token = raw.startsWith("\n") ? raw.slice(1) : raw;
    if (token.startsWith("\u0001")) {
      if (current) yield current;
      current = headerOf(token);
      continue;
    }
    if (token === "") continue;
    if (!current)
      throw new CitymapError("history/parse", "the log does not start with a commit", { token: token.slice(0, 80) });
    if (meta === null) {
      meta = token;
      continue;
    }
    // ":<old mode> <new mode> <old blob> <new blob> <status>", then the path.
    const [, newMode = "", , newBlob = "", status = ""] = meta.slice(1).split(" ");
    current.entries.push({ mode: newMode, blob: newBlob, status, path: token });
    meta = null;
  }
  if (current) yield current;
}

interface Live {
  blob: string;
  identity: string;
  firstSeen: number;
}

const encoder = new TextEncoder();
const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/**
 * Applies one commit to the tree state: deletions, exact renames (equal blobs, paired in path order), additions. True
 * when the set of files changed; a commit that only edits files leaves it as it was. Gitlinks go to `gitlinks`: a
 * submodule's files arrive when its pin is expanded.
 */
function apply(
  state: Map<string, Live>,
  folders: Map<string, number>,
  workspaces: Workspaces,
  gitlinks: Map<string, string>,
  commit: RawCommit,
  index: number,
): boolean {
  const deleted = new Map<string, Live[]>();
  const added: RawEntry[] = [];
  const remove = (path: string) => {
    const live = state.get(path);
    if (!live) return;
    state.delete(path);
    workspaces.remove(path);
    const list = deleted.get(live.blob) ?? [];
    list.push(live);
    deleted.set(live.blob, list);
  };
  for (const entry of commit.entries) {
    workspaces.touch(entry.path, entry.status === "D" ? null : entry.blob);
    if (entry.status === "D") {
      if (!gitlinks.delete(entry.path)) remove(entry.path);
    } else if (entry.mode === GITLINK_MODE) {
      // A file that becomes a gitlink leaves the tree; the gitlink's pin moves.
      remove(entry.path);
      gitlinks.set(entry.path, entry.blob);
    } else {
      // A path the tree does not hold arrives (a birth, or a gitlink turned file); one it holds keeps its identity.
      gitlinks.delete(entry.path);
      const live = state.get(entry.path);
      if (live) live.blob = entry.blob;
      else added.push(entry);
    }
  }
  for (const entry of added.toSorted((a, b) => compareKeys(a.path, b.path))) {
    // A path the engine cannot hold ends the read, by name: its length bounds every folder walk and the work with it.
    if (entry.path.length * 3 > MAX_PATH_BYTES && encoder.encode(entry.path).length > MAX_PATH_BYTES)
      throw new CitymapError("snapshot/bad-path", `a path is longer than ${MAX_PATH_BYTES} bytes`, {
        index,
        start: entry.path.slice(0, 80),
      });
    const moved = deleted.get(entry.blob)?.shift();
    workspaces.add(entry.path);
    state.set(
      entry.path,
      moved
        ? { ...moved, blob: entry.blob }
        : { blob: entry.blob, identity: `${entry.path}@${index}`, firstSeen: index },
    );
    for (let folder = folderOf(entry.path); !folders.has(folder); folder = folderOf(folder)) {
      folders.set(folder, index);
      if (folder === "") break;
    }
  }
  return deleted.size > 0 || added.length > 0;
}

/** The files of the tree state, sorted, as the snapshot holds them. */
const filesOf = (state: Map<string, Live>): FileEntry[] =>
  [...state]
    .toSorted(([a], [b]) => compareKeys(a, b))
    .map(([path, live]) => ({ path, identity: live.identity, firstSeen: live.firstSeen }));

function snapshotOf(
  repository: string,
  sha: string,
  index: number,
  files: readonly FileEntry[],
  folders: ReadonlyMap<string, number>,
  workspaces: readonly string[] | undefined,
  submodules: readonly string[],
): Snapshot {
  return {
    repository,
    commit: sha,
    index,
    files,
    folderFirstSeen: folders,
    ...(workspaces === undefined ? {} : { workspaces }),
    ...(submodules.length === 0 ? {} : { submodules }),
  };
}

export interface ReadOptions {
  /** The commit to read up to; HEAD by default. */
  readonly to?: string;
  /**
   * A resume: the first index to yield, laid whatever the schedule; earlier commits still apply to the tree, but build no
   * snapshot, and later ones follow the schedule.
   */
  readonly from?: number;
  /** The fold schedule's strides; `FOLD_STRIDES` by default (tests and measurements choose others). */
  readonly strides?: Strides;
  /** The repository's display name; the folder name by default. */
  readonly repository?: string;
  readonly onEvent?: (event: HistoryEvent) => void;
  /** Hears every commit's changes, by identity, for the files' own measures. */
  readonly fileHistory?: FileHistory;
}

/**
 * Records a commit's changes to the files it leaves live, after it is applied, by the identities they carry, under the
 * email the mailmap gives its author.
 */
function recordChanges(history: FileHistory, mailmap: Mailmap, state: ReadonlyMap<string, Live>, commit: RawCommit) {
  const email = emailOf(mailmap, commit.author);
  for (const entry of commit.entries) {
    if (entry.status === "D" || entry.mode === GITLINK_MODE) continue;
    // Applying the commit made every such path live.
    history.record(state.get(entry.path)!.identity, commit.time, email);
  }
}

/**
 * Streams a repository's first-parent history, oldest first, as one snapshot per commit the fold schedule lays; every
 * commit applies to the tree. Reads no file contents but the root workspace manifests.
 */
export async function* readHistory(repoDir: string, options: ReadOptions = {}): AsyncGenerator<Snapshot> {
  const dir = resolve(repoDir);
  let isDirectory = false;
  try {
    isDirectory = statSync(dir).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) throw new CitymapError("history/not-a-repo", `${dir} is not a directory`, { dir });
  const repository = options.repository ?? basename(dir);
  const onEvent = options.onEvent ?? (() => {});
  const from = options.from;
  // The count and the log walk the same commit, even when the ref moves between them.
  const head = await resolveCommit(dir, options.to ?? "HEAD");
  const schedule = foldSchedule(await countCommits(dir, head), options.strides);
  const laid = (at: number) => isLaid(schedule, at, from);
  // Pins are expanded where the uninterrupted fold lays, whatever the resume, so births carry the same indices.
  const expandsAt = (at: number) => isLaid(schedule, at) || at === from;
  onEvent({
    code: "history/schedule",
    detail: {
      commits: schedule.commits,
      coarse: schedule.coarseEnd,
      tail: schedule.tailStart,
      from: from ?? 0,
      laid: laidCount(schedule, from),
    },
  });
  const blobs = new BlobReader(dir);
  // The target's own .mailmap names the people, so the history alone decides who they are. Read before the log starts:
  // a listing that fails leaves no process behind, as it fails before any blob is asked for.
  let mailmap: Mailmap = new Map();
  if (options.fileHistory) {
    const read = await readMailmap(dir, head, blobs);
    onEvent(read.event);
    mailmap = read.mailmap;
    if (read.event.detail.status === "unfetchable") options.fileHistory.forgetAuthors();
  }
  const child = spawn(
    "git",
    [
      "-c",
      "core.quotepath=off",
      "-c",
      "core.hooksPath=/dev/null",
      "-C",
      dir,
      "log",
      "--first-parent",
      "--reverse",
      "--diff-merges=first-parent",
      "--raw",
      "-z",
      "--no-renames",
      "--no-abbrev",
      // The author as written: %aE would map it through the working tree's .mailmap.
      "--format=%x01%H%x02%ct%x02%ae%x02%an",
      head,
      "--",
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: gitEnvironment() },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (text: string) => {
    stderr += text;
  });
  // A git killed by a signal closes with a null code, which fails the check below as it should.
  const closed = once(child, "close");
  const state = new Map<string, Live>();
  const folders = new Map<string, number>();
  const workspaces = new Workspaces();
  const pins = new Pins(new SubmoduleReader(dir));
  let index = 0;
  // The files and folders as last handed over: a commit that leaves the file set as it was hands over the same ones, so
  // what the layout derives from them can be kept (snapshots are immutable; nothing mutates these).
  let files: readonly FileEntry[] | null = null;
  let folderMap: ReadonlyMap<string, number> | null = null;
  const decoder = new TextDecoder();
  let rest = "";
  // Commits are complete once the next header arrives; buffer tokens and hand over each finished commit.
  let pending: string[] = [];
  const flush = async function* (final: boolean): AsyncGenerator<Snapshot> {
    const cut = final ? pending.length : pending.findLastIndex((t) => t.replace(/^\n/, "").startsWith("\u0001"));
    if (cut <= 0) return;
    const commits = [...parseRawLog(pending.slice(0, cut))];
    // The manifests these commits need, read in one pass before their snapshots are built.
    const wanted = await blobs.readAll(workspaces.wanted(commits, index, laid));
    // A manifest blob it cannot read sends it back through that manifest's older blobs, read in one more pass.
    const older = await blobs.readAll(workspaces.fallbacks(commits, index, laid, wanted));
    const texts = new Map([...wanted, ...older]);
    // The pins these commits expand, read in parallel before their snapshots are built.
    const names = state.get(".gitmodules")?.blob ?? null;
    await pins.prepare(commits, index, expandsAt, names, (b) => blobs.readAll(b));
    for (const commit of commits) {
      if (apply(state, folders, workspaces, pins.gitlinks, commit, index)) [files, folderMap] = [null, null];
      // The commit's own changes, recorded before its pins expand: a submodule's files carry no history of their own.
      if (options.fileHistory) recordChanges(options.fileHistory, mailmap, state, commit);
      const entries = expandsAt(index) ? pins.move(index, state.get(".gitmodules")?.blob ?? null, onEvent) : null;
      if (entries && apply(state, folders, workspaces, pins.gitlinks, { ...commit, entries }, index))
        [files, folderMap] = [null, null];
      if (laid(index)) {
        files ??= filesOf(state);
        folderMap ??= new Map(folders);
        const declared = workspaces.resolve(texts, index, onEvent);
        yield snapshotOf(repository, commit.sha, index, files, folderMap, declared, pins.submodules);
      }
      index++;
    }
    pending = pending.slice(cut);
  };
  try {
    for await (const chunk of child.stdout as AsyncIterable<Uint8Array>) {
      const text = rest + decoder.decode(chunk, { stream: true });
      const parts = text.split("\u0000");
      rest = parts.pop()!;
      pending.push(...parts);
      yield* flush(false);
    }
    pending.push(rest);
    const [code]: unknown[] = await closed;
    if (code !== 0) {
      const first = stderr.split("\n", 1)[0]!;
      throw new CitymapError("history/git-failed", `git log exited with ${String(code)}: ${first}`, {
        code: String(code),
        stderr: first,
      });
    }
    yield* flush(true);
  } finally {
    await blobs.close();
  }
}
