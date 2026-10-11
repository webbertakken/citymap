import { describe, expect, it } from "vitest";
import { isManifest, patternsOf, resolveWorkspaces } from "./manifests";

describe("isManifest", () => {
  it("knows the root workspace manifests", () => {
    for (const f of [
      "package.json",
      "pnpm-workspace.yaml",
      "lerna.json",
      "Cargo.toml",
      "go.work",
      "pyproject.toml",
      "deno.json",
      "deno.jsonc",
    ])
      expect(isManifest(f)).toBe(true);
    expect(isManifest("apps/web/package.json")).toBe(false);
    expect(isManifest("README.md")).toBe(false);
  });
});

describe("patternsOf", () => {
  it("reads npm, Yarn and Bun workspaces, as a list or under packages", () => {
    expect(patternsOf("package.json", '{"workspaces":["apps/*","packages/*","!packages/old"]}')).toEqual({
      include: ["apps/*", "packages/*"],
      exclude: ["packages/old"],
    });
    expect(patternsOf("package.json", '{"workspaces":{"packages":["libs/**"]}}')).toEqual({
      include: ["libs/**"],
      exclude: [],
    });
    expect(patternsOf("package.json", '{"name":"x"}')).toBeNull();
    expect(patternsOf("package.json", "{not json")).toBeNull();
  });

  it("reads pnpm and Lerna", () => {
    expect(
      patternsOf(
        "pnpm-workspace.yaml",
        "packages:\n  - 'apps/*'\n  - \"tools/x\"\n  - packages/**\n  - '!**/test/**'\ncatalog:\n  react: 19\n",
      ),
    ).toEqual({ include: ["apps/*", "tools/x", "packages/**"], exclude: ["**/test/**"] });
    expect(patternsOf("pnpm-workspace.yaml", "catalog:\n  a: 1\n")).toBeNull();
    expect(patternsOf("lerna.json", '{"packages":["modules/*"]}')).toEqual({ include: ["modules/*"], exclude: [] });
  });

  it("reads Cargo, uv and Deno", () => {
    expect(
      patternsOf(
        "Cargo.toml",
        '[package]\nname = "x"\n\n[workspace]\nmembers = [\n  "crates/*",\n  "tools/cli", # the cli\n]\nexclude = ["crates/old"]\n',
      ),
    ).toEqual({ include: ["crates/*", "tools/cli"], exclude: ["crates/old"] });
    expect(patternsOf("Cargo.toml", '[package]\nname = "x"\n')).toBeNull();
    expect(
      patternsOf("pyproject.toml", '[project]\nname = "x"\n[tool.uv.workspace]\nmembers = ["packages/*"]\n'),
    ).toEqual({
      include: ["packages/*"],
      exclude: [],
    });
    expect(patternsOf("deno.jsonc", '{\n  // members\n  "workspace": ["./add", "./subtract"]\n}')).toEqual({
      include: ["add", "subtract"],
      exclude: [],
    });
  });

  it("reads go.work in both forms", () => {
    expect(patternsOf("go.work", "go 1.22\n\nuse (\n\t./api\n\t./web // site\n)\nuse ./tools\n")).toEqual({
      include: ["api", "web", "tools"],
      exclude: [],
    });
  });
});

describe("resolveWorkspaces", () => {
  const folders = ["apps", "apps/web", "apps/api", "packages", "packages/a", "packages/a/src", "packages/old", "docs"];

  it("matches globs against folders, minus exclusions", () => {
    expect(resolveWorkspaces([{ include: ["apps/*", "packages/*"], exclude: ["packages/old"] }], folders)).toEqual([
      "apps/api",
      "apps/web",
      "packages/a",
    ]);
  });

  it("matches ** across levels and exact paths", () => {
    expect(resolveWorkspaces([{ include: ["packages/**", "docs"], exclude: [] }], folders)).toEqual([
      "docs",
      "packages/a",
      "packages/a/src",
      "packages/old",
    ]);
  });

  it("joins every manifest's patterns", () => {
    expect(
      resolveWorkspaces(
        [
          { include: ["apps/web"], exclude: [] },
          { include: ["apps/api"], exclude: [] },
        ],
        folders,
      ),
    ).toEqual(["apps/api", "apps/web"]);
  });
});

describe("patternsOf, less common forms", () => {
  it("reads a TOML section followed by another, single quotes, and none without members", () => {
    expect(patternsOf("Cargo.toml", "[workspace]\nmembers = ['a', \"b\"]\n\n[profile.release]\nlto = true\n")).toEqual({
      include: ["a", "b"],
      exclude: [],
    });
    expect(patternsOf("Cargo.toml", '[workspace]\nexclude = ["x"]\n')).toBeNull();
  });

  it("reads a pnpm list that ends the file, a plain deno.json, and nothing from a go.work without use", () => {
    expect(patternsOf("pnpm-workspace.yaml", "packages:\n  - libs/*")).toEqual({ include: ["libs/*"], exclude: [] });
    expect(patternsOf("deno.json", '{"workspace":["./a"]}')).toEqual({ include: ["a"], exclude: [] });
    expect(patternsOf("go.work", "go 1.22\n")).toBeNull();
  });
});

describe("resolveWorkspaces, single characters", () => {
  it("matches **/ at any depth, the root included", () => {
    expect(
      resolveWorkspaces([{ include: ["**/fixtures"], exclude: [] }], ["fixtures", "a/b/fixtures", "a/fixturesx"]),
    ).toEqual(["a/b/fixtures", "fixtures"]);
  });

  it("matches ? as one character within a folder name", () => {
    expect(resolveWorkspaces([{ include: ["pkg/v?"], exclude: [] }], ["pkg/v1", "pkg/v10", "pkg/v2"])).toEqual([
      "pkg/v1",
      "pkg/v2",
    ]);
  });
});
