// Submodules: a gitlink's pinned tree, read from the submodule's own git data, as files under its folder.
import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { CitymapError, GITLINK_FILE, compareKeys } from "@citymap/ground-plan";
import { gitEnvironment } from "./env";
import { isSafeModulePath, parseGitmodules, type ModuleEntry } from "./gitmodules";

const run = promisify(execFile);

/** Nesting deeper than this is not followed. */
export const SUBMODULE_DEPTH = 8;
/** A gitlink's mode in a tree. */
export const GITLINK_MODE = "160000";
/** The mode a submodule's files arrive with in the fold. */
const FILE_MODE = "100644";

export type UnreadReason = "no-git-data" | "missing-commit" | "depth" | "bad-name";

export interface SubmoduleUnavailable {
  readonly code: "history/submodule-unavailable";
  readonly detail: { readonly path: string; readonly index: number; readonly reason: UnreadReason };
}
export interface SubmoduleRead {
  readonly code: "history/submodule";
  readonly detail: { readonly path: string; readonly index: number; readonly files: number };
}

/** One gitlink as read at its pin: its files (path → blob id), the submodules in it, and those it could not read. */
export interface Expanded {
  readonly commit: string;
  readonly files: ReadonlyMap<string, string>;
  /** Every submodule folder it holds, itself included, sorted. */
  readonly submodules: readonly string[];
  readonly unread: readonly { readonly path: string; readonly reason: UnreadReason }[];
}

