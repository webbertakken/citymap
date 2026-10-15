import { describe, expect, it } from "vitest";
import { Grid, boxOf } from "./grid";

describe("Grid", () => {
  it("finds every item whose box meets the query, once, in insertion order, across cells", () => {
    const grid = new Grid(100);
    grid.add(
      boxOf([
        { x: 0, y: 0 },
        { x: 350, y: 20 },
      ]),
    );
    grid.add(boxOf([{ x: 500, y: 500 }], 10));
    grid.add(
      boxOf([
        { x: -150, y: -150 },
        { x: -120, y: -120 },
      ]),
    );
    expect(grid.near(boxOf([{ x: 300, y: 10 }], 5))).toEqual([0]);
    expect(
      grid.near(
        boxOf([
          { x: -130, y: -130 },
          { x: 510, y: 510 },
        ]),
      ),
    ).toEqual([0, 1, 2]);
    // In a shared cell but apart: no meeting.
    expect(grid.near(boxOf([{ x: 520, y: 590 }]))).toEqual([]);
    expect(grid.near(boxOf([{ x: 5000, y: 5000 }]))).toEqual([]);
  });
});
