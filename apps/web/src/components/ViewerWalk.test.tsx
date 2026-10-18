import { UNIT, parseCity, serialiseCity } from "@citymap/ground-plan";
import type { Footprint, Walls } from "@citymap/world";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArcadeWhy, GoDown } from "../explore/descent";
import type { Garage } from "../explore/physics/garage";
import type { RaiseWalls } from "../explore/physics/raise";
import type { Fetcher } from "../github/read";
import type { ExploreCanvasProps } from "./ExploreView";
import { StubCanvas, currentView, files, fromMore } from "./testing/fixtures";
import { Viewer } from "./Viewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

/** alpha with a street along its south edge (z = 0 in the scene), so there is somewhere to walk. */
const roads: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([url, text]) => {
    if (!url.startsWith("/cities/alpha/")) return [url, text];
    const city = parseCity(text);
    const street = {
      cls: "street" as const,
      pts: [
        { x: 0, y: 0 },
        { x: 20 * UNIT, y: 0 },
      ],
    };
    return [url, serialiseCity({ ...city, towns: [{ ...city.towns[0]!, roads: [street] }] })];
  }),
);
const fetcher: Fetcher = async (url) => new Response(roads[url] ?? "", { status: url in roads ? 200 : 404 });
const bare: Fetcher = async (url) => new Response(files[url] ?? "", { status: url in files ? 200 : 404 });

/** Draws one frame once mounted, as the real canvas draws them after each paint. */
function ExploreStub({ frame }: ExploreCanvasProps) {
  useEffect(() => {
    frame(0);
  }, [frame]);
  return <p data-testid="explore-canvas" />;
}

/** Walls of open ground, that say when they are freed. */
const openWalls = () => {
  const dispose = vi.fn<() => void>();
  const walls: Walls = {
    move: (feet, delta) => ({ feet: { x: feet.x + delta.x, y: feet.y, z: feet.z + delta.z }, grounded: true }),
    clearance: () => 10,
    dispose,
  };
  return { walls, dispose };
};

/** Going down by raising the walls alone, with a garage (or none, and why). */
const downBy =
  (raise: RaiseWalls, garage: Garage | null = null, arcade: ArcadeWhy | null = null): GoDown =>
  async (footprints, _at, options) => ({ walls: await raise(footprints, options), garage, arcade });
const show = async (raise: RaiseWalls, with_: Fetcher = fetcher) => {
  render(
    <Viewer
      Canvas={StubCanvas}
      explore={{ Canvas: ExploreStub, engine: "Stand-in", goDown: downBy(raise) }}
      fetcher={with_}
    />,
  );
  await screen.findByRole("heading", { level: 1, name: "alpha" });
};
const walkButton = () => screen.getByRole("button", { name: "Walk" });

