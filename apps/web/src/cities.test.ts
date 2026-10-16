import { CitymapError, DEFAULT_TOGGLES, serialiseCity, type City } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { describeFailure, loadCity, loadIndex, readCityFile, variantOf } from "./cities";
import { entryOf } from "./components/testing/fixtures";

const city: City = { repository: "demo", commit: "worktree", towns: [], highways: [] };
const fetcher = (files: Record<string, string>) => async (url: string) => ({
  ok: url in files,
  status: url in files ? 200 : 404,
  text: async () => files[url] ?? "",
});

describe("loadIndex", () => {
  it("reads the bundled cities, each with its sixteen variants", async () => {
    const index = [entryOf("demo", 3)];
    expect(await loadIndex(fetcher({ "/cities/index.json": JSON.stringify(index) }))).toEqual(index);
  });

  it("rejects a missing or malformed index", async () => {
    const bad = (value: unknown) => fetcher({ "/cities/index.json": JSON.stringify(value) });
    const demo = entryOf("demo", 1);
    await expect(loadIndex(fetcher({}))).rejects.toThrow("/cities/index.json answered 404");
    await expect(loadIndex(bad({}))).rejects.toThrow("not a list of cities");
    await expect(loadIndex(bad([{ ...demo, variants: demo.variants.slice(1) }]))).rejects.toThrow(
      "not a list of cities",
    );
    const [first, ...rest] = demo.variants;
    await expect(loadIndex(bad([{ ...demo, variants: [{ ...first, file: "../x.json" }, ...rest] }]))).rejects.toThrow(
      "not a list of cities",
    );
    await expect(
      loadIndex(bad([{ ...demo, variants: [{ ...first, toggles: ["gridiron"] }, ...rest] }])),
    ).rejects.toThrow("not a list of cities");
    await expect(loadIndex(bad([{ ...demo, variants: [rest[0], ...rest] }]))).rejects.toThrow("not a list of cities");
    await expect(loadIndex(bad([{ ...demo, variants: [{ ...first, lots: "1" }, ...rest] }]))).rejects.toThrow(
      "not a list of cities",
    );
    await expect(loadIndex(bad([{ name: 1, variants: demo.variants }]))).rejects.toThrow("not a list of cities");
  });
});

describe("variantOf", () => {
  it("finds the variant with exactly the toggles named, in any order", () => {
    const demo = entryOf("demo", 1);
    expect(variantOf(demo, DEFAULT_TOGGLES).file).toBe("demo/corridor-tiers.json");
    expect(variantOf(demo, ["tiers", "corridor"]).file).toBe("demo/corridor-tiers.json");
    expect(variantOf(demo, []).file).toBe("demo/none.json");
  });
});

describe("loadCity and readCityFile", () => {
  it("parse a city, the bundled one in the variant the toggles name", async () => {
    const files = { "/cities/demo/quarters.json": serialiseCity(city) };
    expect(await loadCity(fetcher(files), entryOf("demo", 0), ["quarters"])).toEqual(city);
    expect(await readCityFile(new Blob([serialiseCity(city)]))).toEqual(city);
  });

  it("reject what is not a city", async () => {
    await expect(readCityFile(new Blob(["{}"]))).rejects.toThrow("city/bad-shape");
  });
});

describe("describeFailure", () => {
  it("names a bad city by the engine's message, and anything else as a load failure", () => {
    expect(describeFailure(new CitymapError("city/bad-json", "the text is not JSON"))).toBe(
      "That file is not a city: city/bad-json: the text is not JSON",
    );
    expect(describeFailure(new Error("offline"))).toBe("The city could not load: Error: offline");
  });
});
