import { UNIT, parseCity, serialiseCity } from "@citymap/ground-plan";
import type { Footprint, Walls } from "@citymap/world";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function ExploreStub({ frame }: ExploreCanvasProps) {
  return <p data-testid="explore-canvas">{frame(0).session.body.feet.x.toFixed(1)}</p>;
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

const show = async (raise: RaiseWalls, with_: Fetcher = fetcher) => {
  render(<Viewer Canvas={StubCanvas} explore={{ Canvas: ExploreStub, engine: "Stand-in", raise }} fetcher={with_} />);
  await screen.findByRole("heading", { level: 1, name: "alpha" });
};
const walkButton = () => screen.getByRole("button", { name: "Walk" });

describe("Viewer walking", () => {
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
    expect(await screen.findByText("Walking could not start: the physics engine did not load.")).toBeTruthy();
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

  it("offers no walk without the ground-level view", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(screen.queryByRole("button", { name: "Walk" })).toBeNull();
  });
});
