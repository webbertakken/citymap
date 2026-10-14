# 0001 Ground plan engine, CLI and viewer

Build the ground plan as a product: a deterministic fixed-point engine, a history reader, a CLI, SVG output and a
Next.js viewer. Specs: [vision](../docs/specs/001-project-vision/vision.md),
[scope](../docs/specs/002-project-scope/scope.md),
[architecture](../docs/specs/003-system-architecture/architecture.md),
[ground plan](../docs/specs/006-ground-plan/ground-plan.md). Blueprints:
[ground plan blueprints](../docs/specs/006-ground-plan/blueprints/README.md).

Branch `build/ground-plan`; tooling and CI arrive from the delegate's `build/ci` branch.

## Phase 0: groundwork

- [x] Merge the research branch (PR #1) and branch from main
- [x] Architecture spec (003)
- [x] Blueprints, defaults ledger, completeness
- [x] Merge `build/ci` (oxfmt, oxlint, vitest projects, hooks, CI); every package joins the root references
- [ ] Webber answers ambiguities 5 to 7 (loop connectors, Voronoi outlines, morphometric targets)

## Phase 1: fixed-point core (`packages/ground-plan/src/fixed`)

- [x] Package scaffold: `package.json`, `tsconfig.json`, `src/index.ts`, vitest project
- [x] `floorDiv`, `roundDiv`, `mulDiv`, `isqrt` with property tests against bigint
- [x] Direction table generator script, committed table, checksum test; `dir`, `normalise`, `perp`, `rotate`
- [x] `fnv1a` over UTF-8, `seedOf`, `unitMille`, `compareKeys` with tests (astral characters included)
- [x] Polygons: `area2`, `centroid`, `clip`, `inset`, `chord`, `extent`, `longestEdge`, `offsetFor`, `reach`
- [x] Noise, warp and `densify` in fixed point
- [x] Commit

## Phase 2: model (`snapshot`, `land-use`, `tree`, `plat`, `city`)

- [x] `CitymapError` and the rejection codes
- [x] `parseSnapshot` with every rejection
- [x] `classifyLandUse` ported with table-driven tests; weights and lot capacity
- [x] Workspace members and groups from paths
- [x] `buildTree`: sharing, chain collapse, mass, demand
- [x] Plat types, sorted-key serialisation, `parsePlat`, round-trip property test
- [x] City model types and serialisation
- [x] Commit

## Phase 3: town layout (`town`)

- [x] `classifyNode` with every threshold and band tested
- [x] `decide` and `split`: fresh, remembered, recut, empty side, forget
- [x] Pinwheel with its guards
- [x] Radial: sectors, core scale, decline cases, re-sector
- [x] Twin: banks, river, bridges
- [x] Neighbourhood: park strip, grid, cells, slots, span, green, high street, renewal, newcomers, addresses
- [x] Wards, districts, park and reserve blocks
- [x] Organic warp of a laid town
- [x] Golden fixtures: hamlet, twin, radial
- [x] Commit

## Phase 4: region and fold

- [x] Parts, outlines, growth, placement
- [x] Highways with seamless gates
- [x] Archetype switch and old towns
- [x] `layCity`, `foldHistory`, events, summary line
- [x] Determinism and locality property tests
- [x] Locality cache, proven identical with it off
- [x] Commit

## Phase 5: history and CLI

- [x] `packages/history`: streaming `git log` reader, exact renames, submodules, folder first-seen; tests on a generated
      fixture repository
- [x] `packages/svg`: Paper atlas and Dracula themes from the prototype, escaped labels
- [x] `apps/cli`: `citymap <repo> [--commit] [--out city.json] [--svg map.svg] [--lock] [--verbose]`
- [x] Commit

## Phase 6: corpus verification

- [ ] HEAD sheets for the public reference repositories next to the prototype's; differences explained or fixed
- [x] Stability runs (react, takken.io, next.js, home-assistant, redux) within the prototype's numbers
      (`bun scripts/stability.ts`; every move lands on a commit with a plan decision; takken.io's 0.2 points over the
      prototype is one renewal)
- [ ] Linux HEAD timing and a cached full fold
- [ ] Post the sheets to the wall; commit

## Phase 7: viewer (`packages/scene`, `apps/web`)

- [x] Viewer blueprint (presentation, accessibility, web experience) derived from the spec's Presentation section
- [x] `packages/scene`: city model to Three.js geometry (instanced lots, merged roads, water, labels), framework free
- [x] `apps/web`: Next.js 16, React 19, react-three-fiber; dimetric and plan cameras; themes; phone layout
- [x] Local repository loading through the CLI's JSON (hosted import is later)
- [x] Playwright end-to-end tests in dark mode; WCAG 2.2 AA checks; Core Web Vitals measured
- [x] Shots on the wall (walkthroughs are retired there; the steps go in the reply); commit

## Phase 8: fold-back

- [x] Reconcile the specs with what shipped, re-derive the blueprints, update DEFAULTS and COMPLETENESS
- [x] Traceability table: every spec rule to its tests
- [x] Verify every symbol, file and reference in the docs; indexes current
- [ ] PR with images, merged after the local gate

## Phase 7b: workspaces from manifests, split groups, drill down

- [x] Spec and blueprints: manifests, split groups (`apps/` by default), drill down
- [x] Engine: `Options.split` (default `["apps"]`), one town per member of a split group; plat setting key
- [x] Engine: members from `snapshot.workspaces` when present, else the path heuristic
- [x] History: read root workspace manifests at the commits that change them; parse every format; glob matching
- [x] CLI: `--split=<groups>` (default `apps`; `--split=apps,packages` splits packages too)
- [x] Viewer: drill down to a town and back; breadcrumb; panel action
- [x] Tests (unit, end to end), corpus check on livediagram and next.js, commit and push

## Traceability

Every rule of the ground plan spec (`006`) and the viewer spec (`004`), and the tests that prove it. Paths are under
`packages/` unless they start with `apps/` or `scripts/`; `›` separates the `describe` from the `it`.

| Spec rule                                                                          | Tests                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input: first-parent history, oldest first; same commit, same city                  | `history/read` › yields one snapshot per first-parent commit…; follows only the first parent of a merge; `ground-plan/region/compose` › is pure and deterministic, warp included                                                                      |
| Input: a committed lockfile overrides the fold                                     | `apps/cli/run` › writes a lockfile and resumes from it…; saves the lock along the way…; ignores a lockfile for another land setting or off the history                                                                                                |
| Input: reads commits, trees and root manifests only                                | `history/read-manifests` › every test; `history/blobs` › BlobReader; `history/env` › gitEnvironment                                                                                                                                                   |
| Input: identity follows exact renames                                              | `history/read` › carries identity through an exact rename…; pairs identical files moved together in path order                                                                                                                                        |
| Land use: path rules, earliest first                                               | `ground-plan/land-use` › classifies %s as %s; applies the earliest rule first; matches folder names case-insensitively                                                                                                                                |
| Land use: weights and `round(1 / weight)` files per lot                            | `ground-plan/land-use` › weighs every land use; shares a lot among round(1 / weight) files; `ground-plan/tree` › shares lots among files of one use…                                                                                                  |
| Mass: weighted count of files that take lots                                       | `ground-plan/tree` › sums mass and demand up the tree; keeps tests off the land and docs as parks, outside the mass                                                                                                                                   |
| Land dimension: tests and fixtures take none by default; each setting its own plat | `ground-plan/tree` › gives tests land when the land dimension includes them; `ground-plan/land-use` › landKey; `ground-plan/region/compose` › rejects a plat laid for another land setting                                                            |
| Docs are parks                                                                     | `ground-plan/town/layout` › lays docs as a park strip; cuts a folder's own lots and its docs park beside its child folders                                                                                                                            |
| Dimensions: road widths, blocks, lots                                              | `ground-plan/town/golden` › lays a hamlet / a twin / a radial town (fixtures hold every width)                                                                                                                                                        |
| Neighbourhood lot class: widen, narrow, re-grid                                    | `ground-plan/town/branches` › narrows its lot class and re-lays when its lots outgrow their slots; lays its grid afresh when the cuts around it moved its land off the grid; keeps its grid when a fresh one would seat no more lots                  |
| Density setting                                                                    | `ground-plan/tree` › landFor is the square of the lots' land over density plus a road margin                                                                                                                                                          |
| Order: first appearance, path, centre-out                                          | `ground-plan/town/layout` › centreOut puts the oldest in the middle…; orders children by first appearance when asked; `ground-plan/tree` › orders own lots by first appearance, then path                                                             |
| Structure: octagon outline, recursive cuts, cuts are streets by tier               | `ground-plan/region/outline` › lays an octagon…; `ground-plan/town/layout` › cutClass ranks roads by the tier…; gives every file of a polycentric town a lot                                                                                          |
| Structure: flatten under nine blocks; serpentine fill; chains collapse             | `ground-plan/archetype/classify` › flattens a folder without children, or under the flatten limit; `ground-plan/tree` › collapses chains of empty single-child folders                                                                                |
| Structure: long top-level cuts jog round a plaza                                   | `ground-plan/town/layout` › jogs a long top-level cut round a plaza, unless jogging is off; `ground-plan/town/branches` › pinwheel guards (nine tests)                                                                                                |
| Structure: remembered cuts, bands, lent land, recuts                               | `ground-plan/town/layout` › lends an emptied side's land to its sibling…; moves a remembered cut when one side outgrows its band; lets the growing side take an emptied side's land without moving the cut                                            |
| Structure: remembered neighbourhoods, slots, park lines                            | `ground-plan/town/branches` › keeps a remembered park line and warp scale; lays a park line afresh when it no longer crosses its land; `ground-plan/town/layout` › keeps an address once issued                                                       |
| Structure: shared lots remember members                                            | `ground-plan/tree` › keeps a shared lot while a member lives and fills it with a newcomer                                                                                                                                                             |
| Structure: towns grow at 1.35 about their centre                                   | `ground-plan/region/compose` › grows a town outward about its centre without moving its lots                                                                                                                                                          |
| Structure: roads follow the tier within a 1.25 band                                | `ground-plan/town/cut` › decide road classes (two tests)                                                                                                                                                                                              |
| Structure: a starved side recuts; a crowding park line re-lays                     | `ground-plan/town/cut` › moves a remembered cut when its land shifted…; `ground-plan/town/branches` › lays its park line afresh…                                                                                                                      |
| Structure: flatten hysteresis 1.5                                                  | `ground-plan/archetype/classify` › keeps a flat folder flat up to 1.5 times the limit; keeps a cut folder cut down to the limit over 1.5                                                                                                              |
| Archetypes: Schmitt trigger                                                        | `ground-plan/archetype/classify` › districtForm (four tests); flatForm (two tests)                                                                                                                                                                    |
| Archetypes: twin across a river, bridges                                           | `ground-plan/town/layout` › lays a twin town across a river with a bridge; `ground-plan/town/branches` › bridges a short river once; balances a twin's extra folders…                                                                                 |
| Archetypes: hamlet green, street village                                           | `ground-plan/town/layout` › gathers a hamlet round a green…; runs a street village along a collector high street                                                                                                                                      |
| Archetypes: radial, its guards and re-sectoring                                    | `ground-plan/town/layout` › lays a radial town with a ring road, and re-sectors for a newcomer; falls back to cuts when a radial ring has fewer than three items; `ground-plan/town/branches` › declines a ring item that needs more than 171 degrees |
| Edges: members from manifests, else paths                                          | `history/manifests` › every test; `ground-plan/region/compose` › takes members from the manifests when the snapshot carries them; `ground-plan/workspace` › workspaceMembers                                                                          |
| Edges: groups, split groups (`apps` by default), each setting its own plat         | `ground-plan/workspace` › workspaceGroups (three tests); `ground-plan/region/compose` › split groups (five tests)                                                                                                                                     |
| Edges: highways continue roads; approach streets                                   | `ground-plan/region/highway` › every test; `ground-plan/region/compose` › gives a town without roads an approach street…                                                                                                                              |
| Deletion: vacant lots, renewal                                                     | `ground-plan/town/layout` › keeps every surviving lot in place when files are deleted…; renews a neighbourhood whose remembered lots are mostly vacant                                                                                                |
| Archetype switch: old towns, lit by their members, unique keys                     | `ground-plan/region/compose` › freezes the town as an old town…; freezes vacant lots too…; moves between neighbourhood forms in place…; `ground-plan/city/serialise` › rejects a city whose towns share a key                                         |
| Addresses never change; lots never split                                           | `ground-plan/town/layout` › keeps an address once issued; `ground-plan/tree` › keeps a shared lot while a member lives…                                                                                                                               |
| Organic layer: deterministic warp that never feeds the plat                        | `ground-plan/fixed/warp` › every test; `ground-plan/town/layout` › warp memory; is deterministic, warp included, and leaves its input plat untouched                                                                                                  |
| Presentation: themes, Paper atlas lead, Night atlas twin                           | `themes` › every test (WCAG contrast); `svg/render` › draws in the %s theme; `apps/web/components/Viewer` › starts in Night atlas when the system prefers dark                                                                                        |
| Presentation: dimetric default, plan one switch away                               | `apps/web/view/view` › basis and fit tests; `apps/web/components/Viewer` › switches city, view and theme from the bar                                                                                                                                 |
| Invariant: determinism and integer core                                            | `ground-plan/fixed/*` › bigint references; `ground-plan/plat/canonical` › every test; `svg/render` › draws a whole city as one SVG document, the same every time                                                                                      |
| Invariant: locality                                                                | `ground-plan/fold/fold` › moves nothing outside the folders a commit touches, when no plan decision fires; the locality cache…                                                                                                                        |
| Viewer: drill down, breadcrumb, Escape                                             | `apps/web/components/Viewer` › Viewer drill down (three tests); `apps/web/e2e/viewer` › shows one town alone…                                                                                                                                         |
| Viewer: hover and select                                                           | `apps/web/components/Viewer` › Viewer hover and select (three tests); `scene/pick` › every test; `apps/web/e2e/viewer` › names what is under the pointer…                                                                                             |
| Viewer: accessibility (WCAG 2.2 AA)                                                | `apps/web/e2e/viewer` › passes axe with no WCAG 2.2 AA violations; reaches every control and the map by keyboard…                                                                                                                                     |
| Viewer: web experience (LCP, CLS 0, INP)                                           | `apps/web/e2e/vitals` › both tests                                                                                                                                                                                                                    |
| Viewer: observability                                                              | `apps/web/log` › every test; `apps/web/components/Viewer` › Viewer log                                                                                                                                                                                |

Open, by Webber's choice (Phase 0): loop connectors, Voronoi outlines and morphometric targets (road length shares,
neighbourhoods of 3 to 8 blocks) have no implementation and so no tests.
