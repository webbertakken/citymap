import { initialState, layCity, stateSnapshot } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { liveOptions } from "../lay/lay";
import { liveMeasures } from "./live";

const snapshot = stateSnapshot("demo", "c1", ["src/a.ts", "src/b.ts", "src/a.test.ts"]);
const options = liveOptions();
const { city, state } = layCity(snapshot, initialState(options), options);
const fileOf = (measures: ReturnType<typeof liveMeasures>, path: string) =>
  Object.values(measures.lots)
    .flatMap((town) => Object.values(town))
    .flatMap((lot) => lot.files)
    .find((f) => f.path === path);

describe("liveMeasures", () => {
  it("gives sizes from GitHub's tree and tests by name", () => {
    const measures = liveMeasures(city, state.plat, snapshot, {
      source: "github",
      size: "bytes",
      comments: false,
      files: new Map([["src/a.ts", { bytes: 120 }]]),
      coverage: new Map(),
    });
    expect(measures).toMatchObject({ source: "github", size: "bytes", tested: "name" });
    expect(measures.available).toEqual(["size", "tested", "kind"]);
    expect(fileOf(measures, "src/a.ts")).toEqual({ path: "src/a.ts", bytes: 120, named: true });
    expect(fileOf(measures, "src/b.ts")).toEqual({ path: "src/b.ts", named: false });
  });

  it("gives a folder's lines and comments, and its coverage instead of names", () => {
    const measures = liveMeasures(city, state.plat, snapshot, {
      source: "folder",
      size: "lines",
      comments: true,
      files: new Map([["src/a.ts", { bytes: 20, lines: 2, comments: 1, todos: 0 }]]),
      coverage: new Map([["src/a.ts", { covered: 1, executable: 2 }]]),
    });
    expect(measures).toMatchObject({ source: "folder", tested: "coverage" });
    expect(measures.available).toContain("comments");
    expect(fileOf(measures, "src/a.ts")).toEqual({
      path: "src/a.ts",
      bytes: 20,
      lines: 2,
      comments: 1,
      todos: 0,
      covered: 1,
      executable: 2,
    });
    expect(fileOf(measures, "src/b.ts")).toEqual({ path: "src/b.ts" });
  });
});
