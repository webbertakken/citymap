import { serialiseCity } from "@citymap/ground-plan";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../github/read";
import { layHere } from "../lay/lay";
import { project } from "../view/view";
import {
  StubCanvas,
  city,
  currentView,
  fetcher,
  files,
  fromMore,
  index,
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
});

const broken = async () => new Response("", { status: 500 });
const half = async (url: string) =>
  new Response(url === "/cities/index.json" ? JSON.stringify(index) : "", {
    status: url === "/cities/index.json" ? 200 : 404,
  });
const empty = async (url: string) => new Response(url === "/cities/index.json" ? "[]" : "", { status: 200 });

describe("Viewer", () => {
  it("opens the first bundled city and lists its towns", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    expect(await screen.findByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(await screen.findByText("1 towns · 1 lots")).toBeTruthy();
    expect(towns()).toEqual(["alpha"]);
    expect(screen.getByRole("application", { name: /Map of alpha/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Legend" }).textContent).toContain(
      "Park: land for a folder's documentation",
    );
  });

  it("switches city from More, theme from its menu, and the view between Plan and Buildings", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "alpha 1 lots" }).getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "beta 1 lots" }));
    expect(await screen.findByRole("heading", { level: 1, name: "beta" })).toBeTruthy();
    // The view switch: plan at first; Buildings stands the buildings up, and pressed again lays them down.
    const plan = screen.getByRole("button", { name: "Plan" });
    const buildings = screen.getByRole("button", { name: "Buildings" });
    expect([plan.getAttribute("aria-pressed"), buildings.getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    fireEvent.click(buildings);
    expect(buildings.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("main")?.getAttribute("data-mode")).toBe("buildings");
    fireEvent.click(buildings);
    expect(plan.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(buildings);
    fireEvent.click(plan);
    expect(document.querySelector("main")?.getAttribute("data-mode")).toBe("plan");
    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    fireEvent.click(screen.getByRole("radio", { name: "Dracula" }));
    expect(read()).toMatch(/Dracula$/);
    // A pick closes the menu and hands focus back to its button.
    expect(screen.getByRole("button", { name: "Theme" }).getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Theme" }));
  });

  it("closes a menu with Escape or a press elsewhere", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const theme = screen.getByRole("button", { name: "Theme" });
    fireEvent.click(theme);
    expect(theme.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Paper atlas" }), { key: "Escape" });
    expect(theme.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(theme);
    fireEvent.click(theme);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(theme.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(screen.getByRole("application"));
    expect(theme.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(theme);
    fireEvent.click(theme);
    expect(theme.getAttribute("aria-expanded")).toBe("false");
  });

  it("pans and zooms with the keyboard and the zoom buttons, and fits with 0", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    const before = read();
    fireEvent.keyDown(map, { key: "+" });
    expect(read()).not.toBe(before);
    fireEvent.keyDown(map, { key: "0" });
    expect(read()).toBe(before);
    fireEvent.keyDown(map, { key: "ArrowRight" });
    expect(read()).not.toBe(before);
    fireEvent.keyDown(map, { key: "q" });
    fireEvent.click(screen.getByRole("button", { name: "Fit the city" }));
    expect(read()).toBe(before);
    const fitted = currentView().zoom;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(currentView().zoom).toBeCloseTo(fitted * 1.25, 9);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(currentView().zoom).toBeCloseTo(fitted / 1.25, 9);
  });

  it("opens a picked city file, and says why a bad one is not a city while keeping the last", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const input = screen.getByLabelText<HTMLInputElement>("City file");
    let clicked = false;
    input.addEventListener("click", () => {
      clicked = true;
    });
    fromMore("Open a city file…");
    expect(clicked).toBe(true);
    fireEvent.change(input, { target: { files: [new File([serialiseCity(city("gamma"))], "gamma.json")] } });
    expect(await screen.findByRole("heading", { level: 1, name: "gamma" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "alpha 1 lots" }).getAttribute("aria-current")).toBeNull();
    fireEvent.change(input, { target: { files: [new File(["{"], "bad.json")] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/^That file is not a city: city\/bad-json/);
    expect(screen.getByRole("heading", { level: 1, name: "gamma" })).toBeTruthy();
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
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
    expect(asked).toEqual(["/citymap/cities/index.json", "/citymap/cities/alpha/corridor-tiers.json"]);
  });

  it("says nothing of an empty city while the first one is still on its way", async () => {
    let arrive: ((response: Response) => void) | undefined;
    const slow = async (url: string) =>
      url === "/cities/index.json" ? fetcher(url) : new Promise<Response>((done) => (arrive = done));
    render(<Viewer Canvas={StubCanvas} fetcher={slow} />);
    expect(await screen.findByText("alpha: downloading…")).toBeTruthy();
    expect(screen.queryByText(/No city yet/)).toBeNull();
    await act(async () => arrive!(await fetcher("/cities/alpha/corridor-tiers.json")));
    expect(await screen.findByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
  });

  it("shows the empty state, and a failed index, by name", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={empty} />);
    expect(await screen.findByText(/No city yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    cleanup();
    render(<Viewer Canvas={StubCanvas} fetcher={broken} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The city could not load: Error: /cities/index.json answered 500",
    );
  });

  it("names a bundled city that fails to load", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={half} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The city could not load: Error: /cities/alpha/corridor-tiers.json answered 404",
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
    expect(read()).toMatch(/Night atlas$/);
  });

  it("hides the drawer to give the map the page, and brings it back", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const drawer = screen.getByRole("complementary", { name: "Details" });
    expect(drawer.dataset["open"]).toBe("auto");
    const fitted = read();
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(drawer.dataset["open"]).toBe("false");
    // The city refits to the map the drawer gave back.
    expect(read()).not.toBe(fitted);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(drawer.dataset["open"]).toBe("true");
    expect(read()).toBe(fitted);
    expect(info.mock.calls.map(([line]) => line).filter((l) => String(l).startsWith("viewer/drawer"))).toEqual([
      "viewer/drawer open=closed",
      "viewer/drawer open=open",
    ]);
  });

  it("lists seven towns by size, then all of them on request", async () => {
    const many = { ...city("many"), towns: [] as ReturnType<typeof city>["towns"][number][] };
    for (let i = 0; i < 9; i++)
      many.towns.push({
        ...city(`t${i}`).towns[0]!,
        key: `t${i}`,
        outline: city("x").towns[0]!.outline.map((p) => ({ x: p.x + i * 12800, y: p.y })),
        stats: { lots: 10 + i, overflow: 0, offLand: 0, docs: 0, lotArea2: 0, landArea2: 0 },
      });
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.change(screen.getByLabelText("City file"), {
      target: { files: [new File([serialiseCity(many)], "many.json")] },
    });
    await screen.findByRole("heading", { level: 1, name: "many" });
    expect(towns()).toEqual(["t8", "t7", "t6", "t5", "t4", "t3", "t2"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all 9 towns" }));
    expect(towns()).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer towns" }));
    expect(towns()).toHaveLength(7);
  });
});

describe("Viewer, rendered elsewhere", () => {
  it("prerenders on the server in the light theme, with no window", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    expect(html).toContain("citymap");
    expect(html).toContain('data-theme="paper-atlas"');
  });

  it("fetches from the browser by default", async () => {
    vi.stubGlobal("fetch", fetcher);
    render(<Viewer Canvas={StubCanvas} />);
    expect(await screen.findByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
  });
});

describe("Viewer fitting", () => {
  it("keeps a new city fitted to the map as it is measured, until the person moves it", async () => {
    let width = 1600;
    // From the wide layout to the medium one, where the search sits under the title and the city refits below it.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    const first = read();
    width = 1000;
    fireEvent(window, new Event("resize"));
    expect(read()).not.toBe(first);
    fireEvent.keyDown(map, { key: "ArrowRight" });
    const moved = read();
    width = 1600;
    fireEvent(window, new Event("resize"));
    expect(read()).toBe(moved);
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
    const middle = project(currentView(), viewport, { x: 50, y: 0, z: -50 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: middle.x, clientY: middle.y });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerLeave(map);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerDown(map, { pointerId: 1, clientX: middle.x, clientY: middle.y });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: middle.x + 50, clientY: middle.y });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: middle.x + 50, clientY: middle.y });
    expect(screen.getByRole("region", { name: "Selected" }).textContent).toContain("Nothing yet");
    fireEvent.pointerMove(map, { pointerId: 2, clientX: -500, clientY: -500 });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("places the card by its measured size beside the pointer, flipping at the far edges", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    const map = await screen.findByRole("application");
    // Without the drawer the town sits near the map's middle; close up, the whole map is town.
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    for (let i = 0; i < 12; i++) fireEvent.keyDown(map, { key: "+" });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 790, clientY: 590 });
    const card = screen.getByRole("tooltip");
    expect(card.style.left).toBe(`${790 - 16 - 300}px`);
    expect(card.style.top).toBe(`${590 - 16 - 200}px`);
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(screen.getByRole("tooltip").style.left).toBe("26px");
  });
});

