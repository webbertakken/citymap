import { pickIndex, pick } from "@citymap/scene";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMeasureRows } from "./MeasureRows";
import { city } from "./testing/fixtures";

function Rows() {
  const rowsOf = useMeasureRows();
  const hit = pick(pickIndex(city("alpha")), 1.5, -0.5)!;
  return <p>{rowsOf(hit).length} rows</p>;
}

describe("useMeasureRows", () => {
  it("adds no rows outside a viewer that knows the measures", () => {
    render(<Rows />);
    expect(screen.getByText("0 rows")).toBeTruthy();
  });
});
