import { describe, expect, it } from "vitest";
import { statusOf } from "./phases";

describe("statusOf", () => {
  it.each([
    [{ phase: "listing" }, "Listing the folder's files…"],
    [{ phase: "index" }, "repo: reading the git index…"],
    [{ phase: "folder", files: 12_345 }, "repo: reading the folder… (12,345 files)"],
    [{ phase: "manifests" }, "repo: reading workspace manifests…"],
    [{ phase: "laying", files: 96_000 }, "repo: laying out 96,000 files…"],
    [{ phase: "drawing" }, "repo: drawing the map…"],
  ] as const)("says %j as a person reads it", (phase, text) => {
    expect(statusOf("repo", phase)).toBe(text);
  });
});
