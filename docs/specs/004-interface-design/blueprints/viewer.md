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
  `Canvas` with an `OrthographicCamera`, one `mesh` per layer with vertex colours); labels are HTML over the canvas,
  placed by `MapView`).
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
- `readRepository(fetcher, repo, { signal, onStep })`, every call through the injected fetcher (tests stub it) with the
  signal, JSON from `https://api.github.com` with `Accept: application/vnd.github+json`; `onStep` hears a `ReadStep`
  (see Loading) before the commit, as each tree answer arrives, and as each manifest is read:
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
- Laying: `lay/worker.ts` (a module Web Worker) receives the snapshot and returns
  `layCity(snapshot, initialState(LIVE_OPTIONS), LIVE_OPTIONS, onProgress).city` with the CLI's default options;
  `Viewer` takes a `lay` function, `Lay = (snapshot, { signal, onProgress }) => Promise<City>` (`layInWorker` by
  default, `layHere` on the calling thread in tests). See Loading for the progress it posts and how it ends.
- A repository is laid from the search box (below). While it loads, the status line names the phase ("{name}: {phase}";
  see Loading); then "{towns} towns · {lots} lots · single state, not folded". On success the address becomes
  `?repo=owner/name` (`history.replaceState`); on load, a `repo` parameter is laid instead of the first bundled city.
- Hosting: `next.config` takes `basePath` from `CITYMAP_BASE_PATH` (`/citymap` on GitHub Pages, empty locally); every
  fetch of bundled files is prefixed with it. `.github/workflows/pages.yml` builds the export on every push to main and
  deploys it with `actions/upload-pages-artifact` and `actions/deploy-pages`.
- Every API answer passes through `meter(fetcher, onAllowance)` (`github/allowance.ts`), which reads
  `x-ratelimit-remaining` and `x-ratelimit-reset` from answers whose `x-ratelimit-resource` is `core` (or absent), so
  laying and the suggestions share one `Allowance` (`{ remaining, reset }`, null until GitHub has answered once).
- Logs: `viewer/github-read repo requests files ms` and `viewer/github-failed repo reason`.

## Loading (`apps/web/src/load`, `components/LoadingCard.tsx`)

- Sources and their phases, in order (`Phase` ids, then the words the card and the status show):
  - `github`: `commit` "Asking GitHub for the latest commit", `tree` "Reading the file tree", `manifests` "Reading
    workspace manifests", `lay` "Laying out {files} files", `draw` "Drawing the map";
  - `bundled`: `download` "Downloading", `parse` "Reading the city", `draw`;
  - `file`: `download` "Reading the file", `parse` "Reading the city", `draw`;
  - `local` (plan 0010) brings its own phases into the same model.
- `PHASE_WEIGHTS` (`load/progress.ts`) give each phase its share of the one bar, per source, summing to 1 (see
  `DEFAULTS.md`); a phase's segment starts where the earlier phases' weights end.
- `Step` (what a source reports): `{ phase, done?, of?, requests? }`; `done` and `of` count the phase's unit (`UNITS`:
  folders for `tree`, manifests for `manifests`, lots for `lay`, bytes for `download`), `requests` the API requests so
  far.
- `Progress` (pure, `load/progress.ts`): `startProgress(source, name, now)`; `advance(progress, step, now)` moves to the
  step's phase and sets `fraction` = max(the previous fraction, the phase's start + its weight × min(1, done / of)), so
  the bar never moves backwards, a phase change jumps to the phase's start, and a step without counts holds the bar;
  `finish(progress)` sets it to 1. `determinate` is true while the current phase has counts.
- Words (`load/progress.ts`): `phaseWords(progress)`; `countWords(progress)`: "1,204 of 2,610 folders · 27 requests", "2
  of 3 manifests", "31,200 of 75,123 lots", "4.1 of 12.3 MB" (bytes in MB with one decimal; "4.1 MB" when the total is
  unknown); `spentWords(ms)`: "0 s", "12 s", "1 min 4 s"; `estimateWords(progress, now)`: null until steady (fraction at
  least `ESTIMATE_FROM` 0.1 and `STEADY_MS` 2,000 ms spent), then the time left at the pace so far,
  `spent × (1 − fraction) / fraction`: "a few seconds left" under 5 s, "about {n} s left" (whole seconds, to 5 s from 20
  s) under 60 s, "about {n} min left" above.
