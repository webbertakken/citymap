import { spawn } from "node:child_process";
import { once } from "node:events";
import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { CitymapError, MAX_PATH_BYTES, compareKeys, type FileEntry, type Snapshot } from "@citymap/ground-plan";
import { countCommits, resolveCommit } from "./ancestry";
import { BlobReader } from "./blobs";
import { gitEnvironment } from "./env";
import type { FileHistory } from "./file-history";
import { foldSchedule, isLaid, laidCount, type Strides } from "./schedule";
import { Workspaces, type ManifestUnavailable } from "./workspaces";

/** One changed path of a commit, from git's raw diff against the first parent. */
interface RawEntry {
  readonly mode: string;
  readonly blob: string;
  readonly status: string;
  readonly path: string;
}

/** One first-parent commit: its id, its committer time (epoch seconds), its author's email, and its changes. */
export interface RawCommit {
  readonly sha: string;
  readonly time: number;
  readonly author: string;
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

export type HistoryEvent =
  | { readonly code: "history/skip-submodule"; readonly detail: { readonly path: string; readonly index: number } }
  | ManifestUnavailable
  | ScheduleChosen;

const SUBMODULE = "160000";

/** A commit's header, "<sha>\x02<time>\x02<email>" after its \x01 mark; a time that is no number reads 0. */
function headerOf(token: string): { sha: string; time: number; author: string; entries: RawEntry[] } {
  const [sha = "", time = "", author = ""] = token.slice(1).split("\u0002");
  return { sha, time: /^\d+$/.test(time) ? Number(time) : 0, author, entries: [] };
}

/** Parses git's `log --raw -z` tokens (split at NUL) into commits. */
export function* parseRawLog(tokens: Iterable<string>): Generator<RawCommit> {
  let current: { sha: string; time: number; author: string; entries: RawEntry[] } | null = null;
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
 * when the set of files changed; a commit that only edits files leaves it as it was.
 */
function apply(
  state: Map<string, Live>,
  folders: Map<string, number>,
  workspaces: Workspaces,
  commit: RawCommit,
  index: number,
  onEvent: (event: HistoryEvent) => void,
): boolean {
  const deleted = new Map<string, Live[]>();
  const added: RawEntry[] = [];
  for (const entry of commit.entries) {
    workspaces.touch(entry.path, entry.status === "D" ? null : entry.blob);
    if (entry.status === "D") {
      const live = state.get(entry.path);
      if (!live) continue;
      state.delete(entry.path);
      workspaces.remove(entry.path);
      const list = deleted.get(live.blob) ?? [];
      list.push(live);
      deleted.set(live.blob, list);
    } else if (entry.mode === SUBMODULE) {
      onEvent({ code: "history/skip-submodule", detail: { path: entry.path, index } });
    } else if (entry.status === "A") added.push(entry);
    else {
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
): Snapshot {
  return {
    repository,
    commit: sha,
    index,
    files,
    folderFirstSeen: folders,
    ...(workspaces === undefined ? {} : { workspaces }),
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

/** Records a commit's changes to the files it leaves live, after it is applied, by the identities they carry. */
function recordChanges(history: FileHistory, state: ReadonlyMap<string, Live>, commit: RawCommit): void {
  for (const entry of commit.entries) {
    if (entry.status === "D" || entry.mode === SUBMODULE) continue;
    // Applying the commit made every such path live.
    history.record(state.get(entry.path)!.identity, commit.time, commit.author);
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
      "--format=%x01%H%x02%ct%x02%aE",
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
  const blobs = new BlobReader(dir);
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
    for (const commit of commits) {
      if (apply(state, folders, workspaces, commit, index, onEvent)) [files, folderMap] = [null, null];
      if (options.fileHistory) recordChanges(options.fileHistory, state, commit);
      if (laid(index)) {
        files ??= filesOf(state);
        folderMap ??= new Map(folders);
        yield snapshotOf(repository, commit.sha, index, files, folderMap, workspaces.resolve(texts, index, onEvent));
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
