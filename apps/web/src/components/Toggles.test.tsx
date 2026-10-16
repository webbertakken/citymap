import { DEFAULT_TOGGLES, type Snapshot, type Toggle } from "@citymap/ground-plan";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../github/read";
import { layHere } from "../lay/lay";
import { StubCanvas, fetcher, files, fromMore, townButton } from "./testing/fixtures";
import { TOOLTIPS } from "./Toggles";
import { Viewer } from "./Viewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const layout = () => screen.getByRole("button", { name: "Layout" });
const openLayout = () => fireEvent.click(layout());
const panel = () => screen.getByRole("group", { name: "City layout" });
const switchFor = (name: string) => within(panel()).getByRole("switch", { name });
// The bundle without its every-toggle-off variant.
const gappy: Fetcher = async (url) => (url.endsWith("/none.json") ? new Response("", { status: 404 }) : fetcher(url));

describe("the layout toggles", () => {
  it("lists the four switches in order, corridor and tiers on, each described by its tooltip word for word", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    expect(layout().getAttribute("aria-expanded")).toBe("false");
    openLayout();
    const switches = within(panel()).getAllByRole("switch");
    expect(switches.map((s) => s.closest("label")?.textContent)).toEqual([
      "Corridor",
      "Archipelago",
      "Quarters",
      "Tiers",
    ]);
    expect(switches.map((s) => s.matches(":checked"))).toEqual([true, false, false, true]);
    expect(switchFor("Corridor").getAttribute("aria-describedby")).toBeTruthy();
    for (const [name, toggle] of [
      ["Corridor", "corridor"],
      ["Archipelago", "archipelago"],
      ["Quarters", "quarters"],
      ["Tiers", "tiers"],
    ] as const) {
      const tip = document.getElementById(switchFor(name).getAttribute("aria-describedby")!)!;
      expect(tip.getAttribute("role")).toBe("tooltip");
      expect(tip.textContent).toBe(TOOLTIPS[toggle]);
    }
    expect(TOOLTIPS.tiers).toBe(
      "a town's size sets its widest road, and only one road per town gets that class; every other road is at least one class narrower.",
    );
  });

  it("shows a tooltip while its switch is hovered or focused, and hides it on the first Escape", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    openLayout();
    const tipOf = (name: string) => document.getElementById(switchFor(name).getAttribute("aria-describedby")!)!;
    const row = switchFor("Quarters").closest("li")!;
    fireEvent.pointerOver(row);
    expect(tipOf("Quarters").hidden).toBe(false);
    fireEvent.pointerOut(row, { relatedTarget: document.body });
    expect(tipOf("Quarters").hidden).toBe(true);
    act(() => switchFor("Tiers").focus());
    expect(tipOf("Tiers").hidden).toBe(false);
    // The first Escape hides the tooltip and leaves the popover open; the next closes it, focus back on its button.
    fireEvent.keyDown(switchFor("Tiers"), { key: "Escape" });
    expect(tipOf("Tiers").hidden).toBe(true);
    expect(layout().getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(switchFor("Tiers"), { key: "Escape" });
    expect(layout().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(layout());
  });

  it("leaves an Escape a control inside answered, even where the page's root is the document", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    openLayout();
    const answered = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    answered.preventDefault();
    act(() => void switchFor("Tiers").dispatchEvent(answered));
    expect(layout().getAttribute("aria-expanded")).toBe("true");
  });

  it("loads the bundled variant the switches name, keeps the popover open, and logs the change", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const asked: string[] = [];
    const spy: Fetcher = async (url) => {
      asked.push(url);
      return fetcher(url);
    };
    render(<Viewer Canvas={StubCanvas} fetcher={spy} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    openLayout();
    fireEvent.click(switchFor("Quarters"));
    expect(await screen.findByText("1 towns · 2 lots")).toBeTruthy();
    expect(asked.at(-1)).toBe("/cities/alpha/corridor-quarters-tiers.json");
    expect(switchFor("Quarters")).toHaveProperty("checked", true);
    fireEvent.click(switchFor("Corridor"));
    fireEvent.click(switchFor("Tiers"));
    expect(await screen.findByText("1 towns · 4 lots")).toBeTruthy();
    expect(asked.at(-1)).toBe("/cities/alpha/quarters.json");
    expect(info.mock.calls.map(([line]) => String(line)).filter((l) => l.startsWith("viewer/toggles"))).toEqual([
      "viewer/toggles on=corridor,quarters,tiers",
      "viewer/toggles on=quarters,tiers",
      "viewer/toggles on=quarters",
    ]);
    // The cities list the lots of the variant the switches name; another city opens in it too.
    fromMore("beta 4 lots");
    expect(await screen.findByRole("heading", { level: 1, name: "beta" })).toBeTruthy();
    expect(asked.at(-1)).toBe("/cities/beta/quarters.json");
  });

  it("keeps the view and the town shown when a variant arrives", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    fireEvent.click(townButton("alpha"));
    fireEvent.keyDown(screen.getByRole("application"), { key: "+" });
    const before = screen.getByTestId("canvas").textContent;
    openLayout();
    fireEvent.click(switchFor("Archipelago"));
    await screen.findByText("1 towns · 2 lots");
    expect(screen.getByTestId("canvas").textContent).toBe(before);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });

  it("says so and keeps the last city when a variant fails to load", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={gappy} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    openLayout();
    fireEvent.click(switchFor("Corridor"));
    await screen.findByText("1 towns · 2 lots");
    fireEvent.click(switchFor("Tiers"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The city could not load: Error: /cities/alpha/none.json answered 404",
    );
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(error.mock.calls.map(([line]) => String(line))).toEqual([
      'viewer/variant-failed name=alpha reason="Error: /cities/alpha/none.json answered 404"',
    ]);
  });

  it("only remembers the switches while no city is shown", async () => {
    const asked: string[] = [];
    const empty: Fetcher = async (url) => {
      asked.push(url);
      return new Response(url === "/cities/index.json" ? "[]" : "", { status: 200 });
    };
    render(<Viewer Canvas={StubCanvas} fetcher={empty} />);
    await screen.findByText(/No city yet/);
    openLayout();
    fireEvent.click(switchFor("Corridor"));
    expect(switchFor("Corridor")).toHaveProperty("checked", false);
    expect(asked).toEqual(["/cities/index.json"]);
  });

  it("disables the switches for a city file, which keeps its layout", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const file = new File([files["/cities/beta/none.json"]!], "beta.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("City file"), { target: { files: [file] } });
    await screen.findByRole("heading", { level: 1, name: "beta" });
    openLayout();
    expect(within(panel()).getByText("A city file keeps the layout it was laid with.")).toBeTruthy();
    expect(switchFor("Corridor")).toHaveProperty("disabled", true);
  });

  it("lays a live repository again with the switches, off the main thread", async () => {
    const API = "https://api.github.com/repos/acme/widgets";
    const routes: Record<string, () => Response> = {
      [`${API}/commits/HEAD`]: () => new Response(JSON.stringify({ sha: "c9", commit: { tree: { sha: "t9" } } })),
      [`${API}/git/trees/t9?recursive=1`]: () =>
        new Response(JSON.stringify({ tree: [{ path: "src/f0.ts", type: "blob", sha: "s0" }] })),
    };
    const github: Fetcher = async (url) => (routes[url] ?? (() => fetcher(url)))();
    const laid: (readonly Toggle[])[] = [];
    let failing = false;
    const lay = async (snapshot: Snapshot, toggles: readonly Toggle[]) => {
      laid.push(toggles);
      if (failing) throw new Error("the layout worker failed");
      return layHere(snapshot, toggles);
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.replaceState(null, "", "/?repo=acme/widgets");
    render(<Viewer Canvas={StubCanvas} fetcher={github} lay={lay} />);
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    openLayout();
    fireEvent.click(switchFor("Quarters"));
    expect(await screen.findByText(/single state, not folded/)).toBeTruthy();
    expect(laid).toEqual([DEFAULT_TOGGLES, ["corridor", "quarters", "tiers"]]);
    failing = true;
    await act(async () => fireEvent.click(switchFor("Tiers")));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The city could not load: Error: the layout worker failed",
    );
    expect(screen.getByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    expect(error.mock.calls.map(([line]) => String(line))).toContain(
      'viewer/variant-failed name=acme/widgets reason="Error: the layout worker failed"',
    );
  });
});
