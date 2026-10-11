import { serialiseCity, type City } from "@citymap/ground-plan";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasProps } from "./MapView";
import { Viewer } from "./Viewer";

afterEach(cleanup);

const square = (x: number, s: number) => [
  { x, y: 0 },
  { x: x + s, y: 0 },
  { x: x + s, y: s },
  { x, y: s },
];
const city = (name: string): City => ({
  repository: name,
  commit: "worktree",
  highways: [],
  towns: [
    {
      key: name,
      name,
      form: "polycentric",
      old: false,
      outline: square(0, 6400),
      water: [],
      roads: [],
      blocks: [],
      lots: [{ pts: square(64, 64), key: "a", address: "a", vacant: false, path: "a.ts", use: "source", district: 1 }],
      districts: [
        { pts: square(0, 3200), path: "src", name: "src", depth: 1, massMille: 2000, ward: false },
        { pts: square(3200, 3200), path: "lib", name: "lib", depth: 1, massMille: 1000, ward: false },
      ],
      stats: { lots: 1, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
    },
  ],
});
const index = [
  { name: "alpha", file: "alpha.json", lots: 1 },
  { name: "beta", file: "beta.json", lots: 1 },
];
const files: Record<string, string> = {
  "/cities/index.json": JSON.stringify(index),
  "/cities/alpha.json": serialiseCity(city("alpha")),
  "/cities/beta.json": serialiseCity(city("beta")),
};
const fetcher = async (url: string) => new Response(files[url] ?? "", { status: url in files ? 200 : 404 });
const broken = async () => new Response("", { status: 500 });
const half = async (url: string) =>
  new Response(url === "/cities/index.json" ? JSON.stringify(index) : "", {
    status: url === "/cities/index.json" ? 200 : 404,
  });

const read = () => screen.getByTestId("canvas").textContent;
const empty = async (url: string) => new Response(url === "/cities/index.json" ? "[]" : "", { status: 200 });

function StubCanvas({ view, theme }: CanvasProps) {
  return (
    <p data-testid="canvas">
      {view.mode} {view.zoom.toFixed(3)} {view.centre.x.toFixed(1)},{view.centre.z.toFixed(1)} {theme.label}
    </p>
  );
}

describe("Viewer", () => {
  it("opens the first bundled city and lists its towns and districts", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    expect(await screen.findByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /alpha/ })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["src", "lib"]);
    expect(screen.getByRole("application", { name: /Map of alpha/ })).toBeTruthy();
  });

  it("switches city, view and theme from the bar", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "beta.json" } });
    expect(await screen.findByRole("heading", { level: 1, name: "beta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    expect(screen.getByRole("button", { name: "Plan" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("canvas").textContent).toMatch(/^plan /);
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dracula" } });
    expect(screen.getByTestId("canvas").textContent).toMatch(/Dracula$/);
  });

  it("pans and zooms with the keyboard, and fits with 0", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    const before = screen.getByTestId("canvas").textContent;
    fireEvent.keyDown(map, { key: "+" });
    expect(screen.getByTestId("canvas").textContent).not.toBe(before);
    fireEvent.keyDown(map, { key: "0" });
    expect(screen.getByTestId("canvas").textContent).toBe(before);
    fireEvent.keyDown(map, { key: "ArrowRight" });
    expect(screen.getByTestId("canvas").textContent).not.toBe(before);
    fireEvent.keyDown(map, { key: "q" });
  });

  it("opens a picked city file, and says why a bad one is not a city while keeping the last", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const input = screen.getByLabelText("City file");
    fireEvent.change(input, { target: { files: [new File([serialiseCity(city("gamma"))], "gamma.json")] } });
    expect(await screen.findByRole("heading", { level: 1, name: "gamma" })).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File(["{"], "bad.json")] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/^That file is not a city: city\/bad-json/);
    expect(screen.getByRole("heading", { level: 1, name: "gamma" })).toBeTruthy();
    fireEvent.change(input, { target: { files: [] } });
  });

  it("opens a dropped city file anywhere on the page", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    await act(async () => {
      fireEvent.dragOver(document);
      fireEvent.drop(document, { dataTransfer: { files: [new File([serialiseCity(city("delta"))], "delta.json")] } });
    });
    expect(await screen.findByRole("heading", { level: 1, name: "delta" })).toBeTruthy();
    fireEvent.drop(document, { dataTransfer: { files: [] } });
  });

  it("drags to pan, pinches and wheels to zoom", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    const start = read();
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 140, clientY: 100 });
    const panned = read();
    expect(panned).not.toBe(start);
    fireEvent.pointerDown(map, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(map, { pointerId: 2, clientX: 260, clientY: 100 });
    expect(read()).not.toBe(panned);
    fireEvent.pointerUp(map, { pointerId: 1 });
    fireEvent.pointerUp(map, { pointerId: 2 });
    fireEvent.pointerMove(map, { pointerId: 3, clientX: 0, clientY: 0 });
    const pinched = read();
    fireEvent.wheel(map, { deltaY: -100 });
    expect(read()).not.toBe(pinched);
    fireEvent.wheel(map, { deltaY: 100 });
    fireEvent(window, new Event("resize"));
  });

  it("shows the empty state, and a failed index, by name", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={empty} />);
    expect(await screen.findByText(/No city yet/)).toBeTruthy();
    cleanup();
    render(<Viewer Canvas={StubCanvas} fetcher={broken} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The city could not load: Error: /cities/index.json answered 500",
    );
  });

  it("names a bundled city that fails to load", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={half} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The city could not load: Error: /cities/alpha.json answered 404",
    );
  });

  it("starts in Night atlas when the system prefers dark", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(screen.getByTestId("canvas").textContent).toMatch(/Night atlas$/);
    vi.unstubAllGlobals();
  });

  it("keeps the city and theme when a select offers an unknown value, and opens the file picker", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "nowhere.json" } });
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "neon" } });
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(read()).toMatch(/Paper atlas$/);
    const input = screen.getByLabelText<HTMLInputElement>("City file");
    let clicked = false;
    input.addEventListener("click", () => {
      clicked = true;
    });
    fireEvent.click(screen.getByRole("button", { name: "Open a city file…" }));
    expect(clicked).toBe(true);
  });

  it("folds the panel behind a disclosure on narrow screens", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const toggle = await screen.findByRole("button", { name: "Towns and districts" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Viewer, rendered elsewhere", () => {
  it("prerenders on the server in the light theme, with no window", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    expect(html).toContain("citymap");
    expect(html).toContain('data-theme="paper-atlas"');
  });

  it("fetches from the browser by default, and switches back to dimetric", async () => {
    vi.stubGlobal("fetch", fetcher);
    render(<Viewer Canvas={StubCanvas} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Dimetric" }));
    expect(read()).toMatch(/^dimetric /);
    vi.unstubAllGlobals();
  });
});

describe("Viewer fitting", () => {
  it("keeps a new city fitted to the map as it is measured, until the person moves it", async () => {
    let width = 800;
    const box = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    const first = read();
    width = 1600;
    fireEvent(window, new Event("resize"));
    const wider = read();
    expect(wider).not.toBe(first);
    fireEvent.keyDown(map, { key: "ArrowRight" });
    const moved = read();
    width = 400;
    fireEvent(window, new Event("resize"));
    expect(read()).toBe(moved);
    box.mockRestore();
  });
});
