import { CitymapError, serialiseCity, type City } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import { describeFailure, loadCity, loadIndex, readCityFile } from "./cities";
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
const entry = { name: "demo", file: "demo.json", lots: 0 };

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

  it("count the bytes as they arrive, of the length when it is known, then say they read the city", async () => {
    const body = serialiseCity(city);
    const length = String(new TextEncoder().encode(body).length);
    const steps: Step[] = [];
    expect(
      await loadCity(chunked(body, { "content-length": length }), entry, "", { onStep: (s) => steps.push(s) }),
    ).toEqual(city);
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
        await loadCity(chunked(body, headers), entry, "", { onStep: (s) => heard.push(s) });
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
    expect(await loadCity(plain, entry)).toEqual(city);
  });

  it("stop when their signal aborts, while downloading or before reading", async () => {
    const controller = new AbortController();
    const steps: Step[] = [];
    const reading = loadCity(chunked(serialiseCity(city), {}), entry, "", {
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
