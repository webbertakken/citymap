# 0003 Rust engine and CLI

A second implementation of the `citymap` CLI in Rust whose city JSON, lockfile and SVG are byte-identical to the
TypeScript CLI's, and much faster. Spec: [architecture](../docs/specs/003-system-architecture/architecture.md) § Rust
implementation. Blueprint: [Rust implementation](../docs/specs/003-system-architecture/blueprints/rust.md).

Branch `feat/rust-engine` in the worktree `../citymap-rust`.

## Phase 0: groundwork

- [x] Worktree from `origin/main`; read the specs, blueprints and every TypeScript module the CLI uses
- [x] Architecture spec and scope: the Rust implementation, where it lives, how parity is proven
- [x] Blueprint, defaults ledger, completeness for the port
- [x] This plan
- [x] Commit

## Phase 1: workspace and fixed-point core

- [x] Toolchain pinned (latest stable), Cargo workspace, lints, rustfmt, crates scaffolded, versions confirmed
- [x] `ErrorCode` and `CitymapError`
- [x] Arithmetic: `floor_div`, `round_div`, `mul_div`, `isqrt`, with the ported tests
- [x] Directions: the table, `dir`, `normalise`, `perp`, `negate`, `rotate`, checksum test
- [x] Hashes: `fnv1a`, `seed_of`, `unit_mille`, `compare_keys`
- [x] Polygons: `area2`, `centroid`, `side`, `clip`, `inset`, `chord`, `extent`, `longest_edge`, `offset_for`, `reach`
- [x] Noise, warp, `densify`, memoised warp
- [x] Commit

## Phase 2: model

- [x] Constants, road classes, `cut_class`, `reclass`, `reserve_for`, `road_excess`
- [x] Land use, weights, lot capacity, land key; parity fixture of classified paths
- [x] Snapshot, `parse_snapshot` limits; workspace members and groups
- [x] `build_tree`: sharing, chain collapse, mass, demand, digest
- [x] Archetype: features, district and flat forms, `classify_node`, `flatten`
- [x] Canonical JSON; plat, lock and city types, serialisation and parsing
- [x] Commit

## Phase 3: town layout

- [x] Context, events, `forget`, item and draft types
- [x] `decide`, `split`, pinwheel, wards, park, reserve, `trim`
- [x] Partition with the locality cache; radial; twin
- [x] Neighbourhood: park split, grid, slots, span, green, high street, renewal, newcomers, addresses
- [x] Loop connectors and the uniform grid
- [x] `layout_town` with the warp
- [x] Golden towns byte-identical to `__golden__`
- [x] Commit

## Phase 4: region and fold

- [x] Outline, highways, placement, old towns, `lay_city`, `check_extent`
- [x] `fold_history`, `initial_state`
- [x] Organic regions: Delaunay and Voronoi
- [x] Commit

## Phase 5: history

- [x] Git environment, `resolve_commit`, `is_ancestor`
- [x] Raw log parser and the tree state: renames, submodules, folders
- [x] Manifests on `regress`, workspaces tracker, blob reader
- [x] `read_history` on a reader thread; `read_tree`
- [x] Ported tests on temporary repositories
- [x] Commit

## Phase 6: themes, SVG and CLI

- [x] Colours and themes; parity fixture of every hue
- [x] `to_fixed` and the SVG renderer; parity fixture of SVG documents
- [x] Arguments, `run_lay` with lock resume and periodic saves, `main` with exit codes
- [x] Ported CLI tests
- [x] Commit

## Phase 7: parity

- [x] `scripts/parity.ts` and `bun run parity`
- [x] `--no-history` on every parity repository: identical
- [x] Full folds on every parity repository: identical
- [ ] next.js full fold: identical
- [ ] Timings side by side; profile and speed up where the fold is slow
- [ ] Commit

## Phase 8: gate

- [x] `bun run rust:check`; pre-commit runs it for staged `.rs` files; pre-push for pushes that change Rust
- [x] CI job: format, clippy, tests
- [x] `docs/instructions/development.md`
- [x] Commit

## Phase 9: fold-back and pull request

- [ ] Fold-back: specs, blueprint, defaults and indexes match what shipped; every symbol and path verified
- [ ] Private-name check, push, pull request with parity results and timings; not merged
