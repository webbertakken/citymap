import { buildScene, pickIndex } from "@citymap/scene";
import { THEMES } from "@citymap/themes";
import { describe, expect, it } from "vitest";
import { city } from "../components/testing/fixtures";
import { cityBuildings, tableFor } from "../view/buildings";
import { footprintsOf } from "./footprints";
import { inspector } from "./inspect";

const alpha = city("alpha");
const scene = buildScene(alpha, THEMES["paper-atlas"]);
const index = pickIndex(alpha);
const { table } = tableFor(scene, cityBuildings(null), "folder", THEMES["paper-atlas"]);
const footprints = footprintsOf(scene.buildings, table);

describe("inspector", () => {
  it("names a building by its card and, without measures, its one file", () => {
    const inspect = inspector(scene, footprints, index, cityBuildings(null));
    expect(inspect(0)).toMatchObject({ hit: { kind: "lot", key: "a", path: "a.ts" }, files: ["a.ts"] });
  });

  it("lists a building's files from its measures, in their order", () => {
    const measured = cityBuildings({
      version: 1,
      source: "cli",
      size: "lines",
      tested: "name",
      available: ["size"],
      lots: {
        alpha: {
          a: {
            files: [
              { path: "a.ts", lines: 3 },
              { path: "b.ts", lines: 4 },
            ],
          },
        },
      },
    });
    expect(inspector(scene, footprints, index, measured)(0).files).toEqual(["a.ts", "b.ts"]);
  });

  it("knows nothing of a lot it has no building or footprint for", () => {
    const inspect = inspector(scene, footprints, index, cityBuildings(null));
    expect(inspect(5)).toEqual({ hit: null, files: [] });
    expect(inspector(scene, [], index, cityBuildings(null))(0)).toEqual({ hit: null, files: [] });
  });

  it("names nothing when the middle of the footprint is not that building", () => {
    // A footprint far from its lot: the map there holds no lot.
    const astray = [{ ...footprints[0]!, corners: footprints[0]!.corners.map((c) => ({ x: c.x + 500, z: c.z })) }];
    expect(inspector(scene, astray, index, cityBuildings(null))(0)).toEqual({ hit: null, files: [] });
  });
});
