import { parseCity, serialiseCity, type City } from "@citymap/ground-plan";
import { serialiseCityFile, type Measures } from "@citymap/measures";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../github/read";
import { layHere } from "../lay/lay";
import { project } from "../view/view";
import { StubCanvas, currentView, files, fromMore, searchField, type, variantCity } from "./testing/fixtures";
import { Viewer } from "./Viewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

/** alpha in every variant, with the measures a CLI lays without history: sizes, tests by name, comments. */
const measures = (city: City): Measures => ({
  version: 1,
  source: "cli",
  size: "lines",
  tested: "name",
  available: ["size", "tested", "kind", "comments"],
  lots: {
    [city.towns[0]!.key]: Object.fromEntries(
      city.towns[0]!.lots.map((lot, i) => [
        lot.key,
        { files: [{ path: lot.path, bytes: 4000, lines: 120 * (i + 1), comments: 3, todos: 1, named: i === 0 }] },
      ]),
    ),
  },
});
const measured: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([url, text]) => {
    if (!url.startsWith("/cities/alpha/")) return [url, text];
    const city = parseCity(text);
    return [url, serialiseCityFile({ city, measures: measures(city) })];
  }),
);
const fetcher: Fetcher = async (url) => new Response(measured[url] ?? "", { status: url in measured ? 200 : 404 });

const viewport = { width: 800, height: 600 };
const map = () => screen.getByRole("application");
const legend = () => screen.getByRole("region", { name: "Legend" });
const hover = (x: number, y: number, mode: "plan" | "buildings" = "plan", height = 0) => {
  const p = project(currentView(), viewport, { x: x / 64, y: height, z: -y / 64 }, mode);
  fireEvent.pointerMove(map(), { pointerId: 1, clientX: p.x, clientY: p.y });
  return screen.getByRole("tooltip");
};
const rows = (card: HTMLElement) =>
  Array.from(card.querySelectorAll(".hit-rows > div"), (row) => [
    row.querySelector("dt")?.textContent,
    row.querySelector("dd")?.textContent,
  ]);
const colourBy = () => within(legend()).getByRole("button", { name: /^Colour by/ });

describe("Viewer buildings", () => {
  it("adds a file's measures to its card, saying where each came from", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(rows(hover(96, 32))).toEqual([
      ["In this folder", "1 lot"],
      ["Address", expect.stringContaining("No. 1")],
      ["Size", "120 lines4 kB"],
      ["Tested", "A test names itBy name"],
      ["Comments", "3 lines1 TODO"],
      ["Changed, commits, authors", "Not knownLaid without history (--no-history)"],
    ]);
  });

  it("colours by a measure from the legend, the unavailable ones disabled with their reason", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(colourBy().textContent).toBe("Colour by Folder");
    expect(within(legend()).getByText(/^Lot: a file's land/)).toBeTruthy();
    const folderColours = screen.getByTestId("canvas").dataset.colours;
    fireEvent.click(colourBy());
    const recency = screen.getByRole("radio", { name: /^Recency/ });
    expect(recency).toHaveProperty("disabled", true);
    expect(document.getElementById(recency.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Laid without history (--no-history)",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Size" }));
    expect(colourBy().textContent).toBe("Colour by Size");
    expect(document.activeElement).toBe(colourBy());
    expect(within(legend()).getByText("How big it is")).toBeTruthy();
    expect(within(legend()).getByText("Not known")).toBeTruthy();
    expect(screen.getByTestId("canvas").dataset.colours).not.toBe(folderColours);
    fireEvent.click(colourBy());
    fireEvent.click(screen.getByRole("radio", { name: "Kind" }));
    expect(within(legend()).getByText("Source file")).toBeTruthy();
    fireEvent.click(colourBy());
    fireEvent.click(screen.getByRole("radio", { name: "Tested" }));
    expect(within(legend()).getByText("0 %")).toBeTruthy();
    expect(info.mock.calls.map(([line]) => String(line))).toContain("viewer/colour-by by=size");
  });

  it("explains height and windows in the Buildings view, and stands the buildings", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(within(legend()).queryByText(/^Height/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Buildings" }));
    expect(screen.getByTestId("canvas").dataset.mode).toBe("buildings");
    expect(within(legend()).getByText(/^Height: size, 1 to 12 floors/)).toBeTruthy();
    expect(within(legend()).getByText("Lit windows: tested share (by name: all or none)")).toBeTruthy();
    // The keys and a hover answer in the Buildings view too.
    fireEvent.keyDown(map(), { key: "ArrowRight" });
    // The one building stands one floor high: its wall, a little above the ground, is the lot's.
    expect(hover(96, 32, "buildings", 0.2).dataset.kind).toBe("file");
    expect(info.mock.calls.map(([line]) => String(line))).toContain("viewer/mode mode=buildings");
  });

  it("offers only folder and kind for a city file without measures, and falls back to folder", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(colourBy());
    fireEvent.click(screen.getByRole("radio", { name: "Size" }));
    fromMore(/^beta/);
    await screen.findByRole("heading", { level: 1, name: "beta" });
    expect(colourBy().textContent).toBe("Colour by Folder");
    fireEvent.click(colourBy());
    const enabled = screen.getAllByRole("radio").filter((r) => !r.hasAttribute("disabled"));
    expect(enabled.map((r) => r.getAttribute("value"))).toEqual(["folder", "kind"]);
    expect(screen.getAllByText("This city file has no measures")).toHaveLength(5);
    expect(rows(hover(96, 32)).map(([label]) => label)).toEqual(["In this folder", "Address"]);
    // Height has no scale to tell without sizes.
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Buildings" }));
    expect(within(legend()).getByText(/^Height/).textContent).toBe(
      "Height: size, 1 to 12 floors; a hatched roof, not known",
    );
  });

  it("measures a GitHub repository from its tree's sizes and its tests' names", async () => {
    const API = "https://api.github.com/repos/acme/widgets";
    const tree = [
      { path: "src/a.ts", type: "blob", sha: "s1", size: 2048 },
      { path: "src/a.test.ts", type: "blob", sha: "s2", size: 99 },
    ];
    const routes: Record<string, () => Response> = {
      [`${API}/commits/HEAD`]: () => new Response(JSON.stringify({ sha: "c9", commit: { tree: { sha: "t9" } } })),
      [`${API}/git/trees/t9?recursive=1`]: () => new Response(JSON.stringify({ tree })),
    };
    const github: Fetcher = async (url) => (routes[url] ?? (() => fetcher(url)))();
    render(<Viewer Canvas={StubCanvas} fetcher={github} lay={layHere} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    type("acme/widgets");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    await screen.findByText(/single state, not folded$/);
    type("a.ts");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    const card = screen.getByRole("region", { name: "Selected" });
    expect(rows(card).slice(2)).toEqual([
      ["Size", "2 kB"],
      ["Tested", "A test names itBy name"],
      ["Changed, commits, authors", "Not knownNeeds the CLI's history"],
      ["Comments", "Not knownNeeds the files' contents"],
    ]);
  });

  it("folds the legend behind a button, for a phone", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const button = screen.getByRole("button", { name: "Legend" });
    expect(legend().dataset.open).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(legend().dataset.open).toBe("true");
    fireEvent.click(button);
    expect(legend().dataset.open).toBe("false");
  });
});

// Keeps the fixture's own city in use, so a stale import is caught by the type check.
void serialiseCity(variantCity("alpha", []));
