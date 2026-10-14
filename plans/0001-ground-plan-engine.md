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
- [ ] Stability runs (react, takken.io, next.js, home-assistant, redux) within the prototype's numbers
- [ ] Linux HEAD timing and a cached full fold
- [ ] Post the sheets to the wall; commit

## Phase 7: viewer (`packages/scene`, `apps/web`)

- [x] Viewer blueprint (presentation, accessibility, web experience) derived from the spec's Presentation section
- [x] `packages/scene`: city model to Three.js geometry (instanced lots, merged roads, water, labels), framework free
- [x] `apps/web`: Next.js 16, React 19, react-three-fiber; dimetric and plan cameras; themes; phone layout
- [x] Local repository loading through the CLI's JSON (hosted import is later)
- [ ] Playwright end-to-end tests in dark mode; WCAG 2.2 AA checks; Core Web Vitals measured
- [ ] Walkthrough on the wall; commit

## Phase 8: fold-back

- [ ] Reconcile the specs with what shipped, re-derive the blueprints, update DEFAULTS and COMPLETENESS
- [ ] Traceability table: every spec rule to its tests
- [ ] Verify every symbol, file and reference in the docs; indexes current
- [ ] PR with images, merged after the local gate

## Phase 7b: workspaces from manifests, split groups, drill down

- [x] Spec and blueprints: manifests, split groups (`apps/` by default), drill down
- [x] Engine: `Options.split` (default `["apps"]`), one town per member of a split group; plat setting key
- [x] Engine: members from `snapshot.workspaces` when present, else the path heuristic
- [x] History: read root workspace manifests at the commits that change them; parse every format; glob matching
- [x] CLI: `--split=<groups>` (default `apps`; `--split=apps,packages` splits packages too)
- [x] Viewer: drill down to a town and back; breadcrumb; panel action
- [x] Tests (unit, end to end), corpus check on livediagram and next.js, commit and push
