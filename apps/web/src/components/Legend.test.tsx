import { THEMES } from "@citymap/themes";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cityBuildings } from "../view/buildings";
import { Legend } from "./Legend";

describe("Legend", () => {
  it("says lit windows come from a coverage report when they do", () => {
    const city = cityBuildings({
      version: 1,
      source: "folder",
      size: "lines",
      tested: "coverage",
      available: ["size", "tested", "kind", "comments"],
      lots: { t: { a: { files: [{ path: "a.ts", lines: 10, covered: 1, executable: 2 }] } } },
    });
    render(
      <Legend
        theme={THEMES["night-atlas"]}
        mode="buildings"
        colourBy="tested"
        onColourBy={() => {}}
        city={city}
        uses={["source"]}
      />,
    );
    expect(screen.getByText("Lit windows: tested share (coverage report)")).toBeTruthy();
    expect(screen.getByText(/^Height: size, 1 to 12 floors \(10 lines to 10 lines\)/)).toBeTruthy();
  });
});
