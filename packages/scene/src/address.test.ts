import { describe, expect, it } from "vitest";
import { folderOf, parseAddress } from "./address";

describe("parseAddress", () => {
  it("reads a neighbourhood's folder and the lot's row, block, side and index", () => {
    expect(parseAddress("drivers/phy/intel:0.0.0.3")).toEqual({
      folder: "drivers/phy/intel",
      row: 0,
      block: 0,
      side: 0,
      index: 3,
    });
    expect(parseAddress("src:-2.-1.1.12")).toEqual({ folder: "src", row: -2, block: -1, side: 1, index: 12 });
  });

  it("drops the mark of a folder's own lots, and reads a town's top folder as empty", () => {
    expect(parseAddress("apps/live/lib#lots:2.0.0.3")?.folder).toBe("apps/live/lib");
    expect(parseAddress("#lots:0.1.0.1")?.folder).toBe("");
    expect(parseAddress(":0.0.0.6")?.folder).toBe("");
  });

  it("rejects what is not an address", () => {
    expect(parseAddress("a")).toBeNull();
    expect(parseAddress("src:1.2.3")).toBeNull();
    expect(parseAddress("src:a.b.c.d")).toBeNull();
  });
});

describe("folderOf", () => {
  it("is the path before its last slash, empty at the top", () => {
    expect(folderOf("src/ui/a.ts")).toBe("src/ui");
    expect(folderOf("a.ts")).toBe("");
    expect(folderOf("")).toBe("");
  });
});
