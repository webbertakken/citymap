// Cities, fetchers and a stub canvas for the viewer's tests.
import { serialiseCity, type City, type Town } from "@citymap/ground-plan";
import { fireEvent, screen, within } from "@testing-library/react";
import type { View } from "../../view/view";
import type { CanvasProps } from "../MapView";

export const square = (x: number, s: number) => [
  { x, y: 0 },
  { x: x + s, y: 0 },
  { x: x + s, y: s },
  { x, y: s },
];

export const city = (name: string): City => ({
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

export const index = [
  { name: "alpha", file: "alpha.json", lots: 1 },
  { name: "beta", file: "beta.json", lots: 1 },
];
export const files: Record<string, string> = {
  "/cities/index.json": JSON.stringify(index),
  "/cities/alpha.json": serialiseCity(city("alpha")),
  "/cities/beta.json": serialiseCity(city("beta")),
};
export const fetcher = async (url: string) => new Response(files[url] ?? "", { status: url in files ? 200 : 404 });

// The city of alpha with a second town, apps/web, east of it across a highway.
const base = city("alpha");
const web: Town = {
  ...base.towns[0]!,
  key: "alpha/apps/web",
  name: "apps/web",
  outline: square(12800, 6400),
  lots: [{ ...base.towns[0]!.lots[0]!, pts: square(12864, 64), path: "apps/web/page.tsx" }],
  districts: [{ pts: square(12800, 3200), path: "apps/web/src", name: "src", depth: 1, massMille: 1000, ward: false }],
};
export const twin: City = {
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
export const twinFetcher = async (url: string) =>
  new Response(twinFiles[url] ?? "", { status: url in twinFiles ? 200 : 404 });

export const read = () => screen.getByTestId("canvas").textContent;

/** The view the stub canvas was last given. */
export const currentView = (): View => {
  const [mode, zoom, centre] = (read() ?? "").split(" ");
  const [x, z] = centre!.split(",").map(Number);
  return { mode: mode === "plan" ? "plan" : "dimetric", zoom: Number(zoom), centre: { x: x!, z: z! } };
};

export function StubCanvas({ view, theme }: CanvasProps) {
  return (
    <p data-testid="canvas">
      {view.mode} {view.zoom} {view.centre.x},{view.centre.z} {theme.label}
    </p>
  );
}

/** The towns the drawer lists, by name. */
export const towns = () =>
  Array.from(screen.getByRole("region", { name: "Towns" }).querySelectorAll("li"), (li) => li.firstChild?.textContent);

/** The drawer's button that shows one town alone. */
export const townButton = (name: string) =>
  within(screen.getByRole("region", { name: "Towns" })).getByRole("button", { name });

/** Opens More and picks one of its entries. */
export const fromMore = (name: RegExp | string) => {
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("button", { name }));
};

export const searchField = () => screen.getByRole("searchbox", { name: "Search files and folders, or lay owner/name" });

/** Types into the search, as a person would, one change. */
export const type = (text: string) => fireEvent.change(searchField(), { target: { value: text } });