describe("Viewer walking", () => {
  it("stands the city's helicopter along the landing's road, or says there is no open ground for it", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    // Open ground seen clear all the way.
    const walls: Walls = {
      ...openWalls().walls,
      clearance: (from, to) => Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z),
    };
    await show(async () => walls);
    fireEvent.click(walkButton());
    await screen.findByTestId("explore-canvas");
    const lines = () => info.mock.calls.map(([line]) => String(line));
    expect(lines().find((l) => l.startsWith("explore/helipad"))).toMatch(/^explore\/helipad x=-?\d+\.\d z=-?\d+\.\d$/);
    cleanup();
    info.mockClear();
    // Walls that push anything as wide as a rotor: nowhere is open enough.
    const crowded: Walls = {
      ...walls,
      move: (feet, delta, radius) => ({
        feet: { x: feet.x + delta.x + ((radius ?? 0) > 3 ? 1 : 0), y: feet.y, z: feet.z + delta.z },
        grounded: true,
      }),
    };
    await show(async () => crowded);
    fireEvent.click(walkButton());
    await screen.findByTestId("explore-canvas");
    expect(lines()).toContain("explore/no-helipad");
  });

  it("goes down into the city once its walls are raised, and hides what belongs to the map", async () => {
    const { walls } = openWalls();
    const raised: Footprint[][] = [];
    await show(async (footprints, options) => {
      raised.push([...footprints]);
      options.onStep?.({ phase: "walls", done: 0, of: footprints.length });
      return walls;
    });
    fireEvent.click(walkButton());
    expect(await screen.findByTestId("explore-canvas")).toBeTruthy();
    expect(raised[0]).toHaveLength(1);
    expect(walkButton().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("application").getAttribute("aria-label")).toMatch(/^Walking in alpha/);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("region", { name: "Legend" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(document.querySelector("main")?.dataset.walking).toBe("true");
  });

  it("comes back to the map where the walk ended, and frees the walls", async () => {
    const { walls, dispose } = openWalls();
    await show(async () => walls);
    fireEvent.click(walkButton());
    await screen.findByTestId("explore-canvas");
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("explore-canvas")).toBeNull());
    // The road nearest the middle of the map runs along z = 0.
    expect(currentView().centre.z).toBeCloseTo(0, 6);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("frees the cars' garage with the walls when the walk ends", async () => {
    const { walls } = openWalls();
    const dispose = vi.fn<() => void>();
    const garage: Garage = {
      follow: () => ({ standing: 0, waiting: 0, nearest: Infinity }),
      drive: (vehicles) => vehicles,
      keepingUp: () => true,
      load: () => 0,
      dispose,
    };
    render(
      <Viewer
        Canvas={StubCanvas}
        explore={{ Canvas: ExploreStub, engine: "Stand-in", goDown: downBy(async () => walls, garage) }}
        fetcher={fetcher}
      />,
    );
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(walkButton());
    expect(await screen.findByTestId("explore-canvas")).toBeTruthy();
    expect(screen.queryByText(/Cars drive simply/)).toBeNull();
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  });

  it("says once in the walk's card that cars drive simply when the physics engine did not load", async () => {
    render(
      <Viewer
        Canvas={StubCanvas}
        explore={{
          Canvas: ExploreStub,
          engine: "Stand-in",
          goDown: downBy(async () => openWalls().walls, null, "engine"),
        }}
        fetcher={fetcher}
      />,
    );
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(walkButton());
    expect(await screen.findByText("Cars drive simply here: the physics engine did not load.")).toBeTruthy();
  });

  it("leaves by Escape pressed the moment the walk shows, before the effects of its commit have run", async () => {
    // Outside act, as in the browser: the walk commits when its walls resolve, and its effects run in a later task. A
    // press then must reach the walk, not the finished load's Escape, nor fall before the walk listens.
    const acting = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const { walls, dispose } = openWalls();
    root.render(
      <Viewer
        Canvas={StubCanvas}
        explore={{ Canvas: ExploreStub, engine: "Stand-in", goDown: downBy(async () => walls) }}
        fetcher={fetcher}
      />,
    );
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy());
    const shown = new Promise<void>((resolve) => {
      const watch = new MutationObserver(() => {
        if (!host.querySelector("[data-testid=explore-canvas]")) return;
        watch.disconnect();
        resolve();
      });
      watch.observe(host, { childList: true, subtree: true });
    });
    fireEvent.click(walkButton());
    await shown;
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(host.querySelector("[data-testid=explore-canvas]")).toBeNull());
    expect(dispose).toHaveBeenCalledOnce();
    root.unmount();
    host.remove();
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", acting);
  });

  it("leaves by the Walk button or a change of view, keeping the map where it was", async () => {
    await show(async () => openWalls().walls);
    const before = currentView();
    fireEvent.click(walkButton());
    await screen.findByTestId("explore-canvas");
    fireEvent.click(walkButton());
    expect(screen.queryByTestId("explore-canvas")).toBeNull();
    expect(currentView()).toEqual(before);
    fireEvent.click(walkButton());
    await screen.findByTestId("explore-canvas");
    fireEvent.click(screen.getByRole("button", { name: "Buildings" }));
    expect(screen.queryByTestId("explore-canvas")).toBeNull();
    expect(screen.getByTestId("canvas").dataset.mode).toBe("buildings");
  });

  it("ends the walk when another city is shown", async () => {
    const { walls, dispose } = openWalls();
    await show(async () => walls);
    fireEvent.click(walkButton());
    await screen.findByTestId("explore-canvas");
    // Ready once the walk holds the keyboard: its focusing would otherwise close More as it opens.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("application")));
    fromMore(/^beta/);
    await screen.findByRole("heading", { level: 1, name: "beta" });
    expect(screen.queryByTestId("explore-canvas")).toBeNull();
    expect(walkButton().getAttribute("aria-pressed")).toBe("false");
    // The walk's walls go once a new walk replaces it.
    fireEvent.click(walkButton());
    await waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  });

  it("says so when the walls cannot rise, and stays on the map", async () => {
    await show(async () => {
      throw new Error("no wasm");
    });
    fireEvent.click(walkButton());
    expect(await screen.findByText("Walking could not start: the city’s walls did not rise.")).toBeTruthy();
    expect(screen.getByTestId("canvas")).toBeTruthy();
  });

  it("stays quiet when the walk is cancelled", async () => {
    const error = vi.spyOn(console, "error");
    await show(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    fireEvent.click(walkButton());
    await waitFor(() => expect(screen.getByTestId("canvas")).toBeTruthy());
    expect(error).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has nowhere to land in a city without roads", async () => {
    const raise = vi.fn<RaiseWalls>();
    await show(raise, bare);
    fireEvent.click(walkButton());
    expect(await screen.findByText("This city has no roads to walk on.")).toBeTruthy();
    expect(raise).not.toHaveBeenCalled();
  });

  it("keeps the Walk button in its place, disabled, until a city is drawn to walk in", async () => {
    let arrive: ((response: Response) => void) | undefined;
    const slow: Fetcher = async (url) =>
      url.startsWith("/cities/alpha/")
        ? new Promise<Response>((done) => (arrive = done))
        : new Response(roads[url] ?? "", { status: url in roads ? 200 : 404 });
    render(
      <Viewer
        Canvas={StubCanvas}
        explore={{ Canvas: ExploreStub, engine: "Stand-in", goDown: downBy(async () => openWalls().walls) }}
        fetcher={slow}
      />,
    );
    await waitFor(() => expect(arrive).toBeDefined());
    expect(walkButton()).toHaveProperty("disabled", true);
    arrive!(new Response(roads["/cities/alpha/corridor-tiers.json"]));
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(walkButton()).toHaveProperty("disabled", false);
  });

  it("offers no walk without the ground-level view", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(screen.queryByRole("button", { name: "Walk" })).toBeNull();
  });
});
