import type { City } from "@citymap/ground-plan";
import type { CityFile, Measures } from "@citymap/measures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { square, twin } from "../components/testing/fixtures";
import { PIECE_BYTES, cityOfPieces, cityPieces } from "./pieces";

// A city of two towns of several lots each, with measures for most of them: small pieces split both.
const lotsOf = (town: City["towns"][number], n: number, x: number) =>
  Array.from({ length: n }, (_, i) => ({
    ...town.lots[0]!,
    key: `k${i}`,
    path: `src/f${i}.ts`,
    pts: square(x + 96 * i, 64),
  }));
const city: City = {
  ...twin,
  towns: [
    { ...twin.towns[0]!, lots: lotsOf(twin.towns[0]!, 9, 64) },
    { ...twin.towns[1]!, lots: lotsOf(twin.towns[1]!, 7, 12864) },
  ],
};
const measures: Measures = {
  version: 1,
  source: "cli",
  size: "lines",
  tested: "name",
  available: ["size", "tested", "kind"],
  lots: {
    alpha: Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`k${i}`, { files: [{ path: `src/f${i}.ts`, lines: 10 * i }] }]),
    ),
    "alpha/apps/web": {},
  },
};
const file: CityFile = { city, measures };
/** The city file as one JSON text, measures last: what the pieces must add up to, key for key. */
const whole = ({ city: c, measures: m }: CityFile) => JSON.stringify(m ? { ...c, measures: m } : c);
const still = () => Promise.resolve();

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("cityPieces and cityOfPieces", () => {
  it("cut a city file into pieces that add up to the file parsed whole, its keys in the same order", async () => {
    const pieces = cityPieces(file, 400);
    expect(pieces.length).toBeGreaterThan(6);
    expect(Math.max(...pieces.slice(1).map((p) => p.length))).toBeLessThan(800);
    const taken = await cityOfPieces(pieces, { pause: still });
    expect(taken).toEqual(file);
    expect(whole(taken)).toBe(whole(file));
  });

  it("carry a city without measures, and a whole city in a few pieces at the usual size", async () => {
    const bare = { city, measures: null };
    expect(cityPieces(bare)).toHaveLength(3);
    expect(PIECE_BYTES).toBe(1_000_000);
    const taken = await cityOfPieces(cityPieces(bare, 300), { pause: still });
    expect(whole(taken)).toBe(whole(bare));
    expect(taken.measures).toBeNull();
  });

  it("give an item larger than a piece a piece of its own", () => {
    const pieces = cityPieces(file, 1);
    expect(pieces).toHaveLength(1 + 9 + 7 + 9);
  });

  it("keep a key named like a prototype's as the lot's own", async () => {
    const lots: Measures["lots"] = JSON.parse('{"alpha":{"__proto__":{"files":[]}}}');
    const taken = await cityOfPieces(cityPieces({ city, measures: { ...measures, lots } }), { pause: still });
    expect(Object.hasOwn(taken.measures!.lots.alpha!, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(taken.measures!.lots.alpha)).toBe(Object.prototype);
  });

  it("yield between pieces, and log what was taken in", async () => {
    const pause = vi.fn<() => Promise<void>>(still);
    let now = 0;
    const pieces = cityPieces(file, 400);
    await cityOfPieces(pieces, { pause, now: () => (now += 5) });
    expect(pause).toHaveBeenCalledTimes(pieces.length - 1);
    const chars = pieces.reduce((n, p) => n + p.length, 0);
    expect(info).toHaveBeenCalledWith(`viewer/city-pieces pieces=${pieces.length} chars=${chars} ms=5`);
  });

  it("stop when aborted, before and between pieces", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(cityOfPieces(cityPieces(file, 400), { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    const later = new AbortController();
    const pause = vi.fn<() => Promise<void>>(async () => later.abort());
    await expect(cityOfPieces(cityPieces(file, 400), { signal: later.signal, pause })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
