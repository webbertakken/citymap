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
  0, blocks 0.01, water 0.015, roads 0.02 (casing) and 0.025 (fill), vacant lots 0.03 (`LOTS_BASE`).
- `roadRibbon(polyline, width)`: one quad per segment, offset by half the width along the segment's normal, plus a
  square cap at each joint so turns stay closed.
- Every lot that holds files is a building in `Scene.buildings` (one mesh; see the
  [buildings blueprint](../../008-buildings/blueprints/buildings.md)): a plinth of `LOT_HEIGHT` = 0.12 u in plan view,
  its floors standing in the Buildings view, its look read from the lot table. Vacant lots lie flat in the reserve
  colour (layer `lots`).
- `buildScene(city, theme)` → `{ layers: { name, positions, colours, indices }[], buildings, labels, bounds }`; labels
  are town names and the districts the SVG renderer would label (same rule), at their centroids.
- Budgets: next.js (about 8,000 lots) builds in under 300 ms and under 64 MB of arrays.

## Picking (`packages/scene`)

- `pickIndex(city)` builds a uniform grid over the city (cells of 8 u) listing, per cell, the lots, blocks, roads,
  districts and towns whose bounding boxes touch it; `pick(index, x, z)` (scene units) returns the topmost hit: a lot
  (point in polygon), else a block, else a road (distance to a segment within half its width), else a district (smallest
  containing), else a town.
- The index is built in two halves, so the city's worker builds it and the main thread only attaches it:
  `pickIndex(city)` is `pickFrom(city, pickGrid(city))`.
- `pickGrid(city)` → `PickGrid`, plain data of typed arrays (structured-cloneable; `pickBuffers(grid)` lists its
  buffers, handed over without a copy). Its entries are numbered in this order: per town its lots, blocks, roads,
  labelled districts (wards left out) and outline; then the highways. Per entry, one slot (or four, or two) of each
  column:
  - `layer` (`Uint8Array`): 0 lot, 1 block, 2 road, 3 district, 4 town;
  - `town` (`Int32Array`): the town's index in `city.towns`, −1 for a highway;
  - `item` (`Uint32Array`): the index in the town's `lots`, `blocks`, `roads` or `districts` (counting wards), or in
    `city.highways`; 0 for a town;
  - `box` (`Float64Array`, four per entry): x0, y0, x1, y1 in fixed units, a road's grown by half its width;
  - `area` (`Float64Array`): the bounding box's area (the smallest district wins);
  - `lots` (`Uint32Array`): a lot's `folderLots`, a district's `lots`;
  - `folders` (`Uint32Array`): a district's `folders`, a town's `districts`;
  - `ends` (`Int32Array`, two per entry): a highway's towns nearest its two ends (indices in `city.towns`, −1 for none);
  - `building` (`Int32Array`): a lot's building, by its index in the whole city's `buildScene(city).buildings.order`
    (`hasBuilding(lot)`: not vacant, at least three corners), −1 for every other entry and for a lot without one.
- The grid is dense over the cells the entries' boxes touch: `column0` and `row0` (the first cell's column and row,
  `floor(coordinate / CELL)`), `columns`, `rows`; `starts` (`Uint32Array`, `columns × rows + 1`) and `members`
  (`Uint32Array`): cell c lists the entries `members[starts[c]]` to `members[starts[c + 1] − 1]`, in entry order, where
  c = (row − row0) × columns + (column − column0). A point outside the grid lies in no cell.
- `pickFrom(city, grid)` → `PickIndex` (`{ city, grid, only, folders, hits }`): it walks only the `layer` column, for
  the districts. `folders` maps `{townKey}\n{path}` of every labelled district to its entry (the last of a key wins, as
  before); `only` is null (every town answers); `hits` keeps each entry's hit once made, so a lot, road, district or
  town answers with the same object every time (a block's hit depends on the point, so it is made each time). The city
  must be the one the grid was built from (the same towns and items in the same order).
- A hit is made from the city on demand, the same as the whole index would have made it: the lot, block, road, district
  or town at `town` and `item`, `townRoot` for its root, and the counts from the columns.
- `onlyTown(index, townKey)` → the same grid answering for one town only (`only` its index, so no highway answers; a key
  the city does not hold answers nothing): what `pickIndex(focusOn(city, townKey))` would answer, built in no time, so a
  drill builds no index. `folderHit` keeps answering for the whole city.
- Sizes: a dense grid holds `columns × rows` cells: linux 88 × 85 = 7,480, livediagram 31 × 43 = 1,333; entries are one
  per lot, block, road, labelled district, town and highway (linux 85,869).
- A city's districts are only its labelled folders (top level, or at least 15 ‰ of the town's mass), so the deepest
  folder the model knows for a block is the smallest labelled district holding the point; a park's own folder (a
  flattened subfolder's) is not in the model, nor is any folder's count of documents.
- `townRoot(city, town)`: the folder a town is laid from: empty for the main town and its old towns (key equal to the
  repository, or starting with "{repository} old town"), else the key after "{repository}/" without a trailing " old
  town" or " old town {n}".
- Every hit of a town carries `town` (its name), `townKey` and `root` (`townRoot`). Per kind:
  - `lot`: `path` (empty when vacant), `use`, `address`, `vacant`, `folder` (the file's folder: its path up to the last
    slash, empty at the top; for a vacant lot the address's folder, `addressFolder`), `folderLots` (the live lots whose
    folder is `folder`);
  - `block`: `block` (the kind), `folder` (the smallest labelled district's path holding the point, else `root`);
  - `road`: `cls`, `joins` (for a highway, the names of the towns nearest its two ends, in that order; empty for a
    town's road); `town`, `townKey` and `root` are null for a highway;
  - `district`: `district` (its name), `path`, `form` (or null), `lots` (live lots at or below its path) and `folders`
    (folders below its path that hold lots, or lead to folders that do);
  - `town`: `form`, `old`, `lots` (`stats.lots`) and `districts` (its top-level labelled districts).
- `folderHit(index, townKey, path)`: the `district` hit of a labelled folder by its town and path (what a search pick
  selects), or null.
- `buildingAt(index, x, z)`: the `building` of the topmost thing at a point when it is a lot (the first lot entry, in
  entry order, whose shape holds the point and whose town answers), else −1; what `pick` would answer there, without
  making a hit, so the Buildings view's ray reads each step's height from typed arrays.
- `lotRefs(city)` (`packages/scene/src/buildings.ts`): every building's `LotRef` in `buildings.order`'s order (per town,
  its lots with `hasBuilding`), without building a scene; `buildingSpans(city)`: per town key, the `Span`
  (`{ first, count }`) of its buildings in that order. A town alone (`focusOn`) has exactly the whole city's buildings
  from `first` to `first + count − 1`, in order.
- Counts are made once, while indexing: live lots per folder, then summed into every ancestor up to the town's root;
  folders below each labelled district from the set of folders on the way from each lot's folder up to it. A highway's
  towns are those whose outline lies nearest each end (distance to the outline's edges, 0 inside).
- Budget: next.js (about 8,000 lots) indexes in under 50 ms, linux (about 75,000 lots) in under 500 ms; a query answers
  in under 1 ms; `pickFrom` and `onlyTown` in under 1 ms for linux.

## App (`apps/web`)

- Next.js App Router, `output: "export"`, one page. Bundled cities live in `public/cities/<name>/<variant>.json`, one
  per combination of toggles, with an index `public/cities/index.json`
  (`[{ name, variants: [{ toggles, file, lots }] }]`, sixteen variants per city), produced by `scripts/bundle-cities.ts`
  (Layout toggles, below).
- Components: `Viewer` (state: city, theme, view), the floating atlas's cards (below), `CityCanvas` (react-three-fiber
  `Canvas` with an `OrthographicCamera`, one `mesh` per layer with vertex colours); labels are HTML over the canvas,
  placed by `MapView`).
- Camera: a `Mode`, `plan` (the default, on every visit) or `buildings`. Plan looks straight down with `up = (0, 0, −1)`
  (`basis("plan")`: eye `(0, 1, 0)`, screen right `(1, 0, 0)`, screen up `(0, 0, −1)`); the Buildings view from
  `ELEVATION` 30° and `YAW` 45° (`basis("buildings")`: eye `(cos30·sin45, sin30, cos30·cos45)`, `up = (0, 1, 0)`). A
  `View` is `{ centre, zoom, yaw?, tilt? }`: the Buildings view's turn (default `YAW`, `ELEVATION`;
  `basis(mode, turn)`), ignored in plan view; `project`, `pan`, `fit`, `framed`, `onKey`, `declutter` and `unproject`
  take the mode, plan by default, so switching keeps the centre and the zoom. Zoom fits the bounds' four corners on load
  and on `0`.
