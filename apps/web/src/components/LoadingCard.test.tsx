import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advance, startProgress } from "../load/progress";
import { LoadingCard } from "./LoadingCard";

afterEach(cleanup);

const linux = advance(startProgress("github", "torvalds/linux", 0), {
  phase: "tree",
  done: 1204,
  of: 2610,
  requests: 27,
});

describe("LoadingCard", () => {
  it("counts what it can, says the time spent and left, and cancels", () => {
    const cancel = vi.fn<() => void>();
    render(<LoadingCard progress={linux} now={12_000} cancellable onCancel={cancel} />);
    const bar = screen.getByRole("progressbar", { name: "Reading the file tree" });
    expect(bar.getAttribute("value")).toBe("34");
    expect(bar.parentElement?.getAttribute("data-sweep")).toBe("false");
    expect(screen.getByText("1,204 of 2,610 folders · 27 requests")).toBeTruthy();
    expect(screen.getByText("12 s spent · about 25 s left")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps Cancel in place but unusable once the load is done and the card only holds", () => {
    render(<LoadingCard progress={linux} now={12_000} cancellable={false} onCancel={() => {}} />);
    const cancel = screen.getByRole("button", { name: "Cancel", hidden: true });
    expect(cancel).toHaveProperty("disabled", true);
    expect(cancel.dataset["held"]).toBe("true");
  });

  it("sweeps where nothing can be counted, and says its percentage instead", () => {
    const drawing = advance(linux, { phase: "draw" });
    render(<LoadingCard progress={drawing} now={1000} cancellable onCancel={() => {}} />);
    const bar = screen.getByRole("progressbar", { name: "Drawing the map" });
    expect(bar.parentElement?.getAttribute("data-sweep")).toBe("true");
    expect(bar.getAttribute("aria-valuetext")).toBe("Drawing the map: 90 %");
    expect(bar.parentElement?.querySelector(".sweep")).not.toBeNull();
  });
});
