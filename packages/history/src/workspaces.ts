// Follows the root workspace manifests and the folders holding files, and resolves the declared members per commit.
import { compareKeys } from "@citymap/ground-plan";
import { isManifest, patternsOf, resolveWorkspaces, type Patterns } from "./manifests";

export interface ManifestUnavailable {
  readonly code: "history/manifest-unavailable";
  readonly detail: { readonly path: string; readonly index: number };
}

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

export class Workspaces {
  /** Root manifests changed since the last snapshot: the new blob, or null when the manifest went. */
  private readonly pending = new Map<string, string | null>();
  /** The patterns of each root manifest read so far (null: it declares none). */
  private readonly known = new Map<string, Patterns | null>();
  /** Folders other than the root holding files, and how many files are beneath each. */
  private readonly holding = new Map<string, number>();
  private foldersChanged = false;
  private current: string[] | undefined;

  /** Notes a changed path: a root manifest's new blob, or null when it was deleted. */
  touch(path: string, blob: string | null) {
    if (isManifest(path)) this.pending.set(path, blob);
  }

  /** Counts a file that arrived at `path`. */
  add(path: string) {
    for (let folder = folderOf(path); folder !== ""; folder = folderOf(folder)) {
      const count = this.holding.get(folder) ?? 0;
      if (count === 0) this.foldersChanged = true;
      this.holding.set(folder, count + 1);
    }
  }

  /** Uncounts a file that left `path`. */
  remove(path: string) {
    for (let folder = folderOf(path); folder !== ""; folder = folderOf(folder)) {
      const count = this.holding.get(folder)! - 1;
      if (count === 0) {
        this.holding.delete(folder);
        this.foldersChanged = true;
      } else this.holding.set(folder, count);
    }
  }

  /**
   * The manifest blobs that `resolve` will read over these commits, given that only commits from `from` on are
   * resolved: a manifest changed twice between two of them is read once, at its later blob.
   */
  wanted(
    commits: readonly {
      readonly entries: readonly { readonly path: string; readonly blob: string; readonly status: string }[];
    }[],
    index: number,
    from: number,
  ): string[] {
    const pending = new Map(this.pending);
    const blobs = new Set<string>();
    commits.forEach((commit, i) => {
      for (const entry of commit.entries)
        if (isManifest(entry.path)) pending.set(entry.path, entry.status === "D" ? null : entry.blob);
      if (index + i < from) return;
      for (const blob of pending.values()) if (blob !== null) blobs.add(blob);
      pending.clear();
    });
    return [...blobs];
  }

  /** The declared members at commit `index`, from the manifests changed since the last call; undefined: none. */
  resolve(
    texts: ReadonlyMap<string, string | null>,
    index: number,
    onEvent: (event: ManifestUnavailable) => void,
  ): readonly string[] | undefined {
    let changed = false;
    for (const [path, blob] of [...this.pending].toSorted(([a], [b]) => compareKeys(a, b))) {
      if (blob === null) {
        this.known.delete(path);
        changed = true;
        continue;
      }
      const text = texts.get(blob);
      if (typeof text !== "string") onEvent({ code: "history/manifest-unavailable", detail: { path, index } });
      else {
        this.known.set(path, patternsOf(path, text));
        changed = true;
      }
    }
    this.pending.clear();
    const patterns = [...this.known.values()].filter((p): p is Patterns => p !== null);
    if (patterns.length === 0) this.current = undefined;
    // Patterns only change with `changed`, so otherwise the members stand until the folders holding files change.
    else if (changed || this.foldersChanged) this.current = resolveWorkspaces(patterns, this.holding.keys());
    this.foldersChanged = false;
    return this.current;
  }
}
