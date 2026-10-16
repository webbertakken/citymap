import { describe, expect, it } from "vitest";
import { githubUrl } from "./github";

const origin = { owner: "torvalds", name: "linux", commit: "abc123" };

describe("githubUrl", () => {
  it("links a file as a blob and a folder as a tree, at the commit laid", () => {
    expect(githubUrl(origin, { path: "drivers/phy/intel/phy.c", type: "blob" })).toBe(
      "https://github.com/torvalds/linux/blob/abc123/drivers/phy/intel/phy.c",
    );
    expect(githubUrl(origin, { path: "drivers", type: "tree" })).toBe(
      "https://github.com/torvalds/linux/tree/abc123/drivers",
    );
  });

  it("links the repository's root for an empty path, and encodes each segment", () => {
    expect(githubUrl(origin, { path: "", type: "tree" })).toBe("https://github.com/torvalds/linux/tree/abc123");
    expect(githubUrl(origin, { path: "docs/a b#c?.md", type: "blob" })).toBe(
      "https://github.com/torvalds/linux/blob/abc123/docs/a%20b%23c%3F.md",
    );
  });
});
