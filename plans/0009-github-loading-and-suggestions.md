# Plan 0009: large repositories load visibly, and owners' repositories are suggested

A progress card over the map while anything loads, and repository suggestions after `owner/`. Spec:
[viewer](../docs/specs/004-interface-design/viewer.md) (Loading, Repository suggestions, A GitHub repository, live).

## Phase 1: spec and blueprint

- [x] Spec: Loading (phases, one bar, counts, estimate, cancel, threshold, accessibility) and Repository suggestions
      (source, ranking, shape, caching, the shared hourly allowance, failures)
- [x] Blueprint: the progress model (phases, weights, monotonic fraction, estimate), its events from the reader, the
      worker and the scene; the suggestion sources and their requests; error codes; defaults and completeness
- [ ] Measure the phases on linux, next.js, react and takken.io (requests, folders, files, worker and scene times on a
      laptop and a 4x slowed phone), to set the weights

## Phase 2: progress at its sources

- [x] `readRepository` reports folders read of folders known, requests and manifests; takes an `AbortSignal` (tests
      first)
- [x] The engine reports laying progress (files placed of files) through a callback, without changing its output
      (byte-identical lay; Rust parity unaffected, the callback is TypeScript only or mirrored as a no-op)
- [x] The layout worker posts progress at most every 100 ms and can be ended
- [x] Bundled city and file loads report bytes of bytes
- [ ] Building the scene for linux: measure; move it to the worker if it blocks the main thread for over 200 ms

## Phase 3: the progress card

- [x] `progress.ts`: the pure model (phase, fraction that never falls, counts in words, time spent, estimate once
      steady), tests first
- [ ] `LoadingCard`: over the free map, after 300 ms, at least 400 ms once shown, the last city dimmed beneath;
      `progressbar` with value and phase as text, phase changes announced; sweep, still under reduced motion
- [ ] Cancel and Escape abort requests and end the worker; the last city stays (tests)
- [ ] Logs: `viewer/load-phase`, `viewer/load-cancelled`, `viewer/load-done ms`

## Phase 4: repository suggestions

- [ ] `suggest.ts`: parse `owner/prefix` (and URLs); rank by starts-with, contains, stars (tests first)
- [ ] `ownerRepositories`: one request per owner (`/users/{owner}/repos`, newest pushed first, 100 per page), kept ten
      minutes in the tab; the repository search for a name past the first page; named failures (unknown owner, limit
      with reset time, offline); reads the remaining allowance (tests with a stubbed fetcher)
- [ ] SearchBox: an "On GitHub" group after the city's matches (city at most three then), seven in all; marked names,
      one-line descriptions, stars, language, fork and archived; the remaining allowance in the summary
- [ ] Debounce so typing a name costs one request per owner, measured

## Phase 5: proof

- [ ] Unit tests at 100 %; `bun run check`
- [ ] End-to-end with GitHub answered from fixtures: linux-sized folder-by-folder read shows progress and a count,
      cancel keeps the last city; suggestions for an owner, keyboard picking, unknown owner, limit reached; axe light
      and dark with the card and the suggestions open; vitals (CLS 0, INP)
- [ ] On the live page: torvalds/linux loads with the card; `facebook/` suggests react; screenshots

## Phase 6: ship

- [ ] Fold-back: spec and blueprint match what shipped; every symbol and reference verified
- [ ] PR with pictures, CI green, squash-merge, Pages verified, `~/PR_RESULTS.md`