- Hover: `hitAt(index, view, viewport, pointer, mode, heights)` picks the ground in plan view (a lot's top lies over its
  footprint); in the Buildings view it walks the view ray down from the tallest top in steps of `RAY_STEP` 0.1 u and
  answers the first lot whose building reaches that height, else the ground. `Heights` (`view/hover.ts`) is
  `{ top, floors }`: `floors` (`Uint8Array`) every building's floors by its index in the whole city's order (the city's
  worker makes it once), `top` the tallest of the place shown (`heightsOf(floors, span)`); a building's height is
  `heightOf(floors)` = `LOTS_BASE + floors × FLOOR_HEIGHT`, worked out in doubles as the lot table's reader does. Each
  step asks `buildingAt`, and only the step that answers makes the hit (`pick`), so a step costs no hit and no map. The
  hover card is described under Hover cards. Click selects; the drawer's "Selected" section (`aria-live="polite"`) shows
  the same details. Escape clears both. The selection's place carries a marker (a ring, `aria-hidden`) over the map.
- Drill down: `focus` (a town key or null). The scene is the town's, built by the city's worker ahead (below), and the
  pick index the whole city's restricted to the town (`onlyTown`); the view refits; the title card shows a breadcrumb
  (`<nav aria-label="Breadcrumb">`: the city as a button, then the town); the panel offers "Show only this town" on each
  town, and on a selection within a town.
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
- `getJson(fetcher, url, notFound, signal)` (`github/api.ts`): every API call, through the injected fetcher (tests stub
  it) with the signal, JSON from `https://api.github.com` with `Accept: application/vnd.github+json`. Rejections
  (`CitymapError`): 404 the caller's `notFound`; 403 or 429 with `x-ratelimit-remaining: 0` `github/rate-limited`
  (detail `reset`, the epoch second from `x-ratelimit-reset`); any other failure status `github/failed` (detail
  `status`); a fetch that throws `github/offline`; an aborted signal rejects with its reason (an `AbortError`), never as
  offline.
- `readRepository(fetcher, repo, { signal, onStep })`; `onStep` hears a `ReadStep` (a `Step` that always carries
  `requests`; see Loading) before the commit, after each tree answer, and as each manifest is read:
  1. `GET /repos/{owner}/{name}/commits/HEAD`: the commit `sha` and its `commit.tree.sha` (the default branch); a 404
     anywhere is `github/not-found` "{owner}/{name} does not exist or is private".
  2. `GET /repos/{owner}/{name}/git/trees/{tree}?recursive=1`. When `truncated`, the tree is read folder by folder
     instead: a folder's tree without `recursive` lists its entries; each subtree is then read with `recursive=1`, and
     any still truncated is split the same way. At most `IN_FLIGHT` 4 requests are in flight.
  3. Entries: `blob` is a file (path joined from its folder), `commit` a submodule (skipped), `tree` a folder.
  4. Root workspace manifests (`isManifest`) are read from
     `https://raw.githubusercontent.com/{owner}/{name}/{sha}/{path}` with the signal (not counted against the API
     limit), parsed with `patternsOf` and resolved with `resolveWorkspaces`; one that cannot be read is left out.
  5. The snapshot is `stateSnapshot(name, sha, paths, workspaces)` from `@citymap/ground-plan`, the same builder the
     CLI's `--no-history` and the bench use, so the browser lays exactly what `citymap --no-history` lays.
