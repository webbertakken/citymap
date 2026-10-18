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
- Counts are made once, while indexing: live lots per folder, then summed into every ancestor up to the town's root;
  folders below each labelled district from the set of folders on the way from each lot's folder up to it. A highway's
  towns are those whose outline lies nearest each end (distance to the outline's edges, 0 inside).
- Budget: next.js (about 8,000 lots) indexes in under 50 ms, linux (about 75,000 lots) in under 500 ms; a query answers
  in under 1 ms.

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
  `View` is `{ centre, zoom }`; `project`, `pan`, `fit`, `framed`, `onKey`, `declutter` and `unproject` take the mode,
  plan by default, so switching keeps the centre and the zoom. Zoom fits the bounds' four corners on load and on `0`.
- Hover: `hitAt(index, view, viewport, pointer, mode, heights)` picks the ground in plan view (a lot's top lies over its
  footprint); in the Buildings view it walks the view ray down from the tallest top in steps of `RAY_STEP` 0.1 u and
  answers the first lot whose building reaches that height, else the ground. The hover card is described under Hover
  cards. Click selects; the drawer's "Selected" section (`aria-live="polite"`) shows the same details. Escape clears
  both. The selection's place carries a marker (a ring, `aria-hidden`) over the map.
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
- Laying (`lay/`): `Lay = (snapshot, { signal, onProgress, theme, toggles }) => Promise<Laid>`,
  `Laid = { city, scene }`. `layHere` lays on the calling thread,
  `layCity(snapshot, initialState(options), options, onProgress)` with the CLI's default options and the chosen toggles
  (`liveOptions(toggles)`, the engine's defaults when none are given), and, given a `theme`, posts a `draw` step and
  builds the scene there too (`scene: { theme, scene }`, else null). `layInWorker` (the default; `layHere` in tests)
  runs it in a module Web Worker (`lay/worker.ts`) sent `{ snapshot, theme, toggles }`; the scene's buffers come back
  transferred (`buffersOf`), not copied. See Loading for the progress it posts and how it ends.
- `Viewer` keeps the worker's scene (`drawn`: the city, the theme, the scene) and uses it while that city is shown in
  that theme; any other city or theme builds its scene on the main thread as before.
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
  It holds `progress` (null when idle), `shown`, and `now`: the card shows `SHOW_AFTER_MS` 300 ms after `begin` if still
  loading, and once shown stays at least `HOLD_MS` 400 ms (the bar full meanwhile); a load done before 300 ms shows
  nothing; a failure removes it at once. A clock ticks every `TICK_MS` 250 ms while the card shows. A job's reports
  after it ended change nothing; leaving the page aborts the load in flight.
- The viewer's loads report through it: the index's first city and More
  (`loadCity(fetcher, entry, base, { signal, onStep })`: the body read as a stream, `content-length` the total unless
  `content-encoding` is set, then `parseCity`), a city file (`readCityFile(file, { signal, onStep })`, read in
  `FILE_CHUNK` 1 MB slices, `file.size` the total), and a GitHub repository (`readRepository`, then the worker). Before
  parsing and before showing the city, `afterPaint()` (`load/paint.ts`) waits for a frame, or `FRAME_WAIT_MS` 100 ms in
  a hidden tab, so the phase is seen before the main thread is busy.
- `draw` (`Viewer`'s `draw(job, city, name, file, scene)`): the phase is said, a frame passes, the city is shown (and
  More's current city set), a frame passes, and the job is done.
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
  flushed before the city), then `{ city, scene }` or `{ error }`. Aborting the signal terminates the worker and rejects
  with the signal's reason.
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
- `ViewControls` (top right): the view switch (`<fieldset class="glass segmented">`, legend "View": "Plan" and
  "Buildings", `aria-pressed`; "Buildings" pressed again returns to plan; on a phone only its icon shows); "Theme" (a
  popover `<fieldset>`, legend "Map theme", of radio inputs, one per theme); then "More" (a popover headed "Example
  cities": each bundled city as a button, "{name} {lots} lots", the current one `aria-current`, then "Open a city file…"
  behind a hidden `<input type="file">` labelled "City file", then the local repository group of
  [local repositories](../../007-local-repositories/blueprints/local-repositories.md)). A popover (`Popover.tsx`:
  `aria-expanded`, `aria-controls`) closes on Escape and on a pick, both handing focus back to its button, and on focus
  or a press outside.
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
  `viewer/search-pick kind path`, `viewer/drawer open`, `viewer/copy-path kind`, `viewer/github-open kind`, the loading
  and suggestion events above (to `console.info`); `viewer/index-failed reason`, `viewer/open-failed name reason`,
  `viewer/file-rejected file reason`, `viewer/suggest-failed owner reason`, `viewer/copy-failed reason` (to
  `console.error`). A reason is the engine's code (`city/bad-json`) or the error's text. Every failure also reaches the
  person as `role="alert"` text.

## Constants

Every tuning number is named where it is used and listed in `DEFAULTS.md`: `PAN_SHARE`, `KEY_ZOOM`, `FIT_SHARE`,
`LABEL_FIT`, `REPEAT_PX` (in `view/view.ts`), `FLY_SHARE`, `FLY_MIN_EXTENT`, `FLY_MS` (in `view/fly.ts`), `NARROW`,
`MEDIUM` and the card sizes (in `view/insets.ts`), `CLICK_SLOP`, `WHEEL_ZOOM` (in `MapView.tsx`), `CARD_GAP`,
`CARD_MARGIN` (in `card/place.ts`), `COPIED_MS` (in `Actions.tsx`), `FIRST_SIZE` (in `HoverCard.tsx`), `MIN_QUERY`,
`MAX_HITS` (in `search/search.ts`), `SETTLE_MS` and `CITY_WITH_SUGGESTIONS` (in `SearchBox.tsx`), `SUGGEST_MS` (in
`github/useSuggestions.ts`), `IN_FLIGHT` (in `github/read.ts`), `FILE_CHUNK` (in `cities.ts`), `FRAME_WAIT_MS` (in
`load/paint.ts`), `TOWNS_SHOWN` (in `Drawer.tsx`), `PHASE_WEIGHTS`, `ESTIMATE_FROM` and `STEADY_MS` (in
`load/progress.ts`), `SHOW_AFTER_MS`, `HOLD_MS` and `TICK_MS` (in `load/useLoading.ts`), `POST_MS` (in `lay/worker.ts`),
`OWNER_TTL_MS` (in `github/owners.ts`), the tooltip's width (`.tooltip` in the stylesheet), `LOT_HEIGHT` (in
`packages/scene`), `ELEVATION` and `YAW` (in `view/view.ts`), `RAY_STEP` (in `view/hover.ts`).

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
  property of a value that may be null during render: the search's context (`finder`) carries the scene's bounds and the
  pick index, built only once the city is.
- INP under 200 ms on a phone: the view while fitted is derived from the scene (`fit(scene.bounds, viewport, insets)`),
  never built twice; the whole city's scene and pick index stay built while one town is shown, so going back costs
  nothing. Measured on a Pixel 7 profile with the processor slowed to a phone four times slower than the reference
  workstation (`e2e/phone.ts`: a fixed piece of work is timed on the machine at hand, its median against `REFERENCE_MS`
  45 ms sets the CDP `Emulation.setCPUThrottlingRate`, never below 1, and is reported with the test), so a CI runner and
  the workstation stand in for the same phone. Where Chromium draws in software on fewer than `SOFTWARE_DRAWING_CORES` 8
  cores (a CI runner: no GPU, 4 cores), drawing cannot stand for a phone's GPU, so `cannotTimeAPhone` skips this budget
  there with its reason; it gates in the local run before every merge. Measured over taps, keys, a theme change, a
  search and a drill. A theme change is a transition (`startTransition`): the menu closes in the next frame and the
  scene is rebuilt in its new colours after it, so the tap answers within the budget.
- Laying a large repository: the worker lays and builds the scene, so on that phone profile linux's longest main-thread
  task fell from 2.25 s to 0.83 s, most of it the pick index (which appends to its cells rather than copying them: about
  100 ms for linux on a desktop) and the search index 0.09 s (both still on the main thread, after the card says
  "Drawing the map"; the card's sweep runs on the compositor meanwhile). The loading card shifts nothing and its Cancel
  answers within the budget (`vitals.spec.ts`).
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
  (Vitest, Node).
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
