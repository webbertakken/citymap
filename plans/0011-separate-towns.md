# 0011 Separate towns

Kinds of folder (workspace members, submodules, `apps/`, `packages/`, `libs/`, `crates/`, `services/`, `modules/`,
`extensions/`, `**/plugins/`) laid as towns of their own, a switch each, replacing `split`; submodules read from their
own git data in the CLI fold, the local reader and the GitHub reader. Spec:
[ground plan](../docs/specs/006-ground-plan/ground-plan.md) § Separate towns, § Submodules;
[viewer](../docs/specs/004-interface-design/viewer.md) § Separate towns, § A GitHub repository, live;
[local repositories](../docs/specs/007-local-repositories/local-repositories.md) § What is read. Blueprints:
[region](../docs/specs/006-ground-plan/blueprints/region.md),
[model](../docs/specs/006-ground-plan/blueprints/model.md), [fold](../docs/specs/006-ground-plan/blueprints/fold.md),
[viewer](../docs/specs/004-interface-design/blueprints/viewer.md),
[local repositories](../docs/specs/007-local-repositories/blueprints/local-repositories.md),
[Rust](../docs/specs/003-system-architecture/blueprints/rust.md).

Branch `feat/separate-towns`, stacked on `local-beside-search` (#36); rebase onto main when #36 merges.

## Phase 0: specification

- [x] Answers from Webber on the forks (off means as today; workspaces override apps and packages; every manifest;
      submodule contents, reachable locally; submodules on; libs, crates, services, modules, extensions; precompute only
      the separations a city records; a "Separate towns" group)
- [x] Spec: ground plan (vocabulary, input, Separate towns, Submodules, determinism), viewer, local repositories, scope
- [x] Blueprints: region (parts, nesting, highways to the parent town), model (`Snapshot.submodules`, the city's
      `separable` and `declared`), fold (gitlinks, `.gitmodules`, submodule trees, renames, events), viewer (the group,
      disabled state, variants), local repositories (submodule indexes), Rust; DEFAULTS rows; COMPLETENESS
- [x] Ambiguities resolved in the spec deleted from `AMBIGUITIES.md`
- [x] Commit

## Phase 1: TypeScript engine

- [x] `Separation` type, `SEPARATIONS`, `DEFAULT_SEPARATIONS`; `Options.separate` replaces `split`; `settingKey`
- [x] Members per separation from a snapshot (pure, test-first): workspaces (declared only), submodules, folder kinds
      (root child folders; `plugins` at any depth), the override, outermost per separation, one town per folder
- [x] Parts: nested separate towns, each excluding the towns beneath it; highways to the parent town
- [x] `separable(snapshot)` and `declared` on the city; city schema and `parseCity`
- [x] Defaults change: golden towns unchanged (no separate member in them); every separation off lays the towns
      `split: []` laid (compose tests); Rust fixtures re-derived with the port (Phase 3)
- [x] Gate: format, lint, typecheck, coverage
- [x] Commit

## Phase 2: TypeScript history and CLI

- [x] `.gitmodules` parsed (path, name, url) at the commits that change it, as manifests are
- [x] Single state (`tree.ts`): a gitlink's pinned tree read from `.git/modules/<name>` or the submodule's `.git`;
      nested; unreachable as one file; `history/submodule-unavailable`
- [x] Fold (`read.ts`): a moved gitlink's tree difference (births, deletions, exact renames), inside windows too; resume
      from a lock
- [x] `--separate=` replaces `--split=` (usage, validation); parity and stability scripts
- [x] Tests on real fixture repositories with submodules (initialised, not initialised, nested, moved)
- [x] Commit

## Phase 3: Rust

- [ ] Parity fixtures regenerated (the defaults changed; Rust follows in this phase)
- [ ] Port separations, parts, city fields, `.gitmodules`, submodule trees in single state and fold, `--separate=`
- [ ] Rust tests; `bun run rust:check`
- [ ] `bun run parity` with the defaults, each separation alone, and none; a repository with submodules (rust, deno)
- [ ] Commit

## Phase 4: web readers

- [x] Local: submodule entries from the index, `.gitmodules`, each submodule's index through its git data inside the
      picked folder (handle and folder input); unreachable as one file; logs
- [x] GitHub: `commit` tree entries, `.gitmodules` read, github.com submodules' trees at their pinned commit (folder by
      folder when truncated), other hosts as one file; requests counted
- [x] Commit

## Phase 5: viewer

- [ ] "Separate towns" group: switches, tooltips, disabled Apps and Packages with the line, relevance from the city
- [ ] Live lays with the separations; bundled variant names and loading; city file disabled
- [ ] End to end: the group, a local repository with a submodule, axe light and dark
- [ ] Commit

## Phase 6: bundled cities

- [ ] `scripts/bundle/` names variants by toggles and separations; lays only the separations each city records
- [ ] Lay the bundled cities; measure raw, gzipped and git pack sizes; surface the trade-off if unreasonable
- [ ] Commit

## Phase 7: verification and fold-back

- [ ] Run it: the CLI on rust and deno with submodules; the viewer on a local repository with submodules, on GitHub (a
      repository with github.com submodules), and on the bundled cities; read the logs
- [ ] `bun run check`; e2e; parity
- [ ] PR with images; `~/PR_RESULTS.md`
- [ ] Fold-back: spec reconciled to what shipped, blueprints re-derived, every symbol, file and reference verified
