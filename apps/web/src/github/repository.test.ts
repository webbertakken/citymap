import { describe, expect, it } from "vitest";
import { parseRepository } from "./repository";

describe("parseRepository", () => {
  it.each([
    ["facebook/react", "facebook", "react"],
    ["  vercel/next.js ", "vercel", "next.js"],
    ["https://github.com/home-assistant/core", "home-assistant", "core"],
    ["https://www.github.com/torvalds/linux/tree/master/kernel", "torvalds", "linux"],
    ["github.com/rust-lang/rust.git", "rust-lang", "rust"],
  ])("reads %j", (input, owner, name) => {
    expect(parseRepository(input)).toEqual({ owner, name });
  });

  it.each(["react", "", "a/", "/b", "has space/x", "a/..", "x".repeat(40) + "/y", "a/b c"])(
    "rejects %j by name",
    (input) => {
      expect(() => parseRepository(input)).toThrow("github/bad-name");
    },
  );
});
