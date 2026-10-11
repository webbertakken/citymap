# 0001 Ground plan engine, CLI and viewer

Build the ground plan as a product: a deterministic fixed-point engine, a history reader, a CLI, SVG output and a
Next.js viewer. Specs: [vision](../docs/specs/001-project-vision/vision.md), [scope](../docs/specs/002-project-scope/scope.md),
[architecture](../docs/specs/003-system-architecture/architecture.md), [ground plan](../docs/specs/006-ground-plan/ground-plan.md).
Blueprints: [ground plan blueprints](../docs/specs/006-ground-plan/blueprints/README.md).

Branch `build/ground-plan`; tooling and CI arrive from the delegate's `build/ci` branch.

## Phase 0: groundwork

- [x] Merge the research branch (PR #1) and branch from main
- [x] Architecture spec (003)
- [x] Blueprints, defaults ledger, completeness
- [ ] Merge `build/ci` (oxfmt, oxlint, vitest projects, hooks, CI); every package joins the root references
- [ ] Webber answers ambiguities 5 to 7 (loop connectors, Voronoi outlines, morphometric targets)

## Phase 1: fixed-point core (`packages/ground-plan/src/fixed`)

- [ ] Package scaffold: `package.json`, `tsconfig.json`, `src/index.ts`, vitest project
- [ ] `floorDiv`, `roundDiv`, `mulDiv`, `isqrt` with property tests against bigint
- [ ] Direction table generator script, committed table, checksum test; `dir`, `normalise`, `perp`, `angleOf`
- [ ] `fnv1a` over UTF-8, `seedOf`, `unitMille`, `compareKeys` with tests (astral characters included)
- [ ] Polygons: `area2`, `centroid`, `clip`, `inset`, `chord`, `extent`, `longestEdge`, `offsetFor`, `reach`
- [ ] Noise, warp and `densify` in fixed point
- [ ] Commit

## Phase 2: model (`snapshot`, `land-use`, `tree`, `plat`, `city`)

- [ ] `CitymapError` and the rejection codes
- [ ] `parseSnapshot` with every rejection
- [ ] `classifyLandUse` ported with table-driven tests; weights and lot capacity
- [ ] Workspace members and groups from paths
- [ ] `buildTree`: sharing, chain collapse, mass, demand
- [ ] Plat types, sorted-key serialisation, `parsePlat`, round-trip property test
- [ ] City model types and serialisation
- [ ] Commit

## Phase 3: town layout (`town`)

- [ ] `classifyNode` with every threshold and band tested
- [ ] `decide` and `split`: fresh, remembered, recut, empty side, forget
- [ ] Pinwheel with its guards
- [ ] Radial: sectors, core scale, decline cases, re-sector
- [ ] Twin: banks, river, bridges
- [ ] Neighbourhood: park strip, grid, cells, slots, span, green, high street, renewal, newcomers, addresses
- [ ] Wards, districts, park and reserve blocks
- [ ] Organic warp of a laid town
- [ ] Golden fixtures: hamlet, twin, radial
- [ ] Commit

## Phase 4: region and fold

- [ ] Parts, outlines, growth, placement
- [ ] Highways with seamless gates
- [ ] Archetype switch and old towns
- [ ] `layCity`, `foldHistory`, events, summary line
- [ ] Determinism and locality property tests
- [ ] Locality cache, proven identical with it off
- [ ] Commit

## Phase 5: history and CLI

- [ ] `packages/history`: streaming `git log` reader, exact renames, submodules, folder first-seen; tests on a
      generated fixture repository
- [ ] `packages/svg`: Paper atlas and Dracula themes from the prototype, escaped labels
- [ ] `apps/cli`: `citymap <repo> [--commit] [--out city.json] [--svg map.svg] [--lock] [--verbose]`
- [ ] Commit

## Phase 6: corpus verification

- [ ] HEAD sheets for the public reference repositories next to the prototype's; differences explained or fixed
- [ ] Stability runs (react, takken.io, next.js, home-assistant, redux) within the prototype's numbers
- [ ] Linux HEAD timing and a cached full fold
- [ ] Post the sheets to the wall; commit

## Phase 7: viewer (`packages/scene`, `apps/web`)

- [ ] Viewer blueprint (presentation, accessibility, web experience) derived from the spec's Presentation section
- [ ] `packages/scene`: city model to Three.js geometry (instanced lots, merged roads, water, labels), framework free
- [ ] `apps/web`: Next.js 16, React 19, react-three-fiber; dimetric and plan cameras; themes; phone layout
- [ ] Local repository loading through the CLI's JSON (hosted import is later)
- [ ] Playwright end-to-end tests in dark mode; WCAG 2.2 AA checks; Core Web Vitals measured
- [ ] Walkthrough on the wall; commit

## Phase 8: fold-back

- [ ] Reconcile the specs with what shipped, re-derive the blueprints, update DEFAULTS and COMPLETENESS
- [ ] Traceability table: every spec rule to its tests
- [ ] Verify every symbol, file and reference in the docs; indexes current
- [ ] PR with images, merged after the local gate
