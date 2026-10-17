// A public GitHub repository's single state, read from GitHub's API in the browser: its default branch's tree, its
// submodules' trees at their pins, and its root workspace manifests, as the snapshot the CLI's `--no-history` would lay.
import { CitymapError, GITLINK_FILE, compareKeys, stateSnapshot, type Snapshot } from "@citymap/ground-plan";
import { parseGitmodules } from "@citymap/history/gitmodules";
import { isManifest, patternsOf, resolveWorkspaces, type Patterns } from "@citymap/history/manifests";
import type { Step } from "../load/step";
import { API, getJson, type Fetcher } from "./api";
import type { Repository } from "./repository";
import { SUBMODULE_DEPTH, githubRepositoryOf, type GitHubSubmoduleUnread } from "./submodules";

export type { Fetcher } from "./api";
const RAW = "https://raw.githubusercontent.com";
/** Subtrees read at once when a tree is read folder by folder. */
export const IN_FLIGHT = 4;

interface Entry {
  readonly path: string;
  readonly type: string;
  readonly sha: string;
}

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const text = (value: unknown, what: string): string => {
  if (typeof value !== "string") throw new CitymapError("github/failed", `GitHub's answer has no ${what}`, { what });
  return value;
};
const entriesOf = (value: unknown): Entry[] => {
  const tree = get(value, "tree");
  if (!Array.isArray(tree)) throw new CitymapError("github/failed", "GitHub's answer has no tree", { what: "tree" });
  return tree.map((e: unknown) => ({
    path: text(get(e, "path"), "path"),
    type: text(get(e, "type"), "type"),
    sha: text(get(e, "sha"), "sha"),
  }));
};

/** The folders among a tree's entries, as paths from the repository's root. */
const foldersIn = (entries: readonly Entry[], prefix: string) =>
  entries.filter((e) => e.type === "tree").map((e) => prefix + e.path);

/** Runs `task` over the items, `IN_FLIGHT` at a time, results in the items' order. */
async function inBatches<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const now = await Promise.all(items.slice(0, IN_FLIGHT).map(task));
  return [...now, ...(await inBatches(items.slice(IN_FLIGHT), task))];
}

/** A step of a read, which always counts its API requests so far. */
export type ReadStep = Step & { readonly requests: number };

export interface ReadOptions {
  /** Aborts every request, and the read, with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Hears the read's progress: the commit, folders read of folders known, and the manifests. */
  readonly onStep?: (step: ReadStep) => void;
  /** Hears each submodule laid as its `.gitlink` file, and why. */
  readonly onUnread?: (path: string, reason: GitHubSubmoduleUnread) => void;
}

/** A tree's files and gitlinks, as paths from the repository's root. */
interface Listing {
  readonly blobs: readonly string[];
  readonly gitlinks: readonly { readonly path: string; readonly pin: string }[];
}

