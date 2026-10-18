# 0014 Separate towns

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

- [x] Parity fixtures regenerated (the defaults changed; Rust follows in this phase)
- [x] Port separations, parts, city fields, `.gitmodules`, submodule trees in single state and fold, `--separate=`
- [x] Rust tests; `bun run rust:check`
- [x] `bun run parity` with the defaults, each separation alone, and none; a repository with submodules (rust, deno)
- [x] Commit

## Phase 4: web readers

- [x] Local: submodule entries from the index, `.gitmodules`, each submodule's index through its git data inside the
      picked folder (handle and folder input); unreachable as one file; logs
- [x] GitHub: `commit` tree entries, `.gitmodules` read, github.com submodules' trees at their pinned commit (folder by
      folder when truncated), other hosts as one file; requests counted
- [x] Commit

## Phase 5: viewer

- [x] "Separate towns" group: switches, tooltips, disabled Apps and Packages with the line, relevance from the city
- [x] Live lays with the separations; bundled variant names and loading; city file disabled
- [x] End to end: the group, a local repository with a submodule, axe light and dark
- [x] Commit

## Phase 6: bundled cities

- [x] `scripts/bundle/` names variants by toggles and separations; lays only the separations each city records
- [x] Lay the bundled cities; measure raw, gzipped and git pack sizes; surface the trade-off if unreasonable (304
      variants: 311 MB raw, 49.6 MB gzipped, 4.1 MB in a git pack, from 62 MB, 10 MB and 2.0 MB; one variant at a time,
      at most 202 kB gzipped: reasonable, reported)
- [x] Commit

## Phase 7: verification and fold-back

- [x] Run it: the CLI on rust and deno with submodules; the viewer on a local repository with submodules, on GitHub (a
      repository with github.com submodules), and on the bundled cities; read the logs
- [x] `bun run check`; e2e; parity
- [x] PR with images; `~/PR_RESULTS.md` (#37, stacked on #36)
- [x] Fold-back: spec reconciled to what shipped, blueprints re-derived, every symbol, file and reference verified

## Phase 8: integration with main

Main gained buildings and measures (#40), bundled cities laid by the Pages workflow and never committed (#41), authors
mapped by the laid commit's `.mailmap` (#42) and the local repository button beside the search (#36). Merged, not
rebased.

- [x] Merge `origin/main` with a merge commit; every conflict resolved keeping both features whole; the committed city
      files dropped
- [x] The Rust city file keeps `declared` and `separable` beside the measures (both CLIs, tested)
- [x] The history reader records a commit's own changes before its pins expand (both CLIs)
- [x] Local and GitHub reads carry submodule files' sizes (their own indexes, their own trees)
- [x] Plan renumbered `0014` (0011 is buildings, 0012 exploring the city, 0013 claimed by #49)
- [x] CLI measures for submodule files: contents read from each submodule's git data at its pin (both CLIs)
- [x] A lot whose files carry no history gives no author count (both CLIs)
- [x] `scripts/bundle-cities.ts` lays each city's separation states at its pin; a full `bun run bundle` timed and
      measured (304 variants, 839 s locally, 462 MB raw, 67 MB gzipped; CI matches local per variant)
- [x] Merge `origin/main` again (#43 to #54: exploring the city, the end-to-end CI job), with a merge commit
- [x] Bundle lays in parallel, bounded by the cores (`CITYMAP_BUNDLE_JOBS` lowers it), logged as `bundle/pool`
- [x] The parallel bundle proven byte-identical to a serial run, once, locally (305 files; 1,066 s serial, 279 s at four
      jobs)
- [x] A submodule's files carry no history, and say why ("A submodule's own history is not read"); the measures section
      names the submodule folders (both CLIs)
- [x] Spec: the combinatorial limit of precomputed variants, laying in the browser on demand as the long-term answer; a
      submodule's files without history
- [x] Merge `origin/main` once more (#49 the layout worker, #55 to #57, #56 the `.mailmap` fetch), with a merge commit;
      the worker lays with the separations; `measures/done` counts what the section holds in Rust too
- [ ] `bun run check`; `bun run parity` in every mode (state, fold, resume, checkout, coverage) and with separations
      (each alone, none), plus a repository with submodules
- [x] End to end (`CITYMAP_E2E_PORT=5198`; 120 passed, 46 skipped by device, 0 failed); screenshots of separated towns
      in plan and Buildings views, light and dark
- [ ] PR description updated
- [x] Fold-back: specs and blueprints across both features, `docs/specs/README.md`, every symbol, file and reference
      verified
