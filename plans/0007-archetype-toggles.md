# 0007 Archetype toggles

Four opt-in archetypes from the research (corridor, archipelago, quarters, tiers) ship in the product engine as toggles,
corridor and tiers on by default, and the viewer switches between precomputed variants with a settings cog. Spec:
[ground plan](../docs/specs/006-ground-plan/ground-plan.md) § Toggles;
[viewer](../docs/specs/004-interface-design/viewer.md) § Layout toggles. Blueprints:
[toggles](../docs/specs/006-ground-plan/blueprints/toggles.md),
[viewer](../docs/specs/004-interface-design/blueprints/viewer.md) § Layout toggles,
[Rust](../docs/specs/003-system-architecture/blueprints/rust.md).

Branch `feat/archetype-toggles` in the worktree `../citymap-forms`. The lock-resume work (`fix/resume-matches-fold`)
touches the fold and the plat: rebase onto main when it merges.

## Phase 0: groundwork

- [x] Worktree from `origin/main`; read the research section "Opt-in archetypes", the prototype, the product engine and
      its history (forms and plat fields grow as optional records; settings key the plat)
- [x] Before measurements on `origin/main`: `bun run bench --folds`, stability on nine windows
      (`~/.cache/citymap/forms/before-bench.log`, `stability-before.log`)
- [x] Spec: ground plan § Toggles, vocabulary, archetypes, presentation; scope; viewer § Layout toggles
- [x] Blueprints: toggles (new), layout, model, region, fold, Rust, viewer; defaults rows
- [x] This plan
- [x] Commit

## Phase 1: TypeScript engine

- [x] Toggles in `Options`, `settingKey`, `LayoutOptions`, `Ctx.toggles`; cache constants
- [x] Tree: `member`, `sourceMille`, `TreeOptions.members`, `isPackage`; digest
- [x] Classify: features, the three rules with their bands and toggles
- [x] Tiers: `townTier`, `classOf`, `reclassOf`, `rightOfWayFor`; `decide`'s `how`; radial, high street
- [x] Corridor
- [x] Waterway (twin's river moved out), archipelago, island groups; `Town.canals`
- [x] Quarters and frame splits
- [x] Plat schema and city schema; forget; events
- [x] Themes (canal colours, form colours), SVG and scene canals
- [x] All toggles off lays the bytes of `origin/main` (golden towns, corpus `cmp`)
- [x] Gate: format, lint, typecheck, coverage
- [x] Commit

## Phase 2: command line and scripts

- [x] `--toggles=` in the TypeScript CLI (usage, validation), stability script, parity script `--toggles=`
- [x] Parity fixtures regenerated
- [x] Commit

## Phase 3: Rust

- [x] Port options, tree, classify, tiers, decide, corridor, waterway, archipelago, quarters, plat, city, themes, SVG
- [x] Rust tests ported; `bun run rust:check`
- [x] `bun run parity` with the defaults, each toggle alone, and none
- [x] Commit

## Phase 4: bundled variants

- [x] `scripts/bundle/bundle.ts` (combinations, names, index) test-first; `scripts/bundle-cities.ts` lays all sixteen
- [x] Lay the six bundled cities; measure the size on GitHub Pages (raw and gzip); surface the trade-off if unreasonable
      (96 variants: 62.2 MB raw, 10.0 MB gzipped, 1.7 MB in a git pack; one variant at a time, 35 to 320 kB gzipped:
      reasonable, no question)
- [x] Commit

## Phase 5: viewer

- [x] `cities.ts` variants; `liveOptions(toggles)`, worker message
- [x] `Toggles` popover with tooltips, Escape order; `ViewControls` cog; phone row
- [x] `Viewer`: toggles state, variant loading, live re-lay, city file disabled, logs
- [x] Component tests; gate
- [x] End-to-end: keyboard, axe light and dark (tooltip shown), no card overlap at every width, vitals
- [x] Commit

## Phase 6: measurements

- [ ] After: `bun run bench --folds` (budgets, corpus ratchet, morphometrics), stability for the defaults, none and each
      toggle alone; ratchets rebased only where numbers improve or the change is explained
- [ ] Commit

## Phase 7: finish

- [ ] README text and pictures (before and after)
- [ ] Rebase onto main if the resume work merged; resolve; gate and parity again
- [ ] Fold-back: spec reconciled to what shipped, blueprints re-derived, every symbol, file and reference verified
- [ ] Commit, push, open the pull request with before and after pictures (not merged)
