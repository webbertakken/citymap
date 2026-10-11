import { CitymapError, serialiseCity, type City } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { describeFailure, loadCity, loadIndex, readCityFile } from "./cities";

const city: City = { repository: "demo", commit: "worktree", towns: [], highways: [] };
const fetcher = (files: Record<string, string>) => async (url: string) => ({
  ok: url in files,
  status: url in files ? 200 : 404,
  text: async () => files[url] ?? "",
});

describe("loadIndex", () => {
  it("reads the bundled cities", async () => {
    const index = [{ name: "demo", file: "demo.json", lots: 3 }];
    expect(await loadIndex(fetcher({ "/cities/index.json": JSON.stringify(index) }))).toEqual(index);
  });

  it("rejects a missing or malformed index", async () => {
    await expect(loadIndex(fetcher({}))).rejects.toThrow("/cities/index.json answered 404");
    await expect(loadIndex(fetcher({ "/cities/index.json": '[{"name":"x","file":"../x","lots":1}]' }))).rejects.toThrow(
      "not a list of cities",
    );
    await expect(loadIndex(fetcher({ "/cities/index.json": "{}" }))).rejects.toThrow("not a list of cities");
  });
});

describe("loadCity and readCityFile", () => {
  it("parse a city", async () => {
    const files = { "/cities/demo.json": serialiseCity(city) };
    expect(await loadCity(fetcher(files), { name: "demo", file: "demo.json", lots: 0 })).toEqual(city);
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
