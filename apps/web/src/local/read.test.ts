import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stateSnapshot } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { listedFolder } from "./folder";
import type { LocalPhase } from "./phases";
import { readLocal } from "./read";
import { listedFiles, type Tree } from "./testing/folders";
import { WALK_REPORT } from "./walk";

const index = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "testing/indexes", `${name}.index`)));
const COMMIT = "c".repeat(40);
const MANIFEST = '{ "workspaces": ["packages/*"] }\n';
/** The v2 fixture's repository, as a working tree: its index, HEAD and the files the reader opens. */
const REPO: Tree = {
  ".git": { HEAD: "ref: refs/heads/main\n", refs: { heads: { main: `${COMMIT}\n` } }, index: index("v2") },
  "package.json": MANIFEST,
  "README.md": "# fixture\n",
};
const read = (tree: Tree, phases: LocalPhase[] = [], limit?: number) =>
  readLocal(listedFolder(listedFiles("fixture", tree)), (p) => phases.push(p), limit);
const listing = (): { entries: { mode: string; path: string }[] } =>
  JSON.parse(readFileSync(join(import.meta.dirname, "testing/indexes/v2.json"), "utf8"));
const V2_PATHS = listing()
  .entries.filter((e) => e.mode !== "160000")
  .map((e) => e.path);

describe("readLocal", () => {
  it("lays what the index tracks, with the commit HEAD names and members from the working tree's manifests", async () => {
    const phases: LocalPhase[] = [];
    const result = await read(REPO, phases);
    expect(result.snapshot).toEqual(stateSnapshot("fixture", COMMIT, V2_PATHS, ["packages/a", "packages/b"]));
    expect(result).toMatchObject({
      source: "index",
      index: { version: 2, entries: V2_PATHS.length, submodules: 1 },
      head: "ref",
      unread: [],
    });
    expect(phases).toEqual([{ phase: "index" }, { phase: "manifests" }]);
  });

  it("leaves out a tracked manifest missing from the working tree, and names it", async () => {
    const { "package.json": _, ...withoutManifest } = REPO;
    const result = await read(withoutManifest);
    expect(result.snapshot.workspaces).toBeUndefined();
    expect(result.unread).toEqual(["package.json"]);
  });

  it("passes on a refusal to read a manifest", async () => {
    const refused = {
      webkitRelativePath: "fixture/package.json",
      arrayBuffer: () => Promise.reject(new DOMException("no", "NotAllowedError")),
    };
    const files = [...listedFiles("fixture", REPO).filter((f) => !f.webkitRelativePath.endsWith(".json")), refused];
    await expect(readLocal(listedFolder(files), () => {})).rejects.toMatchObject({ code: "local/denied" });
  });

  it("lays a folder without git from its files, honouring .gitignore, as the worktree", async () => {
    const phases: LocalPhase[] = [];
    const result = await read({ ".gitignore": "dist/\n", "a.ts": "", dist: { "a.js": "" } }, phases);
    expect(result.snapshot).toEqual(stateSnapshot("fixture", "worktree", [".gitignore", "a.ts"]));
    expect(result).toMatchObject({ source: "walk", index: null, head: null });
    expect(phases).toEqual([{ phase: "index" }, { phase: "folder", files: 0 }, { phase: "manifests" }]);
  });

  it("counts the files of a folder without git as it reads, and passes over a manifest without members", async () => {
    const phases: LocalPhase[] = [];
    const many: Tree = Object.fromEntries(Array.from({ length: WALK_REPORT }, (_, i) => [`f${i}.ts`, ""] as const));
    const result = await read({ ...many, "package.json": '{ "name": "solo" }' }, phases);
    expect(result.snapshot.workspaces).toBeUndefined();
    expect(phases).toContainEqual({ phase: "folder", files: WALK_REPORT });
  });

  it("names a repository without an index, and one that tracks nothing", async () => {
    await expect(read({ ".git": { HEAD: "ref: refs/heads/main\n" } })).rejects.toMatchObject({
      code: "local/no-index",
    });
    await expect(read({ ".git": { HEAD: "x", index: index("empty") } })).rejects.toMatchObject({ code: "local/empty" });
  });

  it("names more files than a city holds, and a path longer than it holds", async () => {
    await expect(read(REPO, [], 3)).rejects.toMatchObject({ code: "local/too-large", detail: { files: 10 } });
    await expect(read({ [`${"x".repeat(4097)}.ts`]: "" })).rejects.toMatchObject({ code: "local/long-path" });
  });
});
