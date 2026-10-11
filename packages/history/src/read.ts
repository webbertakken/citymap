import { spawn } from "node:child_process";
import { once } from "node:events";
import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { CitymapError, compareKeys, type FileEntry, type Snapshot } from "@citymap/ground-plan";
import { gitEnvironment } from "./env";

/** One changed path of a commit, from git's raw diff against the first parent. */
interface RawEntry {
  readonly mode: string;
  readonly blob: string;
  readonly status: string;
  readonly path: string;
}

/** One first-parent commit and its changes. */
export interface RawCommit {
  readonly sha: string;
  readonly entries: readonly RawEntry[];
}

export interface HistoryEvent {
  readonly code: "history/skip-submodule";
  readonly detail: { readonly path: string; readonly index: number };
}

const SUBMODULE = "160000";

/** Parses git's `log --raw -z` tokens (split at NUL) into commits. */
export function* parseRawLog(tokens: Iterable<string>): Generator<RawCommit> {
  let current: { sha: string; entries: RawEntry[] } | null = null;
  let meta: string | null = null;
  for (const raw of tokens) {
    const token = raw.startsWith("\n") ? raw.slice(1) : raw;
    if (token.startsWith("\u0001")) {
      if (current) yield current;
      current = { sha: token.slice(1, 41), entries: [] };
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

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** Applies one commit to the tree state: deletions, exact renames (equal blobs, paired in path order), additions. */
function apply(
  state: Map<string, Live>,
  folders: Map<string, number>,
  commit: RawCommit,
  index: number,
  onEvent: (event: HistoryEvent) => void,
) {
  const deleted = new Map<string, Live[]>();
  const added: RawEntry[] = [];
  for (const entry of commit.entries) {
    if (entry.status === "D") {
      const live = state.get(entry.path);
      if (!live) continue;
      state.delete(entry.path);
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
    const moved = deleted.get(entry.blob)?.shift();
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
}

function snapshotOf(
  repository: string,
  sha: string,
  index: number,
  state: Map<string, Live>,
  folders: Map<string, number>,
): Snapshot {
  const files: FileEntry[] = [...state]
    .toSorted(([a], [b]) => compareKeys(a, b))
    .map(([path, live]) => ({ path, identity: live.identity, firstSeen: live.firstSeen }));
  return { repository, commit: sha, index, files, folderFirstSeen: new Map(folders) };
}

export interface ReadOptions {
  /** The commit to read up to; HEAD by default. */
  readonly to?: string;
  /** The first index to yield: earlier commits still apply to the tree, but build no snapshot. */
  readonly from?: number;
  /** The repository's display name; the folder name by default. */
  readonly repository?: string;
  readonly onEvent?: (event: HistoryEvent) => void;
}

/** Streams a repository's first-parent history, oldest first, as one snapshot per commit; reads no file contents. */
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
  const from = options.from ?? 0;
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
      "--format=%x01%H",
      options.to ?? "HEAD",
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
  let index = 0;
  const decoder = new TextDecoder();
  let rest = "";
  // Commits are complete once the next header arrives; buffer tokens and hand over each finished commit.
  let pending: string[] = [];
  const flush = function* (final: boolean): Generator<Snapshot> {
    const cut = final ? pending.length : pending.findLastIndex((t) => t.replace(/^\n/, "").startsWith("\u0001"));
    if (cut <= 0) return;
    for (const commit of parseRawLog(pending.slice(0, cut))) {
      apply(state, folders, commit, index, onEvent);
      if (index >= from) yield snapshotOf(repository, commit.sha, index, state, folders);
      index++;
    }
    pending = pending.slice(cut);
  };
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
}