const isDirectory = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};
const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};
const within = (path: string, root: string) => {
  const r = relative(root, path);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

/** Reads submodules at their pins from the git data a repository holds; nothing is fetched or written. */
export class SubmoduleReader {
  private common: string | null = null;
  private readonly kept = new Map<string, Promise<Expanded>>();

  constructor(private readonly dir: string) {}

  /** The pinned trees of a tree's gitlinks (path → commit), named by its `.gitmodules` text (null when unread). */
  async expandAll(gitlinks: ReadonlyMap<string, string>, gitmodules: string | null): Promise<Map<string, Expanded>> {
    const modules = parseGitmodules(gitmodules ?? "");
    const sorted = [...gitlinks].toSorted(([a], [b]) => compareKeys(a, b));
    const read = await Promise.all(
      sorted.map(([path, commit]) => this.expand(null, path, modules.get(path), commit, 0)),
    );
    return new Map(sorted.map(([path], i) => [path, read[i]!]));
  }

  /** One gitlink at its pin, kept for the read: a pin seen again reads nothing. */
  expand(parent: string | null, path: string, module: ModuleEntry | undefined, commit: string, depth: number) {
    const key = `${parent ?? ""}\u0000${path}\u0000${module?.name ?? ""}\u0000${commit}`;
    let found = this.kept.get(key);
    if (!found) {
      found = this.read(parent, path, module?.name ?? path, commit, depth);
      this.kept.set(key, found);
    }
    return found;
  }

  private async read(
    parent: string | null,
    path: string,
    name: string,
    commit: string,
    depth: number,
  ): Promise<Expanded> {
    const unread = (reason: UnreadReason): Expanded => ({
      commit,
      files: new Map([[`${path}/${GITLINK_FILE}`, commit]]),
      submodules: [path],
      unread: [{ path, reason }],
    });
    if (depth >= SUBMODULE_DEPTH) return unread("depth");
    if (!isSafeModulePath(name) || !isSafeModulePath(path)) return unread("bad-name");
    const gitData = await this.gitDataOf(parent, path, name);
    if (gitData === null) return unread("no-git-data");
    const entries = await this.lsTree(gitData, commit);
    if (entries === null) return unread("missing-commit");
    const files = new Map<string, string>();
    const nested: [string, string][] = [];
    let gitmodulesBlob: string | null = null;
    for (const { mode, blob, path: inner } of entries) {
      if (mode === GITLINK_MODE) nested.push([inner, blob]);
      else {
        files.set(`${path}/${inner}`, blob);
        if (inner === ".gitmodules") gitmodulesBlob = blob;
      }
    }
    const submodules = [path];
    const unreadList: { path: string; reason: UnreadReason }[] = [];
    if (nested.length > 0) {
      const modules = parseGitmodules(gitmodulesBlob === null ? "" : await this.catBlob(gitData, gitmodulesBlob));
      const order = nested.toSorted(([a], [b]) => compareKeys(a, b));
      const subs = await Promise.all(
        order.map(([inner, pin]) => this.expand(gitData, `${path}/${inner}`, modules.get(inner), pin, depth + 1)),
      );
      for (const sub of subs) {
        for (const [p, b] of sub.files) files.set(p, b);
        submodules.push(...sub.submodules);
        unreadList.push(...sub.unread);
      }
    }
    return { commit, files, submodules: submodules.toSorted(compareKeys), unread: unreadList };
  }

  /** Where a submodule's git data lies: its parent's `modules/<name>`, else its working tree's `.git`; or null. */
  private async gitDataOf(parent: string | null, path: string, name: string): Promise<string | null> {
    const base = parent ?? (await this.commonDir());
    const modules = resolve(base, "modules", name);
    if (isDirectory(resolve(modules, "objects"))) return modules;
    const dotGit = resolve(this.dir, path, ".git");
    if (isDirectory(resolve(dotGit, "objects"))) return dotGit;
    if (!isFile(dotGit)) return null;
    const line = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, "utf8"));
    if (!line) return null;
    const target = resolve(this.dir, path, line[1]!);
    // Followed only inside the repository's folder or its git data.
    if (!within(target, this.dir) && !within(target, await this.commonDir())) return null;
    return isDirectory(resolve(target, "objects")) ? target : null;
  }

  private async commonDir(): Promise<string> {
    if (this.common === null) {
      const { stdout } = await run("git", ["-C", this.dir, "rev-parse", "--git-common-dir"], { env: gitEnvironment() });
      this.common = resolve(this.dir, stdout.trim());
    }
    return this.common;
  }

  private async lsTree(gitData: string, commit: string) {
    try {
      const { stdout } = await run(
        "git",
        [`--git-dir=${gitData}`, "-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit],
        { env: gitEnvironment(), maxBuffer: 1 << 30 },
      );
      return stdout
        .split("\u0000")
        .filter(Boolean)
        .map((entry) => {
          const tab = entry.indexOf("\t");
          const [mode, , blob] = entry.slice(0, tab).split(" ");
          return { mode: mode!, blob: blob!, path: entry.slice(tab + 1) };
        });
    } catch {
      return null;
    }
  }

  private async catBlob(gitData: string, blob: string): Promise<string> {
    try {
      const { stdout } = await run("git", [`--git-dir=${gitData}`, "cat-file", "blob", blob], {
        env: gitEnvironment(),
      });
      return stdout;
    } catch {
      return "";
    }
  }
}

/** One change a moved pin makes to the tree, as a raw log entry: a file born, deleted, or changed. */
export interface PinChange {
  readonly mode: string;
  readonly status: "A" | "D" | "M";
  readonly path: string;
  readonly blob: string;
}

/** The raw entries `Pins.prepare` reads: a path, its new mode and blob, and its status. */
interface LogEntry {
  readonly mode: string;
  readonly blob: string;
  readonly status: string;
  readonly path: string;
}

/**
 * The fold's gitlinks and what each was last expanded to. `prepare` reads, in parallel, every pin a chunk of commits
 * will expand; `move` then expands the pins that moved since, at once, and says what changed, as one commit's changes
 * sorted by path; nothing moved is null.
 */
export class Pins {
  readonly gitlinks = new Map<string, string>();
  private readonly expanded = new Map<string, Expanded>();
  private readonly ready = new Map<string, Expanded>();
  private list: readonly string[] = [];

  constructor(private readonly reader: SubmoduleReader) {}

  /** The submodule folders as last expanded, sorted: the same array while they stay the same. */
  get submodules(): readonly string[] {
    return this.list;
  }

