import { describe, expect, it } from "vitest";
import { MAX_FILES, parseSnapshot } from "./snapshot";

const file = (path: string, firstSeen = 0) => ({ path, identity: `${path}@${firstSeen}`, firstSeen });
const valid = (files = [file("a.ts"), file("src/b.ts", 1)]) => ({
  repository: "demo",
  commit: "a".repeat(40),
  index: 1,
  files,
  folderFirstSeen: { "": 0, src: 1 },
});

describe("parseSnapshot", () => {
  it("accepts a valid snapshot", () => {
    const snapshot = parseSnapshot(valid());
    expect(snapshot.files.map((f) => f.path)).toEqual(["a.ts", "src/b.ts"]);
    expect(snapshot.folderFirstSeen.get("src")).toBe(1);
  });

  it("keeps the declared workspace members, sorted", () => {
    expect(parseSnapshot({ ...valid(), workspaces: ["pkg/b", "apps/a"] }).workspaces).toEqual(["apps/a", "pkg/b"]);
    expect(parseSnapshot(valid()).workspaces).toBeUndefined();
  });

  it("rejects workspaces that are not folder paths", () => {
    expect(() => parseSnapshot({ ...valid(), workspaces: "apps" })).toThrow("snapshot/bad-shape");
    expect(() => parseSnapshot({ ...valid(), workspaces: ["../x"] })).toThrow("snapshot/bad-shape");
  });

  it("keeps the submodules' folders, sorted, and rejects any that is not a folder path", () => {
    expect(parseSnapshot({ ...valid(), submodules: ["vendor/b", "ext/a"] }).submodules).toEqual(["ext/a", "vendor/b"]);
    expect(parseSnapshot(valid()).submodules).toBeUndefined();
    expect(() => parseSnapshot({ ...valid(), submodules: "ext" })).toThrow("snapshot/bad-shape");
    expect(() => parseSnapshot({ ...valid(), submodules: ["/ext"] })).toThrow("snapshot/bad-shape");
  });

  it("accepts the working tree as a commit", () => {
    expect(parseSnapshot({ ...valid(), commit: "worktree" }).commit).toBe("worktree");
  });

  it.each([
    ["a non-object", 7],
    ["a missing repository", { ...valid(), repository: "" }],
    ["a bad commit", { ...valid(), commit: "xyz" }],
    ["files that are not an array", { ...valid(), files: {} }],
    ["a file without identity", { ...valid(), files: [{ path: "a.ts", firstSeen: 0 }] }],
    ["a bad folder map", { ...valid(), folderFirstSeen: { src: -1 } }],
    ["a folder map that is not an object", { ...valid(), folderFirstSeen: [1] }],
  ])("rejects %s as a bad shape", (_, input) => {
    expect(() => parseSnapshot(input)).toThrow("snapshot/bad-shape");
  });

  it("rejects a negative or fractional index", () => {
    expect(() => parseSnapshot({ ...valid(), index: -1 })).toThrow("snapshot/bad-index");
    expect(() => parseSnapshot({ ...valid(), index: 1.5 })).toThrow("snapshot/bad-index");
  });

  it("rejects unsorted and duplicate paths", () => {
    expect(() => parseSnapshot(valid([file("b.ts"), file("a.ts")]))).toThrow("snapshot/not-sorted");
    expect(() => parseSnapshot(valid([file("a.ts"), file("a.ts")]))).toThrow("snapshot/duplicate-path");
  });

  it.each(["", "/abs.ts", "a//b.ts", "a/./b.ts", "a/../b.ts", "a/", "a\u0000b", "x".repeat(4097)])(
    "rejects the bad path %j",
    (path) => {
      expect(() => parseSnapshot(valid([file(path)]))).toThrow("snapshot/bad-path");
    },
  );

  it("rejects too many files", () => {
    const files = { length: MAX_FILES + 1 };
    expect(() => parseSnapshot({ ...valid(), files: Object.assign([], files) })).toThrow("snapshot/too-large");
  });
});
