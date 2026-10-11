import { describe, expect, it } from "vitest";
import { FORMS, isFlat } from "./forms";

describe("isFlat", () => {
  it("tells the neighbourhood forms from the district forms", () => {
    expect(FORMS.filter(isFlat)).toEqual(["hamlet", "street-village", "neighbourhood"]);
    expect(isFlat(undefined)).toBe(false);
  });
});