describe("Viewer drill down", () => {
  const viewport = { width: 800, height: 600 };

  it("shows one town from the drawer, fitted, and the whole city again from the breadcrumb", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    await screen.findByRole("application");
    expect(towns()).toEqual(["alpha", "apps/web"]);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    const whole = read();
    fireEvent.click(townButton("apps/web"));
    expect(towns()).toEqual(["apps/web"]);
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs.textContent).toBe("alphaapps/web");
    expect(crumbs.querySelector("[aria-current=page]")?.textContent).toBe("apps/web");
    expect(within(screen.getByRole("region", { name: "Towns" })).queryByRole("button")).toBeNull();
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
    expect(within(selected).getByRole("heading", { level: 3 }).textContent).toBe("page.tsx");
    expect(selected.textContent).toContain("In apps/web");
    fireEvent.click(within(selected).getByRole("button", { name: "Show only this town: apps/web" }));
    expect(towns()).toEqual(["apps/web"]);
    expect(selected.textContent).toContain("Nothing yet");
    // Select again in the town alone: Escape clears the selection first, then leaves the town.
    const again = project(currentView(), viewport, { x: 12896 / 64, y: 0.15, z: -32 / 64 });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: again.x, clientY: again.y });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: again.x, clientY: again.y });
    expect(within(selected).getByRole("heading", { level: 3 }).textContent).toBe("page.tsx");
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
    fireEvent.click(townButton("apps/web"));
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
    await screen.findByText("1 towns · 1 lots");
    fireEvent.change(screen.getByLabelText("City file"), { target: { files: [new File(["{"], "bad.json")] } });
    await screen.findByRole("alert");
    fireEvent.click(townButton("alpha"));
    fireEvent.click(screen.getByRole("navigation", { name: "Breadcrumb" }).querySelector("button")!);
    const lines = info.mock.calls.map(([line]) => String(line));
    expect(lines.filter((l) => !l.startsWith("viewer/load-")).map((l) => l.replace(/ ms=\d+$/, ""))).toEqual([
      "viewer/index cities=2",
      // Before the city shows, its folders and files are listed for search, in slices.
      "viewer/search-index entries=3 slices=1",
      "viewer/measures-none name=alpha",
      "viewer/open name=alpha towns=1 lots=1",
      "viewer/town key=alpha",
      "viewer/city",
    ]);
    // Each load logs its phases and its end; the bad file failed, so it ends in the error instead.
    expect(lines.filter((l) => l.startsWith("viewer/load-")).map((l) => l.replace(/ ms=\d+$/, ""))).toEqual([
      "viewer/load-phase source=bundled name=alpha phase=download",
      "viewer/load-phase source=bundled name=alpha phase=parse",
      "viewer/load-phase source=bundled name=alpha phase=draw",
      "viewer/load-done source=bundled name=alpha",
      "viewer/load-phase source=file name=bad.json phase=download",
      "viewer/load-phase source=file name=bad.json phase=parse",
    ]);
    expect(error.mock.calls.map(([line]) => line)).toEqual(["viewer/file-rejected file=bad.json reason=city/bad-json"]);
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

  it("logs each submodule it lays as its .gitlink, and why", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const tree = {
      tree: [
        { path: "src/a.ts", type: "blob", sha: "a" },
        { path: "ext/x", type: "commit", sha: "p" },
      ],
    };
    const withSubmodule = github({ [`${API}/git/trees/t9?recursive=1`]: () => new Response(JSON.stringify(tree)) });
    render(<Viewer Canvas={StubCanvas} fetcher={withSubmodule} lay={layHere} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    type("acme/widgets");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    // The load is done once the status says how it was laid.
    expect(await screen.findByText(/single state, not folded$/)).toBeTruthy();
    expect(info.mock.calls.map(([line]) => String(line))).toContain(
      "viewer/github-submodule-unread path=ext/x reason=no-url",
    );
  });

  it("lays a named repository's single state from the search, says so, and puts it in the address", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={github()} lay={layHere} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    type("https://github.com/acme/widgets");
    // Nothing in alpha matches, so laying the repository is the first choice, and Enter picks it.
    expect(screen.getAllByRole("button", { name: /from GitHub/ }).map((b) => b.textContent)).toEqual([
      "Lay acme/widgets from GitHub Reads its tree and lays it here",
    ]);
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    expect(await screen.findByText(/^1 towns · 12 lots · single state, not folded$/)).toBeTruthy();
    expect(window.location.search).toBe("?repo=acme/widgets");
    expect(searchField()).toHaveProperty("value", "");
    expect(info.mock.calls.map(([line]) => String(line)).find((l) => l.startsWith("viewer/github-read"))).toMatch(
      /^viewer\/github-read repo=acme\/widgets requests=2 files=12 ms=\d+$/,
    );
    // Its files are found by the search; the repository is offered after the matches when the text names one too.
    type("src/f1");
    const options = within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
    expect(options.map((b) => b.textContent)).toEqual([
      "File f1.ts src/f1.ts",
      "File f10.ts src/f10.ts",
      "File f11.ts src/f11.ts",
      "Lay src/f1 from GitHub Reads its tree and lays it here",
    ]);
    type("src");
    expect(screen.getByText(/^12 matches; the first 7 are shown, type more to narrow them$/)).toBeTruthy();
  });

  it("suggests an owner's repositories with the allowance left, and lays the one picked", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const owner = github({
      "https://api.github.com/users/acme/repos?sort=pushed&per_page=100": () =>
        new Response(
          JSON.stringify([
            {
              name: "widgets",
              description: "Widgets.",
              stargazers_count: 7,
              language: "Go",
              fork: false,
              archived: false,
            },
          ]),
          { headers: { "x-ratelimit-remaining": "57", "x-ratelimit-reset": "1700000000" } },
        ),
    });
    render(<Viewer Canvas={StubCanvas} fetcher={owner} lay={layHere} />);
    await screen.findByText("1 towns · 1 lots");
    type("acme/");
    expect(await screen.findByText("On GitHub")).toBeTruthy();
    expect(document.querySelector(".summary")?.textContent).toBe(
      "1 of acme's repositories match · 57 GitHub requests left this hour",
    );
    fireEvent.click(screen.getByRole("button", { name: /^GitHub repository acme\/widgets/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
  });

  it("lays the repository an address names, instead of the first bundled city, and says why a bad one cannot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.replaceState(null, "", "/?repo=acme/widgets");
    render(<Viewer Canvas={StubCanvas} fetcher={github()} lay={layHere} />);
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    cleanup();
    window.history.replaceState(null, "", "/?repo=not%20a%20repository");
    render(<Viewer Canvas={StubCanvas} fetcher={github()} lay={layHere} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      '"not a repository" is not a GitHub repository: use owner/name.',
    );
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
    type("acme/widgets");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect(
      await screen.findByText(/^GitHub's hourly limit for this browser is reached; it resets at \d\d:\d\d\.$/),
    ).toBeTruthy();
    type("acme/missing");
    fireEvent.click(screen.getByRole("button", { name: /^Lay acme\/missing from GitHub/ }));
    expect(await screen.findByText("acme/missing does not exist or is private.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
  });
});
