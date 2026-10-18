import { TOGGLES } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import {
  BUNDLED,
  cloneArgs,
  combinations,
  inPool,
  indexEntry,
  layArgs,
  poolSize,
  separateFor,
  statesOf,
  summary,
  variantFile,
  variantName,
} from "./bundle.ts";

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
    expect(new Set(all.map((toggles) => variantName(toggles))).size).toBe(16);
  });
});

describe("variant names", () => {
  it("joins the toggles with dashes, or says none", () => {
    expect(variantName([])).toBe("none");
    expect(variantName(["corridor", "tiers"])).toBe("corridor-tiers");
    expect(variantFile("takken.io", ["quarters"])).toBe("takken.io/quarters.json");
  });

  it("adds the separations of a state after a tilde, or none", () => {
    expect(variantName(["tiers"], ["workspaces", "apps"])).toBe("tiers~workspaces-apps");
    expect(variantFile("react", [], [])).toBe("react/none~none.json");
  });
});

describe("separation states", () => {
  it("lays a city that records none once, with the defaults, and one that records some in each state", () => {
    expect(statesOf({ separable: [], declared: false })).toEqual([null]);
    expect(statesOf({ separable: ["workspaces", "packages"], declared: true })).toEqual([
      [],
      ["workspaces"],
      ["packages"],
    ]);
  });

  it("lays a state with the defaults of the separations the city does not record", () => {
    const recorded = { separable: ["packages", "plugins"] as const, declared: false };
    expect(separateFor(["plugins"], { ...recorded, separable: [...recorded.separable] })).toEqual([
      "workspaces",
      "submodules",
      "apps",
      "plugins",
    ]);
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
    expect(layArgs("/r/citymap", "/c/redux", "/o/x.json", [], "abc", ["apps"]).at(-1)).toBe("--separate=apps");
    expect(layArgs("/r/citymap", "/c/redux", "/o/x.json", [], "abc", []).at(-1)).toBe("--separate=");
  });
});

describe("indexEntry", () => {
  it("names a city and every variant with its file and lots", () => {
    const entry = indexEntry("redux", { separable: [], declared: false }, [
      { toggles: [], state: null, lots: 10 },
      { toggles: ["tiers"], state: null, lots: 12 },
    ]);
    expect(entry).toEqual({
      name: "redux",
      variants: [
        { toggles: [], file: "redux/none.json", lots: 10 },
        { toggles: ["tiers"], file: "redux/tiers.json", lots: 12 },
      ],
    });
  });

  it("records a city's separations and its declaration, and names each variant's state", () => {
    const entry = indexEntry("react", { separable: ["workspaces", "packages"], declared: true }, [
      { toggles: [], state: ["workspaces"], lots: 10 },
    ]);
    expect(entry).toEqual({
      name: "react",
      separable: ["workspaces", "packages"],
      declared: true,
      variants: [{ toggles: [], separate: ["workspaces"], file: "react/none~workspaces.json", lots: 10 }],
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

describe("poolSize", () => {
  it("lays as many at once as the machine has cores, or fewer when asked", () => {
    expect(poolSize(4, undefined)).toBe(4);
    expect(poolSize(4, "2")).toBe(2);
    // Never more than the cores.
    expect(poolSize(4, "16")).toBe(4);
    expect(poolSize(0, undefined)).toBe(1);
  });

  it("refuses a count that is not a whole number above zero", () => {
    for (const bad of ["0", "-1", "two", "1.5", ""])
      expect(() => poolSize(4, bad)).toThrow(
        `bundle/usage: CITYMAP_BUNDLE_JOBS takes a whole number above 0, not ${bad}`,
      );
  });
});

describe("inPool", () => {
  it("runs at most the limit at once and answers in the items' order, whatever order they finish in", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    const results = await inPool([30, 5, 20, 1, 10], 2, async (ms, at) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      done.push(at);
      return ms * 2;
    });
    expect(results).toEqual([60, 10, 40, 2, 20]);
    expect(most).toBe(2);
    expect(done).not.toEqual([0, 1, 2, 3, 4]);
  });

  it("starts nothing more once a task fails, and fails with it", async () => {
    const started: number[] = [];
    const failing = inPool([1, 2, 3, 4], 1, async (n) => {
      started.push(n);
      if (n === 2) throw new Error("bundle/failed two");
      return n;
    });
    await expect(failing).rejects.toThrow("bundle/failed two");
    expect(started).toEqual([1, 2]);
    expect(await inPool([], 3, async () => 1)).toEqual([]);
  });
});
