import { describe, expect, it } from "vitest";
import { githubRepositoryOf } from "./submodules";

const parent = { owner: "rust-lang", name: "rust" };

describe("githubRepositoryOf", () => {
  it.each([
    ["https://github.com/rust-lang/cargo.git", "rust-lang/cargo"],
    ["https://github.com/rust-lang/cargo", "rust-lang/cargo"],
    ["https://github.com/rust-lang/cargo/", "rust-lang/cargo"],
    ["http://github.com/o/r.git", "o/r"],
    ["https://www.github.com/o/r", "o/r"],
    ["git@github.com:o/r.git", "o/r"],
    ["ssh://git@github.com/o/r.git", "o/r"],
    ["git://github.com/o/r", "o/r"],
    ["../stdarch.git", "rust-lang/stdarch"],
    ["../../llvm/llvm-project.git", "llvm/llvm-project"],
    ["./../book", "rust-lang/book"],
  ])("reads %s as a GitHub repository", (url, name) => {
    const found = githubRepositoryOf(url, parent);
    expect(typeof found === "string" ? found : `${found.owner}/${found.name}`).toBe(name);
  });

  it.each([
    ["https://gitlab.com/o/r.git", "host"],
    ["https://github.com/o", "host"],
    ["https://github.com/o/r/tree/main", "host"],
    ["./sub", "host"],
    ["../../../far", "host"],
    ["../..", "host"],
    ["https://github.com/o/.", "host"],
    ["https://github.com/o/..", "host"],
    ["https://github.com/bad_owner/r", "host"],
    ["", "no-url"],
    ["  ", "no-url"],
  ])("names why %s is not one", (url, reason) => {
    expect(githubRepositoryOf(url, parent)).toBe(reason);
  });
});
