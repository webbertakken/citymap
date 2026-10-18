import { TOGGLES } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { BUNDLED, cloneArgs, combinations, indexEntry, layArgs, summary, variantFile, variantName } from "./bundle.ts";

describe("BUNDLED", () => {
  it("pins each public city to a GitHub repository and a full commit, names unique", () => {
    expect(BUNDLED.map((c) => c.name)).toEqual([
      "takken.io",
      "redux",
      "game-ci-cli",
      "studio-worker",
      "livediagram",
      "react",
    ]);
    for (const city of BUNDLED) {
      expect(city.url).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/);
      expect(city.commit).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe("cloneArgs", () => {
  it("clones without blobs and without a checkout, so only the pinned commit's files are fetched", () => {
    expect(cloneArgs("https://github.com/reduxjs/redux.git", "/s/redux")).toEqual([
      "git",
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      "--quiet",
      "https://github.com/reduxjs/redux.git",
      "/s/redux",
    ]);
  });
});

describe("combinations", () => {
  it("lists all sixteen subsets of the toggles, none first, each in the toggles' own order", () => {
    const all = combinations();
    expect(all).toHaveLength(16);
    expect(all[0]).toEqual([]);
    expect(all[1]).toEqual(["corridor"]);
    expect(all[9]).toEqual(["corridor", "tiers"]);
    expect(all[15]).toEqual([...TOGGLES]);
    expect(new Set(all.map(variantName)).size).toBe(16);
  });
});

describe("variant names", () => {
  it("joins the toggles with dashes, or says none", () => {
    expect(variantName([])).toBe("none");
    expect(variantName(["corridor", "tiers"])).toBe("corridor-tiers");
    expect(variantFile("takken.io", ["quarters"])).toBe("takken.io/quarters.json");
  });
});

describe("layArgs", () => {
  it("folds the repository with the variant's toggles into its file", () => {
    expect(layArgs("/r/citymap", "/c/redux", "/o/redux/none.json", [], "abc")).toEqual([
      "/r/citymap",
      "/c/redux",
      "--out=/o/redux/none.json",
      "--to=abc",
      "--toggles=",
    ]);
    expect(layArgs("/r/citymap", "/c/redux", "/o/x.json", ["corridor", "tiers"], "abc").at(-1)).toBe(
      "--toggles=corridor,tiers",
    );
  });
});

describe("indexEntry", () => {
  it("names a city and every variant with its file and lots", () => {
    const entry = indexEntry("redux", [
      { toggles: [], lots: 10 },
      { toggles: ["tiers"], lots: 12 },
    ]);
    expect(entry).toEqual({
      name: "redux",
      variants: [
        { toggles: [], file: "redux/none.json", lots: 10 },
        { toggles: ["tiers"], file: "redux/tiers.json", lots: 12 },
      ],
    });
  });
});

describe("summary", () => {
  it("totals the bytes laid and their gzip size", () => {
    expect(
      summary(
        [
          { bytes: 1000, gzip: 200 },
          { bytes: 500, gzip: 100 },
        ],
        2,
      ),
    ).toBe("bundle/done cities=2 variants=2 bytes=1500 gzip=300");
  });
});
