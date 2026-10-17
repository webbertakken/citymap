import { describe, expect, it } from "vitest";
import type { Step } from "../load/step";
import { IN_FLIGHT, readRepository, type Fetcher } from "./read";

const API = "https://api.github.com/repos/o/r";
const RAW = "https://raw.githubusercontent.com/o/r/c1";
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers });
const entry = (path: string, type: string, sha = `${path}-sha`) => ({ path, type, sha });

/** A stub GitHub: answers by URL, records each one asked. */
function github(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const fetcher: Fetcher = async (url) => {
    asked.push(url);
    const route = routes[url];
    return route ? route() : new Response("", { status: 404 });
  };
  return { fetcher, asked };
}
const offline: Fetcher = () => Promise.reject(new Error("no network"));
const commit = () => json({ sha: "c1", commit: { tree: { sha: "t0" } } });

describe("readRepository", () => {
  it("reads a whole tree in one answer, skipping folders and submodules, with its declared members", async () => {
    const { fetcher } = github({
      [`${API}/commits/HEAD`]: commit,
      [`${API}/git/trees/t0?recursive=1`]: () =>
        json({
          truncated: false,
          tree: [
            { ...entry("package.json", "blob"), size: 25 },
            entry("packages", "tree"),
            { ...entry("packages/a/index.ts", "blob"), size: 1.5 },
            entry("vendor/lib", "commit"),
            entry("README.md", "blob"),
          ],
        }),
      [`${RAW}/package.json`]: () => new Response(JSON.stringify({ workspaces: ["packages/*"] })),
    });
    const steps: Step[] = [];
    const { snapshot: snap, sizes } = await readRepository(
      fetcher,
      { owner: "o", name: "r" },
      { onStep: (s) => steps.push(s) },
    );
    expect(snap).toMatchObject({ repository: "r", commit: "c1", index: 0, workspaces: ["packages/a"] });
    expect(snap.files.map((f) => f.path)).toEqual(["README.md", "package.json", "packages/a/index.ts"]);
    // Sizes come with the tree; one that is not a whole number of bytes is left unknown.
    expect(sizes).toEqual(new Map([["package.json", 25]]));
    // The root and packages are the folders it lists; the one answer reads both.
    expect(steps).toEqual([
      { phase: "commit", requests: 0 },
      { phase: "tree", done: 0, of: 1, requests: 1 },
      { phase: "tree", done: 2, of: 2, requests: 2 },
      { phase: "manifests", done: 0, of: 1, requests: 2 },
      { phase: "manifests", done: 1, of: 1, requests: 2 },
    ]);
  });

  it("reads a truncated tree folder by folder, splitting again where needed, a few at a time", async () => {
    const folders = Array.from({ length: IN_FLIGHT + 1 }, (_, i) => `d${i}`);
    const routes: Record<string, () => Response> = {
      [`${API}/commits/HEAD`]: commit,
      // The truncated answer names some folders already: they are known before they are read.
      [`${API}/git/trees/t0?recursive=1`]: () => json({ truncated: true, tree: [entry("d1", "tree", "d1-t")] }),
      [`${API}/git/trees/t0`]: () =>
        json({ tree: [entry("top.ts", "blob"), ...folders.map((d) => entry(d, "tree", `${d}-t`))] }),
      // The first folder is itself too large: its own folders are read one by one.
      [`${API}/git/trees/d0-t?recursive=1`]: () => json({ truncated: true, tree: [] }),
      [`${API}/git/trees/d0-t`]: () => json({ tree: [entry("deep", "tree", "deep-t")] }),
      [`${API}/git/trees/deep-t?recursive=1`]: () => json({ tree: [entry("x.ts", "blob")] }),
    };
    for (const d of folders.slice(1))
      routes[`${API}/git/trees/${d}-t?recursive=1`] = () => json({ tree: [entry("f.ts", "blob")] });
    const { fetcher } = github(routes);
    const steps: Step[] = [];
    const { snapshot: snap } = await readRepository(
      fetcher,
      { owner: "o", name: "r" },
      { onStep: (s) => steps.push(s) },
    );
    expect(snap.files.map((f) => f.path)).toEqual([
      "d0/deep/x.ts",
      ...folders.slice(1).map((d) => `${d}/f.ts`),
      "top.ts",
    ]);
    expect(snap.workspaces).toBeUndefined();
    const tree = steps.filter((s) => s.phase === "tree");
    // Known: the root, then d1 from the truncated answer, then every folder; read: each folder as its entries arrive.
    expect(tree.slice(0, 3)).toEqual([
      { phase: "tree", done: 0, of: 1, requests: 1 },
      { phase: "tree", done: 0, of: 2, requests: 2 },
      { phase: "tree", done: 1, of: 6, requests: 3 },
    ]);
    expect(tree.at(-1)).toEqual({ phase: "tree", done: 7, of: 7, requests: 10 });
    const done = tree.map((s) => s.done!);
    expect(done).toEqual(done.toSorted((a, b) => a - b));
  });

  it("stops when its signal aborts: between requests, and in the middle of one", async () => {
    const controller = new AbortController();
    const { fetcher, asked } = github({
      [`${API}/commits/HEAD`]: () => {
        controller.abort();
        return commit();
      },
    });
    const repo = { owner: "o", name: "r" };
    await expect(readRepository(fetcher, repo, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(asked).toEqual([`${API}/commits/HEAD`]);
    // A fetch the signal aborts rejects with the abort, never as being offline.
    const aborting = new AbortController();
    const hanging: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        aborting.abort();
      });
    await expect(readRepository(hanging, repo, { signal: aborting.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("stops after the tree when aborted while the manifests are read", async () => {
    const controller = new AbortController();
    const { fetcher } = github({
      [`${API}/commits/HEAD`]: commit,
      [`${API}/git/trees/t0?recursive=1`]: () => json({ tree: [entry("package.json", "blob")] }),
      [`${RAW}/package.json`]: () => {
        controller.abort();
        throw new Error("aborted");
      },
    });
    await expect(
      readRepository(fetcher, { owner: "o", name: "r" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("leaves out a manifest it cannot read, or one that declares no members", async () => {
    const { fetcher } = github({
      [`${API}/commits/HEAD`]: commit,
      [`${API}/git/trees/t0?recursive=1`]: () =>
        json({ tree: [entry("package.json", "blob"), entry("Cargo.toml", "blob"), entry("go.work", "blob")] }),
      [`${RAW}/package.json`]: () => new Response(JSON.stringify({ name: "solo" })),
      [`${RAW}/go.work`]: () => {
        throw new Error("offline");
      },
    });
    const { snapshot: snap } = await readRepository(fetcher, { owner: "o", name: "r" });
    expect(snap.workspaces).toBeUndefined();
    expect(snap.files).toHaveLength(3);
  });

  it("names every failure: unknown, rate limited, failed, offline, and an answer of the wrong shape", async () => {
    const repo = { owner: "o", name: "r" };
    await expect(readRepository(github({}).fetcher, repo)).rejects.toThrow("github/not-found");
    const limited = github({
      [`${API}/commits/HEAD`]: () => json({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" }),
    });
    await expect(readRepository(limited.fetcher, repo)).rejects.toMatchObject({
      code: "github/rate-limited",
      detail: { reset: 1700000000 },
    });
    const noReset = github({ [`${API}/commits/HEAD`]: () => json({}, 429, { "x-ratelimit-remaining": "0" }) });
    await expect(readRepository(noReset.fetcher, repo)).rejects.toMatchObject({ detail: { reset: 0 } });
    const forbidden = github({ [`${API}/commits/HEAD`]: () => json({}, 403) });
    await expect(readRepository(forbidden.fetcher, repo)).rejects.toMatchObject({
      code: "github/failed",
      detail: { status: 403 },
    });
    await expect(readRepository(offline, repo)).rejects.toThrow("github/offline");
    const odd = github({ [`${API}/commits/HEAD`]: () => json({ sha: "c1", commit: {} }) });
    await expect(readRepository(odd.fetcher, repo)).rejects.toThrow("github/failed: GitHub's answer has no tree");
    const noTree = github({
      [`${API}/commits/HEAD`]: commit,
      [`${API}/git/trees/t0?recursive=1`]: () => json({ truncated: false }),
    });
    await expect(readRepository(noTree.fetcher, repo)).rejects.toThrow("github/failed: GitHub's answer has no tree");
    const notObject = github({ [`${API}/commits/HEAD`]: () => json(null) });
    await expect(readRepository(notObject.fetcher, repo)).rejects.toThrow("github/failed");
  });
});
