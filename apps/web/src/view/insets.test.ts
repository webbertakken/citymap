import { describe, expect, it } from "vitest";
import { insetsFor } from "./insets";

describe("insetsFor", () => {
  it("keeps the city clear of the title row and an open drawer on a wide screen", () => {
    expect(insetsFor({ width: 1600, height: 960 }, null)).toEqual({ top: 100, right: 352, bottom: 0, left: 0 });
    expect(insetsFor({ width: 1600, height: 960 }, true)).toEqual({ top: 100, right: 352, bottom: 0, left: 0 });
    expect(insetsFor({ width: 1600, height: 960 }, false)).toEqual({ top: 100, right: 0, bottom: 0, left: 0 });
  });

  it("clears the search under the title on a medium screen", () => {
    expect(insetsFor({ width: 1000, height: 800 }, null)).toEqual({ top: 156, right: 352, bottom: 0, left: 0 });
  });

  it("clears the top cards and the details button on a phone, or half the height when the sheet is open", () => {
    expect(insetsFor({ width: 390, height: 844 }, null)).toEqual({ top: 140, right: 0, bottom: 64, left: 0 });
    expect(insetsFor({ width: 390, height: 844 }, false)).toEqual({ top: 140, right: 0, bottom: 64, left: 0 });
    expect(insetsFor({ width: 390, height: 844 }, true)).toEqual({ top: 140, right: 0, bottom: 422, left: 0 });
  });
});
