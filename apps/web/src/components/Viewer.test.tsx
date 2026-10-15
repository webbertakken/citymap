import { serialiseCity, type City } from "@citymap/ground-plan";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../github/read";
import { layHere } from "../lay/lay";
import { project, type View } from "../view/view";
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
        // A ward around both, named after its largest member: a grouping on the map, not a district of its own.
        { pts: square(0, 6400), path: "#ward", name: "src", depth: 1, massMille: 3000, ward: true },
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

/** The view the stub canvas was last given. */
const currentView = (): View => {
  const [mode, zoom, centre] = (read() ?? "").split(" ");
  const [x, z] = centre!.split(",").map(Number);
  return { mode: mode === "plan" ? "plan" : "dimetric", zoom: Number(zoom), centre: { x: x!, z: z! } };
};

function StubCanvas({ view, theme }: CanvasProps) {
  return (
    <p data-testid="canvas">
      {view.mode} {view.zoom} {view.centre.x},{view.centre.z} {theme.label}
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

  it("fetches the bundled cities under the site's base path", async () => {
    const asked: string[] = [];
    const under = async (url: string) => {
      asked.push(url);
      return fetcher(url.replace(/^\/citymap/, ""));
    };
    render(<Viewer Canvas={StubCanvas} fetcher={under} basePath="/citymap" />);
    expect(await screen.findByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(asked).toEqual(["/citymap/cities/index.json", "/citymap/cities/alpha.json"]);
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

describe("Viewer hover and select", () => {
  const viewport = { width: 800, height: 600 };

  it("names the lot under the pointer, selects it with a click, and clears with Escape", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    // The lot spans 64 to 128 east and 0 to 64 north: its centre, at the height of its top.
    const lot = project(currentView(), viewport, { x: 96 / 64, y: 0.15, z: -32 / 64 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: lot.x, clientY: lot.y });
    expect(screen.getByRole("tooltip").textContent).toContain("a.ts");
    fireEvent.pointerDown(map, { pointerId: 1, clientX: lot.x, clientY: lot.y });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: lot.x, clientY: lot.y });
    expect(screen.getByRole("region", { name: "Selected" }).textContent).toContain("a.ts");
    fireEvent.keyDown(map, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("region", { name: "Selected" }).textContent).toContain("Nothing yet");
  });

  it("drops the card when the pointer leaves, and does not select after a drag", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 400, clientY: 300 });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerLeave(map);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 450, clientY: 300 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 450, clientY: 300 });
    expect(screen.getByRole("region", { name: "Selected" }).textContent).toContain("Nothing yet");
    fireEvent.pointerMove(map, { pointerId: 2, clientX: -500, clientY: -500 });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps the card on the map beside the pointer, flipping at the far edges", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    for (let i = 0; i < 12; i++) fireEvent.keyDown(map, { key: "+" });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 790, clientY: 590 });
    const card = screen.getByRole("tooltip");
    expect(card.style.left).toBe(`${790 - 16 - 260}px`);
    expect(card.style.top).toBe(`${590 - 16 - 96}px`);
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(screen.getByRole("tooltip").style.left).toBe("26px");
  });
});

/** The towns the panel lists, by name. */
const towns = () =>
  Array.from(screen.getByRole("region", { name: "Towns and districts" }).querySelectorAll("h2"), (h) =>
    h.firstChild?.textContent?.trim(),
  );

describe("Viewer drill down", () => {
  const viewport = { width: 800, height: 600 };
  // The city of alpha with a second town, apps/web, east of it across a highway.
  const base = city("alpha");
  const web = {
    ...base.towns[0]!,
    key: "alpha/apps/web",
    name: "apps/web",
    outline: square(12800, 6400),
    lots: [{ ...base.towns[0]!.lots[0]!, pts: square(12864, 64), path: "apps/web/page.tsx" }],
    districts: [
      { pts: square(12800, 3200), path: "apps/web/src", name: "src", depth: 1, massMille: 1000, ward: false },
    ],
  };
  const twin: City = {
    ...base,
    towns: [base.towns[0]!, web],
    highways: [
      {
        pts: [
          { x: 6400, y: 3200 },
          { x: 12800, y: 3200 },
        ],
        cls: "highway",
      },
    ],
  };
  const twinFiles: Record<string, string> = {
    "/cities/index.json": JSON.stringify([{ name: "alpha", file: "alpha.json", lots: 2 }]),
    "/cities/alpha.json": serialiseCity(twin),
  };
  const twinFetcher = async (url: string) =>
    new Response(twinFiles[url] ?? "", { status: url in twinFiles ? 200 : 404 });

  it("shows one town from the panel, fitted, and the whole city again from the breadcrumb", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    await screen.findByRole("application");
    expect(towns()).toEqual(["alpha", "apps/web"]);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    const whole = read();
    fireEvent.click(screen.getByRole("button", { name: "Show only this town: apps/web" }));
    expect(towns()).toEqual(["apps/web"]);
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs.textContent).toBe("alphaapps/web");
    expect(crumbs.querySelector("[aria-current=page]")?.textContent).toBe("apps/web");
    expect(screen.queryByRole("button", { name: /^Show only this town/ })).toBeNull();
    expect(currentView().centre.x).toBeGreaterThan(200);
    expect(read()).not.toBe(whole);
    fireEvent.click(screen.getByRole("button", { name: "alpha" }));
    expect(towns()).toEqual(["alpha", "apps/web"]);
    expect(read()).toBe(whole);
  });

  it("shows the town of a selection, and steps back out with Escape once nothing is selected", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    const map = await screen.findByRole("application");
    const lot = project(currentView(), viewport, { x: 12896 / 64, y: 0.15, z: -32 / 64 });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: lot.x, clientY: lot.y });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: lot.x, clientY: lot.y });
    const selected = screen.getByRole("region", { name: "Selected" });
    expect(selected.textContent).toContain("apps/web/page.tsx");
    fireEvent.click(within(selected).getByRole("button", { name: "Show only this town: apps/web" }));
    expect(towns()).toEqual(["apps/web"]);
    expect(selected.textContent).toContain("Nothing yet");
    // Select again in the town alone: Escape clears the selection first, then leaves the town.
    const again = project(currentView(), viewport, { x: 12896 / 64, y: 0.15, z: -32 / 64 });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: again.x, clientY: again.y });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: again.x, clientY: again.y });
    expect(selected.textContent).toContain("apps/web/page.tsx");
    expect(screen.queryByRole("button", { name: /^Show only this town/ })).toBeNull();
    fireEvent.keyDown(map, { key: "Escape" });
    expect(selected.textContent).toContain("Nothing yet");
    expect(towns()).toEqual(["apps/web"]);
    fireEvent.keyDown(map, { key: "Escape" });
    expect(towns()).toEqual(["alpha", "apps/web"]);
    fireEvent.keyDown(map, { key: "Escape" });
    expect(towns()).toEqual(["alpha", "apps/web"]);
  });

  it("offers no town for a highway, and leaves the town when another city opens", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    const map = await screen.findByRole("application");
    const road = project(currentView(), viewport, { x: 9600 / 64, y: 0, z: -3200 / 64 });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: road.x, clientY: road.y });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: road.x, clientY: road.y });
    const selected = screen.getByRole("region", { name: "Selected" });
    expect(selected.textContent).toContain("Highway");
    expect(within(selected).queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show only this town: apps/web" }));
    const file = new File([serialiseCity(city("beta"))], "beta.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("City file"), { target: { files: [file] } });
    await screen.findByRole("heading", { level: 1, name: "beta" });
    expect(towns()).toEqual(["beta"]);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });
});

