# 0006 Resumed folds equal uninterrupted ones

A fold resumed from a lock saved part way did not always write the same lockfile as the fold left uninterrupted (rust
and next.js, both CLIs alike). Spec: [ground plan](../docs/specs/006-ground-plan/ground-plan.md) § Fold schedule,
Invariants. Blueprints: [fold](../docs/specs/006-ground-plan/blueprints/fold.md) § Fold,
[layout](../docs/specs/006-ground-plan/blueprints/layout.md) § Neighbourhood,
[Rust implementation](../docs/specs/003-system-architecture/blueprints/rust.md) § Types, Parity.

Branch `fix/resume-matches-fold` in the worktree `../citymap-resume`.

## Phase 0: reproduce and find the cause

- [x] Worktree from `origin/main`; the old `citymap-stride` worktrees removed
- [x] A probe that folds a repository, branches a resumed fold (lock written, parsed, its commit laid again) at save
      points, and reports the first commit and plat field where the two differ
- [x] Smallest reproduction: takken.io, every save point before commit 120 diverges at 120 (an old town frozen with a
      lot at another address); the re-laid city already differs from save point 6 (vacant lots in another order)
- [x] First cause: a grid's `slots` record read in insertion order (slot claims, vacant lots drawn in that order); a
      lockfile keeps the records but sorts their keys
- [x] Second cause: the resume rebuilds the towns as last laid by laying the lock's commit again, which is exact only if
      a lay is settled; renewal was judged before vanished slots were dropped, so a lay could leave a renewal pending
      (synthetic history, commit 20)
- [x] Third cause, beyond the engine: the towns as last laid kept a town the last lay did not lay (no land), which a
      re-laid commit does not rebuild
- [x] Fourth cause, in the reader (the CLI resume on next.js still differed, both CLIs): with a manifest blob missing
      from a blob-less clone, the reader kept patterns of an older blob it had read on the way; a read that begins at
      the lock's commit never saw it, and laid next.js without its workspace towns from commit 32,214

## Phase 1: spec and fix

- [x] Spec: the resumption guarantee, sorted reads and settled lays as invariants, remembered lots for renewal
- [x] Blueprints: fold (resumption, testing), layout (slot claims, renewal order), Rust (record order, parity resume)
- [x] TypeScript, test-first: a lay from a read-back plat, a re-lay of each commit, resumes from several save points
- [x] Rust, test-first: the same history generator and tests
- [x] Towns as last laid: only the towns the last lay laid, test-first in both
- [x] Reader: a manifest known by its newest blob the repository holds since it was added, test-first in both
- [x] Parity: a `resume` mode that resumes each fold from a lock saved part way, in both CLIs, against the uninterrupted
      fold
- [x] Parity fixtures regenerated (unchanged); gate (format, lint, typecheck, coverage, `rust:check`, mimalloc lint)
- [x] Commit

## Phase 2: proof and measurements

- [x] Probe on the corpus at every laid step (takken.io to rust): no differences in the engine
- [ ] `bun run parity --long` (state, fold, resume): identical, resumed folds equal uninterrupted ones
- [ ] The six large repositories, Rust CLI: a fold resumed at the parity resume point equals the uninterrupted fold
- [ ] Lock size before and after; files without a lot and fold times, against `origin/main`
- [ ] Bench and fold ratchet; rebased only where explained
- [ ] Commit

## Phase 3: finish

- [ ] Fold-back: spec reconciled to what shipped, blueprints re-derived, every symbol and reference verified
- [ ] Commit, push, open the pull request (not merged)
