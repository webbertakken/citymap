import { describe, expect, it } from "vitest";
import { localStep } from "./phases";

describe("localStep", () => {
  it.each([
    [{ phase: "index" }, { phase: "index" }],
    [
      { phase: "folder", files: 12_345 },
      { phase: "folder", done: 12_345 },
    ],
    [{ phase: "manifests" }, { phase: "manifests" }],
    [
      { phase: "laying", files: 96_000 },
      { phase: "lay", files: 96_000 },
    ],
    [{ phase: "drawing" }, { phase: "draw" }],
  ] as const)("takes %j to the card as %j", (phase, step) => {
    expect(localStep(phase)).toEqual(step);
  });
});
