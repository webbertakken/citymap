// Follows the root workspace manifests and the folders holding files, and resolves the declared members per commit.
import { compareKeys } from "@citymap/ground-plan";
import { isManifest, patternsOf, resolveWorkspaces, type Patterns } from "./manifests";

export interface ManifestUnavailable {
  readonly code: "history/manifest-unavailable";
  readonly detail: { readonly path: string; readonly index: number };
}

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** A commit's changed paths, as `wanted` and `fallbacks` read them. */
interface Changes {
  readonly entries: readonly { readonly path: string; readonly blob: string; readonly status: string }[];
}

export class Workspaces {
  /** Root manifests changed since the last snapshot: the new blob, or null when the manifest went. */
  private readonly pending = new Map<string, string | null>();
  /** Each root manifest's blobs since it was last added, oldest first. */
  private readonly chains = new Map<string, string[]>();
  /** The patterns of each root manifest read so far (null: it declares none). */
  private readonly known = new Map<string, Patterns | null>();
  /** Folders other than the root holding files, and how many files are beneath each. */
  private readonly holding = new Map<string, number>();
  private foldersChanged = false;
  private current: string[] | undefined;

  /** Notes a changed path: a root manifest's new blob, or null when it was deleted. */
  touch(path: string, blob: string | null) {
    if (!isManifest(path)) return;
    this.pending.set(path, blob);
    if (blob === null) this.chains.delete(path);
    else this.chains.set(path, [...(this.chains.get(path) ?? []), blob]);
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
   * The manifest blobs that `resolve` will read over these commits (the first at `index`), given that only the laid ones
   * are resolved: a manifest changed twice between two of them is read once, at its later blob.
   */
  wanted(commits: readonly Changes[], index: number, laid: (index: number) => boolean): string[] {
    const pending = new Map(this.pending);
    const blobs = new Set<string>();
    commits.forEach((commit, i) => {
      for (const entry of commit.entries)
        if (isManifest(entry.path)) pending.set(entry.path, entry.status === "D" ? null : entry.blob);
      if (!laid(index + i)) return;
      for (const blob of pending.values()) if (blob !== null) blobs.add(blob);
      pending.clear();
    });
    return [...blobs];
  }

  /**
   * The older blobs `resolve` may look back to over these commits: every earlier blob, since the manifest was last added,
   * of a manifest whose wanted blob cannot be read (`texts`), and that `texts` does not hold yet.
   */
  fallbacks(
    commits: readonly Changes[],
    index: number,
    laid: (index: number) => boolean,
    texts: ReadonlyMap<string, string | null>,
  ): string[] {
    const pending = new Map(this.pending);
    const chains = new Map(this.chains);
    const blobs = new Set<string>();
    commits.forEach((commit, i) => {
      for (const entry of commit.entries) {
        if (!isManifest(entry.path)) continue;
        const blob = entry.status === "D" ? null : entry.blob;
        pending.set(entry.path, blob);
        if (blob === null) chains.delete(entry.path);
        else chains.set(entry.path, [...(chains.get(entry.path) ?? []), blob]);
      }
      if (!laid(index + i)) return;
      for (const [path, blob] of pending)
        if (blob !== null && typeof texts.get(blob) !== "string")
          for (const older of chains.get(path)!.slice(0, -1)) if (!texts.has(older)) blobs.add(older);
      pending.clear();
    });
    return [...blobs];
  }

  /**
   * The declared members at commit `index`, from the manifests changed since the last call; undefined: none. A manifest
   * whose blob cannot be read is known by its newest blob the repository holds since it was last added (`texts` holds
   * the `fallbacks`), so what a read knows depends on the history alone, never on the commit it began at.
   */
  resolve(
    texts: ReadonlyMap<string, string | null>,
    index: number,
    onEvent: (event: ManifestUnavailable) => void,
  ): readonly string[] | undefined {
    let changed = false;
    for (const [path, blob] of [...this.pending].toSorted(([a], [b]) => compareKeys(a, b))) {
      changed = true;
      if (blob === null) {
        this.known.delete(path);
        continue;
      }
      let text = texts.get(blob);
      if (typeof text !== "string") {
        onEvent({ code: "history/manifest-unavailable", detail: { path, index } });
        text = this.chains
          .get(path)!
          .slice(0, -1)
          .toReversed()
          .map((older) => texts.get(older))
          .find((older) => typeof older === "string");
      }
      if (typeof text === "string") this.known.set(path, patternsOf(path, text));
      else this.known.delete(path);
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
