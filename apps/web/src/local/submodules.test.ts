import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalError } from "./errors";
import { handleFolder, listedFolder, type Folder } from "./folder";
import { SUBMODULE_DEPTH, readSubmodules } from "./submodules";
import { fakeHandle, listedFiles, type Tree } from "./testing/folders";

const index = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "testing/indexes", `${name}.index`)));
const tracked = (name: string): string[] => {
  const json: { entries: { mode: string; path: string }[] } = JSON.parse(
    readFileSync(join(import.meta.dirname, "testing/indexes", `${name}.json`), "utf8"),
  );
  return [...new Set(json.entries.filter((e) => e.mode !== "160000").map((e) => e.path))];
};

/** A checkout whose submodule at vendor/sub keeps its git data in .git/modules, its index the v3 fixture. */
const checkout = (sub: Tree = { ".git": "gitdir: ../../.git/modules/vendor/sub\n" }): Tree => ({
  ".git": { index: index("v2"), modules: { vendor: { sub: { index: index("v3") } } } },
  vendor: { sub },
});

describe("readSubmodules", () => {
  it.each([
    ["a folder dialog", (tree: Tree) => handleFolder(fakeHandle("repo", tree))],
    ["the folder input", (tree: Tree) => listedFolder(listedFiles("repo", tree))],
  ])("reads a submodule's tracked paths through its own index, under its folder, through %s", async (_, open) => {
    const read = await readSubmodules(open(checkout()), ["vendor/sub"]);
    expect(read.paths).toEqual(tracked("v3").map((p) => `vendor/sub/${p}`));
    expect(read.submodules).toEqual(["vendor/sub"]);
    expect(read.unread).toEqual([]);
  });

  it("reads a submodule whose git data is its own .git folder", async () => {
    const folder = handleFolder(fakeHandle("repo", checkout({ ".git": { index: index("v4") } })));
    const read = await readSubmodules(folder, ["vendor/sub"]);
    expect(read.paths).toEqual(tracked("v4").map((p) => `vendor/sub/${p}`));
  });

  it.each([
    ["not checked out (no folder)", { ".git": { index: index("v2") } }, "not-checked-out"],
    ["not checked out (an empty folder)", checkout({}), "not-checked-out"],
    ["git data outside the folder", checkout({ ".git": "gitdir: ../../../elsewhere\n" }), "outside"],
    ["a .git file without a gitdir line", checkout({ ".git": "nothing here\n" }), "bad-git-file"],
    [
      "no index",
      {
        ".git": { modules: { vendor: { sub: {} } } },
        vendor: { sub: { ".git": "gitdir: ../../.git/modules/vendor/sub\n" } },
      },
      "no-index",
    ],
    ["an index not read", checkout({ ".git": { index: index("split") } }), "index"],
  ] as const)("lays a submodule as its .gitlink file when %s", async (_, tree, reason) => {
    const read = await readSubmodules(handleFolder(fakeHandle("repo", tree)), ["vendor/sub"]);
    expect(read.paths).toEqual(["vendor/sub/.gitlink"]);
    expect(read.submodules).toEqual(["vendor/sub"]);
    expect(read.unread).toEqual([{ path: "vendor/sub", reason }]);
  });

  it("reads nested submodules in turn, and stops past the depth limit", async () => {
    // The submodule's index is v2 again, which holds a submodule at vendor/sub: each level finds the next.
    const level = (depth: number): Tree =>
      depth === 0 ? {} : { ".git": { index: index("v2") }, vendor: { sub: level(depth - 1) } };
    const tree: Tree = { ".git": { index: index("v2") }, vendor: { sub: level(SUBMODULE_DEPTH + 2) } };
    const read = await readSubmodules(handleFolder(fakeHandle("repo", tree)), ["vendor/sub"]);
    const deepest = Array.from({ length: SUBMODULE_DEPTH + 1 }, () => "vendor/sub").join("/");
    expect(read.submodules.at(-1)).toBe(deepest);
    expect(read.submodules).toHaveLength(SUBMODULE_DEPTH + 1);
    expect(read.unread).toEqual([{ path: deepest, reason: "depth" }]);
    expect(read.paths).toContain(`${deepest}/.gitlink`);
    expect(read.paths).toContain("vendor/sub/README.md");
  });

  it("fails the read when a file vanishes while it is read", async () => {
    const vanishing: Folder = {
      name: "repo",
      kind: async () => "file",
      read: async () => {
        throw new LocalError("local/vanished", "gone");
      },
      list: async () => [],
    };
    await expect(readSubmodules(vanishing, ["vendor/sub"])).rejects.toThrow("local/vanished");
  });

  it("reads nothing when there are no gitlinks", async () => {
    expect(await readSubmodules(handleFolder(fakeHandle("repo", {})), [])).toEqual({
      paths: [],
      submodules: [],
      unread: [],
    });
  });

  it("lists the submodules it could not read by path, whatever order they were read in", async () => {
    const read = await readSubmodules(handleFolder(fakeHandle("repo", {})), ["b/x", "a/y"]);
    expect(read.unread.map((u) => u.path)).toEqual(["a/y", "b/x"]);
  });
});
