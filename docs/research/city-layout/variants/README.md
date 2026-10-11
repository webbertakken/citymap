# Decision variants on real repositories

Follow the references below only as needed; never upfront.

The owner's answers to the [synthesis](../synthesis.md) decisions, rendered side by side on the example repositories,
so each fork can be judged by eye and by number. Every sheet varies one decision and holds the rest at the chosen
baseline: first-seen order, lines of code (weighted) for lot size, courts on, workspaces as islands, Paper atlas, plan
view.

This is a topology-only prototype. It has no organic layer, no archetype frame beyond workspace islands, and no
persistent plat (frozen sides, reserved slack). Read the sheets for what each decision does, not for how the city
will finally look. The street-tree sheets are superseded by the neighbourhood prototype below.

## Neighbourhood prototype (current)

**STATE A** is git tag `state-a`: this prototype as the owner approved it, the reference look for later work. Check
it out to compare.

The street-tree sheets looked like fishbones, not cities. The current prototype follows the procedural-generation
report's backbone instead, with rules of our own:

- **Land**: tests and fixtures get no land; docs become parks; everything else takes shared lots (`round(1 / weight)`
  files per lot).
- **Towns**: the main town holds the repository; every workspace group (a folder with two or more members, mostly
  source, such as `packages/`) becomes its own town, sized by its land and joined by a highway.
- **Cuts are streets**: a town's outline is cut recursively between its folders in first-seen order, arranged
  centre-out so the oldest code sits in the middle. A cut takes the class of the land it separates (city: boulevard,
  town: avenue, village: collector), so a town has at most one boulevard and local streets dominate.
- **Neighbourhoods**: folders under nine blocks of land flatten into one neighbourhood with its own block grid
  (6 u by 12 u), aligned to its main frontage; lots sit back to back, their lot class (up to 4) set once so they fill the blocks they need;
  spare blocks are dashed reserve plots.
- **Wards**: land between collectors or bigger roads takes its own tint and the name of its heaviest folder.
- **Organic layer**: one smooth, seeded warp scaled to the town bends every road and block.
- **Density**: a setting; it sets land per lot, so it acts as grain (suburban big plots to dense narrow plots).
- **Land dimension**: `Options.noLand` lists the land uses that take no land; tests and fixtures by default, fixtures
  only for tests as land. Tests as land roughly doubles next.js (8,032 to 19,367 lots).
- **Highways** continue a road: they join road ends of the highest class both towns offer at their edges, take that
  class and are drawn like any road.
- **Themes**: `render-town.ts` takes a theme, Paper atlas or Dracula.

Sheets: `img/towns-towns-<repo>.webp` (plan), `img/towns-density-<repo>.webp` (35, 50, 65% at one scale),
`img/towns-hero-<repo>.webp` (2:1 dimetric), `img/towns-land-<repo>.webp` (tests off the map against tests as land),
`img/towns-themes-<repo>.webp` (Paper atlas against Dracula). Generate with `bun towns.ts all`.

| Repo           | Lots   | Lot coverage of land | Local street share | Long straight roads | Lots without room |
| -------------- | ------ | -------------------- | ------------------ | ------------------- | ----------------- |
| takken.io      | 244    | 22.1%                | 88%                | 9                   | 0                 |
| react          | 2,018  | 35.5%                | 75%                | 7                   | 6                 |
| redux          | 92     | 13.2%                | 80%                | 5                   | 0                 |
| next.js        | 8,024  | 36.5%                | 80%                | 26                  | 16                |
| game-ci-cli    | 702    | 26%                  | 80%                | 7                   | 0                 |
| livediagram    | 4,122  | 36.9%                | 72%                | 11                  | 9                 |
| studio-worker  | 101    | 26.1%                | 100%               | 3                   | 0                 |
| home-assistant | 13,193 | 43.7%                | 80%                | 3                   | 13                |
| typescript     | 929    | 37.6%                | 80%                | 8                   | 1                 |
| rust           | 6,243  | 29%                  | 71%                | 5                   | 17                |

"Long straight roads" counts roads longer than 45% of their town's diameter that stay within 0.5% of a straight line.
Small towns still have too many: the warp bends less than a cut is long, and every cut runs wall to wall.

### Plat