- Laying and reading (`lay/`): every opening becomes a city in its own module Web Worker, which stays with the city
  while it is shown (the city's worker) and makes what the map needs next.
  `Laid = { city, measures, pick, scales, floors, roofs, answers, port }`: the city, its measures (or null), its pick
  index, the legend's scales (`Scales`, from every building), every building's floors (`Uint8Array`, by its index in the
  whole city's order), every building's roof (`Roofs`, below), the opening's answers (its first lot table, the whole
  city's scene, the town asked for) and the city's port (`CityPort`, below), which goes on with the rest.
  - Every opening is given `OpenOptions`, `{ signal, onProgress, theme, colourBy?, town? }`: the theme and the colour to
    make the first look in (`colourBy` the one asked for; the work colours by `colourFor(colourBy, measures)`), and the
    town to make first (a city shown again in another layout keeps its town; else null).
  - `Lay = (snapshot, options & { toggles, facts }) => Promise<Laid>`: `layMade` lays,
    `layCity(snapshot, initialState(options), options, onProgress)` with the CLI's default options and the chosen
    toggles (`liveOptions(toggles)`, the engine's defaults when none are given), and builds the measures from the facts.
  - `Read = (text, options) => Promise<Laid>`: `readMade` posts a `parse` step and reads the text with `parseCityFile`
    (its rejections are the file's).
  - Both then (`finish`) post a `draw` step and make the city's work: `cityWork(file)` (`lay/work.ts`), what the worker
    keeps: the city file, its buildings (`cityBuildings(measures)`: each lot's `Building` and the scales), the
    buildings' `LotRef`s (`lotRefs(city)`), their floors (`cityFloors(refs, buildings)`), their roofs
    (`cityRoofs(city, buildings)`) and spans (`buildingSpans(city)`); and the pick grid (`pickGrid`). The first look is
    asked at once (`opening(work, { ask: "look", theme, colourBy, first: town })`): its lot table, the whole city's
    scene and the town asked for (when the city has it) are made before the city crosses; every other town's is left to
    make. A `Made` is `{ work, grid, answers, tasks }`.
  - `layHere` and `readHere` do it all on the calling thread (jsdom, tests), with `herePort(work, tasks)`; `layInWorker`
    and `readInWorker` (`lay/browser.ts`; the Viewer's defaults, `layHere` and `readHere` where no `Worker` exists) in a
    module Web Worker (`lay/worker.ts`), one per opening, sent a `Request`:
    `{ job: "lay", snapshot, theme, colourBy, town, toggles, facts }` or `{ job: "read", text, theme, colourBy, town }`.
- The city's work (`lay/work.ts`) answers two asks, each made of tasks that make one `Answer` apiece:
  - `{ ask: "look", theme, colourBy, first }`: the lot table in that theme and colour, then the whole city's scene
    (`buildScene(city, THEMES[theme])`), then the town `first` (when given and in the city), then every other town's
    (`buildScene(focusOn(city, key), …)`), largest first (by `stats.lots`, then the city's order, as the drawer lists
    them). A city of one town without highways answers its town with `scene: null`, "the whole city's", as `focusOn` of
    it is the city itself and its scene the same.
  - `{ ask: "table", theme, colourBy }`: the lot table alone.
  - `Answer` is `{ kind: "scene", theme, town, scene }` (`town` null for the whole city) or
    `{ kind: "table", theme, colourBy, table }`: the whole city's lot table
    (`tableFor(refs, buildings, colourBy, theme)`), from which a town shown alone draws its buildings' rows
    (`placeTable(table, span)`, a copy of `4 × count` floats into whole texture rows), equal to the town's own table.
  - `Tasks` (`lay/work.ts`, pure) is the queue: `asked(tasks, work, ask)` puts a look's tasks after every table still to
    make and drops every scene an older look has not made yet (a newer theme supersedes them); a table goes first; a
    task already waiting under the same key (`scene {theme} {town}`, `table {theme} {colourBy}`) is not added twice. The
    worker takes the first each time.
- The port (`CityPort`, `lay/port.ts`): `ask(ask)` (a look or a table), `listen(hear)` (every answer, those that came
  before it first, in order) and `end()` (the work stops; nothing more is heard; again does nothing). `hearing()` holds
  the answers until heard and logs each with the time since the ask that made it; `drain(tasks, tell, stopped)` makes
  tasks in order, logging one that fails and making the rest.
  - `herePort(work, left)` makes what the opening left at once, and each ask's tasks when asked, on the calling thread.
  - The worker's port (`lay/browser.ts`) posts each ask; the worker (`lay/worker.ts`) runs one task per macrotask (a
    zero timeout between them), so a newer ask arrives between two tasks and reorders what is left, and posts each
    answer with its buffers transferred (`answerBuffers`: a scene's `buffersOf`, a table's buffer). A task that fails
    answers `{ failed: { task, error: Failure } }`: logged; what it would have made never comes, and the map keeps what
    it shows. A worker that fails after the city is open (`error`) is logged and replaced by the calling thread: the
    port makes `cityWork(file)` there and asks again what was asked last, so the map still changes, more slowly.
  - Lifetime: the opening's signal ends the worker until the city is open (a cancel, a newer opening); then the viewer
    ends it when another city replaces it on the map, when its `draw` fails (the job ended before the city showed), and
    when the viewer goes. A newer opening that is cancelled leaves the city shown, and its worker.
- The worker answers an opening with `{ step }` as it goes (see Loading), then `{ piece }` for each piece of the city
  (below), each a message of its own so the main thread receives each in a short task, then
  `{ opened: { grid, floors, roofs, scales, answers } }` (the grid's, the roofs' and the answers' buffers transferred;
  the floors, 75 kB for linux, copied), then `{ answer }` for each task left. A failed opening answers
  `{ error: Failure }` (`failureOf`: `{ code, message, detail }`, `code` null for an error that is not a
  `CitymapError`), rejected on the main thread by `errorOf` as the same `CitymapError` (or an `Error` of that message),
  so a bad file is named as before. The worker logs nothing itself; `viewer/worker job ms` is logged when the city's
  last piece has arrived, and every failure by the opening that asked. The opening resolves once the city is taken in,
  with its first answers in hand.
- The city crosses in pieces (`lay/pieces.ts`): `cityPieces(file)` (in the worker) is a list of JSON texts: first the
  head, the city file with every town's `lots`, `blocks`, `roads` and `districts` and the measures' `lots` emptied; then
  `{ "town": t, "part": "lots", "items": […] }` (and `blocks`, `roads`, `districts`), town `t`'s part in order, and
  `{ "measures": townKey, "items": {…} }`, a town's lot measures in order, each piece at most `PIECE_BYTES` 1,000,000
  characters (a single larger item is a piece of its own). linux crosses in about 45 pieces, its head 50 kB.
  `cityOfPieces(pieces, { signal, pause })` (the main thread) parses the head, then each piece in its own slice,
  yielding to input between them (`yieldToInput`), appending items to their town's part and measures to their town's
  record (own keys only, created in the head's order), so the city file equals the one parsed whole, its keys in the
  same order (`JSON.stringify` of both is the same text); the job's signal stops it. Nothing is validated again: the
  worker has validated or laid it, and the schemas are strict and transform nothing.
  `viewer/city-pieces pieces chars ms` is logged. It then attaches the grid (`pickFrom(city, grid)`).
- `Viewer` keeps the city's atlas (`Atlas`, `lay/atlas.ts`): the city, its port, its scales, floors, roofs and spans
  (`whole` the span of every building), and what the port has answered, the scenes by theme (each by town key, null for
  the whole city) and the whole city's lot tables by theme and colour, at most `THEMES_KEPT` 2 themes (the oldest
  dropped with its tables when a third arrives). `Atlas.look(atlas, { theme, colourBy })` is what the map draws: the
  theme asked for when it has the whole city's scene and a table, else the newest theme that has both; in it the table
  of the colour asked for, else the newest table of that theme. `Atlas.town(atlas, theme, key)` is a town's scene in
  that theme (the whole city's for `scene: null`), or null. The map, its background, its names and the legend draw in
  the look's theme and colour; the theme menu shows the theme asked for. When the look lacks the theme asked for, the
  viewer asks the port for a look in it (the town shown first); when it lacks the colour, for a table (`Atlas.wants`;
  `viewer/city-ask ask theme by first`), whenever the port, the theme or the colour changes. `Atlas.span(atlas, town)`
  is the span of the place shown (every building's for the whole city, or a key it does not hold).
- A town shown alone draws `Atlas.town` in the look's theme; until the worker has made it (just after the city shows, or
  a theme change), the viewer builds it on the main thread (`viewer/town-scene-here key ms`), as the spec asks the town
  to show at once. Its table is `placeTable(look.table, span)` and its heights `heightsOf(floors, span)`. It picks from
  `onlyTown(wholePick, focus)`, the opening's pick index kept with the city (`wholePick`).
- Roofs (`view/roofs.ts`): `Roofs` is `{ names, ends, centres }`, every building's name joined (`signName` of its files
  from its measures, else its path), where each ends, and its roof's middle (x, z), by its index in the whole city's
  order. `roofsNear(roofs, floors, span, centre, reach)` gives a place's roofs within reach of a point, each at its top
  (`heightOf`); the map asks for those within the screen's reach of its centre (`roofLabels` takes that function,
  `RoofsNear`), so no list of every roof is built on the main thread.
- Each map layer's geometry gets its bounding sphere from the scene's bounds, grown by `LAYER_MARGIN` 8 u (a road's
  casing beyond the outermost town), so three.js never walks a new layer's vertices to cull it.
- The search index (`searchIndexInSlices(city, { signal, pause, now })`, `search/slices.ts`, the entries of
  `entriesOf(city)` in order) is built on the main thread in `draw`, before the city shows, in slices of at most
  `SLICE_MS` 5 ms that yield to input between them (`scheduler.yield()` where the browser has it, else a zero timeout):
  its entries are objects the main thread owns, and receiving 75,000 of them by structured clone takes longer than
  building them (linux in Chromium: 62 ms against 30 to 39 ms). It equals `searchIndex(city)`. It is part of the
  opening: the job's signal stops it (a cancel or a newer opening), and a failure fails the opening. `Viewer` keeps it
  with its city (`listed`), so the search box has an index whenever a city shows, and text typed the moment a city
  appears finds it (and is never offered to GitHub as a repository for want of a list);
  `viewer/search-index entries slices ms` is logged once it is built.
- A repository is laid from the search box (below). While it loads, the status line names the phase ("{name}: {phase}…";
  see Loading); then "{towns} towns · {lots} lots · single state, not folded". On success the address becomes
  `?repo=owner/name` (`history.replaceState`); on load, a `repo` parameter is laid instead of the first bundled city.
- Hosting: `next.config` takes `basePath` from `CITYMAP_BASE_PATH` (`/citymap` on GitHub Pages, empty locally); every
  fetch of bundled files is prefixed with it. `.github/workflows/pages.yml` builds the export on every push to main and
  deploys it with `actions/upload-pages-artifact` and `actions/deploy-pages`.
- Every API answer passes through `meter(fetcher, onAllowance)` (`github/allowance.ts`), which reads
  `x-ratelimit-remaining` and `x-ratelimit-reset` from answers whose `x-ratelimit-resource` is `core` (or absent), so
  laying and the suggestions share one `Allowance` (`{ remaining, reset }`, null until GitHub has answered once);
  `spent(allowance, now)` is true while none is left and the reset is still to come.
- Logs: `viewer/github-read repo requests files ms` and `viewer/github-failed repo reason`.

## Loading (`apps/web/src/load`, `components/LoadingCard.tsx`)

- Sources and their phases, in order (`Phase` ids, then the words the card and the status show):
  - `github`: `commit` "Asking GitHub for the latest commit", `tree` "Reading the file tree", `manifests` "Reading
    workspace manifests", `lay` "Laying out {files} files" ("the files" until the count is known), `draw` "Drawing the
    map";
  - `bundled`: `download` "Downloading", `parse` "Reading the city", `draw`;
  - `file`: `download` "Reading the file", `parse` "Reading the city", `draw`;
  - `local`: `index` "Reading the git index" (or `folder` "Reading the folder", "{n} files found", for a folder without
    git), `manifests`, `contents` "Reading the files" ("{n} of {m} files"), `coverage` "Looking for coverage reports",
    `lay`, `draw`, from `localStep` (see
    [local repositories](../../007-local-repositories/blueprints/local-repositories.md)).
- `PHASE_WEIGHTS` (`load/progress.ts`) give each phase its share of the one bar, per source, summing to 1 (see
  `DEFAULTS.md`); a phase's segment starts where the earlier phases' weights end.
- `Step` (`load/step.ts`, what a source reports): `{ phase, done?, of?, count?, requests?, files? }`; `done` of `of`
  counts the phase's unit (folders for `tree`, manifests for `manifests`, lot steps for `lay`, bytes for `download`);
  `count` is what the words count when it differs from the bar's measure (lots placed of lots); `requests` the API
  requests so far; `files` the files a lay lays, kept from the step that brings it.
- `Progress` (pure, `load/progress.ts`): `startProgress(source, name, now)`; `advance(progress, step)` moves to the
  step's phase and sets `fraction` = max(the previous fraction, the phase's start + its weight × min(1, done / of)), so
  the bar never moves backwards: a step of an earlier phase, or of a phase the source does not have, changes nothing; a
  phase change jumps to the phase's start; a step without counts holds the bar. `finish(progress)` sets it to 1.
  `determinate` is true while the current step has a total above zero.
- Words (`load/progress.ts`): `phaseWords(progress)`; `countWords(progress)`: "1,204 of 2,610 folders · 27 requests" ("1
  request"), "2 of 3 manifests", "31,200 of 75,123 lots", "4.1 of 12.3 MB" or "51 of 900 kB" (both in the unit of the
  larger, 1,000-based; "4.1 MB" when the total is unknown); `spentWords(ms)`: "0 s", "12 s", "1 min 4 s";
  `estimateWords(progress, now)`: null until steady (fraction at least `ESTIMATE_FROM` 0.1 and `STEADY_MS` 2,000 ms
  spent) and once done, then the time left at the pace so far, `spent × (1 − fraction) / fraction`: "a few seconds left"
  under 5 s, "about {n} s left" (whole seconds; to 5 s from 20 s) under 60 s, "about {n} min left" above.
- `useLoading()` (`load/useLoading.ts`): one load at a time. `begin(source, name)` ends any load in flight (logged
  `why=replaced`) and returns a `Job`, `{ signal, step, done, failed }`; `cancel()` ends the current one (`why=cancel`).
  It holds `progress` (null when idle), `shown`, and `cancellable` (shown and still running): the card shows
  `SHOW_AFTER_MS` 300 ms after `begin` if still loading, and once shown stays at least `HOLD_MS` 400 ms (the bar full
  meanwhile); a load done before 300 ms shows nothing; a failure removes it at once. A finished load cannot be
  cancelled: `cancel()` then does nothing and logs nothing, and Escape is left to the map. The card keeps its own clock,
  ticking every `TICK_MS` 250 ms while it is mounted, so a tick re-renders the card alone, never the viewer. A job's
  reports after it ended change nothing; leaving the page aborts the load in flight.
- The viewer's loads report through it: the index's first city and More
  (`loadCity(fetcher, entry, toggles, base, { signal, onStep })`: the body read as a stream, `content-length` the total
  unless `content-encoding` is set, into text), a city file (`readCityFile(file, { signal, onStep })`, read in
  `FILE_CHUNK` 1 MB slices, `file.size` the total, into text), each text then read by the worker (`read`, which says
  `parse`, then `draw`), and a GitHub repository (`readRepository`, then the worker's `lay`). Before showing the city,
  `afterPaint()` (`load/paint.ts`) waits for a frame, or `FRAME_WAIT_MS` 100 ms in a hidden tab, so the phase is seen
  before the main thread is busy.
- `draw` (`Viewer`'s `draw(job, laid, how)`): the phase is said, a frame passes, the search index is built in slices (an
  opening that ends meanwhile ends its city's worker, `why=cancelled`), the city shown before ends its worker
  (`why=replaced`), the city is shown with its atlas, pick index and search index (and More's current city set), a frame
  passes, and the job is done.
- `ReadStep`s from `readRepository`: `commit` before the first request; `tree` on entering the phase and after each tree
  answer, with `done` the folders whose entries are in hand and `of` the folders known (the root, and every `tree` entry
  seen in any answer, the truncated first answer included); `manifests` with `done` of `of` root manifests read.
- The engine: `layCity(snapshot, state, options, onProgress?)` calls `onProgress({ placed, shaped, lots })`
  (`LayProgress`) once at the start and after each change: `lots` the lot seeds of every town it lays (known once their
  trees are built), `placed` the seeds laid so far (at each neighbourhood, and a whole cached folder at once), `shaped`
  the seeds of towns whose warp is done (a quarter of a town's seeds after each of its roads, blocks, lots, and
  districts with water; all at once unwarped). Its hooks (`LayHooks` in the town's `Ctx`) read nothing back, so the city
  is byte-identical with or without a listener; the Rust engine has no callback (parity compares bytes).
- `layStep` makes it a `lay` step, `done` = `placed + shaped` of `of` = `2 × lots`, `count` lots placed of lots. The
  worker posts `{ step }` at once on a phase change and at most every `POST_MS` 100 ms within a phase (`throttled`,
  flushed before the city), then the city (Laying and reading) or `{ error }`. Aborting the signal before the city is
  taken in terminates the worker and rejects with the signal's reason.
- Cancel: "Cancel" on the card, or Escape anywhere but in the search box or an open menu (a capturing `keydown` listener
  on `window` while the card shows, which stops the key there), calls `cancel()`: requests abort (the fetcher gets the
  signal), the worker ends, and the last city, the address and the selection stay. An `AbortError` is never shown as a
  failure.
- `LoadingCard` (`<section aria-label="Loading">`, `.glass.loading`, 360 px wide at most, in `.loading-place`: the free
  map as `insetsFor` reckons it, in CSS (top 100 px, 156 px from 1,100 px down; right 352 px unless the drawer is
  closed; on a phone top 140 px and bottom 64 px, or half the height with the sheet open), centred, `z-index` 10,
  beneath the search, menus and notices): "Opening {name}" (`<h2>`, with a turning `LoaderCircle`), the phase as text, a
  native `<progress>` (`value` the whole percentage of the bar, `max` 100, labelled by the phase, `aria-valuetext`
  "{phase}: {count}" or "{phase}: {n} %"), the count, "{spent} spent · {estimate}", and a "Cancel" button. The fill
  eases over 150 ms; where the phase has no total, a 30 % band sweeps over the bar in 1.4 s (`transform`, so it moves
  while the main thread is busy), held still under `prefers-reduced-motion: reduce`. The card announces nothing: the
  title card's status (`aria-live="polite"`) names the phase, so a phase change is heard once and a step is not.
- While the card shows the map is dimmed (`.viewer[data-loading="true"] .map`, opacity 0.45) and stays live; the card is
  the only thing added, floating, so nothing moves (CLS 0).
- Logs: `viewer/load-phase source name phase ms` (at `begin` and on each phase change, `ms` since `begin`),
  `viewer/load-cancelled source name phase ms why`, `viewer/load-done source name ms`; failures keep their own logs.

## Repository suggestions (`apps/web/src/github`)

- `ownerQuery(text)` (`suggest.ts`, pure): the text trimmed, a leading `https://`, `www.` and `github.com/` dropped;
  `{ owner, prefix }` when it is `owner/` followed by nothing or the start of a name (an owner of `[A-Za-z0-9-]{1,39}`,
  a prefix of at most 100 of `[A-Za-z0-9._-]`), or a GitHub URL that stops at the owner; else null.
- `GitHubRepository`: `{ name, description, stars, language, fork, archived }` (`description` and `language` may be
  null), read by `repositoriesOf` from GitHub's `name`, `description`, `stargazers_count`, `language`, `fork`,
  `archived`; an entry of another shape is left out.
- `rankRepositories(repos, prefix)` (pure): those whose name starts with the prefix (case-insensitively), then those
  that contain it, each group by stars (most first), then name (`compareKeys`); an empty prefix keeps them all.
- `createSuggester(fetcher, now)` (`owners.ts`), one per viewer, its cache living as long as the tab:
  - `ownerRepositories(owner)`: `GET /users/{owner}/repos?sort=pushed&per_page=100` (users and organisations alike),
    kept per owner (case-insensitively) for `OWNER_TTL_MS` 10 minutes, `cached(owner)` the kept answer; one request in
    flight per owner is shared; the answer is `{ repos, more }`, `more` when the `link` header has `rel="next"`.
  - `searchRepositories(owner, prefix)`:
    `GET /search/repositories?q={prefix} in:name user:{owner}&sort=stars&per_page=20`, kept per owner and prefix for the
    same ten minutes (`cachedSearch`); its allowance is the search API's, so the meter leaves it out.
  - Rejections (`CitymapError`, via `getJson`): 404 `github/not-found` with detail `owner`, kept like an answer;
    `github/rate-limited`, `github/failed` and `github/offline`, forgotten so they are asked again.
  - `suggestionFailure(failure, owner)`: "No GitHub user or organisation named {owner}", "GitHub's hourly limit is
    reached; it resets at 14:05", "GitHub could not be reached", "GitHub answered {status}".
- `useSuggestions(suggester, allowance, text)` (`useSuggestions.ts`): `idle` without an owner query; `asking` until the
  owner's answer; `failed` with its line; `ready` with the ranked repositories. The owner's list is asked `SUGGEST_MS`
  250 ms after the text rests (a kept answer at once, logged as cached), so typing a name costs one request per owner;
  while the allowance is `spent`, nothing is asked and the limit's line shows. For an owner with `more`, a non-empty
  prefix is also searched after the same rest; its finds join the list (by name, once), and a failed search is only
  logged. An answer for an owner or prefix the text has left is dropped.
- `SearchBox` takes `suggester` and `allowance`. A text whose owner is a folder of the city shown
  (`holdsFolder(index, owner)`, `search/search.ts`) is a path in the city: no suggester is used for it.
- The list (`.choices`): the city's matches in `<ul aria-label="Matches">` (at most `CITY_WITH_SUGGESTIONS` 3 while
  suggestions show), then a heading "On GitHub" (`<p class="group">`) and `<ul aria-labelledby>` it of the suggestions,
  then "Lay owner/name from GitHub" when the text names a repository that no suggestion is; seven choices in all
  (`MAX_HITS`). Without suggestions the list is as before. Each suggestion is a button: a `BookMarked` icon, "GitHub
  repository" (visually hidden), "{owner}/{name}" with the typed prefix marked, its description (one line,
  `text-overflow: ellipsis`, the whole text in the button's name), and a line of facts: "★ 12.3k" (compact, `en-GB`,
  read as "12.3k stars"), the language, "fork", "archived". Picking one calls `onRepository("owner/name")`. The arrow
  keys move through every button of both lists.
- The summary: the city's line when it has matches or nothing is asked of GitHub; then "Asking GitHub for {owner}'s
  repositories…", "{n} of {owner}'s repositories match" ("None of …"), or the failure's line; and " · {remaining} GitHub
  requests left this hour" once the allowance is known. The lay offer stays on a failure.
- Logs: `viewer/suggest owner repos more ms` (an answer from GitHub), `viewer/suggest-cached owner`,
  `viewer/suggest-search owner prefix repos`, `viewer/suggest-failed owner [prefix] reason`, `viewer/suggest-pick repo`.

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
  status (`aria-live="polite"`), 13 px on an 18 px line, wrapping (`overflow-wrap: anywhere`) and never cut: its box
  holds two lines from the first paint (`min-height: 36px`), so a status that wraps moves nothing. The card is 94 px
  tall on a desktop and 82 px on a phone.
- `SearchBox` (`<search>`, inside `.finder` with the local repository button hanging to its right; top centre, at most
  520 px and clear of the title card on both sides; from 1,100 px down, under the title card, as wide as the room left
  of the drawer less the button's 56 px, at most 440 px; on a phone, the full width under the title row, less 56 px on a
  fine pointer): an `<input type="search">` labelled "Search files and folders, or lay owner/name", over a summary
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
- `ViewControls` (top right): the view switch (`<fieldset class="glass segmented">`, legend "View": "Plan" and
  "Buildings", `aria-pressed`; "Buildings" pressed again returns to plan; on a phone only its icon shows); "Theme" (a
  popover `<fieldset>`, legend "Map theme", of radio inputs, one per theme); then "More" (a popover headed "Example
  cities": each bundled city as a button, "{name} {lots} lots", the current one `aria-current`, then "Open a city file…"
  behind a hidden `<input type="file">` labelled "City file", then the local repository group (opening the last folder
  again) of [local repositories](../../007-local-repositories/blueprints/local-repositories.md)). A popover
  (`Popover.tsx`: `aria-expanded`, `aria-controls`) closes on Escape and on a pick, both handing focus back to its
  button, and on focus or a press outside.
- `Drawer` (`<aside aria-label="Details">`; right, 320 px, from below the top row to 16 px above the bottom): "Selected"
  (the hit's card body, `CardBody`, as on the hover card, then its actions, below), then "Towns" (each town's name and
  lot count, the first `TOWNS_SHOWN` 7 by lots, then "Show all {n} towns" and "Show fewer towns"; each name a button,
  described as "Shows only this town", that shows only that town; while one town is shown its name is plain text). The
  empty state ("No city yet…") shows only when nothing is on its way (an empty status). A close button ("Hide details")
  collapses it to a "Details" button. Its state is `data-open`: `auto` until the person chooses (open on a wide screen,
  closed on a phone), then `true` or `false`. Below 760 px wide it is a bottom sheet, at most half the height.
- `ZoomControls` (a `<fieldset>`, legend "Zoom"; bottom right, beside the drawer, or at the right edge when it is
  closed): "Zoom in", "Zoom out", "Fit the city" (the keyboard's `+`, `-`, `0`).
- `Legend` (`<section aria-label="Legend">`, bottom left, 280 px): "Colour by" (a `Popover` opening above, its seven
  radios as the [buildings blueprint](../../008-buildings/blueprints/buildings.md) says), then the scale of the choice:
  for folder, swatches from the map theme in the cards' words (`LEGEND` in `card/words.ts`): "Lot: a file's land, tinted
  by folder; source stronger" (two tints of one district), "Park: land for a folder's documentation", and "Reserve plot:
  room to grow; empty lots too"; in the Buildings view, height and windows besides. Below 760 px wide it folds behind a
  "Legend" button (`aria-expanded`, bottom left), closed at first, and hides while the drawer's sheet is open.
- `Notice` (top centre, under the search box): an error as `role="alert"` with a "Dismiss" button; floating, so it moves
  nothing.
- Insets (`view/insets.ts`, `insetsFor(viewport, drawer)`): where the cards cover the map, from the stylesheet's sizes:
  top 118 px (174 px from 1,100 px down, where the search is under the title), right 352 px unless the drawer is closed;
  on a phone top 154 px and bottom 64 px (half the height while the sheet is open). `fit`, `onKey`'s `0` and `flyTo`
  take them: the zoom fits the free part, and `framed` pans so the free part's centre is the view's.
- Sizes: controls 48 px tall on `(pointer: coarse)`, 40 px otherwise (above the 32 px floor), 8 px apart; spacing from
  4, 8, 12, 16, 24, 32, 48 px. Layers (`z-index`): map 0, marker 1, labels 2, cards 10, the search, the controls'
  popovers and the hover card 20, notices 30. Transitions 150 ms, none under reduced motion.

## Layout toggles

- `ViewControls` gains the settings cog between Theme and More: a `Popover` labelled "Layout" (icon `Settings`), whose
  panel is `Toggles` (`components/Toggles.tsx`): a `<fieldset>`, legend "City layout", of four
  `<input type="checkbox" role="switch" aria-checked>` in `TOGGLES` order, each in a `<label>` with its name
  ("Corridor", "Archipelago", "Quarters", "Tiers"), drawn as a track and thumb, and a `role="tooltip"` element
  (`TOOLTIPS`, the spec's text word for word) that is its `aria-describedby`. The tooltip (`.tooltip` in the stylesheet)
  is 280 px wide, beside the panel to its left on a wide screen, and beneath its row inside the panel below 760 px.
- A tooltip shows while its row is hovered (the row holds the tooltip, so the pointer can rest on it) or its switch has
  focus, and hides when both end and on Escape: the first Escape while one shows hides it and is marked answered
  (`preventDefault`, as the page's React root may be the document the popover listens on); `Popover` skips an Escape
  already answered, so the next one closes it. A switch never closes the popover.
- The top right holds four controls (the view switch, Theme, Layout, More), 204 px of a touch screen's top row.
- `Viewer` holds `toggles` (`DEFAULT_TOGGLES` at start; not remembered) and the `origin` of the city shown (a bundled
  entry; a live repository's name, snapshot, status note and tab title, from GitHub or the person's machine; or a file).
  A change re-opens what is shown in the new variant as a load of its own, with the loading card and the status naming
  its phases (Loading): a bundled city loads `variantOf(entry, toggles)`; a live repository is laid again from its kept
  snapshot in the worker (`relay`, under the same title, so a local repository's stays private); a city file disables
  every switch and shows "A city file keeps the layout it was laid with."; with nothing shown the switches only change.
  A city shown again in another layout keeps the view and the town shown when it has a town of that key (`relaid`).
- `cities.ts`: `CityEntry { name, variants }`, each variant `{ toggles, file, lots }`; `isEntry` checks sixteen distinct
  variants whose toggles are known, files `^\w[\w.-]*/\w[\w.-]*\.json$` (no `..`); `variantOf(entry, toggles)` finds the
  variant with exactly those toggles, in any order; `loadCity(fetcher, entry, toggles, base)`. "More" lists each city
  with the lots of the variant the toggles name, the one shown marked by its name.
- Logs: `viewer/toggles on` (the list, `none` when empty) on every change; `viewer/variant-failed name reason` when a
  variant cannot load (also a notice; the last city stays).
- `scripts/bundle-cities.ts` lays every combination (`combinations()` in `scripts/bundle/bundle.ts`, the sixteen subsets
  of `TOGGLES` in binary order) of each public city in `BUNDLED` (a GitHub URL and a pinned commit), from a fresh clone
  without contents checked out at that commit (`cloneArgs`), with the Rust CLI
  (`rust/target/release/citymap <repo> --to=<commit> --toggles=<list> --out=…`, a full fold, no lock), into
  `public/cities/<name>/<variant>.json`, where `variantName(toggles)` joins the toggles with `-`, or is `none`; then
  writes the index. One line per lay: `bundle/laid name variant lots bytes gzip ms`; at the end
  `bundle/done cities variants bytes gzip`. The six cities' 96 variants take 93 MB (13.6 MB gzipped); a visitor loads
  one at a time. They are not committed: `.github/workflows/pages.yml` runs `bun run bundle` before `next build`, and
  `public/cities/` is ignored.

## Labels

- `Label` carries `extent`: the scene-unit width of the town's or district's bounding box (the smaller side).
- A label's width is its characters times its size times an advance: 0.62 em, plus its letter spacing (0.15 em for a
  town, 0.08 em for a district).
- `declutter` first sizes each town label: `town` (20 px) when its extent on screen is at least its width at that size
  times `LABEL_FIT`, else `district` (13 px) when that fits, else left out; the town label of the largest extent (the
  first such, on a tie) always stays at `town` size. It then keeps a label only when, in this order: it lies inside the
  viewport; a district or minor label's extent on screen is at least its width times `LABEL_FIT` 0.6; no label of the
  same text, compared without regard to case (`toLowerCase`), was kept within `REPEAT_PX` 240 px; it overlaps no label
  kept before.

## Hover cards (`apps/web/src/card`)

One description of a hit feeds the hover card and the drawer's selection, so both say the same.

- `describeHit(hit)` (`card/describe.ts`, pure) → `Card`: `{ kind, eyebrow, title, place, meaning, rows, target }`,
  where `kind` is one of `file`, `vacant`, `park`, `plaza`, `green`, `reserve`, `block`, `road`, `highway`, `folder`,
  `town` (it chooses the icon and is the card's `data-kind`); `eyebrow` names the kind above a name (null when the title
  is the kind); `place` is the list of names from the town down (`placeOf(town, root, folder)`: the town's name, then
  the folder's segments after the town's root); `meaning` is one sentence or null; `rows` are `{ label, value, note? }`;
  `target` is `{ path, type: "blob" | "tree" }` for a file, a folder or a town (its root), else null.
- No fact appears twice: a name in the title or the place line is never a row; a kind in the title is never an eyebrow.
  Per kind (all words live in `card/words.ts`):

  | kind      | eyebrow                         | title                | place                     | meaning                | rows                                                      |
  | --------- | ------------------------------- | -------------------- | ------------------------- | ---------------------- | --------------------------------------------------------- |
  | `file`    | `USE[use].name` ("Source file") | the file's name      | town › its folders        | `USE[use].meaning`     | "In this folder": `{n} lots`; "Address" (below)           |
  | `vacant`  | null                            | "Empty lot"          | town › the address folder | `VACANT`               | "Address"                                                 |
  | `park`    | null                            | "Park"               | town › its folder         | `BLOCK.park`           | none                                                      |
  | `plaza`   | null                            | "Plaza"              | town › its folder         | `BLOCK.plaza`          | none                                                      |
  | `green`   | null                            | "Green"              | town › its folder         | `BLOCK.green`          | none                                                      |
  | `reserve` | null                            | "Reserve plot"       | town › its folder         | `BLOCK.reserve`        | none                                                      |
  | `block`   | null                            | "Block"              | town › its folder         | `BLOCK.built`          | none                                                      |
  | `road`    | null                            | the class ("Avenue") | town                      | `ROAD[cls]`            | none                                                      |
  | `highway` | null                            | "Highway"            | none                      | `HIGHWAY`              | "Joins": "a and b" (one name when both ends are one town) |
  | `folder`  | "Folder"                        | the folder's name    | town › its parent folders | null                   | "Holds": `{lots} lots in {folders} folders`; "Layout"     |
  | `town`    | "Town", or "Old town"           | the town's name      | none                      | `FORM[form]` (+ `OLD`) | "Lots"; "Districts"                                       |

  Counts read "1 lot", "2 lots", "no folders" and use `en-GB` grouping. "Layout" is `FORM[form]` when the folder has a
  form, else absent.

- Words (`card/words.ts`), each meaning one sentence:
  - `USE` (name; meaning): source "Source file"; "Code the project is built from." config "Configuration file";
    "Settings that tools and builds read." assets "Asset file"; "An image, font, sound or other media." ci "Tooling
    file"; "A script or setting that builds, checks or ships the project." docs "Documentation file"; "Written
    documentation; most of it is drawn as parks." tests "Test file"; "A test. Tests are kept off the map unless asked
    for." examples "Example file"; "An example of how to use the project." fixtures "Test data file"; "Data for tests,
    kept off the map unless asked for." generated "Generated file"; "Made by a tool, not written by hand." vendored
    "Vendored file"; "Code copied in from another project."
  - `BLOCK`: park "Open land for this folder's documentation: each document gives its folder half a lot of park." plaza
    "A square where a long road changes direction, its roads turning round it." green "The open centre of a hamlet, a
    small settlement." reserve "Land kept free for this folder's future files." built "Land between streets, its lots
    back to back."
  - `VACANT`: "A file was deleted here. The lot stays empty so its neighbours never move, until the neighbourhood
    renews."
  - `ROAD`: lane "The smallest road, between blocks inside a neighbourhood." street "Runs between rows of blocks inside
    a neighbourhood." collector "Gathers the streets, between districts." avenue "A main road between large districts."
    boulevard "The main road through a city." highway "A road between towns."
  - `HIGHWAY`: "A road across open country between towns."
  - `TOWN_FORM` (a town's meaning): hamlet "A hamlet: a few blocks round a green." street-village "A street village:
    blocks along one high street." neighbourhood "A single neighbourhood: one grid of blocks." radial "A radial town:
    districts round a centre." twin "A twin town: two halves facing each other across a river." polycentric "A
    polycentric town: districts side by side between roads." corridor "A corridor: a road through a small edge quarter
    leads to the one folder that holds nearly everything." archipelago "An archipelago: each package an island, with
    canals and bridges between them." quarters "A town of quarters: many small folders gathered into tidy quarters of
    straight streets."
  - `LAYOUT` (a folder's "Layout" row): hamlet "A hamlet round a green"; street-village "A street village along a high
    street"; neighbourhood "One grid of blocks"; radial "Its folders round a centre"; twin "Two halves across a river";
    polycentric "Its folders side by side between roads"; corridor "A gateway through to the folder that holds nearly
    all of it"; archipelago "Its packages as islands between canals"; quarters "Its small folders gathered into
    quarters".
  - `OLD`: "Kept whole as it stood before its layout changed; the new town grows beside it."
- Address in words (`addressWords(address)`): the address `{folder}:{row}.{block}.{side}.{index}` reads "No. {index + 1}
  on {folder}" ("the top folder" when the folder is empty; `#lots` dropped), with the note "Block {row}.{block}, side
  {side + 1}; kept for life". An address that does not parse is shown as it is, without a note.
- `CardBody` (`components/CardBody.tsx`, classes `hit-*`) draws a card: a head (a 32 px icon chip, `aria-hidden`, one
  lucide icon per kind: file `FileCode`, vacant `SquareDashed`, park `Trees`, plaza `Square`, green `Sprout`, reserve
  `Fence`, block `LayoutGrid`, road `Route`, highway `Waypoints`, folder `Folder`, town `Building2`; then the eyebrow at
  12 px, the title at 15 px bold, and the place at 12 px, its names joined by " › "), then the meaning at 13 px, then
  the rows as a `<dl>` (label 12 px muted on the left, 88 px; value 13 px; a note under the value at 12 px muted). Every
  text wraps: `overflow-wrap: anywhere`, and a `<wbr>` after every slash and dot of a path or name, so long paths break
  after a slash first. Nothing is cut or hidden.
- `HoverCard` (`components/HoverCard.tsx`, `role="tooltip"`, `data-kind`): `CardBody`, then a hint at the foot: "Click
  to select", followed by what the selection offers ("; then show only this town, copy the path or open it on GitHub"):
  `hintFor(offersFor(hit, card, { focused, github }))`, where `offersFor` (`card/describe.ts`) offers the town unless
  one is shown alone or the hit has none (a highway), the path when the target's path is not empty, and GitHub when the
  city came from there and the hit has a target. `min-width` 280 px, `max-width` 360 px (never more than the map less 16
  px), width by its content; 12 px padding; 8 px between parts; radius 12 px; solid glass. Its words (the card, the hint
  and the map's size) key an inner component that measures itself once when they first show (`useLayoutEffect`,
  `offsetWidth`/`offsetHeight`; until then `FIRST_SIZE` 280 by 160 px) and is placed again before paint; it then follows
  the pointer at that size.
- `placeCard(pointer, size, map)` (`card/place.ts`, pure): right of and below the pointer by `CARD_GAP` 16 px; flipped
  to the left when it would cross the right edge less `CARD_MARGIN` 8 px, above when it would cross the bottom; then
  nudged inside the margins on both axes; then, if it covers the pointer (its box grown by `CARD_GAP` / 2), moved to
  whichever side of the pointer (left, right, above, below, in that order) holds it whole, keeping the nudged other
  coordinate. A card larger than the map lies at the top left margin.
- The selection's actions (`components/Actions.tsx`, in the drawer under `CardBody`): "Show only this town" (when a town
  is not already shown alone); "Copy path" when the target's path is not empty (`navigator.clipboard.writeText`; the
  button reads "Copied" for `COPIED_MS` 1,500 ms and keeps its width; a failure shows the notice "The path could not be
  copied"); "Open on GitHub" when the city came from GitHub and has a target: a link
  (`target="_blank" rel="noopener noreferrer"`) to `https://github.com/{owner}/{name}/{blob|tree}/{commit}/{path}`, each
  path segment URI-encoded, the town's root (`tree/{commit}`) when the path is empty.
- A city came from GitHub when the viewer's `origin` is live via GitHub: its name ("owner/name") and the city's commit
  make the drawer's `github` (`card/github.ts`, `GitHubSource`), and `githubUrl(github, target)` makes the link.
- Logs: `viewer/copy-path kind`, `viewer/copy-failed reason`, `viewer/github-open kind`.

## Observability

- `src/log.ts` writes one line per decision point or failure, fingerprinted by its first token: `viewer/index cities`,
  `viewer/open name towns lots`, `viewer/town key`, `viewer/city`, `viewer/search length hits` (when a query settles),
  `viewer/search-pick kind path`, `viewer/search-index entries slices ms` (when the search index is built),
  `viewer/worker job ms` (when the city's worker has opened the city: `lay` or `read`, ms since it was asked),
  `viewer/city-pieces pieces chars ms` (the city taken in), `viewer/city-ask ask theme by first` (a look or a table
  asked of the city's worker), `viewer/city-scene theme town ms` and `viewer/city-table theme by ms` (an answer heard,
  ms since the ask that made it; `town` empty for the whole city), `viewer/city-worker-ended why` (`replaced`,
  `cancelled`, `left`), `viewer/town-scene-here key ms` (a town drawn before its worker made it), `viewer/drawer open`,
  `viewer/copy-path kind`, `viewer/github-open kind`, the loading and suggestion events above (to `console.info`);
  `viewer/index-failed reason`, `viewer/open-failed name reason`, `viewer/file-rejected file reason`,
  `viewer/suggest-failed owner reason`, `viewer/copy-failed reason`, `viewer/city-task-failed task reason` (a task the
  city's worker could not make) and `viewer/city-worker-failed reason` (the city's worker gone; the calling thread takes
  over) (to `console.error`). A reason is the engine's code (`city/bad-json`) or the error's text. Every failure also
  reaches the person as `role="alert"` text.

## Constants

Every tuning number is named where it is used and listed in `DEFAULTS.md`: `PAN_SHARE`, `KEY_ZOOM`, `FIT_SHARE`,
`LABEL_FIT`, `REPEAT_PX` (in `view/view.ts`), `FLY_SHARE`, `FLY_MIN_EXTENT`, `FLY_MS` (in `view/fly.ts`), `NARROW`,
`MEDIUM` and the card sizes (in `view/insets.ts`), `CLICK_SLOP`, `WHEEL_ZOOM` (in `MapView.tsx`), `CARD_GAP`,
`CARD_MARGIN` (in `card/place.ts`), `COPIED_MS` (in `Actions.tsx`), `FIRST_SIZE` (in `HoverCard.tsx`), `MIN_QUERY`,
`MAX_HITS` (in `search/search.ts`), `SETTLE_MS` and `CITY_WITH_SUGGESTIONS` (in `SearchBox.tsx`), `SUGGEST_MS` (in
`github/useSuggestions.ts`), `IN_FLIGHT` (in `github/read.ts`), `FILE_CHUNK` (in `cities.ts`), `FRAME_WAIT_MS` (in
`load/paint.ts`), `TOWNS_SHOWN` (in `Drawer.tsx`), `PHASE_WEIGHTS`, `ESTIMATE_FROM` and `STEADY_MS` (in
`load/progress.ts`), `SHOW_AFTER_MS`, `HOLD_MS` and `TICK_MS` (in `load/useLoading.ts`), `POST_MS` (in `lay/worker.ts`),
`PIECE_BYTES` (in `lay/pieces.ts`), `THEMES_KEPT` (in `lay/atlas.ts`), `LAYER_MARGIN` (in `CityMeshes.tsx`), `SLICE_MS`
(in `search/slices.ts`), `CELL` (in `packages/scene/src/pick.ts`), `OWNER_TTL_MS` (in `github/owners.ts`), the tooltip's
width (`.tooltip` in the stylesheet), `LOT_HEIGHT` (in `packages/scene`), `ELEVATION` and `YAW` (in `view/view.ts`),
`RAY_STEP` (in `view/hover.ts`).

## Web experience

- LCP: text of a card paints first (on a phone, the search's placeholder, drawn inside the field, so it names no
  element), about 40 ms on loopback; a town label may follow (about 100 to 170 ms). Budget: the last largest paint under
  2.5 s.
- CLS 0: every card floats (`position: absolute`) with a fixed width; the status holds two lines from the first paint; a
  notice floats over the map; the hover card floats over everything and moves nothing; the empty state waits until
  nothing is on its way; the font comes with a size-matched fallback; so a longer name, status or error never moves
  anything. Shifts after input (a breadcrumb appearing) are the person's own and do not count.
- The app is built with the React Compiler (`reactCompiler: true`, `babel-plugin-react-compiler`), so moving the map
  re-renders what the view feeds and not the other cards. Against the bar-and-panel viewer, under the same machine load
  at a fourfold slowdown, a key press on livediagram answers in a median 48 ms (was 40 ms), p90 64 ms (was 64 ms). Unit
  tests render uncompiled; the end-to-end suite proves the compiled build. Nothing the compiler memoises reads a
  property of a value that may be null during render: the search's context (`finder`) carries the scene's bounds, the
  pick index and the search index, present only once all three are.
- INP under 200 ms on a phone: the view while fitted is derived from the scene (`fit(scene.bounds, viewport, insets)`),
  never built twice; the whole city's scene and pick index stay built while one town is shown, so going back costs
  nothing. Measured on a Pixel 7 profile with the processor slowed to a phone four times slower than the reference
  workstation (`e2e/phone.ts`: a fixed piece of work is timed on the machine at hand, its median against `REFERENCE_MS`
  43 ms sets the CDP `Emulation.setCPUThrottlingRate`, never below 1, and is reported with the test), so a CI runner and
  the workstation stand in for the same phone. Where Chromium draws in software on fewer than `SOFTWARE_DRAWING_CORES` 8
  cores (a CI runner: no GPU, 4 cores), drawing cannot stand for a phone's GPU, so `cannotTimeAPhone` skips this budget
  there with its reason; it gates in the local run before every merge. A machine busier than the phone it stands for
  cannot time it either: where the work takes more than `BUSY_SHARE` 1.3 times `REFERENCE_MS` (above 56 ms),
  `tooBusyForAPhone(workMs)` (pure, unit-tested in `e2e/phone.test.ts`) names why, and `slowToPhone` skips the test with
  that reason (`e2e/phone work rate busy`, then `e2e/phone-skipped reason`), so a run on a loaded workstation is
  skipped, not failed, and a CI runner (about 100 ms of work) skips every slowed-phone budget. Each budget test
  therefore either passes on a machine that stands for the phone or says why it was not timed. Measured over taps, keys,
  a theme change, a search and a drill. A theme change is a transition (`startTransition`): the menu closes in the next
  frame, and the city's worker makes the scenes in the new colours meanwhile; a drill draws the town's scene made ahead,
  and the whole city again its kept scene and table, so neither builds a scene or a table on the main thread.
- Every map frame in a headless Chromium reads the WebGL canvas back on the main thread while committing
  (`GLES2::ReadPixels`, 20 to 30 ms on the slowed phone at a device pixel ratio of 2), as it composites in software; a
  phone does not. It is part of every step that redraws the map (Details and Hide details refit it), so a step redraws
  once.
- The buildings' material (`Buildings` in `CityMeshes.tsx`) is made once per mesh and kept: one `uniforms` object for
  its life, the lot table (its `DataTexture`), the view (`uBuildings`), the theme's unknown windows and the fog set as
  its values through react-three-fiber's props (`uniforms-uTable-value` and so on). A new material for each would
  dispose the old one first, so three.js would delete the program and link another, which the browser compiles inside
  the next frame (40 to 50 ms of drawing against 17 ms on the slowed phone). Traced after: no program is linked on a
  switch of view, a colour, a drill or going back.
- Opening anything: the city's worker reads or lays the city, makes its first look (a lot table and the whole city's
  scene), its pick grid, floors and roofs, and hands their buffers over; the city crosses in pieces, each received and
  parsed in a task of its own; the main thread attaches the grid, draws, and builds the search index in slices. The
  card's sweep runs on the compositor meanwhile. The loading card shifts nothing and its Cancel answers within the
  budget (`vitals.spec.ts`). On the slowed phone (medians of three runs, alternating with the viewer before the city's
  worker, under heavy machine load): livediagram's longest task 50 ms (was 79 ms), its Quarters layout 55 ms (was 64
  ms), linux from a city file 438 ms (was 962 ms), linux from GitHub 519 ms (was 883 ms). What remains for linux is its
  first frame (uploading about 1.5 million vertices and, headless, reading the drawn canvas back) and handing its 43 MB
  text to the worker (about 100 ms).
- The phone budget (`vitals.spec.ts`), alternating with the viewer before the city's worker, run by run, under heavy
  machine load (calibration work 45 to 236 ms against the reference 43): 17, 16, 18, 16, 16 and 14 of 20 passed, against
  11, 12, 10, 15, 10 and 12; slowest answer medians 128 to 168 ms against 176 to 200 ms. Runs whose calibration work
  stayed under 50 ms passed 25 of 26 (main 19 of 21); the misses came with a machine slower than the phone, where
  drawing in software on contended cores is not slowed in step with the main thread, mostly on Details, a drill or the
  breadcrumb.
- `e2e/vitals-opening.spec.ts` (the vitals projects; phone only, and only where a phone can be timed) records `longtask`
  entries before the page's scripts run and reports, per opening, the longest main-thread task and the blocking time
  (the time beyond 50 ms of every task) on the slowed phone: livediagram from More, then its Quarters layout, asserted
  under 200 ms each; linux from a city file and from GitHub (a tree answered from the city file's paths), reported, when
  `CITYMAP_LINUX_CITY` names linux's city.
- `e2e/vitals.spec.ts` runs in its own projects (`vitals-desktop`, `vitals-phone`) once the journeys are done, so no
  other test draws at the same time; it reports the slowest interaction as an annotation. It records
  `largest-contentful-paint`, `layout-shift` and `event` entries (from 16 ms) through `PerformanceObserver` before the
  page's scripts run, and asserts the three budgets. The phone journey ends in the Buildings view, coloured by size.
- `e2e/vitals-linux.spec.ts` (the same projects) opens linux's city from a file the CLI laid (`CITYMAP_LINUX_CITY`;
  skipped without one, as it is too large to bundle), stands its buildings, taps, zooms, pans and recolours on the
  slowed phone, and asserts every answer under 200 ms; it writes the switch's time, the slowest answer and the heap to
  `linux.json`. It asks for the machine's own graphics (`--use-angle=gl-egl`): a phone draws on its graphics processor,
  while a headless browser's software drawing (SwiftShader) times the processor instead (linux's plan view alone takes
  about 290 ms a frame there, against 24 ms on an integrated GPU).

## Tests

- `packages/scene`: unit tests for triangulation, ribbons, buildings, the lot table, colour by, layers and labels
  (Vitest, Node). Picking: the hit rules through `pickIndex`; the flat form (`pickGrid` after a structured clone,
  attached with `pickFrom`, answers as `pickIndex` does at every point of a fine raster over a city of several towns and
  highways; its buffers are listed once each); `onlyTown` answers as `pickIndex(focusOn(city, key))` at every point.
- `lay/`: `readHere` reads a city file, builds its scene and pick index, and rejects a bad file with the file's code; a
  worker's failure is rebuilt with its code and detail; `cityOfPieces(cityPieces(file))` equals the file parsed whole,
  keys in the same order, for a city of many towns and a piece size that splits towns and measures, and stops when
  aborted; the queue's order (tables first, a newer look dropping an older look's scenes, no task twice); the here port
  answers a look as table, whole city, the town first, then the others largest first, a one-town city's town as the
  whole's (`buildScene(focusOn(city, key))` equals `buildScene(city)` for it), holds answers until heard, and hears
  nothing once ended; `placeTable(table, span)` equals the town's own `tableFor`; the atlas's look falls back to the
  newest complete theme and the newest table of its theme, and keeps at most `THEMES_KEPT` themes; `cityRoofs` and
  `roofsNear` name each building at its top, for the whole city and a town alone.
- `components/ViewerWorker.test.tsx`, through a port that holds the work's answers until released: a drill draws the
  town made ahead and builds nothing; a drill before it is made shows at once, built here; a theme or a colour keeps the
  map's colours until its answers arrive, the menu showing the choice, and asks for the town shown first; a city's
  worker ends when another city replaces it, when an opening ends before its city shows, and when the viewer goes.
- `packages/scene`: `lotRefs(city)` equals `buildScene(city).buildings.order`; `buildingSpans` cut it into each town's
  `focusOn` order; `buildingAt` answers the `building` of `pick`'s lot at every point of a raster (elsewhere −1), for
  the whole city and for a town alone; `hitAt` in the Buildings view answers as before.
- `search/`: `searchIndexInSlices` equals `searchIndex`, yields between slices of at most `SLICE_MS`, and stops when
  aborted.
- `apps/web`: component tests in jsdom for every card, search, flight, file errors and keyboard handling (the canvas is
  replaced by a stub there; fixtures in `components/testing/`); Playwright end-to-end on a desktop and a phone, in dark
  mode with one light run: loads, switches city and theme, searches and flies, opens a file, shows an error for a bad
  file, reaches every control by keyboard, keeps every card clear of the others at widths from 1,400 to 360 px, and
  passes axe (WCAG 2.2 AA rules) with no violations, with the menus, the matches, the layout toggles (a tooltip shown)
  and the drawer open, in light and dark; switches a toggle by keyboard and sees the variant load; a screenshot per
  theme for review. Hover cards: a long path near each of the map's four edges and corners lies wholly inside the map,
  clear of the pointer, with no text clipped (every text element's `scrollWidth` within its `clientWidth`); axe passes
  with a hover card shown. `e2e/github.spec.ts` holds the GitHub journeys, every API call answered from fixtures
  (anything unanswered is a 404, so nothing reaches the real GitHub).
- `card/`: unit tests for every kind's card (including a park in a folder named "Documentation", whose name appears
  once), the address in words, counts, and placement at every edge and corner, for a card larger than the map, and never
  over the pointer.
- Loading and suggestions: the progress model, the meter, the suggester and the ranking in Node with a stubbed clock and
  fetcher; the card's thresholds with fake timers; cancel by button and by Escape, keeping the last city; the engine's
  progress against the same lay without it (equal output, `placed` and `shaped` reaching `lots`). End-to-end, GitHub
  answered from fixtures: a truncated tree read folder by folder shows the card with a count, Cancel keeps the last
  city; an owner's suggestions, picked by keyboard; an unknown owner and the limit reached; axe with the card and the
  suggestions open, light and dark; the vitals with the card shown.
