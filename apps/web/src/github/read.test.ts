import { describe, expect, it } from "vitest";
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
            entry("package.json", "blob"),
            entry("packages", "tree"),
            entry("packages/a/index.ts", "blob"),
            entry("vendor/lib", "commit"),
            entry("README.md", "blob"),
          ],
        }),
      [`${RAW}/package.json`]: () => new Response(JSON.stringify({ workspaces: ["packages/*"] })),
    });
    const counts: number[] = [];
    const snap = await readRepository(fetcher, { owner: "o", name: "r" }, (n) => counts.push(n));
    expect(snap).toMatchObject({ repository: "r", commit: "c1", index: 0, workspaces: ["packages/a"] });
    expect(snap.files.map((f) => f.path)).toEqual(["README.md", "package.json", "packages/a/index.ts"]);
    expect(counts).toEqual([1, 2]);
  });

  it("reads a truncated tree folder by folder, splitting again where needed, a few at a time", async () => {
    const folders = Array.from({ length: IN_FLIGHT + 1 }, (_, i) => `d${i}`);
    const routes: Record<string, () => Response> = {
      [`${API}/commits/HEAD`]: commit,
      [`${API}/git/trees/t0?recursive=1`]: () => json({ truncated: true, tree: [] }),
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
    const snap = await readRepository(fetcher, { owner: "o", name: "r" });
    expect(snap.files.map((f) => f.path)).toEqual([
      "d0/deep/x.ts",
      ...folders.slice(1).map((d) => `${d}/f.ts`),
      "top.ts",
    ]);
    expect(snap.workspaces).toBeUndefined();
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
    const snap = await readRepository(fetcher, { owner: "o", name: "r" });
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
