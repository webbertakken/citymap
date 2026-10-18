import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advance, startProgress } from "./progress";
import { HOLD_MS, SHOW_AFTER_MS, TICK_MS, loadingStatus, useLoading, type Job, type Loading } from "./useLoading";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Begins a load inside `act`, and hands back its job. */
function begin(loading: Loading, ...args: Parameters<Loading["begin"]>): Job {
  let job: Job | undefined;
  act(() => {
    job = loading.begin(...args);
  });
  return job!;
}
const wait = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const lines = () => vi.mocked(console.info).mock.calls.map(([line]) => String(line).replace(/ ms=\d+/, ""));

describe("useLoading", () => {
  it("shows the card only after 300 ms, then holds it 400 ms once the load is done", () => {
    const { result } = renderHook(() => useLoading());
    const job = begin(result.current, "bundled", "redux");
    expect(result.current.progress).toMatchObject({ name: "redux", phase: "download" });
    wait(SHOW_AFTER_MS - 1);
    expect(result.current.shown).toBe(false);
    wait(1);
    expect(result.current.shown).toBe(true);
    act(() => job.step({ phase: "download", done: 1, of: 2 }));
    expect(result.current.progress?.fraction).toBeCloseTo(0.3, 9);
    wait(100);
    act(() => job.done());
    expect(result.current.progress?.fraction).toBe(1);
    wait(HOLD_MS - 101);
    expect(result.current.shown).toBe(true);
    wait(1);
    expect(result.current.shown).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(lines()).toEqual([
      "viewer/load-phase source=bundled name=redux phase=download",
      "viewer/load-done source=bundled name=redux",
    ]);
  });

  it("holds a finished load's card without letting it be cancelled, or calling it cancelled", () => {
    const { result } = renderHook(() => useLoading());
    const job = begin(result.current, "bundled", "redux");
    wait(SHOW_AFTER_MS);
    expect(result.current.cancellable).toBe(true);
    act(() => job.done());
    expect(result.current.shown).toBe(true);
    expect(result.current.cancellable).toBe(false);
    act(() => result.current.cancel());
    expect(result.current.shown).toBe(true);
    expect(lines().filter((l) => l.startsWith("viewer/load-cancelled"))).toEqual([]);
    wait(HOLD_MS);
    expect(result.current.shown).toBe(false);
    expect(result.current.cancellable).toBe(false);
  });

  it("never shows a load done within 300 ms, and drops a failed one at once", () => {
    const { result } = renderHook(() => useLoading());
    const quick = begin(result.current, "file", "a.json");
    wait(SHOW_AFTER_MS - 1);
    act(() => quick.done());
    expect(result.current.progress).toBeNull();
    wait(SHOW_AFTER_MS);
    expect(result.current.shown).toBe(false);
    const failing = begin(result.current, "file", "b.json");
    wait(SHOW_AFTER_MS + HOLD_MS);
    act(() => failing.step({ phase: "parse" }));
    expect(lines().at(-1)).toBe("viewer/load-phase source=file name=b.json phase=parse");
    act(() => failing.failed());
    expect(result.current.shown).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it("ticks its clock while the card shows", () => {
    const { result } = renderHook(() => useLoading());
    begin(result.current, "github", "a/b");
    wait(SHOW_AFTER_MS);
    const shownAt = result.current.now;
    wait(TICK_MS);
    expect(result.current.now - shownAt).toBe(TICK_MS);
  });

  it("cancels: the signal aborts, the card goes, and the job's later reports change nothing", () => {
    const { result } = renderHook(() => useLoading());
    const job = begin(result.current, "github", "a/b");
    wait(SHOW_AFTER_MS);
    act(() => result.current.cancel());
    expect(job.signal.aborted).toBe(true);
    expect(result.current.progress).toBeNull();
    act(() => {
      job.step({ phase: "tree", done: 1, of: 2 });
      job.done();
      job.failed();
      result.current.cancel();
    });
    expect(result.current.progress).toBeNull();
    expect(lines().at(-1)).toBe("viewer/load-cancelled source=github name=a/b phase=commit why=cancel");
  });

  it("replaces a load in flight with the next one", () => {
    const { result } = renderHook(() => useLoading());
    const first = begin(result.current, "github", "a/b");
    const second = begin(result.current, "bundled", "redux");
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(result.current.progress?.name).toBe("redux");
    expect(lines()).toContain("viewer/load-cancelled source=github name=a/b phase=commit why=replaced");
  });

  it("ends what it was loading when the page goes", () => {
    const { result, unmount } = renderHook(() => useLoading());
    const job = begin(result.current, "github", "a/b");
    unmount();
    expect(job.signal.aborted).toBe(true);
    job.done();
    expect(lines()).not.toContain("viewer/load-done source=github name=a/b");
  });
});

describe("loadingStatus", () => {
  it("names the load and its phase, keeping proper names", () => {
    const start = startProgress("github", "torvalds/linux", 0);
    expect(loadingStatus(start)).toBe("torvalds/linux: asking GitHub for the latest commit…");
    expect(loadingStatus(advance(start, { phase: "lay", files: 3 }))).toBe("torvalds/linux: laying out 3 files…");
  });
});
