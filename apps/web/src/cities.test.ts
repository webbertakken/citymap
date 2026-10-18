import { CitymapError, DEFAULT_TOGGLES, serialiseCity, type City } from "@citymap/ground-plan";
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
  it("read a city file's text, the bundled one in the variant the toggles name", async () => {
    const text = serialiseCity(city);
    const files = { "/cities/demo/quarters.json": text };
    expect(await loadCity(fetcher(files), entryOf("demo", 0), ["quarters"])).toBe(text);
    expect(await readCityFile(new Blob([text]))).toBe(text);
  });

  it("count the bytes as they arrive, of the length when it is known", async () => {
    const body = serialiseCity(city);
    const length = String(new TextEncoder().encode(body).length);
    const steps: Step[] = [];
    expect(
      await loadCity(chunked(body, { "content-length": length }), entry, DEFAULT_TOGGLES, "", {
        onStep: (s) => steps.push(s),
      }),
    ).toBe(body);
    const size = Number(length);
    const half = Math.floor(size / 2);
    expect(steps).toEqual([
      { phase: "download", done: 0, of: size },
      { phase: "download", done: half, of: size },
      { phase: "download", done: size, of: size },
    ]);
    // An encoded body's length counts compressed bytes, so no total is claimed; nor without a length.
    const unknown = await Promise.all(
      [{ "content-length": "9", "content-encoding": "gzip" }, {}].map(async (headers) => {
        const heard: Step[] = [];
        await loadCity(chunked(body, headers), entry, DEFAULT_TOGGLES, "", { onStep: (s) => heard.push(s) });
        return heard.at(-1);
      }),
    );
    expect(unknown).toEqual([
      { phase: "download", done: size },
      { phase: "download", done: size },
    ]);
    const fromFile: Step[] = [];
    await readCityFile(new Blob([body]), { onStep: (s) => fromFile.push(s) });
    expect(fromFile.at(-1)).toEqual({ phase: "download", done: size, of: size });
  });

  it("read a body without a stream whole", async () => {
    const plain = async () => Object.assign(new Response(null), { text: async () => serialiseCity(city) });
    expect(await loadCity(plain, entry, DEFAULT_TOGGLES)).toBe(serialiseCity(city));
  });

  it("stop when their signal aborts while downloading", async () => {
    const controller = new AbortController();
    const reading = loadCity(chunked(serialiseCity(city), {}), entry, DEFAULT_TOGGLES, "", {
      signal: controller.signal,
      onStep: (s) => {
        if (s.phase === "download" && s.done! > 0) controller.abort();
      },
    });
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
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