  /**
   * Reads the pins the commits from index `first` will expand where `expandsAt`, each named by `.gitmodules` as it then
   * stands (its blob `gitmodules` before the first; texts from `readTexts`).
   */
  async prepare(
    commits: readonly { readonly entries: readonly LogEntry[] }[],
    first: number,
    expandsAt: (index: number) => boolean,
    gitmodules: string | null,
    readTexts: (blobs: readonly string[]) => Promise<ReadonlyMap<string, string | null>>,
  ): Promise<void> {
    const pins = new Map(this.gitlinks);
    const last = new Map([...this.expanded].map(([path, e]) => [path, e.commit]));
    const wanted: { path: string; pin: string; names: string | null }[] = [];
    let names = gitmodules;
    commits.forEach((commit, at) => {
      for (const entry of commit.entries) {
        if (entry.path === ".gitmodules") names = entry.status === "D" ? null : entry.blob;
        if (entry.status === "D") pins.delete(entry.path);
        else if (entry.mode === GITLINK_MODE) pins.set(entry.path, entry.blob);
        else pins.delete(entry.path);
      }
      if (!expandsAt(first + at)) return;
      for (const [path, pin] of pins)
        if (last.get(path) !== pin && !this.ready.has(`${path}\u0000${pin}`)) wanted.push({ path, pin, names });
      last.clear();
      for (const [path, pin] of pins) last.set(path, pin);
    });
    if (wanted.length === 0) return;
    const blobs = [...new Set(wanted.flatMap((w) => (w.names === null ? [] : [w.names])))];
    const texts = await readTexts(blobs);
    const modulesOf = (blob: string | null) => {
      const text = blob === null ? null : texts.get(blob);
      return parseGitmodules(typeof text === "string" ? text : "");
    };
    const read = await Promise.all(
      wanted.map((w) => this.reader.expand(null, w.path, modulesOf(w.names).get(w.path), w.pin, 0)),
    );
    wanted.forEach((w, i) => this.ready.set(`${w.path}\u0000${w.pin}`, read[i]!));
  }

  move(index: number, onEvent: (event: SubmoduleRead | SubmoduleUnavailable) => void): PinChange[] | null {
    const moved = [...this.gitlinks]
      .filter(([path, pin]) => this.expanded.get(path)?.commit !== pin)
      .toSorted(([a], [b]) => compareKeys(a, b));
    const gone = [...this.expanded.keys()].filter((path) => !this.gitlinks.has(path));
    if (moved.length === 0 && gone.length === 0) return null;
    const before = new Map<string, string>();
    for (const path of [...moved.map(([p]) => p), ...gone])
      for (const [file, blob] of this.expanded.get(path)?.files ?? []) before.set(file, blob);
    for (const path of gone) this.expanded.delete(path);
    const after = new Map<string, string>();
    for (const [path, pin] of moved) {
      const found = this.ready.get(`${path}\u0000${pin}`);
      if (!found) throw new CitymapError("engine/invariant", `the pin of ${path} was not prepared`, { path, index });
      this.expanded.set(path, found);
      for (const [file, blob] of found.files) after.set(file, blob);
      for (const unread of found.unread)
        onEvent({ code: "history/submodule-unavailable", detail: { path: unread.path, index, reason: unread.reason } });
      if (!found.unread.some((u) => u.path === path))
        onEvent({ code: "history/submodule", detail: { path, index, files: found.files.size } });
    }
    const changes: PinChange[] = [];
    for (const [path, blob] of before) if (!after.has(path)) changes.push({ mode: FILE_MODE, status: "D", path, blob });
    for (const [path, blob] of after) {
      const was = before.get(path);
      if (was === undefined) changes.push({ mode: FILE_MODE, status: "A", path, blob });
      else if (was !== blob) changes.push({ mode: FILE_MODE, status: "M", path, blob });
    }
    const list = [...this.expanded.values()].flatMap((e) => e.submodules).toSorted(compareKeys);
    if (list.join("\u0000") !== this.list.join("\u0000")) this.list = list;
    return changes.toSorted((a, b) => compareKeys(a.path, b.path));
  }
}
