import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../github/read";
import { layHere } from "../lay/lay";
import { project } from "../view/view";
import { COPIED_MS } from "./Actions";
import { StubCanvas, currentView, fetcher, files, fromMore, searchField, twinFetcher, type } from "./testing/fixtures";
import { Viewer } from "./Viewer";

/** Gives the page a clipboard, or takes it away (an insecure page has none). */
const clipboard = (value: Pick<Clipboard, "writeText"> | undefined) =>
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const viewport = { width: 800, height: 600 };
const map = () => screen.getByRole("application");
const selected = () => screen.getByRole("region", { name: "Selected" });

/** The screen point of a fixed-unit point of the city, in the view the canvas was last given. */
const at = (x: number, y: number) => project(currentView(), viewport, { x: x / 64, y: 0, z: -y / 64 });

const hover = (x: number, y: number) => {
  const p = at(x, y);
  fireEvent.pointerMove(map(), { pointerId: 1, clientX: p.x, clientY: p.y });
  return screen.getByRole("tooltip");
};

const click = (x: number, y: number) => {
  const p = at(x, y);
  fireEvent.pointerDown(map(), { pointerId: 1, clientX: p.x, clientY: p.y });
  fireEvent.pointerUp(map(), { pointerId: 1, clientX: p.x, clientY: p.y });
};

/** The words of a card, its parts apart. */
const parts = (card: HTMLElement) =>
  Array.from(card.querySelectorAll(".hit-kind, .hit-name, .hit-place, .hit-meaning, dt, dd, .hit-hint"), (e) =>
    e.textContent?.trim(),
  );

describe("Viewer hover cards", () => {
  it("says what a file is, where it is, its folder's lots and its address, and what clicking offers", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("application");
    const card = hover(96, 32);
    expect(card.dataset.kind).toBe("file");
    expect(parts(card)).toEqual([
      "Source file",
      "a.ts",
      "In alpha",
      "Code the project is built from.",
      "In this folder",
      "1 lot",
      "Address",
      "No. 1 on the top folderBlock 0.0, side 1; kept for life",
      "Click to select; then show only this town or copy the path",
    ]);
  });

  it("says what a town is and what it holds, and that a highway joins two towns", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    await screen.findByRole("application");
    expect(parts(hover(3000, 5000))).toEqual([
      "Town",
      "alpha",
      "A polycentric town: districts side by side between roads.",
      "Lots",
      "1",
      "Districts",
      "2",
      "Click to select; then show only this town",
    ]);
    expect(parts(hover(9600, 3200))).toEqual([
      "Highway",
      "A road across open country between towns.",
      "Joins",
      "alpha and apps/web",
      "Click to select",
    ]);
  });
});

describe("Viewer selection's actions", () => {
  it("copies a file's path, says so for a moment, and keeps the button's place", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    clipboard({ writeText });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("application");
    click(96, 32);
    expect(within(selected()).getByRole("heading", { level: 3 }).textContent).toBe("a.ts");
    expect(within(selected()).queryByRole("link", { name: /Open on GitHub/ })).toBeNull();
    vi.useFakeTimers();
    const copy = within(selected()).getByRole("button", { name: "Copy path" });
    await act(async () => fireEvent.click(copy));
    expect(writeText).toHaveBeenCalledWith("a.ts");
    expect(copy.querySelector("[data-shown=true]")?.textContent).toBe("Copied");
    expect(within(selected()).getByRole("status").textContent).toBe("Path copied");
    expect(info.mock.calls.map(([line]) => String(line))).toContain("viewer/copy-path kind=file");
    await act(async () => {
      vi.advanceTimersByTime(COPIED_MS);
    });
    expect(copy.querySelector("[data-shown=true]")?.textContent).toBe("Copy path");
  });

  it("says when the path could not be copied", async () => {
    clipboard(undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("application");
    click(96, 32);
    await act(async () => fireEvent.click(within(selected()).getByRole("button", { name: "Copy path" })));
    expect(screen.getByRole("alert").textContent).toContain("The path could not be copied.");
    expect(error.mock.calls.map(([line]) => String(line)).find((l) => l.startsWith("viewer/copy-failed"))).toMatch(
      /^viewer\/copy-failed reason=/,
    );
  });

  it("offers nothing for a highway: it has no town of its own and no path", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    await screen.findByRole("application");
    click(9600, 3200);
    expect(within(selected()).getByRole("heading", { level: 3 }).textContent).toBe("Highway");
    expect(within(selected()).queryAllByRole("button")).toEqual([]);
  });

  it("opens a file of a city laid from GitHub there, at the commit laid, until another city opens", async () => {
    const API = "https://api.github.com/repos/acme/widgets";
    const routes: Record<string, () => Response> = {
      [`${API}/commits/HEAD`]: () => new Response(JSON.stringify({ sha: "c9", commit: { tree: { sha: "t9" } } })),
      [`${API}/git/trees/t9?recursive=1`]: () =>
        new Response(JSON.stringify({ tree: [{ path: "src/a b.ts", type: "blob", sha: "s1" }] })),
    };
    const github: Fetcher = async (url) =>
      (routes[url] ?? (() => new Response(files[url] ?? "", { status: url in files ? 200 : 404 })))();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={github} lay={layHere} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    type("acme/widgets");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    await screen.findByText(/single state, not folded$/);
    type("a b");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    const link = within(selected()).getByRole("link", { name: /^Open on GitHub/ });
    expect(link.textContent).toBe("Open on GitHub (opens in a new tab)");
    expect(link.getAttribute("href")).toBe("https://github.com/acme/widgets/blob/c9/src/a%20b.ts");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(link);
    expect(info.mock.calls.map(([line]) => String(line))).toContain("viewer/github-open kind=file");
    fromMore(/^alpha/);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    click(96, 32);
    expect(within(selected()).queryByRole("link", { name: /Open on GitHub/ })).toBeNull();
  });
});
