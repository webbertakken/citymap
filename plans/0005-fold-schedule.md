# 0005 Fold schedule

Long histories fold in windows anchored to the root: the recent commits one by one, older ones in windows of 100, and
the oldest of a very long history in windows of 1,000. Spec: [ground plan](../docs/specs/006-ground-plan/ground-plan.md)
§ Fold schedule. Blueprint: [fold](../docs/specs/006-ground-plan/blueprints/fold.md) § Fold schedule.

Branch `feat/fold-schedule` in the worktree `../citymap-stride`.

## Phase 0: groundwork

- [x] Worktree from `origin/main`; read the ground plan spec, the fold blueprint, `readHistory`, the CLI, the bench and
      stability scripts, and their Rust counterparts
- [x] Before measurements started on `origin/main` (per-commit fold): final city, fresh lay, a lock 1,001 commits back
      for tail stability, TypeScript fold times where none are on record
- [x] Spec: ground plan § Fold schedule, vocabulary, invariants; scope's stability line
- [x] Blueprint: fold § Fold schedule, observability, performance, testing; Rust blueprint § History; defaults ledger
      rows; completeness
- [x] This plan
- [x] Commit

## Phase 1: TypeScript

- [x] `foldSchedule` and `isLaid` as pure functions, test-first, with the strides as named constants
- [x] `countCommits` (`git rev-list --first-parent --count`), test-first
- [x] `readHistory` lays only the schedule's commits (the lock's commit first), reads manifests only for them, and emits
      `history/schedule`; strides injectable for tests
- [x] CLI summary: `commits=` counts the commits folded, `laid=` the lays
- [x] Stability script: `--lock=<file>` starts from a lock
- [x] Bench: the react fold budget keeps timing every commit (`EVERY_COMMIT`)
- [x] Gate: format, lint, typecheck, coverage
- [x] Commit

## Phase 2: Rust

- [x] `schedule.rs`: the same functions and constants, the same tests
- [x] `count_commits`, `read_history` on the schedule, `HistoryEvent::Schedule`
- [x] CLI summary as in TypeScript
- [x] Parity fixtures (unchanged: synthetic snapshots); `bun run rust:check`
- [x] `bun run parity` (both CLIs byte-identical, including redux and livediagram, now windowed)
- [x] Commit

## Phase 3: proof and measurements

- [x] Histories of 1,000 commits or fewer fold byte-identically to `origin/main` (corpus: city, lock, SVG; four
      repositories up to 1,069 commits, `cmp`)
- [x] `bun run bench` and `bun run bench --folds`, before and after (budgets and corpus ratchet unchanged; folds 35
      → 19)
- [x] After: fold time, files without a lot, fresh lay, stability for react, next.js, home-assistant, rust, typescript
      and linux
- [x] Ratchets rebased only where the numbers improve or are explained (`fold-baseline.json` 35 → 19; the corpus
      baseline is unchanged)
- [x] Commit

## Phase 4: finish

- [x] Surface the design fork: whether the per-commit fold stays reachable from the CLI (Webber: library only,
      `EVERY_COMMIT`; no CLI flag), recorded in the spec and blueprints
- [x] README: fold times and history; architecture and development notes on fold times
- [ ] Fold-back: spec reconciled to what shipped, blueprint re-derived, every symbol, file and reference verified
- [ ] Commit, push, open the pull request (not merged)
