import { DEFAULT_SEPARATIONS, compareKeys, serialiseCity, type Separation } from "@citymap/ground-plan";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../github/read";
import { layHere, type Lay } from "../lay/lay";
import { StubCanvas, entryOf, fetcher, files, towns, variantCity } from "./testing/fixtures";
import { DECIDED_NOTE, SEPARATION_TOOLTIPS } from "./Toggles";
import { Viewer } from "./Viewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const openLayout = () => fireEvent.click(screen.getByRole("button", { name: "Layout" }));
const group = () => screen.getByRole("group", { name: "Separate towns" });
const switchFor = (name: string) => within(group()).getByRole("switch", { name });

/** acme/widgets on GitHub: workspaces declared in packages/, an app, and a plain folder. */
function widgets(extra: readonly { path: string; type: string; sha: string }[] = []) {
  const API = "https://api.github.com/repos/acme/widgets";
  const tree = [
    ...["package.json", "apps/web/a.ts", "packages/a/b.ts", "packages/b/c.ts", "src/x.ts"].map((path) => ({
      path,
      type: "blob",
      sha: path,
    })),
    ...extra,
  ];
  const routes: Record<string, () => Response> = {
    [`${API}/commits/HEAD`]: () => new Response(JSON.stringify({ sha: "c9", commit: { tree: { sha: "t9" } } })),
    [`${API}/git/trees/t9?recursive=1`]: () => new Response(JSON.stringify({ tree })),
    "https://raw.githubusercontent.com/acme/widgets/c9/package.json": () =>
      new Response(JSON.stringify({ workspaces: ["packages/*"] })),
  };
  const github: Fetcher = async (url) => (routes[url] ?? (() => fetcher(url)))();
  const laid: (readonly Separation[] | undefined)[] = [];
  const lay: Lay = async (snapshot, options) => {
    laid.push(options?.separate);
    return layHere(snapshot, options);
  };
  return { github, lay, laid };
}

