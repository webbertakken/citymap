// A public GitHub repository's single state, read from GitHub's API in the browser: its default branch's tree and its
// root workspace manifests, as the snapshot the CLI's `--no-history` would lay.
import { CitymapError, compareKeys, stateSnapshot, type Snapshot } from "@citymap/ground-plan";
import { isManifest, patternsOf, resolveWorkspaces, type Patterns } from "@citymap/history/manifests";
import type { Repository } from "./repository";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const API = "https://api.github.com";
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

/** Runs `task` over the items, `IN_FLIGHT` at a time, results in the items' order. */
async function inBatches<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const now = await Promise.all(items.slice(0, IN_FLIGHT).map(task));
  return [...now, ...(await inBatches(items.slice(IN_FLIGHT), task))];
}

/** Reads a repository's tree at its default branch, counting each API request as it goes. */
export async function readRepository(
  fetcher: Fetcher,
  repo: Repository,
  onRequest: (requests: number) => void = () => {},
): Promise<Snapshot> {
  let requests = 0;
  const base = `${API}/repos/${repo.owner}/${repo.name}`;
  const json = async (url: string): Promise<unknown> => {
    onRequest(++requests);
    let response: Response;
    try {
      response = await fetcher(url, { headers: { Accept: "application/vnd.github+json" } });
    } catch (error) {
      throw new CitymapError("github/offline", `GitHub could not be reached: ${String(error)}`, { url });
    }
    if (response.status === 404)
      throw new CitymapError("github/not-found", `${repo.owner}/${repo.name} does not exist or is private`, {
        owner: repo.owner,
        name: repo.name,
      });
    if ((response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0);
      throw new CitymapError("github/rate-limited", "GitHub's hourly limit for this browser is reached", { reset });
    }
    if (!response.ok)
      throw new CitymapError("github/failed", `GitHub answered ${response.status}`, { status: response.status });
    return response.json();
  };

  const commit = await json(`${base}/commits/HEAD`);
  const sha = text(get(commit, "sha"), "commit");
  const tree = text(get(get(get(commit, "commit"), "tree"), "sha"), "tree");

  // A whole tree at once; one too large for a single answer is read folder by folder.
  const files = async (treeSha: string, prefix: string): Promise<string[]> => {
    const whole = await json(`${base}/git/trees/${treeSha}?recursive=1`);
    if (get(whole, "truncated") !== true)
      return entriesOf(whole)
        .filter((e) => e.type === "blob")
        .map((e) => prefix + e.path);
    const top = entriesOf(await json(`${base}/git/trees/${treeSha}`));
    const own = top.filter((e) => e.type === "blob").map((e) => prefix + e.path);
    const subtrees = top.filter((e) => e.type === "tree");
    const nested = await inBatches(subtrees, (t) => files(t.sha, `${prefix}${t.path}/`));
    return [...own, ...nested.flat()];
  };
  const paths = (await files(tree, "")).toSorted(compareKeys);

  // Root workspace manifests come from raw files, outside the API's hourly limit; one that cannot be read is left out.
  const declared = await Promise.all(
    paths.filter(isManifest).map(async (path) => {
      const response = await fetcher(`${RAW}/${repo.owner}/${repo.name}/${sha}/${path}`).catch(() => null);
      return response?.ok ? patternsOf(path, await response.text()) : null;
    }),
  );
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
  return stateSnapshot(repo.name, sha, paths, members);
}
