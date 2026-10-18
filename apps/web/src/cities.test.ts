import { CitymapError, DEFAULT_TOGGLES, serialiseCity, type City, type Separation } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { describeFailure, loadCity, loadIndex, readCityFile, variantOf } from "./cities";
import { entryOf } from "./components/testing/fixtures";
import type { Step } from "./load/step";

const city: City = { repository: "demo", commit: "worktree", towns: [], highways: [] };
const fetcher = (files: Record<string, string>) => async (url: string) =>
  new Response(files[url] ?? "", { status: url in files ? 200 : 404 });
/** A body in two chunks, with the headers given. */
const chunked = (text: string, headers: Record<string, string>) => async () => {
  const bytes = new TextEncoder().encode(text);
  const half = Math.floor(bytes.length / 2);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, half));
      controller.enqueue(bytes.slice(half));
      controller.close();
    },
  });
  return new Response(body, { headers });
};
const entry = entryOf("demo", 0);

/** An index whose text is the value given. */
const bad = (value: unknown) => fetcher({ "/cities/index.json": JSON.stringify(value) });

describe("loadIndex", () => {
  it("reads the bundled cities, each with its sixteen variants", async () => {
    const index = [entryOf("demo", 3)];
    expect(await loadIndex(fetcher({ "/cities/index.json": JSON.stringify(index) }))).toEqual(index);
  });

  it("rejects a missing or malformed index", async () => {
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

  it("reads a city that records separations, a variant per combination and separation state", async () => {
    const index = [entryOf("demo", 3, ["workspaces", "apps", "packages"], true)];
    expect(index[0]!.variants).toHaveLength(16 * 5);
    expect(await loadIndex(fetcher({ "/cities/index.json": JSON.stringify(index) }))).toEqual(index);
  });

  it("rejects recorded separations that are unknown or out of order, and variants that miss or repeat a state", async () => {
    const demo = entryOf("demo", 1, ["apps", "plugins"]);
    const [first, ...rest] = demo.variants;
    const cases = [
      { ...demo, separable: ["split"] },
      { ...demo, separable: ["plugins", "apps"] },
      { ...demo, separable: [] },
      { ...demo, declared: false },
      { ...demo, variants: [{ ...first, separate: ["libs"] }, ...rest] },
      { ...demo, variants: [{ ...first, separate: undefined }, ...rest] },
      { ...demo, variants: [rest[0], ...rest] },
      {
        ...entryOf("demo", 1),
        variants: [{ ...entryOf("demo", 1).variants[0], separate: [] }, ...entryOf("demo", 1).variants.slice(1)],
      },
    ];
    const read = await Promise.allSettled(cases.map((broken) => loadIndex(bad([broken]))));
    expect(read.map((r) => r.status)).toEqual(cases.map(() => "rejected"));
  });
});

describe("variantOf", () => {
  it("finds the variant with exactly the toggles named, in any order", () => {
    const demo = entryOf("demo", 1);
    expect(variantOf(demo, { toggles: DEFAULT_TOGGLES }).file).toBe("demo/corridor-tiers.json");
    expect(variantOf(demo, { toggles: ["tiers", "corridor"], separate: ["plugins"] }).file).toBe(
      "demo/corridor-tiers.json",
    );
    expect(variantOf(demo, { toggles: [] }).file).toBe("demo/none.json");
  });

  it("names a recorded city's variant by the separations it records, declared workspaces deciding", () => {
    const demo = entryOf("demo", 1, ["workspaces", "apps", "packages"], true);
    const at = (separate: readonly Separation[]) => variantOf(demo, { toggles: [], separate }).file;
    expect(at(["workspaces", "submodules", "apps"])).toBe("demo/none~workspaces-apps.json");
    expect(at(["workspaces", "packages"])).toBe("demo/none~workspaces-apps.json");
    expect(at(["packages", "plugins"])).toBe("demo/none~packages.json");
    expect(at([])).toBe("demo/none~none.json");
    expect(variantOf(demo, { toggles: [] }).file).toBe("demo/none~workspaces-apps.json");
  });
});

describe("loadCity and readCityFile", () => {
  it("parse a city, the bundled one in the variant the toggles name", async () => {
    const files = { "/cities/demo/quarters.json": serialiseCity(city) };
    expect(await loadCity(fetcher(files), entryOf("demo", 0), { toggles: ["quarters"] })).toEqual({
      city,
      measures: null,
    });
    expect(await readCityFile(new Blob([serialiseCity(city)]))).toEqual({ city, measures: null });
  });

  it("count the bytes as they arrive, of the length when it is known, then say they read the city", async () => {
    const body = serialiseCity(city);
    const length = String(new TextEncoder().encode(body).length);
    const steps: Step[] = [];
    expect(
      await loadCity(chunked(body, { "content-length": length }), entry, { toggles: DEFAULT_TOGGLES }, "", {
        onStep: (s) => steps.push(s),
      }),
    ).toEqual({ city, measures: null });
    const size = Number(length);
    const half = Math.floor(size / 2);
    expect(steps).toEqual([
      { phase: "download", done: 0, of: size },
      { phase: "download", done: half, of: size },
      { phase: "download", done: size, of: size },
      { phase: "parse" },
    ]);
    // An encoded body's length counts compressed bytes, so no total is claimed; nor without a length.
    const unknown = await Promise.all(
      [{ "content-length": "9", "content-encoding": "gzip" }, {}].map(async (headers) => {
        const heard: Step[] = [];
        await loadCity(chunked(body, headers), entry, { toggles: DEFAULT_TOGGLES }, "", {
          onStep: (s) => heard.push(s),
        });
        return heard.at(-2);
      }),
    );
    expect(unknown).toEqual([
      { phase: "download", done: size },
      { phase: "download", done: size },
    ]);
    const fromFile: Step[] = [];
    await readCityFile(new Blob([body]), { onStep: (s) => fromFile.push(s) });
    expect(fromFile.at(-2)).toEqual({ phase: "download", done: size, of: size });
  });

  it("read a body without a stream whole", async () => {
    const plain = async () => Object.assign(new Response(null), { text: async () => serialiseCity(city) });
    expect(await loadCity(plain, entry, { toggles: DEFAULT_TOGGLES })).toEqual({ city, measures: null });
  });

  it("stop when their signal aborts, while downloading or before reading", async () => {
    const controller = new AbortController();
    const steps: Step[] = [];
    const reading = loadCity(chunked(serialiseCity(city), {}), entry, { toggles: DEFAULT_TOGGLES }, "", {
      signal: controller.signal,
      onStep: (s) => {
        steps.push(s);
        if (s.phase === "download" && s.done! > 0) controller.abort();
      },
    });
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(steps.some((s) => s.phase === "parse")).toBe(false);
    const late = new AbortController();
    const parsing = readCityFile(new Blob([serialiseCity(city)]), {
      signal: late.signal,
      onStep: (s) => {
        if (s.phase === "parse") late.abort();
      },
    });
    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
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