- `useLoading()` (`load/useLoading.ts`): one load at a time. `begin(source, name)` aborts any load in flight and returns
  `{ signal, step, done, failed }`; `cancel()` aborts the current one. It holds `progress` (null when idle) and `shown`:
  the card shows `SHOW_AFTER_MS` 300 ms after `begin` if still loading, and once shown stays at least `HOLD_MS` 400 ms
  (the bar at its end meanwhile); a load done before 300 ms shows nothing. A clock ticks every 250 ms while the card
  shows, for the time spent and the estimate.
- The viewer's loads report through it: the index's first city and More
  (`loadCity(fetcher, entry, base, { signal, onBytes })`: the body read as a stream, `content-length` the total unless
  `content-encoding` is set, then `parseCity`), a city file (`readCityFile(file, { signal, onBytes })`, `file.size` the
  total), and a GitHub repository (`readRepository`, then the worker). `draw` begins once the city is in hand and ends
  on the first animation frame after the new scene is committed.
- `ReadStep`s from `readRepository`: `commit` before the first request; `tree` after each tree answer, with `done` the
  folders whose entries are in hand and `of` the folders known (every `tree` entry seen in any answer, the truncated
  first answer included, plus the root), and `requests`; `manifests` with `done` of `of` root manifests read.
- The engine: `layCity(snapshot, state, options, onProgress?)` calls `onProgress({ placed, shaped, lots })`: `lots` the
  lot seeds of every town it lays (known once their trees are built), `placed` the seeds laid so far (after each
  neighbourhood, and a whole cached folder at once), `shaped` the seeds of towns whose warp is done (a quarter of a
  town's seeds after each of its roads, blocks, lots, and districts with water). It reads nothing back, so the city is
  byte-identical with or without it; the Rust engine has no callback (parity compares bytes).
- The worker posts `{ progress }` at most every `POST_MS` 100 ms (and the last one always), then `{ city }` or
  `{ error }`; the `lay` step reports `done` = `placed + shaped` of `of` = `2 × lots`, and the count shows lots placed
  of lots. Aborting the signal terminates the worker and rejects with an `AbortError`.
- Cancel: "Cancel" on the card, or Escape anywhere but in the search box or an open menu (a capturing `keydown` listener
  on `window` while loading, which stops the key there), calls `cancel()`: requests abort (the fetcher gets the signal),
  the worker ends, and the last city, the address and the selection stay. An `AbortError` is never shown as a failure. A
  failure removes the card at once (no hold) and shows the notice.
- `LoadingCard` (`<section aria-label="Loading">`, `.glass.loading`; centred in the free map by `insetsFor`, 360 px
  wide, at most the map's width less 32 px; `z-index` 10, beneath the search, menus and notices): the name being opened
  (`<h2>`), the phase as text, a `role="progressbar"` (`aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow` the whole
  percentage while determinate, absent otherwise; `aria-valuetext` the phase and the count; `aria-labelledby` the
  phase), the count, "{spent} spent" and the estimate, and a "Cancel" button. The bar's fill is a `transform: scaleX`
  (compositor-only), eased over 150 ms; indeterminate, a 30 % band sweeps across in 1.4 s, held still at the start under
  `prefers-reduced-motion: reduce`. A visually hidden `aria-live="polite"` line carries only the phase's words, so a
  phase change is announced and a step is not. While loading the map is dimmed (`.map[data-loading]`, opacity 0.45, 150
  ms) and stays live; the card is the only thing added, floating, so nothing moves (CLS 0).
- Logs: `viewer/load-phase source name phase ms` (on each phase change, `ms` since `begin`),
  `viewer/load-cancelled source name phase ms`, `viewer/load-done source name ms`; failures keep their own logs.

## Repository suggestions (`apps/web/src/github`)

- `ownerQuery(text)` (`suggest.ts`, pure): the text trimmed, a leading `https://`, `www.` and `github.com/` dropped;
  `{ owner, prefix }` when it is `owner/` followed by nothing or the start of a name (`OWNER`, and a prefix of at most
  100 of `[A-Za-z0-9._-]`), else null.
- `GitHubRepository`: `{ name, description, stars, language, fork, archived }` (`description` and `language` may be
  null), read from GitHub's `name`, `description`, `stargazers_count`, `language`, `fork`, `archived`; an entry of
  another shape is left out.
- `rankRepositories(repos, prefix)` (pure): those whose name starts with the prefix (case-insensitively), then those
  that contain it, each group by stars (most first), then name (`compareKeys`); an empty prefix keeps them all, by
  stars.
- `createSuggester(fetcher, now)` (`owners.ts`), one per viewer, its cache living as long as the tab:
  - `ownerRepositories(owner, signal)`: `GET /users/{owner}/repos?sort=pushed&per_page=100` (users and organisations
    alike), kept per owner (case-insensitively) for `OWNER_TTL_MS` 10 minutes; one request in flight per owner is
    shared; the answer is `{ repos, more }`, `more` when the `link` header has `rel="next"`.
  - `searchRepositories(owner, prefix, signal)`: only when `more` and no name in the first page contains the prefix:
    `GET /search/repositories?q={prefix} in:name user:{owner}&sort=stars&per_page=20`, kept per owner and prefix for the
    same ten minutes; its allowance is the search API's, so it is not metered.
  - Rejections (`CitymapError`): 404 `github/not-found` with detail `owner` ("No GitHub user or organisation named
    {owner}"); `github/rate-limited`, `github/failed` and `github/offline` as for reading; a failure is not cached.
- `SearchBox` takes `suggest` (the suggester) and `allowance`. While `ownerQuery` holds, after the text rests
  `SUGGEST_MS` 250 ms the owner's list is asked for (cached answers at once), so typing a name costs one request per
  owner; an aborted or superseded answer is dropped.
- The list: the city's matches (at most `CITY_WITH_SUGGESTIONS` 3 while suggestions show), then a group headed "On
  GitHub" (`<li role="presentation">` heading text, then the suggestions), then "Lay owner/name from GitHub" when the
  text names a repository that no suggestion is; seven choices in all (`MAX_HITS`). Each suggestion is a button: a
  GitHub icon, the name with the typed prefix marked, a one-line description (`text-overflow: ellipsis`, the whole text
  in the button's name), and a line of facts: "★ 12.3k" (compact, `en-GB`), the language, "fork", "archived". Picking
  one calls `onRepository("owner/name")`.
- The summary adds, while an owner is asked about: "Asking GitHub for {owner}'s repositories…", then "{n} of {owner}'s
  repositories match", and "{remaining} GitHub requests left this hour" when the allowance is known. A failure replaces
  those with its one line ("No GitHub user or organisation named x", "GitHub's hourly limit is reached; it resets at
  14:05", "GitHub could not be reached"); the lay offer stays.
- Logs: `viewer/suggest owner repos more ms` (an answer from GitHub), `viewer/suggest-cached owner`,
  `viewer/suggest-search owner prefix repos`, `viewer/suggest-failed owner reason`, `viewer/suggest-pick repo`.

## Floating atlas (`apps/web/src/components`)

The map (`.map`) fills `.viewer` (`100dvh`); every card is `position: absolute` over it, 16 px from the edges (8 px on a
phone), so nothing the cards do moves the map or each other.

- Interface scheme: CSS custom properties on `:root` (`--glass`, `--glass-solid`, `--glass-line`, `--raised`, `--hover`,
  `--ink`, `--ink-soft`, `--accent`, `--accent-ink`, `--mark`, `--focus`, `--shadow`), light by default and dark under
  `@media (prefers-color-scheme: dark)`. Glass is the scheme's surface at 88 % opacity with
  `backdrop-filter: blur(12px)`, a 1 px line and a soft shadow; menus, matches, notices and the hover card are solid.
  Radius 16 px for cards, 12 px for controls. The map's theme colours only the page behind the map (`country`) and the
  legend.
- Font: Inter, the Latin variable face from `@fontsource-variable/inter`, loaded with `next/font/local` (preloaded, with
  a size-matched fallback, as `--font-inter`); 14 px base, 1.4 line height. Map labels keep Noto Sans. Icons:
  `lucide-react` (ISC), 20 px, `aria-hidden`; every icon-only button has an `aria-label`.
- `TitleCard` (top left, 300 px; on a phone from the left edge to 8 px short of the controls): `<h1>` the city's name;
  the breadcrumb (`<nav aria-label="Breadcrumb">`, the city as a button, then the town) when one town is shown; the
  status (`aria-live="polite"`, one line, ellipsis).
- `SearchBox` (`<search>`; top centre, at most 520 px and clear of the title card on both sides; from 1,100 px down,
  under the title card, as wide as the room left of the drawer, at most 440 px; on a phone, the full width under the
  title row): an `<input type="search">` labelled "Search files and folders, or lay owner/name", over a summary
  (`aria-live="polite"`, also the field's description) and a `<ul aria-label="Matches">` of buttons, each naming its
  kind ("Folder" or "File", visually hidden), its name with the match marked (`<mark>`), and its path. `/` anywhere but
  in a field focuses it; focus or a press outside the search closes the list. A query that rests `SETTLE_MS` 600 ms is
  logged.
  - Matching (`src/search/search.ts`, pure): `searchIndex(city)` lists every district that is not a ward (a folder: its
    path, name, town, town key, centre and extent) and every lot that is not vacant (a file: its path, its file name,
    town, town key, centre and extent), in scene units; the extent is the larger side of the bounding box.
    `search(index, query)` (query trimmed, case-insensitive, at least `MIN_QUERY` 2 characters) ranks: name equals
    query, name starts with it, name contains it, path contains it; folders before files within a rank; then shorter
    paths, then path order; equal paths (an old town's twin) keep the city's order. It returns the first `MAX_HITS` 7
    and the total.
  - When `parseRepository` accepts the text, "Lay owner/name from GitHub" is offered: first when nothing matches, else
    after at most six matches, so seven choices at most.
  - Enter in the field picks the first choice. ArrowDown moves focus to the first button (on the next frame, once the
    list is drawn); ArrowDown and ArrowUp move between buttons, holding at the last, and ArrowUp from the first returns
    to the field. Escape on a button returns to the field and closes the list; in the field it closes the list, then
    clears the text.
  - Picking a folder or file (`view/fly.ts`): `flyTo` centres it in the free map (see Insets), zoomed so its extent
    fills `FLY_SHARE` 0.4 of the free map's shorter side, a place smaller than `FLY_MIN_EXTENT` 6 u counted as 6 u (a
    block's worth, so its neighbours show), never further out than the fitted view. The flight takes `FLY_MS` 300 ms,
    eased in and out (cubic), the centre in step and the zoom by equal ratios (`between`); the map holds the start view
    until the first frame; any other move cancels it; under `prefers-reduced-motion: reduce` it is instant. A match in
    another town than the one shown leaves the town first. The match is then selected (a file as the lot hit at its
    centre, a folder as a district hit) and marked with a ring (`.marker`, `aria-hidden`) until the selection changes.
- `ViewControls` (top right): a `<fieldset>` (legend "View", visually hidden) of two `aria-pressed` buttons, "Plan" and
  "3D"; then "Theme" (a popover `<fieldset>`, legend "Map theme", of radio inputs, one per theme); then "More" (a
  popover headed "Example cities": each bundled city as a button, "{name} {lots} lots", the current one `aria-current`,
  then "Open a city file…" behind a hidden `<input type="file">` labelled "City file"). A popover (`Popover.tsx`:
  `aria-expanded`, `aria-controls`) closes on Escape and on a pick, both handing focus back to its button, and on focus
  or a press outside.
- `Drawer` (`<aside aria-label="Details">`; right, 320 px, from below the top row to 16 px above the bottom): "Selected"
  (the hit's title, ellipsis, full text in `title`, and its lines; "Show only this town" when allowed), then "Towns"
  (each town's name and lot count, the first `TOWNS_SHOWN` 7 by lots, then "Show all {n} towns" and "Show fewer towns";
  each name a button, described as "Shows only this town", that shows only that town; while one town is shown its name
  is plain text). The empty state ("No city yet…") shows only when nothing is on its way (an empty status). A close
  button ("Hide details") collapses it to a "Details" button. Its state is `data-open`: `auto` until the person chooses
  (open on a wide screen, closed on a phone), then `true` or `false`. Below 760 px wide it is a bottom sheet, at most
  half the height.
- `ZoomControls` (a `<fieldset>`, legend "Zoom"; bottom right, beside the drawer, or at the right edge when it is
  closed): "Zoom in", "Zoom out", "Fit the city" (the keyboard's `+`, `-`, `0`).
- `Legend` (`<section aria-label="Legend">`, bottom left): swatches from the map theme: "A folder's files, source
  stronger" (two tints of one district), "Park: documentation", and "Room to grow, and deleted files' lots" (the reserve
  colour, which vacant lots share). Hidden below 760 px wide.
- `Notice` (top centre, under the search box): an error as `role="alert"` with a "Dismiss" button; floating, so it moves
  nothing.
- Insets (`view/insets.ts`, `insetsFor(viewport, drawer)`): where the cards cover the map, from the stylesheet's sizes:
  top 100 px (156 px from 1,100 px down, where the search is under the title), right 352 px unless the drawer is closed;
  on a phone top 140 px and bottom 64 px (half the height while the sheet is open). `fit`, `onKey`'s `0` and `flyTo`
  take them: the zoom fits the free part, and `framed` pans so the free part's centre is the view's.
- Sizes: controls 48 px tall on `(pointer: coarse)`, 40 px otherwise (above the 32 px floor), 8 px apart; spacing from
  4, 8, 12, 16, 24, 32, 48 px. Layers (`z-index`): map 0, marker 1, labels 2, cards 10, the search, the controls'
  popovers and the hover card 20, notices 30. Transitions 150 ms, none under reduced motion.

## Labels

- `Label` carries `extent`: the scene-unit width of the town's or district's bounding box (the smaller side).
- A label's width is its characters times its size times an advance: 0.62 em, plus its letter spacing (0.15 em for a
  town, 0.08 em for a district).
- `declutter` keeps a label only when, in this order: it lies inside the viewport; a district or minor label's extent on
  screen is at least its width times `LABEL_FIT` 0.6; no label of the same text was kept within `REPEAT_PX` 240 px; it
  overlaps no label kept before.

## Observability

- `src/log.ts` writes one line per decision point or failure, fingerprinted by its first token: `viewer/index cities`,
  `viewer/open name towns lots`, `viewer/town key`, `viewer/city`, `viewer/search length hits` (when a query settles),
  `viewer/search-pick kind path`, `viewer/drawer open`, the loading and suggestion events above (to `console.info`);
  `viewer/index-failed reason`, `viewer/open-failed name reason`, `viewer/file-rejected file reason`,
  `viewer/suggest-failed owner reason` (to `console.error`). A reason is the engine's code (`city/bad-json`) or the
  error's text. Every failure also reaches the person as `role="alert"` text.

## Constants

Every tuning number is named where it is used and listed in `DEFAULTS.md`: `PAN_SHARE`, `KEY_ZOOM`, `FIT_SHARE`,
`LABEL_FIT`, `REPEAT_PX` (in `view/view.ts`), `FLY_SHARE`, `FLY_MIN_EXTENT`, `FLY_MS` (in `view/fly.ts`), `NARROW`,
`MEDIUM` and the card sizes (in `view/insets.ts`), `CLICK_SLOP`, `WHEEL_ZOOM`, `CARD` (in `MapView.tsx`), `MIN_QUERY`,
`MAX_HITS` (in `search/search.ts`), `SETTLE_MS`, `SUGGEST_MS` and `CITY_WITH_SUGGESTIONS` (in `SearchBox.tsx`),
`TOWNS_SHOWN` (in `Drawer.tsx`), `PHASE_WEIGHTS`, `ESTIMATE_FROM` and `STEADY_MS` (in `load/progress.ts`),
`SHOW_AFTER_MS`, `HOLD_MS` and `TICK_MS` (in `load/useLoading.ts`), `POST_MS` (in `lay/worker.ts`), `OWNER_TTL_MS` (in
`github/owners.ts`), `LOT_TOP` and `LOT_HEIGHT` (in `packages/scene`).

## Web experience

- LCP: text of a card paints first (on a phone, the search's placeholder, drawn inside the field, so it names no
  element), about 40 ms on loopback; a town label may follow (about 100 to 170 ms). Budget: the last largest paint under
  2.5 s.
- CLS 0: every card floats (`position: absolute`) with a fixed width; the status is one line with an ellipsis; a notice
  floats over the map; the empty state waits until nothing is on its way; the font comes with a size-matched fallback;
  so a longer name, status or error never moves anything. Shifts after input (a breadcrumb appearing) are the person's
  own and do not count.
- The app is built with the React Compiler (`reactCompiler: true`, `babel-plugin-react-compiler`), so moving the map
  re-renders what the view feeds and not the other cards. Against the bar-and-panel viewer, under the same machine load
  at a fourfold slowdown, a key press on livediagram answers in a median 48 ms (was 40 ms), p90 64 ms (was 64 ms). Unit
  tests render uncompiled; the end-to-end suite proves the compiled build. Nothing the compiler memoises reads a
  property of a value that may be null during render: the search's context (`finder`) carries the scene's bounds and the
  pick index, built only once the city is.
- INP under 200 ms on a phone: the view while fitted is derived from the scene
  (`fit(scene.bounds, mode, viewport, insets)`), never built twice; the whole city's scene and pick index stay built
  while one town is shown, so going back costs nothing. Measured on a Pixel 7 profile with the processor slowed fourfold
  (CDP `Emulation.setCPUThrottlingRate`), over taps, keys, the view switch, a search and a drill.
- `e2e/vitals.spec.ts` runs in its own projects (`vitals-desktop`, `vitals-phone`) once the journeys are done, so no
  other test draws at the same time; it reports the slowest interaction as an annotation. It records
  `largest-contentful-paint`, `layout-shift` and `event` entries (from 16 ms) through `PerformanceObserver` before the
  page's scripts run, and asserts the three budgets.

## Tests

- `packages/scene`: unit tests for triangulation, ribbons, plinths, layers and labels (Vitest, Node).
- `apps/web`: component tests in jsdom for every card, search, flight, file errors and keyboard handling (the canvas is
  replaced by a stub there; fixtures in `components/testing/`); Playwright end-to-end on a desktop and a phone, in dark
  mode with one light run: loads, switches city, theme and view, searches and flies, opens a file, shows an error for a
  bad file, reaches every control by keyboard, keeps every card clear of the others at widths from 1,400 to 360 px, and
  passes axe (WCAG 2.2 AA rules) with no violations, with the menus, the matches and the drawer open, in light and dark;
  a screenshot per theme for review.
- Loading and suggestions: the progress model, the meter, the suggester and the ranking in Node with a stubbed clock and
  fetcher; the card's thresholds with fake timers; cancel by button and by Escape, keeping the last city; the engine's
  progress against the same lay without it (equal output, `placed` and `shaped` reaching `lots`). End-to-end, GitHub
  answered from fixtures: a truncated tree read folder by folder shows the card with a count, Cancel keeps the last
  city; an owner's suggestions, picked by keyboard; an unknown owner and the limit reached; axe with the card and the
  suggestions open, light and dark; the vitals with the card shown.
