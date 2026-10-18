# Plan 0013: the indexes off the main thread

After a city opens, the viewer still builds the pick index and the search index on the main thread, so a tap or a key
press landing meanwhile waits (on a slowed phone about 0.1 s for livediagram, 0.7 s for linux). Every opening (a bundled
city, a layout variant, a city file, a GitHub or local repository) goes through the layout worker, which reads or lays
the city, builds its scene and its pick index there and hands them over without a copy; what must stay on the main
thread runs in slices that yield to input. Spec: [viewer](../docs/specs/004-interface-design/viewer.md) (Loading, Web
experience); blueprint: [viewer](../docs/specs/004-interface-design/blueprints/viewer.md) (Picking, A GitHub repository
live, Loading, Web experience).

## Phase 1: measure main

- [x] A measuring spec (`e2e/vitals-opening.spec.ts`): the longest main-thread task and the blocking time while opening
      livediagram, switching its layout, and opening linux from a city file and from GitHub, on the slowed phone
- [x] Main measured: the opening spec, and the phone budget run 20 times (its failure rate and slowest answers)
- [x] Where main's time goes, in Chromium: parsing, validating, the scene, the pick index, the search index, the city's
      structured clone

## Phase 2: spec and blueprint

- [x] Spec: every opening is read or laid in the worker; the indexes are built there or in slices; the budgets
- [x] Blueprint: the pick index's flat form (columns, grid, attach, a town's view), the worker's requests and answers,
      the city crossing as text, the search index in slices, logs, constants, tests; DEFAULTS and COMPLETENESS

## Phase 3: the pick index as flat arrays

- [x] `pickGrid(city)` and `pickFrom(city, grid)`: typed arrays and a dense grid; `pickIndex` is the two together; the
      existing tests pass unchanged (tests first for the flat form, its buffers and a town's view)
- [x] Same answers: every point of a fine raster over every bundled city and linux picks the same hit as before
- [x] A town shown alone picks from the whole city's index, restricted to that town (no index built on a drill)

## Phase 4: every opening through the worker

- [x] The worker reads a city file's text as well as laying a snapshot: validates, builds the scene and the pick grid,
      and answers with the city file's text (laid) and the grid's buffers, transferred; errors keep their code
- [x] The main thread parses the city file it is handed without validating it again, and attaches the pick grid
- [x] Bundled cities, variants and city files open through it; the loading phases stay as they are
- [x] The search index is built in slices that yield to input once the city shows; search waits for it
- [x] Logs for every new decision point and failure

## Phase 5: proof

- [x] Unit tests at 100 %; `bun run check`; parity untouched
- [x] End-to-end: the journeys on desktop and phone; the opening spec after, against main; the phone budget run 20 times
      against main's failure rate; linux's buildings budget
- [x] Screenshots before and after (dark and light): nothing visible changes
- [x] Fold-back: spec and blueprint reconciled to what shipped; every symbol, file and reference checked
- [x] PR with the measurements (not merged)
