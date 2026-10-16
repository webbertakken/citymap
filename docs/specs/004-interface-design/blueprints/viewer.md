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
- Components: `Viewer` (state: city, theme, view), the floating atlas's cards (below), `CityCanvas` (react-three-fiber
  `Canvas` with an `OrthographicCamera`, one `mesh` per layer with vertex colours, `Html` labels).
- Camera: plan by default; dimetric position `(d·cos30°·sin45°, d·sin30°, d·cos30°·cos45°)` looking at the centre; plan
  position straight above with `up = (0, 0, −1)`. Zoom fits the bounds on load and on `0`.
- Hover: `unproject(view, viewport, pointer, height)` meets the ray from the pointer with the plane at a height (the lot
  tops for lots, the ground for the rest); a `Card` (`role="tooltip"`) sits 16 px right and below the pointer, and flips
  to the left or above near the edges. Click selects; the panel's "Selected" section (`aria-live="polite"`) repeats the
  details. Escape clears both. The selection's place carries a marker (a ring, `aria-hidden`) over the map.
- Drill down: `focus` (a town key or null). The scene and the pick index are built from the city with only that town (no
  highways); the view refits; the title card shows a breadcrumb (`<nav aria-label="Breadcrumb">`: the city as a button,
  then the town); the panel offers "Show only this town" on each town, and on a selection within a town.
- Keyboard: arrows pan by 10 % of the view, `+`/`-` zoom by 1.25, `0` fits; handled on the canvas wrapper, which is
  focusable (`tabIndex 0`, `role="application"`, `aria-label` naming the city and the keys).
- File open: `<input type="file" accept="application/json">` behind the button, and a drop zone over the page; text is
  parsed with `parseCity`; a rejection shows `role="alert"` text and keeps the last city.
- Dark preference: `matchMedia("(prefers-color-scheme: dark)")` picks Night atlas at start and follows the system until
  a theme is chosen.
- `dpr={[1, 2]}` on the canvas; `frameloop="demand"`, so nothing renders unless the view changes.

## A GitHub repository, live (`apps/web/src/github`)

- `parseRepository(input)`: `owner/name`, or a `https://github.com/owner/name[/…]` URL (an optional `.git` dropped),
  into `{ owner, name }`; owner `[A-Za-z0-9-]{1,39}`, name `[A-Za-z0-9._-]{1,100}`; anything else is `github/bad-name`.
- `readRepository(fetcher, repo, onRequest)`, every call through the injected fetcher (tests stub it), JSON from
  `https://api.github.com` with `Accept: application/vnd.github+json`:
  1. `GET /repos/{owner}/{name}/commits/HEAD`: the commit `sha` and its `commit.tree.sha` (the default branch).
  2. `GET /repos/{owner}/{name}/git/trees/{tree}?recursive=1`. When `truncated`, the tree is read folder by folder
     instead: a folder's tree without `recursive` lists its entries; each subtree is then read with `recursive=1`, and
     any still truncated is split the same way. At most four requests are in flight.
  3. Entries: `blob` is a file (path joined from its folder), `commit` a submodule (skipped), `tree` a folder.
  4. Root workspace manifests (`isManifest`) are read from
     `https://raw.githubusercontent.com/{owner}/{name}/{sha}/{path}` (not counted against the API limit), parsed with
     `patternsOf` and resolved with `resolveWorkspaces`.
  5. The snapshot is `stateSnapshot(name, sha, paths, workspaces)` from `@citymap/ground-plan`, the same builder the
     CLI's `--no-history` and the bench use, so the browser lays exactly what `citymap --no-history` lays.
- Rejections (`CitymapError`): 404 `github/not-found`; 403 or 429 with `x-ratelimit-remaining: 0` `github/rate-limited`
  (detail `reset`, the epoch second from `x-ratelimit-reset`); any other failure status `github/failed` (detail
  `status`); a fetch that throws `github/offline`.
- Laying: `lay.worker.ts` (a module Web Worker) receives the snapshot (its map as entries) and returns
  `layCity(snapshot, initialState(OPTIONS), OPTIONS).city` with the CLI's default options; `Viewer` takes a `lay`
  function (the worker by default, a direct call in tests).
- A repository is laid from the search box (below). The status reads "{name}: reading the tree… ({n} requests)", then
  "{name}: laying out…", then "{towns} towns · {lots} lots · single state, not folded". On success the address becomes
  `?repo=owner/name` (`history.replaceState`); on load, a `repo` parameter is laid instead of the first bundled city.
- Hosting: `next.config` takes `basePath` from `CITYMAP_BASE_PATH` (`/citymap` on GitHub Pages, empty locally); every
  fetch of bundled files is prefixed with it. `.github/workflows/pages.yml` builds the export on every push to main and
  deploys it with `actions/upload-pages-artifact` and `actions/deploy-pages`.
- Logs: `viewer/github-read repo requests files ms` and `viewer/github-failed repo reason`.

## Floating atlas (`apps/web/src/components`)

The map (`.map`) fills `.viewer` (`100dvh`); every card is `position: absolute` over it, inset 16 px, so nothing the
cards do moves the map or each other.

- Interface scheme: CSS custom properties on `:root` (`--glass`, `--glass-line`, `--ink`, `--ink-soft`, `--accent`,
  `--accent-ink`, `--shadow`, `--raised`), light by default and dark under `@media (prefers-color-scheme: dark)`. Glass
  is the scheme's surface at 88 % opacity with `backdrop-filter: blur(12px)`, a 1 px line and a soft shadow; radius 16
  px for cards, 12 px for controls. The map's theme no longer colours the interface.
