import type { City } from "@citymap/ground-plan";
import { afterEach, describe, expect, it, vi } from "vitest";
import { city as cityNamed, square } from "../components/testing/fixtures";
import { searchIndex } from "./search";
import { SLICE_MS, searchIndexInSlices, yieldToInput } from "./slices";

// A town of 40 files, besides its folders: enough to need several slices on a clock that ticks a millisecond a read.
const base = cityNamed("demo");
const town = base.towns[0]!;
const city: City = {
  ...base,
  towns: [
    {
      ...town,
      lots: Array.from({ length: 40 }, (_, i) => ({
        ...town.lots[0]!,
        key: `f${i}`,
        path: `src/f${i}.ts`,
        pts: square(64 * i, 64),
      })),
    },
  ],
};
/** A clock that moves a millisecond each time it is read. */
const ticking = () => {
  let t = 0;
  return () => t++;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchIndexInSlices", () => {
  it("builds the same index as searchIndex, in one slice when there is time", async () => {
    const { index, slices } = await searchIndexInSlices(city, { now: () => 0 });
    expect(index).toEqual(searchIndex(city));
    expect(slices).toBe(1);
  });

  it("yields after every SLICE_MS of building, and still builds the same index", async () => {
    const pause = vi.fn<() => Promise<void>>(async () => {});
    const { index, slices } = await searchIndexInSlices(city, { pause, now: ticking() });
    expect(index).toEqual(searchIndex(city));
    // 42 entries; each is followed by a read of the clock, a millisecond on, so a slice holds SLICE_MS entries.
    expect(slices).toBe(Math.ceil(42 / SLICE_MS));
    expect(pause).toHaveBeenCalledTimes(slices - 1);
  });

  it("stops between slices once aborted, and builds nothing when aborted before it starts", async () => {
    const controller = new AbortController();
    const pause = async () => controller.abort();
    await expect(searchIndexInSlices(city, { signal: controller.signal, pause, now: ticking() })).rejects.toMatchObject(
      { name: "AbortError" },
    );
    await expect(searchIndexInSlices(city, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("yieldToInput", () => {
  it("yields to input through the scheduler where the browser has one", async () => {
    const yielded = vi.fn<() => Promise<void>>(async () => {});
    vi.stubGlobal("scheduler", { yield: yielded });
    await yieldToInput();
    expect(yielded).toHaveBeenCalledOnce();
  });

  it("else waits for a timeout", async () => {
    vi.stubGlobal("scheduler", undefined);
    const timeout = vi.spyOn(globalThis, "setTimeout");
    await yieldToInput();
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 0);
  });
});
