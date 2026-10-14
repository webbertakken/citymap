# Viewer blueprint

Derived from [viewer](../viewer.md). Packages: `packages/themes` (colours, shared with `packages/svg`), `packages/scene`
(city model to Three.js geometry), `apps/web` (Next.js 16, React 19, react-three-fiber).

## Themes (`packages/themes`)

- The five themes move here from `packages/svg` unchanged (`THEMES`, `THEME_NAMES`, `hueOf`, `oklch`, `mix`,
  `contrast`); `packages/svg` and `packages/scene` both import them.

## Scene (`packages/scene`)

Pure functions from a `City` and a `Theme` to plain typed arrays, so they are testable without WebGL; the app wraps them
in `BufferGeometry`.

- `UNIT` = 64 fixed units is 1 scene unit (one street width); x east, z south (`z = −y`), y up.
- `triangulate(polygon)`: a fan from vertex 0 (every polygon of the model is convex), clockwise to the camera above.
- `flatLayer(polygons, colours, height)`: positions (y = height), colours and indices for flat shapes. Heights: ground
  0, blocks 0.01, water 0.015, roads 0.02 (casing) and 0.025 (fill), lots on top of their plinths.
- `roadRibbon(polyline, width)`: one quad per segment, offset by half the width along the segment's normal, plus a
  square cap at each joint so turns stay closed.
- `plinths(lots, colours)`: each lot extruded to `LOT_HEIGHT` = 0.12 u: a top face and side quads; vacant lots flat at
  block height in the reserve colour.
- `buildScene(city, theme)` → `{ layers: { name, positions, colours, indices }[], labels, bounds }`; labels are town
  names and the districts the SVG renderer would label (same rule), at their centroids.
- Budgets: next.js (about 8,000 lots) builds in under 300 ms and under 64 MB of arrays.

## Picking (`packages/scene`)

- `pickIndex(city)` builds a uniform grid over the city (cells of 8 u) listing, per cell, the lots, blocks, roads,
  districts and towns whose bounding boxes touch it; `pick(index, x, z)` (scene units) returns the topmost hit: a lot
  (point in polygon), else a block, else a road (distance to a segment within half its width), else a district (smallest
  containing), else a town. Hits carry the lot's path, use, address and vacancy, the block's kind, the road's class, the
  district's and town's names.
- Budget: picking next.js (about 8,000 lots) answers in under 1 ms per query after a 50 ms index.

## App (`apps/web`)

- Next.js App Router, `output: "export"`, one page. Bundled cities live in `public/cities/*.json` with an index
  `public/cities/index.json` (`[{ name, file, lots }]`), produced by `scripts/bundle-cities.ts` from CLI output.
- Components: `Viewer` (state: city, theme, view), `TopBar` (heading, city select, open-file button, view toggle, theme
  select), `CityPanel` (each town with its twelve largest top-level districts, wards left out; a disclosure button on
  narrow screens), `CityCanvas` (react-three-fiber `Canvas` with an `OrthographicCamera`, one `mesh` per layer with
  vertex colours, `Html` labels).
- Camera: dimetric position `(d·cos30°·sin45°, d·sin30°, d·cos30°·cos45°)` looking at the centre; plan position straight
  above with `up = (0, 0, −1)`. Zoom fits the bounds on load and on `0`.
- Hover: `unproject(view, viewport, pointer, height)` meets the ray from the pointer with the plane at a height (the lot
  tops for lots, the ground for the rest); a `Card` (`role="tooltip"`) sits 16 px right and below the pointer, and flips
  to the left or above near the edges. Click selects; the panel's "Selected" section (`aria-live="polite"`) repeats the
  details. Escape clears both.
- Drill down: `focus` (a town key or null). The scene and the pick index are built from the city with only that town (no
  highways); the view refits; the bar shows a breadcrumb (`<nav aria-label="Breadcrumb">`: the city as a button, then
  the town); the panel offers "Show only this town" on each town, and on a selection within a town.
- Keyboard: arrows pan by 10 % of the view, `+`/`-` zoom by 1.25, `0` fits; handled on the canvas wrapper, which is
  focusable (`tabIndex 0`, `role="application"`, `aria-label` naming the city and the keys).
- File open: `<input type="file" accept="application/json">` behind the button, and a drop zone over the page; text is
  parsed with `parseCity`; a rejection shows `role="alert"` text and keeps the last city.
- Dark preference: `matchMedia("(prefers-color-scheme: dark)")` picks Night atlas at start.
- `dpr={[1, 2]}` on the canvas; `frameloop="demand"`, so nothing renders unless the view changes.

## Observability

- `src/log.ts` writes one line per decision point or failure, fingerprinted by its first token: `viewer/index cities`,
  `viewer/open name towns lots`, `viewer/town key`, `viewer/city` (to `console.info`); `viewer/index-failed reason`,
  `viewer/open-failed name reason`, `viewer/file-rejected file reason` (to `console.error`). A reason is the engine's
  code (`city/bad-json`) or the error's text. Every failure also reaches the person as `role="alert"` text.

## Constants

Every tuning number is named where it is used and listed in `DEFAULTS.md`: `PAN_SHARE`, `KEY_ZOOM`, `FIT_SHARE` (in
`view/view.ts`), `CLICK_SLOP`, `WHEEL_ZOOM`, `CARD` (in `MapView.tsx`), `LOT_TOP` and `LOT_HEIGHT` (in
`packages/scene`).

## Web experience

- LCP: the status and the panel's text paint first (about 30 ms on loopback); a town label may follow (about 100 ms).
  Budget: the last largest paint under 2.5 s.
- CLS 0: the bar is two blocks, the place (heading and breadcrumb over the status, `flex-direction: column`) on the left
  and the controls on the right (`margin-left: auto`); the city select has a fixed width (15rem), so a longer name,
  status or option never moves a control. The town list's empty state has a town heading's margins. Shifts after input
  (a breadcrumb appearing) are the person's own and do not count.
- INP under 200 ms on a phone: the view while fitted is derived from the scene (`fit(scene.bounds, mode, viewport)`),
  never built twice; the whole city's scene and pick index stay built while one town is shown, so going back costs
  nothing. Measured on a Pixel 7 profile with the processor slowed fourfold (CDP `Emulation.setCPUThrottlingRate`).
- `e2e/vitals.spec.ts` records `largest-contentful-paint`, `layout-shift` and `event` entries (from 16 ms) through
  `PerformanceObserver` before the page's scripts run, and asserts the three budgets.

## Tests

- `packages/scene`: unit tests for triangulation, ribbons, plinths, layers and labels (Vitest, Node).
- `apps/web`: component tests in jsdom for the bar, the panel, file errors and keyboard handling (the canvas is replaced
  by a stub there); Playwright end-to-end in dark mode: loads, switches city, theme and view, opens a file, shows an
  error for a bad file, reaches every control by keyboard, and passes axe (WCAG 2.2 AA rules) with no violations; a
  screenshot per theme for review.
