import { serialiseCity } from "@citymap/ground-plan";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../github/read";
import { layHere } from "../lay/lay";
import { HOLD_MS, SHOW_AFTER_MS } from "../load/useLoading";
import { StubCanvas, city, files, fromMore, searchField, type } from "./testing/fixtures";
import { Viewer } from "./Viewer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const API = "https://api.github.com/repos/acme/widgets";
const answer = (value: unknown) => new Response(JSON.stringify(value));

/** A tree of twelve files. */
const tree = () =>
  answer({ tree: Array.from({ length: 12 }, (_, i) => ({ path: `src/f${i}.ts`, type: "blob", sha: `s${i}` })) });
/** GitHub failing every request; bundled files as ever. */
const failing: Fetcher = async (url) =>
  url.startsWith(API)
    ? new Response("", { status: 500 })
    : new Response(files[url] ?? "", { status: url in files ? 200 : 404 });

/** GitHub with a tree that answers only when told to; each read gets a tree of its own. */
function slowGitHub() {
  const waiting: ((response: Response) => void)[] = [];
  const fetcher: Fetcher = async (url) => {
    if (url === `${API}/commits/HEAD`) return answer({ sha: "c9", commit: { tree: { sha: "t9" } } });
    if (url === `${API}/git/trees/t9?recursive=1`) return new Promise<Response>((done) => waiting.push(done));
    return new Response(files[url] ?? "", { status: url in files ? 200 : 404 });
  };
  const release = async () => {
    for (const done of waiting.splice(0)) done(tree());
    await act(() => vi.advanceTimersByTimeAsync(0));
  };
  return { fetcher, release };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const card = () => screen.queryByRole("region", { name: "Loading" });

/** Renders the viewer on alpha, then lays acme/widgets from the search with the clock in the test's hands. */
async function layingWidgets() {
  const github = slowGitHub();
  render(<Viewer Canvas={StubCanvas} fetcher={github.fetcher} lay={layHere} />);
  await screen.findByText("1 towns · 1 lots");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  type("acme/widgets");
  fireEvent.keyDown(searchField(), { key: "Enter" });
  await wait(0);
  return github;
}

describe("Viewer while loading", () => {
  it("shows the card after 300 ms over the dimmed last city, with the phase, the bar and the count", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const github = await layingWidgets();
    expect(screen.getByText("acme/widgets: reading the file tree…")).toBeTruthy();
    await wait(SHOW_AFTER_MS - 1);
    expect(card()).toBeNull();
    await wait(1);
    const shown = within(card()!);
    expect(shown.getByRole("heading", { name: "Opening acme/widgets" })).toBeTruthy();
    const bar = shown.getByRole("progressbar", { name: "Reading the file tree" });
    expect(bar.getAttribute("value")).toBe("3");
    expect(bar.getAttribute("aria-valuetext")).toBe("Reading the file tree: 0 of 1 folders · 1 request");
    expect(shown.getByText("0 s spent")).toBeTruthy();
    expect(document.querySelector("main")?.getAttribute("data-loading")).toBe("true");
    // The last city stays, and the search stays usable.
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    await github.release();
    await wait(200);
    expect(screen.getByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    // Shown, the card holds 400 ms; the bar is full meanwhile, and Escape is the map's again: nothing is cancelled.
    expect(within(card()!).getByRole("progressbar").getAttribute("value")).toBe("100");
    fireEvent.keyDown(screen.getByRole("application"), { key: "Escape" });
    expect(card()).not.toBeNull();
    const lines = vi.mocked(console.info).mock.calls.map(([line]) => String(line));
    expect(lines.some((l) => l.startsWith("viewer/load-cancelled"))).toBe(false);
    await wait(HOLD_MS - 200);
    expect(card()).toBeNull();
    expect(document.querySelector("main")?.getAttribute("data-loading")).toBe("false");
    expect(screen.getByText("1 towns · 12 lots · single state, not folded")).toBeTruthy();
  });

  it("lets Escape reach the map while a finished load's card holds", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const github = await layingWidgets();
    await wait(SHOW_AFTER_MS);
    await github.release();
    await wait(50);
    expect(card()).not.toBeNull();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    const map = screen.getByRole("application");
    let reached = false;
    map.addEventListener("keydown", () => {
      reached = true;
    });
    map.dispatchEvent(escape);
    expect(reached).toBe(true);
    expect(info.mock.calls.map(([line]) => String(line)).some((l) => l.startsWith("viewer/load-cancelled"))).toBe(
      false,
    );
    expect(screen.getByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
  });

  it("cancels with its button and keeps the last city, the address and no error", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const github = await layingWidgets();
    await wait(SHOW_AFTER_MS);
    await wait(1000);
    expect(within(card()!).getByText("1 s spent")).toBeTruthy();
    fireEvent.click(within(card()!).getByRole("button", { name: "Cancel" }));
    expect(card()).toBeNull();
    await github.release();
    await wait(1000);
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(window.location.search).toBe("");
    const lines = vi.mocked(console.info).mock.calls.map(([line]) => String(line));
    expect(lines.find((l) => l.startsWith("viewer/load-cancelled"))).toMatch(
      /^viewer\/load-cancelled source=github name=acme\/widgets phase=tree ms=\d+ why=cancel$/,
    );
  });

  it("cancels with Escape, unless the search takes the key", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    await layingWidgets();
    await wait(SHOW_AFTER_MS);
    fireEvent.keyDown(searchField(), { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowLeft" });
    expect(card()).not.toBeNull();
    fireEvent.keyDown(screen.getByRole("application"), { key: "Escape" });
    expect(card()).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    // Without a card, Escape is the map's again.
    fireEvent.keyDown(document.body, { key: "Escape" });
  });

  it("cancels a bundled city on its way, and a city file, keeping what was there", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let arrive: ((response: Response) => void) | undefined;
    const slow: Fetcher = async (url) =>
      url === "/cities/beta/corridor-tiers.json"
        ? new Promise<Response>((done) => (arrive = done))
        : new Response(files[url] ?? "", { status: url in files ? 200 : 404 });
    render(<Viewer Canvas={StubCanvas} fetcher={slow} />);
    await screen.findByText("1 towns · 1 lots");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
    fromMore("beta 1 lots");
    await wait(SHOW_AFTER_MS);
    expect(within(card()!).getByText("Downloading")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(card()).toBeNull();
    arrive!(new Response(files["/cities/beta/corridor-tiers.json"]));
    await wait(1000);
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    // A file being read is replaced by the next one picked; only the last arrives.
    const input = screen.getByLabelText<HTMLInputElement>("City file");
    fireEvent.change(input, {
      target: { files: [new File([files["/cities/beta/corridor-tiers.json"]!], "first.json")] },
    });
    fireEvent.change(input, { target: { files: [new File([serialiseCity(city("gamma"))], "gamma.json")] } });
    await wait(1000);
    expect(screen.getByRole("heading", { level: 1, name: "gamma" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops the card at once when the load fails, and says why", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Viewer Canvas={StubCanvas} fetcher={failing} lay={layHere} />);
    await screen.findByText("1 towns · 1 lots");
    type("acme/widgets");
    fireEvent.keyDown(searchField(), { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toBe("GitHub answered 500.");
    expect(card()).toBeNull();
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
  });
});