- Font: Inter (variable, self-hosted from `@fontsource-variable/inter`, Latin subset), 14 px base, 1.4 line height.
  Icons: `lucide-react` (ISC), 20 px, stroke 1.8, `aria-hidden`; every icon-only button has an `aria-label`.
- `TitleCard` (top left, max 360 px): `<h1>` the city's name; the breadcrumb (`<nav aria-label="Breadcrumb">`) when one
  town is shown; the status (`aria-live="polite"`, one line, ellipsis).
- `SearchBox` (top centre, 520 px, `min(520px, 100vw − 32px)` on a phone, where it moves below the title card): a
  combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) labelled "Search files and
  folders, or lay owner/name", over a `role="listbox"` of `role="option"`s. `/` anywhere but in a field focuses it.
  - Matching (`src/search/search.ts`, pure): `searchIndex(city)` lists every district (a folder: its path, name, town
    key, centre and extent) and every lot that is not vacant (a file: its path, its file name, town key, centre and
    extent), in scene units. `search(index, query)` (query trimmed, case-insensitive, at least `MIN_QUERY` 2 characters)
    ranks: name equals query, name starts with it, name contains it, path contains it; folders before files within a
    rank; then shorter paths, then path order. It returns the first `MAX_HITS` 7 and the total.
  - `parseRepository` accepting the text puts "Lay owner/name from GitHub" first.
  - ArrowDown and ArrowUp move the active option (wrapping), Enter picks it (or lays the text as a repository when it
    parses and nothing is active), Escape closes the list, then clears the text.
  - Picking a folder or file: the view flies to centre it, zoomed so its extent fills `FLY_SHARE` 0.4 of the shorter
    side of the map (never further out than the fitted view), over `FLY_MS` 300 ms eased (`easeInOutCubic`), instantly
    under `prefers-reduced-motion: reduce`; a picked file or folder of another town than the one shown leaves the town
    first. It is then selected: a file as a lot hit, a folder as a district hit.
- `ViewControls` (top right): a `<div role="group" aria-label="View">` of two `aria-pressed` buttons, "Plan" and "3D";
  then "Theme" (a disclosure button opening a popover `<fieldset>` of radio inputs, one per theme); then "More" (a
  disclosure opening a list: each bundled city as a button with its lot count, the current one `aria-current`, and "Open
  a city file…"). A popover closes on Escape (focus returns to its button), on a pick, and on a press outside.
- `Drawer` (right, 320 px, from below the controls to 16 px above the bottom): "Selected" (the hit's title, ellipsis,
  full text in `title`, and its lines; "Show only this town" when allowed), then "Towns" (each town's name and lot
  count, the first `TOWNS_SHOWN` 7 by lots, then "Show all {n} towns"; each name a button that shows only that town). A
  close button ("Hide details") collapses it to a 48 px "Details" button. Below 760 px wide it is a bottom sheet, at
  most half the height, closed at first.
- `ZoomControls` (bottom right, beside the drawer): "Zoom in", "Zoom out", "Fit the city" (the keyboard's `+`, `-`,
  `0`).
- `Legend` (bottom left): four swatches from the map theme: "A folder's files" (two of its tints, source stronger),
  "Park: documentation", "Reserve: room to grow", "Vacant: a deleted file". Hidden below 760 px wide.
- `Notice` (top centre, under the search box): an error as `role="alert"` with a "Dismiss" button; floating, so it moves
  nothing.
- Sizes: controls 48 px tall on `(pointer: coarse)`, 40 px otherwise (above the 32 px floor), 8 px apart; spacing from
  4, 8, 12, 16, 24, 32, 48 px. Layers (`z-index`): map 0, labels 1, marker 2, cards 10, popovers and the hover card 20,
  notices 30. Transitions 150 ms, none under reduced motion.

## Labels

- `Label` gains `extent`: the scene-unit width of the town's or district's bounding box (the smaller side).
- `declutter` keeps a label only when, in this order: it lies inside the viewport; a district or minor label's extent on
  screen is at least its text's width times `LABEL_FIT` 0.6; no label of the same text was kept within `REPEAT_PX` 240
  px; it overlaps no label kept before.

## Observability

- `src/log.ts` writes one line per decision point or failure, fingerprinted by its first token: `viewer/index cities`,
  `viewer/open name towns lots`, `viewer/town key`, `viewer/city`, `viewer/search length hits` (when a query settles),
  `viewer/search-pick kind path`, `viewer/drawer open` (to `console.info`); `viewer/index-failed reason`,
  `viewer/open-failed name reason`, `viewer/file-rejected file reason` (to `console.error`). A reason is the engine's
  code (`city/bad-json`) or the error's text. Every failure also reaches the person as `role="alert"` text.

## Constants

Every tuning number is named where it is used and listed in `DEFAULTS.md`: `PAN_SHARE`, `KEY_ZOOM`, `FIT_SHARE` (in
`view/view.ts`), `CLICK_SLOP`, `WHEEL_ZOOM`, `CARD` (in `MapView.tsx`), `MIN_QUERY`, `MAX_HITS` (in `search/search.ts`),
`FLY_SHARE`, `FLY_MS`, `LABEL_FIT`, `REPEAT_PX` (in `view/`), `TOWNS_SHOWN` (in `Drawer.tsx`), `LOT_TOP` and
`LOT_HEIGHT` (in `packages/scene`).

## Web experience

- LCP: the status and the panel's text paint first (about 30 ms on loopback); a town label may follow (about 100 ms).
  Budget: the last largest paint under 2.5 s.
- CLS 0: every card floats (`position: absolute`) with a fixed width; the status is one line with an ellipsis; a notice
  floats over the map; so a longer name, status or error never moves anything. The town list's empty state has a town
  heading's margins. Shifts after input (a breadcrumb appearing) are the person's own and do not count.
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
