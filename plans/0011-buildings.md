# Plan 0011: buildings that show health

A building on every lot in a returning Buildings view: height from size, floors of windows lit by how tested the file
is, colour by folder or by a measure on a switch. Measures come from wherever the city came from: GitHub live, a picked
folder, or the CLI with its history and coverage reports. Spec: [buildings](../docs/specs/008-buildings/buildings.md),
[viewer](../docs/specs/004-interface-design/viewer.md) (Layout, Map, Hover and select).

## Phase 1: research and blueprint

- [x] Webber's choices: 3D returns as the Buildings view; height is size; windows are floors with the lit share tested;
      colour is folder by default, measures on a switch
- [x] Spec: measures, sources, availability, a lot of several files, channels, the city file, privacy; viewer changes
- [x] Research: coverage report formats in the wild (LCOV, Istanbul JSON, Cobertura, JaCoCo; their path forms), test
      naming conventions per language over the corpus (how often "tested by name" finds a test that exists),
      colour-blind safe ramps per theme, drawing windows on facades in three.js at 75,000 buildings
- [x] Blueprint (new `docs/specs/008-buildings/blueprints/`): the measures section of the city file (fields, units,
      unknown, versioning), the measure readers per source, the by-name rule as a pure shared function, the report
      parsers and path matching, aggregation, scales, the facade shader, the colour ramps; error codes, logs; defaults
      and completeness

## Phase 2: measures in the engine and CLIs

- [x] City file: a measures section beside the layout, read and written by both CLIs; a city without it still opens
      (tests first; parity unchanged for cities without measures)
- [x] Tested by name and kind from paths (pure, shared; TypeScript and Rust)
- [x] CLI: size (lines and bytes) at the laid commit without fetching missing objects; recency, churn and authors from
      the history the fold already reads; comments and TODOs
- [x] CLI: coverage reports (`--coverage=<file>` and the usual paths), four formats, paths matched; unknown where not
      covered
- [x] Rust: the same, byte for byte; `bun run parity` with measures on every mode
- [x] Layout untouched: cities and locks byte-identical with and without measures on the corpus
- [x] Bundled cities rebuilt with measures

## Phase 3: measures in the browser

- [x] Live GitHub: sizes from the tree (no extra request), tested by name, kind
- [x] Picked folder: sizes from the git index; lines, comments and TODOs from contents under 50 MB; a coverage report in
      the folder
- [x] Aggregation per lot and per-city scales (pure, tests first)

## Phase 4: the Buildings view

- [x] The view switch returns: Plan and Buildings (dimetric 30° and 45°), keeping centre and zoom (tests first)
- [x] Buildings: height from size, floors, windows drawn on facades with their lit share, unknown in a neutral tone and
      a hatched roof; picking hits buildings at their tops
- [x] Budget: linux's 75,000 buildings draw and answer within the vitals budgets on a 4x slowed phone

## Phase 5: colour and reading

- [x] "Colour by" in the legend: folder and six measures, unavailable ones with their reason; ramps per theme, light and
      dark, colour-blind safe; scales in the legend
- [x] Hover card and drawer: measure rows with their sources; a lot of several files lists them
- [x] The legend folds behind a button on a phone

## Phase 6: proof

- [ ] Unit tests at 100 %; `bun run check`; parity
- [x] End-to-end: Buildings view, colour switch by keyboard, unavailable measures, a picked fixture folder with a
      coverage report, cards with measures, axe light and dark, no card overlap at every width, vitals
- [ ] Measured: corpus share of sources tested by name against real coverage where the corpus has it; linux's draw time
      and memory in the Buildings view; city file sizes before and after
- [x] Screenshots: plan and Buildings, each colour, light and dark, a phone

## Phase 7: ship

- [x] README: buildings, with pictures
- [ ] Fold-back: spec and blueprint match what shipped; every symbol and reference verified
- [ ] PR with pictures, CI green, squash-merge, Pages verified, `~/PR_RESULTS.md`