/** Reads a repository's tree at its default branch, telling how far it has come as it goes. */
export async function readRepository(
  fetcher: Fetcher,
  repo: Repository,
  { signal, onStep = () => {}, onUnread = () => {} }: ReadOptions = {},
): Promise<Snapshot> {
  let requests = 0;
  const base = `${API}/repos/${repo.owner}/${repo.name}`;
  const missing = () =>
    new CitymapError("github/not-found", `${repo.owner}/${repo.name} does not exist or is private`, {
      owner: repo.owner,
      name: repo.name,
    });
  const json = async (url: string, notFound: () => CitymapError = missing): Promise<unknown> => {
    signal?.throwIfAborted();
    requests++;
    return (await getJson(fetcher, url, notFound, signal)).body;
  };
  /** A raw file at a commit, outside the API's hourly limit; null when it cannot be read. */
  const raw = async (at: Repository, commit: string, path: string): Promise<string | null> => {
    const response = await fetcher(`${RAW}/${at.owner}/${at.name}/${commit}/${path}`, {
      signal: signal ?? null,
    }).catch(() => null);
    return response?.ok ? response.text() : null;
  };

  onStep({ phase: "commit", requests });
  const commit = await json(`${base}/commits/HEAD`);
  const sha = text(get(commit, "sha"), "commit");
  const tree = text(get(get(get(commit, "commit"), "tree"), "sha"), "tree");

  // Folders known (named by any answer, a truncated one too) and read (their entries in hand), the root first.
  const known = new Set([""]);
  const read = new Set<string>();
  const tellTree = () => onStep({ phase: "tree", done: read.size, of: known.size, requests });
  // A whole tree at once (of the repository at `at`, a tree or a commit); one too large for a single answer is read
  // folder by folder.
  const listTree = async (
    at: string,
    treeSha: string,
    folder: string,
    notFound?: () => CitymapError,
  ): Promise<Listing> => {
    const prefix = folder === "" ? "" : `${folder}/`;
    const listing = (entries: readonly Entry[]): Listing => ({
      blobs: entries.filter((e) => e.type === "blob").map((e) => prefix + e.path),
      gitlinks: entries.filter((e) => e.type === "commit").map((e) => ({ path: prefix + e.path, pin: e.sha })),
    });
    const whole = await json(`${at}/git/trees/${treeSha}?recursive=1`, notFound);
    const entries = entriesOf(whole);
    const inside = foldersIn(entries, prefix);
    for (const f of inside) known.add(f);
    if (get(whole, "truncated") !== true) {
      for (const f of [folder, ...inside]) read.add(f);
      tellTree();
      return listing(entries);
    }
    tellTree();
    const top = entriesOf(await json(`${at}/git/trees/${treeSha}`, notFound));
    for (const f of foldersIn(top, prefix)) known.add(f);
    read.add(folder);
    tellTree();
    const own = listing(top);
    const subtrees = top.filter((e) => e.type === "tree");
    const nested = await inBatches(subtrees, (s) => listTree(at, s.sha, prefix + s.path, notFound));
    return {
      blobs: [...own.blobs, ...nested.flatMap((n) => n.blobs)],
      gitlinks: [...own.gitlinks, ...nested.flatMap((n) => n.gitlinks)],
    };
  };
  // Every submodule folder, nested ones included.
  const submodules: string[] = [];
  /** The gitlinks of a tree of `owner`'s at `commit`, each read from its own repository at its pin, nested in turn. */
  const readGitlinks = async (owner: Repository, at: string, root: string, listing: Listing, depth: number) => {
    if (listing.gitlinks.length === 0) return [];
    const modules = parseGitmodules((await raw(owner, at, ".gitmodules")) ?? "");
    const inner = root === "" ? (path: string) => path : (path: string) => path.slice(root.length + 1);
    const ordered = listing.gitlinks.toSorted((a, b) => compareKeys(a.path, b.path));
    const lists = await inBatches(ordered, async ({ path, pin }): Promise<string[]> => {
      submodules.push(path);
      const unread = (reason: GitHubSubmoduleUnread) => {
        onUnread(path, reason);
        return [`${path}/${GITLINK_FILE}`];
      };
      if (depth >= SUBMODULE_DEPTH) return unread("depth");
      const target = githubRepositoryOf(modules.get(inner(path))?.url ?? "", owner);
      if (typeof target === "string") return unread(target);
      const gone = new CitymapError("github/not-found", `${target.owner}/${target.name} does not exist or is private`, {
        owner: target.owner,
        name: target.name,
      });
      // Its folder is known once it is to be read, and read once it is listed or found missing.
      known.add(path);
      let found: Listing;
      try {
        found = await listTree(`${API}/repos/${target.owner}/${target.name}`, pin, path, () => gone);
      } catch (error) {
        if (error !== gone) throw error;
        read.add(path);
        tellTree();
        return unread("not-found");
      }
      return [...found.blobs, ...(await readGitlinks(target, pin, path, found, depth + 1))];
    });
    return lists.flat();
  };
  tellTree();
  const top = await listTree(base, tree, "");
  const paths = [...top.blobs, ...(await readGitlinks(repo, sha, "", top, 0))].toSorted(compareKeys);

  // Root workspace manifests come from raw files, outside the API's hourly limit; one that cannot be read is left out.
  const manifests = paths.filter(isManifest);
  let readManifests = 0;
  const tellManifests = () => onStep({ phase: "manifests", done: readManifests, of: manifests.length, requests });
  tellManifests();
  const declared = await Promise.all(
    manifests.map(async (path) => {
      const body = await raw(repo, sha, path);
      const patterns = body === null ? null : patternsOf(path, body);
      readManifests++;
      tellManifests();
      return patterns;
    }),
  );
  signal?.throwIfAborted();
  const patterns = declared.filter((p): p is Patterns => p !== null);
  const folders = new Set<string>();
  for (const path of paths)
    for (
      let f = path.slice(0, Math.max(0, path.lastIndexOf("/")));
      f !== "" && !folders.has(f);
      f = f.slice(0, Math.max(0, f.lastIndexOf("/")))
    )
      folders.add(f);
  const members = patterns.length > 0 ? resolveWorkspaces(patterns, folders) : undefined;
  return stateSnapshot(repo.name, sha, paths, members, submodules);
}
