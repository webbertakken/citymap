import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareKeys } from "@citymap/ground-plan";
import { afterEach, describe, expect, it } from "vitest";
import { gitEnvironment } from "./env";
import { fetchManifests, laidManifests, promisorRemotes, rootTrees } from "./fetch-manifests";
import { readHistory, type HistoryEvent } from "./read";
import { commit, git, repo, removeRepos, write } from "./testing/repos";
import { readTree } from "./tree";

const clones: string[] = [];
afterEach(() => {
  removeRepos();
  for (const dir of clones.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Four commits, each changing the workspace manifest but the last, which adds a Cargo.toml; the blobs in order. */
function workspaceRepo(): { source: string; blobs: string[] } {
  const source = repo();
  write(source, "package.json", JSON.stringify({ workspaces: ["packages/*"] }));
  write(source, "packages/a/index.ts", "a");
  commit(source, "one");
  write(source, "package.json", JSON.stringify({ workspaces: ["packages/*", "tools/*"] }));
  write(source, "packages/b/index.ts", "b");
  commit(source, "two");
  write(source, "package.json", JSON.stringify({ workspaces: ["packages/a"] }));
  commit(source, "three");
  write(source, "Cargo.toml", "[workspace]\nmembers = []\n");
  write(source, "packages/c/index.ts", "c");
  commit(source, "four");
  const blobs = ["HEAD~3", "HEAD~2", "HEAD"].map((at) => git(source, "rev-parse", `${at}:package.json`));
  return { source, blobs: [...blobs, git(source, "rev-parse", "HEAD:Cargo.toml")] };
}

/** A blob-less clone, without a checkout, of `source`, which serves its blobs by id. */
function partialCloneOf(source: string): string {
  git(source, "config", "uploadpack.allowFilter", "true");
  git(source, "config", "uploadpack.allowAnySHA1InWant", "true");
  const clone = mkdtempSync(join(tmpdir(), "citymap-manifests-partial-"));
  clones.push(clone);
  execFileSync("git", ["clone", "-q", "--no-checkout", "--filter=blob:none", `file://${source}`, clone], {
    env: gitEnvironment(),
  });
  return clone;
}

/** Whether a repository holds an object, asking nobody. */
const holds = (dir: string, id: string) => {
  try {
    git(dir, "cat-file", "-e", id);
    return true;
  } catch {
    return false;
  }
};

const read = async (dir: string, options: { from?: number } = {}) => {
  const events: HistoryEvent[] = [];
  const snaps = [];
  for await (const s of readHistory(dir, { ...options, onEvent: (e) => events.push(e) })) snaps.push(s);
  return { snaps, events };
};
const manifestsEvents = (events: readonly HistoryEvent[]) => events.filter((e) => e.code === "history/manifests");

describe("laidManifests", () => {
  it("names exactly the root manifest blobs of the commits laid, each once", async () => {
    const { source, blobs } = workspaceRepo();
    const trees = await rootTrees(source, git(source, "rev-parse", "HEAD"));
    expect(trees).toHaveLength(4);
    // Commits 0 and 3 laid: the first manifest blob, then the last one and the Cargo.toml.
    expect(await laidManifests(source, [trees[0]!, trees[3]!])).toEqual(
      [blobs[0]!, blobs[2]!, blobs[3]!].toSorted(compareKeys),
    );
    // A tree laid twice, or by an expression, is read once.
    expect(await laidManifests(source, [trees[3]!, "HEAD^{tree}"])).toEqual(
      [blobs[2]!, blobs[3]!].toSorted(compareKeys),
    );
  });
});

describe("promisorRemotes", () => {
  it("names the partial clone's remote first, and none for a full clone", async () => {
    const { source } = workspaceRepo();
    expect(await promisorRemotes(source)).toEqual([]);
    const clone = partialCloneOf(source);
    git(clone, "remote", "add", "spare", source);
    git(clone, "config", "remote.spare.promisor", "true");
    expect(await promisorRemotes(clone)).toEqual(["origin", "spare"]);
    // An older git names the partial clone's remote in extensions.partialclone: git asks it first.
    git(clone, "config", "extensions.partialclone", "spare");
    expect(await promisorRemotes(clone)).toEqual(["spare", "origin"]);
  });
});

describe("fetchManifests", () => {
  it("asks nothing of a full clone", async () => {
    const { source } = workspaceRepo();
    expect(await fetchManifests(source, async () => ["HEAD^{tree}"])).toBeNull();
  });

  it("fetches exactly the laid manifest blobs a partial clone does not hold, and nothing else", async () => {
    const { source, blobs } = workspaceRepo();
    const clone = partialCloneOf(source);
    expect(blobs.some((b) => holds(clone, b))).toBe(false);
    const trees = await rootTrees(clone, git(clone, "rev-parse", "HEAD"));
    const fetched = await fetchManifests(clone, async () => [trees[0]!, trees[3]!]);
    expect(fetched).toEqual({ code: "history/manifests", detail: { status: "fetched", blobs: 3, fetched: 3 } });
    expect(blobs.filter((_b, i) => i !== 1).every((b) => holds(clone, b))).toBe(true);
    // The manifest of a commit not laid, and every other file, stay where they are.
    expect(holds(clone, blobs[1]!)).toBe(false);
    expect(holds(clone, git(source, "rev-parse", "HEAD:packages/a/index.ts"))).toBe(false);
    // Held now, they are read as any blob is.
    expect(await fetchManifests(clone, async () => [trees[3]!])).toEqual({
      code: "history/manifests",
      detail: { status: "held", blobs: 2, fetched: 0 },
    });
  });

  it("says why when the manifests cannot be fetched", async () => {
    const { source } = workspaceRepo();
    const offline = partialCloneOf(source);
    git(offline, "remote", "set-url", "origin", join(offline, "gone"));
    expect(await fetchManifests(offline, async () => ["HEAD^{tree}"])).toEqual({
      code: "history/manifests",
      detail: {
        status: "unfetchable",
        blobs: 2,
        fetched: 0,
        reason: "exit-128",
        error: expect.stringMatching(/does not appear to be a git repository$/),
      },
    });
  });

  it("gives up after its timeout", async () => {
    const { source } = workspaceRepo();
    const clone = partialCloneOf(source);
    const ended = await fetchManifests(clone, async () => ["HEAD^{tree}"], 0);
    expect(ended?.detail).toMatchObject({ status: "unfetchable", reason: "timeout", fetched: 0 });
  });
});

describe("a partial clone's fold and single state", () => {
  it("lays the members a full clone lays, from the manifests it fetched", async () => {
    const { source } = workspaceRepo();
    const clone = partialCloneOf(source);
    const whole = await read(source);
    const partial = await read(clone);
    expect(partial.snaps.map((s) => s.workspaces)).toEqual(whole.snaps.map((s) => s.workspaces));
    expect(partial.snaps.at(-1)?.workspaces).toEqual(["packages/a"]);
    expect(manifestsEvents(whole.events)).toEqual([]);
    expect(manifestsEvents(partial.events)).toEqual([
      { code: "history/manifests", detail: { status: "fetched", blobs: 4, fetched: 4 } },
    ]);
    expect(partial.events.some((e) => e.code === "history/manifest-unavailable")).toBe(false);
    expect(partial.snaps.some((s) => "manifests" in s)).toBe(false);
    // A resumed read fetches what it lays.
    const again = partialCloneOf(source);
    expect((await read(again, { from: 2 })).snaps.at(-1)?.workspaces).toEqual(["packages/a"]);
    const single = await readTree(partialCloneOf(source), "HEAD");
    expect(single.workspaces).toEqual(["packages/a"]);
  });

  it("marks every snapshot when the manifests cannot be fetched", async () => {
    const { source } = workspaceRepo();
    const offline = partialCloneOf(source);
    git(offline, "remote", "set-url", "origin", join(offline, "gone"));
    const { snaps, events } = await read(offline);
    expect(snaps.every((s) => s.manifests === "unfetchable")).toBe(true);
    expect(snaps.at(-1)?.workspaces).toBeUndefined();
    expect(manifestsEvents(events)[0]?.detail).toMatchObject({ status: "unfetchable", blobs: 4 });
    const single = await readTree(offline, "HEAD", { onEvent: (e) => events.push(e) });
    expect(single.manifests).toBe("unfetchable");
  });
});