The plat (`TownPlat` in `town.ts`, `RegionPlat` in `region.ts`) remembers cuts (line, class, sides, a band of 1.35
times each side's demand), neighbourhood grids (origin, angle, pitch, lot class, park line, a slot per lot), shared lot
membership, and each town's outline area and centre. A fresh plat per call is a snapshot layout; one plat passed through
every commit folds history. A first lay draws STATE A's design: seeds and tints use the keys without their separators.

Stability, share of surviving lots that moved more than 2 units, per first-parent commit, lots keyed by identity
(exact renames followed). `LAYOUT=towns bun history.ts <repo> steps:<date>:<count>`:

| Repo, window                             | Afresh, per commit | Plat, per commit | Afresh, deleting commits | Plat, deleting commits |
| ---------------------------------------- | ------------------ | ---------------- | ------------------------ | ---------------------- |
| react, 1,200 commits from 2017-06        | 3.3%               | 0.1%             | 29.6%                    | 1.2%                   |
| takken.io, whole history (239)           | 25%                | 1%               | 80.3%                    | 4.7%                   |
| next.js, 300 commits from 2025-01        | 0.9%               | 0%               | 6.1%                     | 0.1%                   |
| home-assistant, 300 commits from 2025-01 | 1.1%               | 0%               | 26.7%                    | 0.1%                   |
| redux, 600 commits from 2015-06          | 4.8%               | 0.5%             | 60.9%                    | 16.3%                  |

`img/towns-plat-takken.io.webp` films takken.io's whole history at yearly frames, laid afresh (top) against the plat
(bottom), lots moved since the previous frame in red: `LAYOUT=towns bun history.ts takken.io film 2021-06-01 ... head`.

What still moves:

- **Cuts outgrowing their band.** Every cut that moved sits in the top two folder levels: 19 in takken.io's 239
  commits, 5 in React's 1,200. The owner chose to let them move with the band rather than freeze them.
- **Unflattening.** takken.io began as one neighbourhood and re-laid once (2024) when it outgrew the flatten band: an
  archetype switch, which the old-town island rule will keep. Cutting the root from day one instead moved more (1.7%
  per commit, 12.6% on deletions), as tiny districts kept outgrowing their bands.
- **Renewal.** A neighbourhood more than half vacant re-lays its lots in order; redux's deleting commits are mostly this.

### Jogging cuts

A long cut (at least 30% of the town's diameter) with two or more items on each side becomes a pinwheel (by default only
the cuts between a town's top-level folders, `jog: "top-level"`; `"all"` jogs every long cut): both sides
split square to it, and where those cross cuts fall at least 2 u apart, the long cut steps 3 u sideways between them.
Four roads end in T-junctions round a plaza; every piece stays convex. `Options.jog` (`off`, `top-level`, `all`) sets it; the plat remembers
it through the same cut records. `img/towns-jog-<repo>.webp` sets straight cuts (STATE A), top-level jogs and every long cut jogging side by side.
Top-level only keeps STATE A's straight streets inside districts and breaks only the cross-town roads.

| Repo           | Long straight roads, straight | Top-level jogs | Every long cut jogs | Lots without room (straight, top-level, all) |
| -------------- | ----------------------------- | -------------- | ------------------- | -------------------------------------------- |
| next.js        | 24                            | 26             | 24                  | 8, 16, 18                                    |
| react          | 10                            | 7              | 7                   | 5, 6, 5                                      |
| home-assistant | 2                             | 3              | 5                   | 8, 13, 11                                    |
| takken.io      | 9                             | 9              | 9                   | 0, 0, 0                                      |

- The count barely moves: a pinwheel road still runs from the town edge to just past the middle (about 55% of a
  top-level cut), so one long road becomes two half roads that both pass the 45% threshold.
- Cuts with a single item on one side (one heavy folder against the rest) cannot pinwheel and stay straight.
- Forcing the cross cuts square rearranges the districts: jogging changes STATE A's layout as well as its roads.
- Stability holds with top-level jogs: React 0.1% per commit and 1.3% on deleting commits; takken.io 1.2% and
  5.9%; redux 0.5% and 16.3%.
- Lots without room rise slightly: the plaza and the step take land from pieces sized without them.

### Archetypes and old towns

`archetype.ts` classifies each folder with hysteresis (spec: Archetypes). Flattened folders become a hamlet round
a green, a street village along a high street, or a plain neighbourhood; larger folders arrange their children as
radial (ring road, spokes, convex sectors), twin (two banks of a river, one or two bridges) or polycentric (the recursive cuts). `img/towns-forms-<repo>.webp` shows each map beside the
same map coloured by form: radial orange, twin blue, polycentric rose.

| Repo           | Lots   | Coverage | Local streets | Long straight roads | Without room |
| -------------- | ------ | -------- | ------------- | ------------------- | ------------ |
| takken.io      | 244    | 22.1%    | 88%           | 9                   | 0            |
| react          | 2,019  | 32.9%    | 65%           | 6                   | 5            |
| next.js        | 8,011  | 35.3%    | 79%           | 18                  | 29           |
| home-assistant | 13,193 | 43.7%    | 79%           | 3                   | 13           |
| rust           | 6,209  | 28.2%    | 64%           | 5                   | 51           |

- Roots: react radial; next.js a twin; home-assistant radial; takken.io, redux and rust polycentric.
- A gridiron was tried and dropped (commit 463b52a, `img/towns-gridiron-<repo>.webp`): rows of single folders,
  staggered rows and superblocks of 12 folders against recursive cuts. Rows turned home-assistant into stripes, 38
  long straight roads against 3; recursive cuts read best on every repo and leave the fewest lots without room.
- A town whose root switches form is frozen as an old town where it stood, dashed, its lots lit while their files
  live; the new town grows beside it (`img/towns-plat-takken.io.webp`: takken.io in 2024).
- The root's form is classified over the whole repository, so a young new town keeps it: one old town, not four.
- Stability holds: React 0.2% per commit and 2.8% on deleting commits; takken.io 0.7% and 4.7%; next.js 0% and
  0.1%; home-assistant 0% and 0.1%; redux 0.5% and 13.1%.

## Sheets

- `img/area-<repo>.webp` - when judging lot size: file count, lines, bytes, shared lots; top row whole city, bottom a district
- `img/courts-<repo>.webp` - when judging whether small leaf folders get their own street
- `img/order-<repo>.webp` - when judging sibling order: first-seen, alphabetical, path hash
- `img/edges-<repo>.webp` - when judging meaningful against aesthetic edges
- `img/style-<repo>.webp` - when judging Paper atlas, Beck schematic and Nolli noir
- `img/camera-<repo>.webp` - when judging plan, 2:1 dimetric and true isometric
- `img/history-react.webp` - when judging deletion: React from 2014 to today under four deletion rules
- `img/switch-react.webp` - when judging the archetype switch: React's 2017 move to `packages/`

One private repository was rendered locally only; its output never leaves `~/.cache/citymap/private`.

## Findings

### 1. Land use decides the map, the size metric barely does

Share of built land per land use, whole city (source, tests plus fixtures, docs plus assets):

| Repo           | File count   | Lines        | Bytes        | File count, shared lots |
| -------------- | ------------ | ------------ | ------------ | ----------------------- |
| takken.io      | 17 / 8 / 56% | 19 / 8 / 54% | 10 / 4 / 72% | 24 / 8 / 50%            |
| react          | 23 / 66 / 3% | 30 / 59 / 3% | 29 / 60 / 3% | 61 / 21 / 5%            |
| next.js        | 15 / 64 / 3% | 19 / 60 / 3% | 19 / 60 / 4% | 22 / 60 / 3%            |
| home-assistant | 36 / 48 / 0% | 44 / 43 / 0% | 43 / 44 / 0% | 58 / 27 / 0%            |
| typescript     | 1 / 98 / 0%  | 2 / 97 / 0%  | 2 / 97 / 0%  | 14 / 84 / 0.5%          |
| rust           | 6 / 85 / 3%  | 11 / 78 / 3% | 11 / 79 / 3% | 16 / 69 / 4%            |

- Lines against count moves source by 2 to 17 points. Bytes against lines differs mainly on binaries: images swell.
- With integer lots, a land-use weight can only shrink large files; a fixture is never smaller than one lot. With file
  count, "weighted" therefore changes nothing on the ground.
- Shared lots (fixtures 20 per lot, tests 3, docs 2, by `round(1 / weight)`) is what makes weighting visible: React's
  compiler fixtures shrink from a warehouse district to a yard, and source becomes the majority.
- Next.js resists every variant: its 19,000 tests sit in thousands of tiny folders, one lot each at minimum.

### 2. Streets per folder sprawl; courts halve the roads

Pure EvoStreets gives every folder a street. Deep trees with a few files per folder (next.js `test/e2e/app-dir`) become
road networks with almost no buildings: next.js has 15,261 roads for 33,998 files. Turning leaf folders of up to 16
files into one block ("courts") cuts that to 5,932 and doubles the built share.

### 3. The raw backbone is sparse

Built share (lot area over the city's bounding box) is 1.4 to 26%; real cities run at roughly 30 to 40%. EvoStreets
leaves a void beside every long, narrow subtree. Folding long streets into a comb of side streets helps; the gap is
for the organic and compaction layers to close.

### 4. Sibling order changes which neighbours meet, not the character

First-seen puts the old core near the root and newcomers at street ends; alphabetical groups `packages/` next to
`compiler/` in React; hash scatters. All three are equally dense.

### 5. Deletion: vacant lots calm small edits; nothing calms years without a plat

Per commit, share of surviving files that moved (prototype without a persistent plat):

| Window                                           | Compaction | Vacant forever | Vacant, renewal above 50% | Renewal, identity follows renames |
| ------------------------------------------------ | ---------- | -------------- | ------------------------- | --------------------------------- |
| react 2017-09, 120 commits, on deleting commits  | 11.2%      | 0%             | 9.7%                      | 8.2%                              |
| react 2019, 150 commits, on deleting commits     | 7.9%       | 2.4%           | 0.1%                      | 2.9%                              |
| redux 2015, 150 commits, on deleting commits     | 56.7%      | 28.3%          | 46.8%                     | 51.7%                             |
| takken.io 2020, 100 commits, on deleting commits | 35%        | 29.3%          | 43.9%                     | 26.8%                             |

- Vacant lots beat compaction whenever a commit only deletes; residual movement comes from additions in the same
  commit, which only reserved slack (the plat) absorbs.
- Vacant forever turns React's pre-2017 `src/` into a ghost town that outlives the code by years (8,396 vacant lots at
  HEAD). Renewal must be local to the folder: a cascading rule renewed React's root and erased every vacancy.
- Across frames years apart, 70 to 100% of files move under every rule; stability over long spans is the plat's job.

### 6. Archetype switch: identity is the real fork

React's "Use Yarn Workspaces" commit deleted 332 paths, of which 305 were exact renames, detectable from blob ids in
a blob-less clone at no fetch cost. Over the two-month window around it only 3 renames survive, so the fold must be
per commit.

- Path identity: the frozen old town keeps 305 of 1,216 lots lit; the moved code reappears as new islands.
- Identity through renames: the old town keeps 583 lit, but today's `packages/` islands are nearly empty, so the map
  stops reflecting today's structure.
- Renamed files keep their birth time and so insert mid-street rather than at the far end, which costs stability.

### 7. Edges, style and camera behave as the research predicted

Workspace islands read well for React and next.js and add a strong landmark layer; Rust's islands are the
`src/tools/*` crates only, because the compiler crates are not separate workspace globs. Beck schematic reads as
statistics, Nolli noir exposes mass (React's fixtures turn black), Paper atlas keeps districts legible. Dimetric and
isometric differ only by a 0.5 against 0.577 squash on a flat ground plan.

## Reproduce

```bash
bun extract.ts ~/.cache/citymap/repos/react ~/.cache/citymap/data/react.json
bun generate.ts all
bun history.ts react 2014-06-01 2016-06-01 2017-09-01 2017-11-01 2020-01-01 head
bun history.ts react switch 2017-09-01 2017-11-01 head
bun history.ts react steps:2019-01-01:150
LAYOUT=towns bun history.ts react steps:2019-01-01:150
bun towns.ts all
pm2 start bun --name citymap-dev --cwd "$PWD" -- serve.ts   # https://127.0.0.1:5190
```

Clones are blob-less (`git clone --filter=blob:none`); history replay runs with `GIT_NO_LAZY_FETCH=1` so it never
fetches contents. Rendering needs Inkscape and ImageMagick.| Repo | Lots | Lot coverage of land | Local street share | Long straight roads | Lots without room |
| --- | --- | --- | --- | --- | --- |
| takken.io | 244 | 22.1% | 88% | 9 | 0 |
| react | 2,019 | 34.7% | 74% | 7 | 5 |
| redux | 92 | 13.2% | 80% | 5 | 0 |
| next.js | 8,022 | 35.8% | 79% | 24 | 18 |
| game-ci-cli | 702 | 25.7% | 76% | 4 | 0 |
| livediagram | 4,124 | 36.7% | 72% | 10 | 7 |
| studio-worker | 101 | 26.1% | 100% | 3 | 0 |
| home-assistant | 13,195 | 43.1% | 79% | 5 | 11 |
| typescript | 927 | 36.7% | 80% | 7 | 3 |
| rust | 6,246 | 29.6% | 69% | 6 | 14 |

"Long straight roads" counts roads longer than 45% of their town's diameter that stay within 0.5% of a straight line.
Small towns still have too many: the warp bends less than a cut is long, and every cut runs wall to wall.

Stability, per commit, share of surviving files that moved (snapshot layout, no plat, compaction):

| Window                      | Street tree | Neighbourhoods | Deleting commits: street tree | Deleting commits: neighbourhoods |
| --------------------------- | ----------- | -------------- | ----------------------------- | -------------------------------- |
| react 2019, 150 commits     | 0.8%        | 0.9%           | 7.9%                          | 13.5%                            |
| takken.io 2020, 100 commits | 9%          | 27.2%          | 35%                           | 70%                              |

Cutting a town's outline re-divides land when a folder grows, so small towns move more. Reserve plots and remembered
cut positions (the plat) are the remedy to measure next.

## Sheets

- `img/area-<repo>.webp` - when judging lot size: file count, lines, bytes, shared lots; top row whole city, bottom a district
- `img/courts-<repo>.webp` - when judging whether small leaf folders get their own street
- `img/order-<repo>.webp` - when judging sibling order: first-seen, alphabetical, path hash
- `img/edges-<repo>.webp` - when judging meaningful against aesthetic edges
- `img/style-<repo>.webp` - when judging Paper atlas, Beck schematic and Nolli noir
- `img/camera-<repo>.webp` - when judging plan, 2:1 dimetric and true isometric
- `img/history-react.webp` - when judging deletion: React from 2014 to today under four deletion rules
- `img/switch-react.webp` - when judging the archetype switch: React's 2017 move to `packages/`

One private repository was rendered locally only; its output never leaves `~/.cache/citymap/private`.

## Findings

### 1. Land use decides the map, the size metric barely does

Share of built land per land use, whole city (source, tests plus fixtures, docs plus assets):

| Repo           | File count   | Lines        | Bytes        | File count, shared lots |
| -------------- | ------------ | ------------ | ------------ | ----------------------- |
| takken.io      | 17 / 8 / 56% | 19 / 8 / 54% | 10 / 4 / 72% | 24 / 8 / 50%            |
| react          | 23 / 66 / 3% | 30 / 59 / 3% | 29 / 60 / 3% | 61 / 21 / 5%            |
| next.js        | 15 / 64 / 3% | 19 / 60 / 3% | 19 / 60 / 4% | 22 / 60 / 3%            |
| home-assistant | 36 / 48 / 0% | 44 / 43 / 0% | 43 / 44 / 0% | 58 / 27 / 0%            |
| typescript     | 1 / 98 / 0%  | 2 / 97 / 0%  | 2 / 97 / 0%  | 14 / 84 / 0.5%          |
| rust           | 6 / 85 / 3%  | 11 / 78 / 3% | 11 / 79 / 3% | 16 / 69 / 4%            |

- Lines against count moves source by 2 to 17 points. Bytes against lines differs mainly on binaries: images swell.
- With integer lots, a land-use weight can only shrink large files; a fixture is never smaller than one lot. With file
  count, "weighted" therefore changes nothing on the ground.
- Shared lots (fixtures 20 per lot, tests 3, docs 2, by `round(1 / weight)`) is what makes weighting visible: React's
  compiler fixtures shrink from a warehouse district to a yard, and source becomes the majority.
- Next.js resists every variant: its 19,000 tests sit in thousands of tiny folders, one lot each at minimum.

### 2. Streets per folder sprawl; courts halve the roads

Pure EvoStreets gives every folder a street. Deep trees with a few files per folder (next.js `test/e2e/app-dir`) become
road networks with almost no buildings: next.js has 15,261 roads for 33,998 files. Turning leaf folders of up to 16
files into one block ("courts") cuts that to 5,932 and doubles the built share.

### 3. The raw backbone is sparse

Built share (lot area over the city's bounding box) is 1.4 to 26%; real cities run at roughly 30 to 40%. EvoStreets
leaves a void beside every long, narrow subtree. Folding long streets into a comb of side streets helps; the gap is
for the organic and compaction layers to close.

### 4. Sibling order changes which neighbours meet, not the character

First-seen puts the old core near the root and newcomers at street ends; alphabetical groups `packages/` next to
`compiler/` in React; hash scatters. All three are equally dense.

### 5. Deletion: vacant lots calm small edits; nothing calms years without a plat

Per commit, share of surviving files that moved (prototype without a persistent plat):

| Window                                           | Compaction | Vacant forever | Vacant, renewal above 50% | Renewal, identity follows renames |
| ------------------------------------------------ | ---------- | -------------- | ------------------------- | --------------------------------- |
| react 2017-09, 120 commits, on deleting commits  | 11.2%      | 0%             | 9.7%                      | 8.2%                              |
| react 2019, 150 commits, on deleting commits     | 7.9%       | 2.4%           | 0.1%                      | 2.9%                              |
| redux 2015, 150 commits, on deleting commits     | 56.7%      | 28.3%          | 46.8%                     | 51.7%                             |
| takken.io 2020, 100 commits, on deleting commits | 35%        | 29.3%          | 43.9%                     | 26.8%                             |

- Vacant lots beat compaction whenever a commit only deletes; residual movement comes from additions in the same
  commit, which only reserved slack (the plat) absorbs.
- Vacant forever turns React's pre-2017 `src/` into a ghost town that outlives the code by years (8,396 vacant lots at
  HEAD). Renewal must be local to the folder: a cascading rule renewed React's root and erased every vacancy.
- Across frames years apart, 70 to 100% of files move under every rule; stability over long spans is the plat's job.

### 6. Archetype switch: identity is the real fork

React's "Use Yarn Workspaces" commit deleted 332 paths, of which 305 were exact renames, detectable from blob ids in
a blob-less clone at no fetch cost. Over the two-month window around it only 3 renames survive, so the fold must be
per commit.

- Path identity: the frozen old town keeps 305 of 1,216 lots lit; the moved code reappears as new islands.
- Identity through renames: the old town keeps 583 lit, but today's `packages/` islands are nearly empty, so the map
  stops reflecting today's structure.
- Renamed files keep their birth time and so insert mid-street rather than at the far end, which costs stability.

### 7. Edges, style and camera behave as the research predicted

Workspace islands read well for React and next.js and add a strong landmark layer; Rust's islands are the
`src/tools/*` crates only, because the compiler crates are not separate workspace globs. Beck schematic reads as
statistics, Nolli noir exposes mass (React's fixtures turn black), Paper atlas keeps districts legible. Dimetric and
isometric differ only by a 0.5 against 0.577 squash on a flat ground plan.

## Reproduce

```bash
bun extract.ts ~/.cache/citymap/repos/react ~/.cache/citymap/data/react.json
bun generate.ts all
bun history.ts react 2014-06-01 2016-06-01 2017-09-01 2017-11-01 2020-01-01 head
bun history.ts react switch 2017-09-01 2017-11-01 head
bun history.ts react steps:2019-01-01:150
LAYOUT=towns bun history.ts react steps:2019-01-01:150
bun towns.ts all
pm2 start bun --name citymap-dev --cwd "$PWD" -- serve.ts   # https://127.0.0.1:5190
```

Clones are blob-less (`git clone --filter=blob:none`); history replay runs with `GIT_NO_LAZY_FETCH=1` so it never
fetches contents. Rendering needs Inkscape and ImageMagick.