describe("the separate towns", () => {
  it("lists only the separations the city records, in order, each described by its tooltip word for word", async () => {
    const { github, lay } = widgets();
    window.history.replaceState(null, "", "/?repo=acme/widgets");
    render(<Viewer Canvas={StubCanvas} fetcher={github} lay={lay} />);
    await screen.findByText(/single state, not folded$/);
    openLayout();
    const switches = within(group()).getAllByRole("switch");
    expect(switches.map((s) => s.closest("label")?.textContent)).toEqual(["Workspaces", "Apps", "Packages"]);
    for (const [name, separation] of [
      ["Workspaces", "workspaces"],
      ["Apps", "apps"],
      ["Packages", "packages"],
    ] as const) {
      const tip = document.getElementById(switchFor(name).getAttribute("aria-describedby")!)!;
      expect(tip.getAttribute("role")).toBe("tooltip");
      expect(tip.textContent).toBe(SEPARATION_TOOLTIPS[separation]);
    }
    expect(SEPARATION_TOOLTIPS.plugins).toBe("each folder in any plugins/ folder is a town of its own.");
  });

  it("lets declared workspaces decide apps and packages until Workspaces is off, laying again at each change", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { github, lay, laid } = widgets();
    window.history.replaceState(null, "", "/?repo=acme/widgets");
    render(<Viewer Canvas={StubCanvas} fetcher={github} lay={lay} />);
    await screen.findByText(/single state, not folded$/);
    // Every declared member stands apart: the main town and packages/a and packages/b.
    expect(towns().map(String).toSorted(compareKeys)).toEqual(["packages/a", "packages/b", "widgets"]);
    openLayout();
    expect(within(group()).getByText(DECIDED_NOTE)).toBeTruthy();
    expect(switchFor("Workspaces")).toHaveProperty("checked", true);
    expect(switchFor("Apps")).toHaveProperty("disabled", true);
    expect(switchFor("Packages")).toHaveProperty("disabled", true);
    fireEvent.click(switchFor("Workspaces"));
    // packages/ is one group town again, and apps/web stands apart as an app.
    await vi.waitFor(() =>
      expect(towns().map(String).toSorted(compareKeys)).toEqual(["apps/web", "packages", "widgets"]),
    );
    expect(within(group()).queryByText(DECIDED_NOTE)).toBeNull();
    expect(switchFor("Packages")).toHaveProperty("disabled", false);
    fireEvent.click(switchFor("Packages"));
    await vi.waitFor(() =>
      expect(towns().map(String).toSorted(compareKeys)).toEqual(["apps/web", "packages/a", "packages/b", "widgets"]),
    );
    expect(laid).toEqual([DEFAULT_SEPARATIONS, ["submodules", "apps"], ["submodules", "apps", "packages"]]);
    expect(info.mock.calls.map(([line]) => String(line)).filter((l) => l.startsWith("viewer/separate"))).toEqual([
      "viewer/separate on=submodules,apps",
      "viewer/separate on=submodules,apps,packages",
    ]);
  });

  it("lays nothing apart once every separation is off, and logs it as none", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    // A submodule GitHub cannot name (no .gitmodules): laid as its .gitlink, and offered as a separation.
    const { github, lay, laid } = widgets([{ path: "ext/x", type: "commit", sha: "p" }]);
    window.history.replaceState(null, "", "/?repo=acme/widgets");
    render(<Viewer Canvas={StubCanvas} fetcher={github} lay={lay} />);
    await screen.findByText(/single state, not folded$/);
    openLayout();
    for (const name of ["Workspaces", "Apps", "Submodules"]) fireEvent.click(switchFor(name));
    await vi.waitFor(() => expect(laid.at(-1)).toEqual([]));
    expect(info.mock.calls.map(([line]) => String(line))).toContain("viewer/separate on=none");
  });

  it("shows no group for a city that records no separations", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    openLayout();
    expect(screen.queryByRole("group", { name: "Separate towns" })).toBeNull();
  });

  it("loads the bundled variant its separations name", async () => {
    const recorded: Separation[] = ["apps", "plugins"];
    const entry = entryOf("gamma", 1, recorded);
    const bundle: Record<string, string> = {
      "/cities/index.json": JSON.stringify([entry]),
      ...Object.fromEntries(
        entry.variants.map((v) => [
          `/cities/${v.file}`,
          serialiseCity({ ...variantCity("gamma", v.toggles), separable: recorded }),
        ]),
      ),
    };
    const asked: string[] = [];
    const spy: Fetcher = async (url) => {
      asked.push(url);
      return new Response(bundle[url] ?? "", { status: url in bundle ? 200 : 404 });
    };
    render(<Viewer Canvas={StubCanvas} fetcher={spy} />);
    await screen.findByRole("heading", { level: 1, name: "gamma" });
    expect(asked.at(-1)).toBe("/cities/gamma/corridor-tiers~apps.json");
    openLayout();
    fireEvent.click(switchFor("Plugins"));
    await vi.waitFor(() => expect(asked.at(-1)).toBe("/cities/gamma/corridor-tiers~apps-plugins.json"));
    expect(switchFor("Plugins")).toHaveProperty("checked", true);
  });

  it("disables the group for a city file, which keeps its layout", async () => {
    render(<Viewer Canvas={StubCanvas} fetcher={fetcher} />);
    await screen.findByRole("heading", { level: 1, name: "alpha" });
    const recorded = serialiseCity({ ...variantCity("delta", []), separable: ["plugins"], declared: true });
    const file = new File([recorded], "delta.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("City file"), { target: { files: [file] } });
    await screen.findByRole("heading", { level: 1, name: "delta" });
    openLayout();
    expect(switchFor("Plugins")).toHaveProperty("disabled", true);
    expect(within(group()).queryByText(DECIDED_NOTE)).toBeNull();
    expect(files["/cities/index.json"]).toBeTruthy();
  });
});
