import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { project } from "../view/view";
import {
  StubCanvas,
  currentView,
  fetcher,
  read,
  searchField,
  townButton,
  towns,
  twinFetcher,
  type,
} from "./testing/fixtures";
import { Viewer } from "./Viewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const matches = () => within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
const selected = () => screen.getByRole("region", { name: "Selected" }).textContent;
const marker = () => document.querySelector(".marker");

describe("Viewer search", () => {
  it("finds a file, flies to it, selects it and marks it; Escape clears both", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    const fitted = currentView();
    type("a.t");
    expect(matches().map((b) => b.textContent)).toEqual(["File a.ts a.ts"]);
    expect(screen.getByText("1 match")).toBeTruthy();
    fireEvent.click(matches()[0]!);
    // The lot's centre, 1.5 east and 0.5 north, is now the middle of the free map, much closer.
    expect(currentView().zoom).toBeGreaterThan(fitted.zoom);
    expect(selected()).toContain("a.ts");
    expect(marker()).not.toBeNull();
    expect(searchField()).toHaveProperty("value", "");
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
    fireEvent.keyDown(map, { key: "Escape" });
    expect(selected()).toContain("Nothing yet");
    expect(marker()).toBeNull();
  });

  it("finds a folder and selects it as a district; a click elsewhere drops the marker", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    type("li");
    expect(matches().map((b) => b.textContent)).toEqual(["Folder lib lib"]);
    expect(within(matches()[0]!).getByText("li").tagName).toBe("MARK");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect(selected()).toContain("FolderlibIn alpha");
    const lot = project(currentView(), { width: 800, height: 600 }, { x: 96 / 64, y: 0.15, z: -32 / 64 });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: lot.x, clientY: lot.y });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: lot.x, clientY: lot.y });
    expect(marker()).toBeNull();
  });

  it("says when nothing matches, and waits for two characters", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("application");
    type("z");
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
    type("zebra");
    expect(screen.getByText("No folders or files match")).toBeTruthy();
    // Enter and ArrowDown have nothing to pick.
    fireEvent.keyDown(searchField(), { key: "Enter" });
    fireEvent.keyDown(searchField(), { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(searchField());
  });

  it("moves through the matches with the arrow keys, and steps back with Escape", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    await screen.findByRole("application");
    searchField().focus();
    type("src");
    expect(matches()).toHaveLength(2);
    await act(async () => {
      fireEvent.keyDown(searchField(), { key: "ArrowDown" });
      await new Promise((done) => requestAnimationFrame(() => done(null)));
    });
    expect(document.activeElement).toBe(matches()[0]);
    fireEvent.keyDown(matches()[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(matches()[1]);
    // The last match holds; ArrowUp from the first goes back to the field.
    fireEvent.keyDown(matches()[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(matches()[1]);
    fireEvent.keyDown(matches()[1]!, { key: "ArrowUp" });
    fireEvent.keyDown(matches()[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(searchField());
    fireEvent.focus(searchField());
    fireEvent.keyDown(matches()[0]!, { key: "Tab" });
    fireEvent.keyDown(matches()[0]!, { key: "Escape" });
    expect(document.activeElement).toBe(searchField());
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
    // Escape in the field: first the matches close, then the text clears.
    fireEvent.focus(searchField());
    expect(screen.getByRole("list", { name: "Matches" })).toBeTruthy();
    fireEvent.keyDown(searchField(), { key: "Escape" });
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
    expect(searchField()).toHaveProperty("value", "src");
    fireEvent.keyDown(searchField(), { key: "Escape" });
    expect(searchField()).toHaveProperty("value", "");
    fireEvent.keyDown(searchField(), { key: "x" });
  });

  it("lets a late arrow key's focus go quietly when the search has gone", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (step: FrameRequestCallback) => frames.push(step));
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("application");
    type("src");
    fireEvent.keyDown(searchField(), { key: "ArrowDown" });
    cleanup();
    expect(() => frames.at(-1)!(0)).not.toThrow();
  });

  it("puts the cursor in the search with / from anywhere but a field", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    map.focus();
    fireEvent.keyDown(map, { key: "/" });
    expect(document.activeElement).toBe(searchField());
    // In a field, / is a character.
    expect(fireEvent.keyDown(searchField(), { key: "/" })).toBe(true);
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(editable);
    expect(fireEvent.keyDown(editable, { key: "/" })).toBe(true);
    editable.remove();
    expect(fireEvent.keyDown(document.body, { key: "q" })).toBe(true);
  });

  it("closes the matches when focus or a press goes elsewhere", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    type("src");
    expect(screen.getByRole("list", { name: "Matches" })).toBeTruthy();
    fireEvent.focusIn(map);
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
    fireEvent.focus(searchField());
    fireEvent.pointerDown(searchField());
    expect(screen.getByRole("list", { name: "Matches" })).toBeTruthy();
    fireEvent.pointerDown(map);
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
  });

  it("leaves a town for a match in another, and stays for one in the same", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    await screen.findByRole("application");
    fireEvent.click(townButton("apps/web"));
    type("page");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(selected()).toContain("page.tsxIn apps/web");
    // Matched by its path only, a folder's name is shown unmarked.
    type("web");
    expect(within(matches()[0]!).queryByText("web")).toBeNull();
    type("a.ts");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(towns()).toEqual(["alpha", "apps/web"]);
    expect(selected()).toContain("a.ts");
  });

  it("flies over 300 ms when motion is welcome, and stops when the person takes over", async () => {
    // Neither dark nor reduced motion.
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (step: FrameRequestCallback) => frames.push(step));
    const cancelled: number[] = [];
    vi.stubGlobal("cancelAnimationFrame", (id: number) => cancelled.push(id));
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    // The frames the load waited for are past; from here every frame is the flight's.
    frames.splice(0);
    const start = currentView();
    type("a.t");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect(currentView()).toEqual(start);
    act(() => frames.shift()!((now += 150)));
    const midway = currentView();
    expect(midway.zoom).toBeGreaterThan(start.zoom);
    act(() => frames.shift()!((now += 150)));
    const landed = currentView();
    expect(landed.zoom).toBeGreaterThan(midway.zoom);
    expect(frames).toHaveLength(0);
    // A second flight, cut short by a key: the view stays where the person put it.
    fireEvent.click(screen.getByRole("button", { name: "Fit the city" }));
    type("a.t");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    const before = cancelled.length;
    fireEvent.keyDown(map, { key: "ArrowLeft" });
    expect(cancelled.length).toBeGreaterThan(before);
    expect(read()).not.toBe(landed);
  });

  it("logs a query once it settles, and each pick", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("application");
    vi.useFakeTimers();
    type("l");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    type("li");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    type("lib");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.keyDown(searchField(), { key: "Enter" });
    const lines = info.mock.calls.map(([line]) => String(line).replace(/ ms=\d+$/, ""));
    expect(lines.filter((l) => l.startsWith("viewer/search"))).toEqual([
      "viewer/search-index entries=3 slices=1",
      "viewer/search length=3 hits=1",
      "viewer/search-pick kind=folder path=lib",
    ]);
  });
});
