// Cities, fetchers and a stub canvas for the viewer's tests.
import { DEFAULT_TOGGLES, TOGGLES, serialiseCity, type City, type Toggle, type Town } from "@citymap/ground-plan";
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
      lots: [
        {
          pts: square(64, 64),
          key: "a",
          address: "#lots:0.0.0.0",
          vacant: false,
          path: "a.ts",
          use: "source",
          district: 1,
        },
      ],
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

/** Every combination of the toggles, none first, as the bundle lays them. */
export const COMBINATIONS: Toggle[][] = Array.from({ length: 2 ** TOGGLES.length }, (_unused, mask) =>
  TOGGLES.filter((_toggle, bit) => (mask >> bit) & 1),
);
const variantName = (toggles: readonly Toggle[]) => (toggles.length === 0 ? "none" : toggles.join("-"));
/** How many toggles a variant sets otherwise than the defaults. */
const changed = (toggles: readonly Toggle[]) =>
  TOGGLES.filter((t) => toggles.includes(t) !== DEFAULT_TOGGLES.includes(t)).length;

/** A bundled city's index entry: a variant per combination, each with one lot more per toggle set otherwise. */
export const entryOf = (name: string, lots: number) => ({
  name,
  variants: COMBINATIONS.map((toggles) => ({
    toggles,
    file: `${name}/${variantName(toggles)}.json`,
    lots: lots + changed(toggles),
  })),
});

/** A city as a variant lays it: one lot more per toggle set otherwise than the defaults, so the status tells them apart. */
export const variantCity = (name: string, toggles: readonly Toggle[]): City => {
  const base = city(name);
  const town = base.towns[0]!;
  const lot = town.lots[0]!;
  const lots = Array.from({ length: 1 + changed(toggles) }, (_, i) =>
    i === 0 ? lot : { ...lot, key: `l${i}`, path: `f${i}.ts` },
  );
  return { ...base, towns: [{ ...town, lots, stats: { ...town.stats, lots: lots.length } }] };
};

export const index = [entryOf("alpha", 1), entryOf("beta", 1)];
export const files: Record<string, string> = {
  "/cities/index.json": JSON.stringify(index),
  ...Object.fromEntries(
    ["alpha", "beta"].flatMap((name) =>
      COMBINATIONS.map((toggles) => [
        `/cities/${name}/${variantName(toggles)}.json`,
        serialiseCity(variantCity(name, toggles)),
      ]),
    ),
  ),
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
  "/cities/index.json": JSON.stringify([entryOf("alpha", 2)]),
  ...Object.fromEntries(
    COMBINATIONS.map((toggles) => [`/cities/alpha/${variantName(toggles)}.json`, serialiseCity(twin)]),
  ),
};
export const twinFetcher = async (url: string) =>
  new Response(twinFiles[url] ?? "", { status: url in twinFiles ? 200 : 404 });

export const read = () => screen.getByTestId("canvas").textContent;

/** The view the stub canvas was last given. */
export const currentView = (): View => {
  const [zoom, centre] = (read() ?? "").split(" ");
  const [x, z] = centre!.split(",").map(Number);
  return { zoom: Number(zoom), centre: { x: x!, z: z! } };
};

export function StubCanvas({ view, theme, mode, table }: CanvasProps) {
  return (
    <p data-testid="canvas" data-mode={mode} data-colours={Array.from(table.filter((_, i) => i % 4 === 2)).join(",")}>
      {view.zoom} {view.centre.x},{view.centre.z} {theme.label}
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
