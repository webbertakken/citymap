import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advance, startProgress } from "../load/progress";
import { TICK_MS } from "../load/useLoading";
import { LoadingCard } from "./LoadingCard";

// The card reads the clock itself; the test's clock starts at 0, as the loads below do.
beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const at = (ms: number) => vi.advanceTimersByTime(ms);

const linux = advance(startProgress("github", "torvalds/linux", 0), {
  phase: "tree",
  done: 1204,
  of: 2610,
  requests: 27,
});

describe("LoadingCard", () => {
  it("counts what it can, says the time spent and left, and cancels", () => {
    const cancel = vi.fn<() => void>();
    at(12_000);
    render(<LoadingCard progress={linux} cancellable onCancel={cancel} />);
    const bar = screen.getByRole("progressbar", { name: "Reading the file tree" });
    expect(bar.getAttribute("value")).toBe("34");
    expect(bar.parentElement?.getAttribute("data-sweep")).toBe("false");
    expect(screen.getByText("1,204 of 2,610 folders · 27 requests")).toBeTruthy();
    expect(screen.getByText("12 s spent · about 25 s left")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps its own clock, so the time spent moves on with nothing re-rendering it from outside", () => {
    render(<LoadingCard progress={linux} cancellable onCancel={() => {}} />);
    expect(screen.getByText(/^0 s spent/)).toBeTruthy();
    act(() => {
      at(4 * TICK_MS);
    });
    expect(screen.getByText(/^1 s spent/)).toBeTruthy();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps Cancel in place but unusable once the load is done and the card only holds", () => {
    render(<LoadingCard progress={linux} cancellable={false} onCancel={() => {}} />);
    const cancel = screen.getByRole("button", { name: "Cancel", hidden: true });
    expect(cancel).toHaveProperty("disabled", true);
    expect(cancel.dataset["held"]).toBe("true");
  });

  it("sweeps where nothing can be counted, and says its percentage instead", () => {
    const drawing = advance(linux, { phase: "draw" });
    at(1000);
    render(<LoadingCard progress={drawing} cancellable onCancel={() => {}} />);
    const bar = screen.getByRole("progressbar", { name: "Drawing the map" });
    expect(bar.parentElement?.getAttribute("data-sweep")).toBe("true");
    expect(bar.getAttribute("aria-valuetext")).toBe("Drawing the map: 90 %");
    expect(bar.parentElement?.querySelector(".sweep")).not.toBeNull();
  });
});
