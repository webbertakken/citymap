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
  (6 u by 12 u), aligned to its main frontage; lots sit back to back, widening up to lot class 4 to fill their block;
  spare blocks are dashed reserve plots.
- **Wards**: land between collectors or bigger roads takes its own tint and the name of its heaviest folder.
- **Organic layer**: one smooth, seeded warp scaled to the town bends every road and block.
- **Density**: a setting; it sets land per lot, so it acts as grain (suburban big plots to dense narrow plots).

Sheets: `img/towns-towns-<repo>.webp` (plan), `img/towns-density-<repo>.webp` (35, 50, 65% at one scale),
`img/towns-hero-<repo>.webp` (2:1 dimetric). Generate with `bun towns.ts all`.

| Repo | Lots | Lot coverage of land | Local street share | Long straight roads | Lots without room |
| --- | --- | --- | --- | --- | --- |
| takken.io | 244 | 21.8% | 88% | 9 | 0 |
| react | 2,019 | 39.1% | 76% | 10 | 5 |
| redux | 92 | 17.2% | 80% | 5 | 0 |
| next.js | 8,032 | 37.5% | 81% | 24 | 8 |
| game-ci-cli | 702 | 28% | 80% | 6 | 0 |
| livediagram | 4,121 | 36.3% | 74% | 9 | 10 |
| studio-worker | 101 | 27.7% | 100% | 3 | 0 |
| home-assistant | 13,198 | 45% | 80% | 2 | 8 |
| typescript | 929 | 38.5% | 80% | 8 | 1 |
| rust | 6,237 | 31.3% | 72% | 3 | 23 |

"Long straight roads" counts roads longer than 45% of their town's diameter that stay within 0.5% of a straight line.
Small towns still have too many: the warp bends less than a cut is long, and every cut runs wall to wall.

Stability, per commit, share of surviving files that moved (snapshot layout, no plat, compaction):

| Window | Street tree | Neighbourhoods | Deleting commits: street tree | Deleting commits: neighbourhoods |
| --- | --- | --- | --- | --- |
| react 2019, 150 commits | 0.8% | 0.9% | 7.9% | 13.5% |
| takken.io 2020, 100 commits | 9% | 27.2% | 35% | 70% |

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

| Repo | File count | Lines | Bytes | File count, shared lots |
| --- | --- | --- | --- | --- |
| takken.io | 17 / 8 / 56% | 19 / 8 / 54% | 10 / 4 / 72% | 24 / 8 / 50% |
| react | 23 / 66 / 3% | 30 / 59 / 3% | 29 / 60 / 3% | 61 / 21 / 5% |
| next.js | 15 / 64 / 3% | 19 / 60 / 3% | 19 / 60 / 4% | 22 / 60 / 3% |
| home-assistant | 36 / 48 / 0% | 44 / 43 / 0% | 43 / 44 / 0% | 58 / 27 / 0% |
| typescript | 1 / 98 / 0% | 2 / 97 / 0% | 2 / 97 / 0% | 14 / 84 / 0.5% |
| rust | 6 / 85 / 3% | 11 / 78 / 3% | 11 / 79 / 3% | 16 / 69 / 4% |

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

| Window | Compaction | Vacant forever | Vacant, renewal above 50% | Renewal, identity follows renames |
| --- | --- | --- | --- | --- |
| react 2017-09, 120 commits, on deleting commits | 11.2% | 0% | 9.7% | 8.2% |
| react 2019, 150 commits, on deleting commits | 7.9% | 2.4% | 0.1% | 2.9% |
| redux 2015, 150 commits, on deleting commits | 56.7% | 28.3% | 46.8% | 51.7% |
| takken.io 2020, 100 commits, on deleting commits | 35% | 29.3% | 43.9% | 26.8% |

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
```

Clones are blob-less (`git clone --filter=blob:none`); history replay runs with `GIT_NO_LAZY_FETCH=1` so it never
fetches contents. Rendering needs Inkscape and ImageMagick.
