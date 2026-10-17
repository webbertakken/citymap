import { describe, expect, it } from "vitest";
import { isSafeModulePath, parseGitmodules } from "./gitmodules";

describe("parseGitmodules", () => {
  it("reads each submodule's path, name and url", () => {
    const text = `[submodule "cargo"]
\tpath = src/tools/cargo
\turl = https://github.com/rust-lang/cargo.git
[submodule "library/stdarch"]
  path = "library/stdarch"
  url = https://github.com/rust-lang/stdarch.git ; a comment
  branch = main
`;
    expect([...parseGitmodules(text)]).toEqual([
      ["src/tools/cargo", { name: "cargo", url: "https://github.com/rust-lang/cargo.git" }],
      ["library/stdarch", { name: "library/stdarch", url: "https://github.com/rust-lang/stdarch.git" }],
    ]);
  });

  it("passes over comments, other sections, keys in any case, and sections without a path", () => {
    const text = `# top
[core]
  path = nope
[submodule "a"]
  URL = git@github.com:o/a.git
  Path = vendor/a/
[submodule "no-path"]
  url = x
`;
    expect([...parseGitmodules(text)]).toEqual([["vendor/a", { name: "a", url: "git@github.com:o/a.git" }]]);
  });

  it("keeps the first section naming a path, and an empty url when none is given", () => {
    const text = `[submodule "one"]\n path = x\n[submodule "two"]\n path = x\n url = u\n`;
    expect([...parseGitmodules(text)]).toEqual([["x", { name: "one", url: "" }]]);
  });

  it("reads nothing from text that is not a gitmodules file", () => {
    expect(parseGitmodules("").size).toBe(0);
    expect(parseGitmodules("\u0000\u0001 binary").size).toBe(0);
  });
});

describe("isSafeModulePath", () => {
  it("takes relative paths of plain segments only", () => {
    expect(isSafeModulePath("src/tools/cargo")).toBe(true);
    for (const bad of ["", "/abs", "a/../b", "..", "a\\b", "a\u0000b", "a//b", "./a", "a/"])
      expect(isSafeModulePath(bad)).toBe(false);
  });
});
