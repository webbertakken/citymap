import { describe, expect, it } from "vitest";
import { handleFolder, listedFolder } from "./folder";
import { fakeHandle, listedFiles, type Tree } from "./testing/folders";
import { WALK_REPORT, walkFolder } from "./walk";

const TREE: Tree = {
  ".gitignore": "node_modules/\n*.log\n!keep.log\n/build\n# a comment\n",
  "keep.log": "",
  "debug.log": "",
  "index.ts": "",
  build: { "out.js": "" },
  node_modules: { x: { "index.js": "" } },
  src: {
    ".gitignore": "!debug.log\ngenerated/\n",
    "debug.log": "",
    "main.ts": "",
    build: { "kept.ts": "" },
    generated: { "g.ts": "" },
    deep: { "a.log": "", "b.ts": "" },
  },
  vendor: { lib: { ".git": { HEAD: "x" }, "lib.c": "" } },
};

const KEPT = [
  ".gitignore",
  "index.ts",
  "keep.log",
  "src/.gitignore",
  "src/build/kept.ts",
  "src/debug.log",
  "src/deep/b.ts",
  "src/main.ts",
  "vendor/lib/lib.c",
];

describe("walkFolder", () => {
  it("lays every file but what the .gitignore files exclude, deeper files overriding", async () => {
    expect((await walkFolder(listedFolder(listedFiles("site", TREE)), () => {})).toSorted()).toEqual(KEPT);
  });

  it("never lists an ignored folder, nor any .git", async () => {
    const asked: string[] = [];
    const files = await walkFolder(handleFolder(fakeHandle("site", TREE, asked)), () => {});
    expect(files.toSorted()).toEqual(KEPT);
    expect(asked).not.toContain("node_modules/*");
    expect(asked).not.toContain("src/generated/*");
    expect(asked).not.toContain("vendor/lib/.git/*");
    expect(asked).toContain("src/deep/*");
  });

  it("matches case as git does by default", async () => {
    const files = await walkFolder(
      listedFolder(listedFiles("site", { ".gitignore": "*.LOG\n", "a.log": "" })),
      () => {},
    );
    expect(files.toSorted()).toEqual([".gitignore", "a.log"]);
  });

  it("counts as it goes, every so many files", async () => {
    const many: Tree = Object.fromEntries(
      Array.from({ length: WALK_REPORT * 2 + 1 }, (_, i) => [`f${i}.ts`, ""] as const),
    );
    const counts: number[] = [];
    const files = await walkFolder(listedFolder(listedFiles("big", many)), (n) => counts.push(n));
    expect(files).toHaveLength(WALK_REPORT * 2 + 1);
    expect(counts).toEqual([WALK_REPORT, WALK_REPORT * 2]);
  });

  it("stops at more files than a city holds", async () => {
    const folder = listedFolder(listedFiles("big", { a: "", b: "", c: { d: "", e: "" } }));
    await expect(walkFolder(folder, () => {}, 3)).rejects.toMatchObject({
      code: "local/too-large",
      detail: { files: 4 },
    });
  });
});
