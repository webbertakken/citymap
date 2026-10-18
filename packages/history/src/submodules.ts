// Submodules: a gitlink's pinned tree, read from the submodule's own git data, as files under its folder.
import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { CitymapError, GITLINK_FILE, compareKeys } from "@citymap/ground-plan";
import { gitEnvironment, onGitData } from "./env";
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
  /** The git data of each submodule read (folder → git data), itself and nested ones: where their blobs are held. */
  readonly stores: ReadonlyMap<string, string>;
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

  /** How many readings it keeps. */
  get held(): number {
    return this.kept.size;
  }

  /** Lets go of every reading it keeps: a pin asked for again is read again. */
  forget(): void {
    this.kept.clear();
  }

  /** The pinned trees of a tree's gitlinks (path → commit), named by its `.gitmodules` text (null when unread). */
  async expandAll(gitlinks: ReadonlyMap<string, string>, gitmodules: string | null): Promise<Map<string, Expanded>> {
    const modules = parseGitmodules(gitmodules ?? "");
    const sorted = [...gitlinks].toSorted(([a], [b]) => compareKeys(a, b));
    const read = await Promise.all(
      sorted.map(([path, commit]) => this.expand(null, path, modules.get(path), commit, 0)),
    );
    return new Map(sorted.map(([path], i) => [path, read[i]!]));
  }

  /** One gitlink at its pin, kept until `forget`: a pin seen again before then reads nothing. */
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
      stores: new Map(),
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
    const stores = new Map([[path, gitData]]);
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
        for (const [folder, store] of sub.stores) stores.set(folder, store);
      }
    }
    return { commit, files, submodules: submodules.toSorted(compareKeys), unread: unreadList, stores };
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
        [...onGitData(gitData), "-c", "core.quotepath=off", "ls-tree", "-r", "-z", commit],
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
      const { stdout } = await run("git", [...onGitData(gitData), "cat-file", "blob", blob], {
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
 * The `.gitmodules` blob a raw entry leaves in force: its new blob, or null when it is deleted or is a gitlink (a
 * gitlink at `.gitmodules` is no file, so it names nothing).
 */
export const gitmodulesAfter = (entry: LogEntry, before: string | null): string | null =>
  entry.path !== ".gitmodules" ? before : entry.status === "D" || entry.mode === GITLINK_MODE ? null : entry.blob;

/** A prepared reading, and how many expansions still take it. */
interface Prepared {
  readonly expanded: Expanded;
  uses: number;
}

/** The key of a reading: the gitlink's path, its pin, and the `.gitmodules` blob in force where it is expanded. */
const readingKey = (path: string, pin: string, gitmodules: string | null) =>
  `${path}\u0000${pin}\u0000${gitmodules ?? ""}`;

/**
 * The fold's gitlinks and what each was last expanded to. `prepare` reads, in parallel, every pin a chunk of commits
 * will expand; `move` then expands the pins that moved since, at once, and says what changed, as one commit's changes
 * sorted by path; nothing moved is null. A reading is keyed by path, pin and the `.gitmodules` blob in force at its
 * expansion point, so it never depends on where a chunk ends; it is held only until the expansions that take it have
 * taken it.
 */
export class Pins {
  readonly gitlinks = new Map<string, string>();
  private readonly expanded = new Map<string, Expanded>();
  private readonly ready = new Map<string, Prepared>();
  private list: readonly string[] = [];

  constructor(private readonly reader: SubmoduleReader) {}

  /** The submodule folders as last expanded, sorted: the same array while they stay the same. */
  get submodules(): readonly string[] {
    return this.list;
  }

  /** How many readings each cache holds: prepared and not yet taken, kept by the reader, and last expanded. */
  get held(): { readonly ready: number; readonly read: number; readonly expanded: number } {
    return { ready: this.ready.size, read: this.reader.held, expanded: this.expanded.size };
  }

  /**
   * Reads the pins the commits from index `first` will expand where `expandsAt`, each named by the `.gitmodules` blob in
   * force there (`gitmodules` before the first; texts from `readTexts`). The reader keeps nothing past it.
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
    const wanted = new Map<string, { path: string; pin: string; names: string | null; uses: number }>();
    let names = gitmodules;
    commits.forEach((commit, at) => {
      for (const entry of commit.entries) {
        names = gitmodulesAfter(entry, names);
        if (entry.status === "D") pins.delete(entry.path);
        else if (entry.mode === GITLINK_MODE) pins.set(entry.path, entry.blob);
        else pins.delete(entry.path);
      }
      if (!expandsAt(first + at)) return;
      for (const [path, pin] of pins) {
        if (last.get(path) === pin) continue;
        const key = readingKey(path, pin, names);
        const held = this.ready.get(key) ?? wanted.get(key);
        if (held) held.uses++;
        else wanted.set(key, { path, pin, names, uses: 1 });
      }
      last.clear();
      for (const [path, pin] of pins) last.set(path, pin);
    });
    if (wanted.size === 0) return;
    const blobs = [...new Set([...wanted.values()].flatMap((w) => (w.names === null ? [] : [w.names])))];
    const texts = await readTexts(blobs);
    const modulesOf = (blob: string | null) => {
      const text = blob === null ? null : texts.get(blob);
      return parseGitmodules(typeof text === "string" ? text : "");
    };
    const list = [...wanted];
    const read = await Promise.all(
      list.map(([, w]) => this.reader.expand(null, w.path, modulesOf(w.names).get(w.path), w.pin, 0)),
    );
    list.forEach(([key, w], i) => this.ready.set(key, { expanded: read[i]!, uses: w.uses }));
    this.reader.forget();
  }

  /**
   * Expands the pins that moved, each taken from its prepared reading for the `.gitmodules` blob in force here
   * (`gitmodules`); a reading no later expansion takes is dropped.
   */
  move(
    index: number,
    gitmodules: string | null,
    onEvent: (event: SubmoduleRead | SubmoduleUnavailable) => void,
  ): PinChange[] | null {
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
      const key = readingKey(path, pin, gitmodules);
      const prepared = this.ready.get(key);
      if (!prepared) throw new CitymapError("engine/invariant", `the pin of ${path} was not prepared`, { path, index });
      if (--prepared.uses === 0) this.ready.delete(key);
      const found = prepared.expanded;
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
