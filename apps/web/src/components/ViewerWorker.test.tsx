import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readHere, type Read } from "../lay/lay";
import type { CityPort } from "../lay/port";
import type { Answer, Ask } from "../lay/work";
import { StubCanvas, fetcher, fromMore, read, townButton, twinFetcher } from "./testing/fixtures";
import { Viewer } from "./Viewer";

// The city's worker stays with its city: what it makes ahead is drawn at once, what it is asked for arrives later, and
// the map keeps what it shows until then.

/** A port that holds every answer of the city's work until released, and remembers what it was asked. */
interface Held {
  readonly asks: Ask[];
  readonly answers: Answer[];
  hear: ((answer: Answer) => void) | null;
  ended: boolean;
}

/** Reads on the calling thread, each opening's port held. */
function holding() {
  const ports: Held[] = [];
  const reading: Read = async (text, options) => {
    const laid = await readHere(text, options);
    const held: Held = { asks: [], answers: [], hear: null, ended: false };
    laid.port.listen((answer) => held.answers.push(answer));
    const port: CityPort = {
      ask: (ask) => {
        held.asks.push(ask);
        laid.port.ask(ask);
      },
      listen: (hear) => {
        held.hear = hear;
      },
      end: () => {
        held.ended = true;
        laid.port.end();
      },
    };
    ports.push(held);
    return { ...laid, port };
  };
  /** Passes on everything the last port has made. */
  const release = () =>
    act(() => {
      const held = ports.at(-1)!;
      for (const answer of held.answers.splice(0)) held.hear?.(answer);
    });
  return { read: reading, ports, release };
}

const lines = (spy: ReturnType<typeof vi.spyOn>): string[] => spy.mock.calls.map(([line]: unknown[]) => String(line));
const canvas = () => screen.getByTestId("canvas");
const pickTheme = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Theme" }));
  fireEvent.click(screen.getByRole("radio", { name }));
};

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Viewer and the city's worker", () => {
  it("draws a town alone from the scene made ahead, building nothing here", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(townButton("apps/web"));
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toContain("apps/web");
    expect(lines(info).filter((l) => l.startsWith("viewer/town-scene-here"))).toEqual([]);
  });

  it("shows a town drilled into before its scene is made at once, building it here", async () => {
    const { read: reading } = holding();
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} read={reading} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(townButton("apps/web"));
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toContain("apps/web");
    expect(lines(info).filter((l) => l.startsWith("viewer/town-scene-here"))).toEqual([
      expect.stringMatching(/^viewer\/town-scene-here key=alpha\/apps\/web ms=\d+$/),
    ]);
  });

  it("keeps the map's colours until the new theme's scenes arrive, the menu showing the theme chosen", async () => {
    const { read: reading, ports, release } = holding();
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} read={reading} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    release();
    pickTheme("Dracula");
    expect(ports[0]!.asks).toEqual([{ ask: "look", theme: "dracula", colourBy: "folder", first: null }]);
    expect(lines(info)).toContain("viewer/city-ask ask=look theme=dracula by=folder first=");
    expect(canvas().textContent).toContain("Paper atlas");
    expect(screen.getByRole("main").dataset.theme).toBe("paper-atlas");
    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    expect(screen.getByRole("radio", { name: "Dracula" })).toHaveProperty("checked", true);
    release();
    expect(canvas().textContent).toContain("Dracula");
    expect(screen.getByRole("main").dataset.theme).toBe("dracula");
  });

  it("asks for the town shown first when the theme changes in a town", async () => {
    const { read: reading, ports, release } = holding();
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} read={reading} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    release();
    fireEvent.click(townButton("apps/web"));
    pickTheme("Beck schematic");
    expect(ports[0]!.asks).toEqual([{ ask: "look", theme: "beck", colourBy: "folder", first: "alpha/apps/web" }]);
    release();
    expect(canvas().textContent).toContain("Beck schematic");
    expect(lines(info).filter((l) => l.startsWith("viewer/town-scene-here"))).toEqual([]);
  });

  it("keeps the map's colours until another colour's table arrives", async () => {
    const { read: reading, ports, release } = holding();
    render(<Viewer Canvas={StubCanvas} fetcher={twinFetcher} read={reading} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    release();
    const before = canvas().dataset.colours;
    const legend = screen.getByRole("region", { name: "Legend" });
    fireEvent.click(within(legend).getByRole("button", { name: /^Colour by/ }));
    fireEvent.click(within(legend).getByRole("radio", { name: "Kind" }));
    expect(ports[0]!.asks).toEqual([{ ask: "table", theme: "paper-atlas", colourBy: "kind" }]);
    expect(canvas().dataset.colours).toBe(before);
    release();
    expect(canvas().dataset.colours).not.toBe(before);
  });

  it("ends a city's worker when another city replaces it, and when the viewer goes", async () => {
    const { read: reading, ports } = holding();
    const { unmount } = render(<Viewer Canvas={StubCanvas} fetcher={fetcher} read={reading} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fromMore(/^beta/);
    await screen.findByRole("heading", { level: 1, name: "beta" });
    expect(ports.map((p) => p.ended)).toEqual([true, false]);
    unmount();
    expect(ports.map((p) => p.ended)).toEqual([true, true]);
    expect(lines(info).filter((l) => l.startsWith("viewer/city-worker-ended"))).toEqual([
      "viewer/city-worker-ended why=replaced",
      "viewer/city-worker-ended why=left",
    ]);
  });

  it("ends the worker of an opening that ends before its city shows, keeping the city shown", async () => {
    const { read: inner, ports } = holding();
    let opened = 0;
    const reading: Read = async (text, options) => {
      const laid = await inner(text, options);
      // The second opening is replaced by a third while it draws, before its city shows.
      if (++opened === 2) setTimeout(() => fromMore(/^alpha \d/), 0);
      return laid;
    };
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} read={reading} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fromMore(/^beta/);
    await vi.waitFor(() => expect(ports).toHaveLength(3));
    await vi.waitFor(() => expect(ports.map((p) => p.ended)).toEqual([true, true, false]));
    expect(lines(info)).toContain("viewer/city-worker-ended why=cancelled");
    expect(read()).toBeTruthy();
  });
});