describe("Viewer log", () => {
  it("logs each opening, rejection and drill by its fingerprint", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.change(screen.getByLabelText("City file"), { target: { files: [new File(["{"], "bad.json")] } });
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Show only this town: alpha" }));
    fireEvent.click(screen.getByRole("navigation", { name: "Breadcrumb" }).querySelector("button")!);
    expect(info.mock.calls.map(([line]) => line)).toEqual([
      "viewer/index cities=2",
      "viewer/open name=alpha towns=1 lots=1",
      "viewer/town key=alpha",
      "viewer/city",
    ]);
    expect(error.mock.calls.map(([line]) => line)).toEqual(["viewer/file-rejected file=bad.json reason=city/bad-json"]);
    vi.restoreAllMocks();
  });
});

describe("Viewer and a GitHub repository", () => {
  const API = "https://api.github.com/repos/acme/widgets";
  const github = (extra: Record<string, () => Response> = {}): Fetcher => {
    const routes: Record<string, () => Response> = {
      [`${API}/commits/HEAD`]: () => new Response(JSON.stringify({ sha: "c9", commit: { tree: { sha: "t9" } } })),
      [`${API}/git/trees/t9?recursive=1`]: () =>
        new Response(
          JSON.stringify({
            tree: Array.from({ length: 12 }, (_, i) => ({ path: `src/f${i}.ts`, type: "blob", sha: `s${i}` })),
          }),
        ),
      ...extra,
    };
    return async (url) =>
      (routes[url] ?? (() => new Response(files[url] ?? "", { status: url in files ? 200 : 404 })))();
  };
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("lays a named repository's single state, says so, and puts it in the address", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={github()} lay={layHere} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "https://github.com/acme/widgets" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lay" }));
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    expect(await screen.findByText(/^1 towns · 12 lots · single state, not folded$/)).toBeTruthy();
    expect(window.location.search).toBe("?repo=acme/widgets");
    expect(info.mock.calls.map(([line]) => String(line)).find((l) => l.startsWith("viewer/github-read"))).toMatch(
      /^viewer\/github-read repo=acme\/widgets requests=2 files=12 ms=\d+$/,
    );
    vi.restoreAllMocks();
  });

  it("lays the repository an address names, instead of the first bundled city", async () => {
    window.history.replaceState(null, "", "/?repo=acme/widgets");
    render(<Viewer Canvas={StubCanvas} fetcher={github()} lay={layHere} />);
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
  });

  it("says in one sentence why a repository cannot be laid, and keeps the last city", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limited = github({
      [`${API}/commits/HEAD`]: () =>
        new Response("{}", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" },
        }),
    });
    render(<Viewer Canvas={StubCanvas} fetcher={limited} lay={layHere} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const field = screen.getByLabelText("GitHub repository");
    fireEvent.change(field, { target: { value: "not a repository" } });
    fireEvent.click(screen.getByRole("button", { name: "Lay" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      '"not a repository" is not a GitHub repository: use owner/name.',
    );
    fireEvent.change(field, { target: { value: "acme/widgets" } });
    fireEvent.click(screen.getByRole("button", { name: "Lay" }));
    expect(
      await screen.findByText(/^GitHub's hourly limit for this browser is reached; it resets at \d\d:\d\d\.$/),
    ).toBeTruthy();
    fireEvent.change(field, { target: { value: "acme/missing" } });
    fireEvent.click(screen.getByRole("button", { name: "Lay" }));
    expect(await screen.findByText("acme/missing does not exist or is private.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    vi.restoreAllMocks();
  });
});
