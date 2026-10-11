import { describe, expect, it } from "vitest";
import { workspaceGroups, workspaceMembers } from "./workspace";

describe("workspaceMembers", () => {
  it("finds folders holding a manifest, outermost only", () => {
    const paths = [
      "package.json",
      "packages/a/package.json",
      "packages/a/fixtures/x/package.json",
      "crates/b/Cargo.toml",
      "app/App.csproj",
      "gems/c/c.gemspec",
      "src/index.ts",
    ];
    expect(workspaceMembers(paths)).toEqual(["app", "crates/b", "gems/c", "packages/a"]);
  });
});

describe("workspaceGroups", () => {
  it("keeps folders with two or more members whose land is mostly source", () => {
    const paths = [
      "packages/a/package.json",
      "packages/a/src/index.ts",
      "packages/b/package.json",
      "packages/b/src/index.ts",
      "packages/b/README.md",
      "fixtures/x/package.json",
      "fixtures/y/package.json",
      "lone/z/package.json",
    ];
    expect(workspaceGroups(paths)).toEqual(["packages"]);
  });

  it("drops a group whose land is mostly not source", () => {
    const paths = ["tools/a/package.json", "tools/a/a.json", "tools/b/package.json", "tools/b/b.json", "tools/b/x.ts"];
    expect(workspaceGroups(paths)).toEqual([]);
  });

  it("drops groups nested inside groups", () => {
    const paths = [
      "packages/a/package.json",
      "packages/a/index.ts",
      "packages/b/package.json",
      "packages/b/index.ts",
      "packages/group/c/package.json",
      "packages/group/c/index.ts",
      "packages/group/d/package.json",
      "packages/group/d/index.ts",
    ];
    expect(workspaceGroups(paths)).toEqual(["packages"]);
  });
});
