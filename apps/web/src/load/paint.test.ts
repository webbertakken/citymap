import { afterEach, describe, expect, it, vi } from "vitest";
import { afterPaint } from "./paint";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("afterPaint", () => {
  it("resolves after the next frame", async () => {
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => setTimeout(() => frame(0), 0));
    await expect(afterPaint()).resolves.toBeUndefined();
  });

  it("resolves anyway when no frame comes, as in a hidden tab", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    let done = false;
    void afterPaint().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
