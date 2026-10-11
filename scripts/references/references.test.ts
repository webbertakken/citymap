import { describe, expect, it } from "vitest";
import { referencedDir, referencePaths, referenceProblems, workspacePatterns } from "./references.ts";

describe("referencedDir", () => {
  it.each([
    ["./packages/a", "packages/a"],
    ["packages/a", "packages/a"],
    ["./packages/a/", "packages/a"],
    ["./packages/a/tsconfig.json", "packages/a"],
    ["./tsconfig.tooling.json", "tsconfig.tooling.json"],
  ])("reads %s as %s", (path, dir) => {
    expect(referencedDir(path)).toBe(dir);
  });
});

describe("referenceProblems", () => {
  it("passes when every workspace is referenced", () => {
    const workspaces = [
      { dir: "packages/a", hasTsconfig: true },
      { dir: "apps/b", hasTsconfig: true },
    ];

    expect(referenceProblems(workspaces, ["./tsconfig.tooling.json", "./packages/a", "apps/b/tsconfig.json"])).toEqual(
      [],
    );
  });

  it("passes when there are no workspaces", () => {
    expect(referenceProblems([], ["./tsconfig.tooling.json"])).toEqual([]);
  });

  it("names a workspace without a tsconfig.json", () => {
    expect(referenceProblems([{ dir: "packages/a", hasTsconfig: false }], [])).toEqual([
      "packages/a has no tsconfig.json",
    ]);
  });

  it("names a workspace the root does not reference", () => {
    expect(referenceProblems([{ dir: "packages/a", hasTsconfig: true }], ["./packages/ab"])).toEqual([
      "packages/a is missing from the root tsconfig.json references",
    ]);
  });
});

describe("workspacePatterns", () => {
  it("reads the workspace globs", () => {
    expect(workspacePatterns({ workspaces: ["packages/*", "apps/*"] })).toEqual(["packages/*", "apps/*"]);
  });

  it.each([null, [], {}, { workspaces: "packages/*" }, { workspaces: [1] }])("rejects %j", (manifest) => {
    expect(() => workspacePatterns(manifest)).toThrow("package.json: `workspaces` must be a list of globs");
  });
});

describe("referencePaths", () => {
  it("reads the reference paths", () => {
    expect(referencePaths({ files: [], references: [{ path: "./a" }, { path: "b" }] })).toEqual(["./a", "b"]);
  });

  it.each([null, {}, { references: {} }])("rejects %j without a list of references", (tsconfig) => {
    expect(() => referencePaths(tsconfig)).toThrow("tsconfig.json: `references` must be a list");
  });

  it.each([[["./a"]], [[{}]], [[{ path: 1 }]]])("rejects references %j without a path", (references) => {
    expect(() => referencePaths({ references })).toThrow("tsconfig.json: every reference needs a `path`");
  });
});
