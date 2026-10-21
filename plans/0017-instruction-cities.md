# Plan 0017: instruction cities

Agent instructions laid as a city: every way one file reaches another drawn as an arrow, scopes and sources as colour,
two layouts in one city file, what each session costs, and a lint. Spec:
[instruction cities](../docs/specs/010-instruction-cities/instruction-cities.md); blueprint:
[instruction cities blueprint](../docs/specs/010-instruction-cities/blueprints/instruction-cities.md) (with its
[defaults](../docs/specs/010-instruction-cities/blueprints/DEFAULTS.md)). Every step lands in TypeScript and Rust
together, tests first (red, green, commit, refactor, commit), and no step is done until `bun run check` passes. Nothing
from a private repository enters this repository: tests, examples and screenshots use the fixture corpus only.

## Phase 1: answers and groundwork

- [ ] Ask the operator the blueprint's open questions (§ Open questions); fold each answer into the spec, then the
      blueprint and its defaults, and delete its `AMBIGUITIES.md` entry
- [ ] Confirm the latest versions of `sha2` and `ureq` (Rust) and of three.js's line material, and record them
- [ ] Scaffold `packages/instructions` (pure, valibot only, Vitest project, 100 % coverage, `tsconfig` reference) and
      `rust/crates/instructions` (`citymap-instructions`: `regress`, `serde`, `serde_json`; workspace lints)
- [ ] Architecture: add `citymap-instructions` to the Rust blueprint's workspace table and module map

## Phase 2: the fixture corpus

- [ ] Write the corpus under `packages/instructions/fixtures/corpus/` (invented content, neutral names: `home`,
      `library`, `project-a`), holding one case for every edge kind, scope, finding kind, duplicate, contradiction
      candidate, placeholder, reserved name and hop distance the blueprint's Testing table names
- [ ] Transcripts in both formats under the corpus home (invented sessions, fixed timestamps), and a prefilled
      contradiction cache
- [ ] `scripts/instruction-fixtures.ts`: build the corpus into a temporary folder (git repositories with fixed authors
      and dates, the library's two commits, links), logging what it built; a test proves two builds are identical
- [ ] Privacy check: `git grep` the corpus for any name of a real repository, person or machine path; none

## Phase 3: text, grammar and tokens

- [ ] `tokens`: estimated tokens in UTF-16 units (tests first; Rust twin)
- [ ] `text`: lines, CommonMark fences (closed, unclosed, tildes, longer closers), prose masks
- [ ] `grammar`: the four patterns, reading order, overlap priority, explicit references, placeholders; Rust on
      `regress` with the same pattern text, a shared case table proving equal matches
- [ ] `code`: imports, joined strings, candidates and their bounds, inject, depend, cite
- [ ] `settings`: commands and their paths; settings that are not JSON

## Phase 4: sources, the walk and scopes

- [ ] `packages/history`: `listTracked` and `isRepository` (tests on temporary repositories; Rust twins)
- [ ] `harness`: entries, mount folders, stacked files, harnesses of an entry
- [ ] `resolve`: the resolution order, folder indexes, `~/`, outside, broken, citation of code (an in-memory reader)
- [ ] `walk`: seeds, structural edges, the queue, hop limit, one edge per pair, numbering; determinism property test
- [ ] `scope`: the relaxation, discovery order, first parent
- [ ] CLI reading (`apps/cli/src/instructions/read.ts`, Rust `read.rs`): sources, skipped files, links, the disk reader;
      tests on the built corpus

## Phase 5: the command line

- [ ] `args`: `--instructions` and its flags, every rejection and message, the usage paragraph (both CLIs, word for
      word)
- [ ] The run's rejections: `instructions/no-repositories`, `not-a-repository`, `duplicate-source`, `unknown-library`,
      `entry-missing`, `entry-outside`, `no-entries` (tests first, exit codes)

## Phase 6: projections and the fold

- [ ] `project`: neutral names, reserved suffix, collisions, by source, by scope, pages, page share at each step's
      boundary
- [ ] `snapshot`: the projection as engine input, identities for life, towns as workspaces; prove on the corpus that the
      towns are the sources, no root town is laid, and every lot is source land (`classifyLandUse`)
- [ ] `fold`: both layouts in single state; then the first library's history (blobs by id, the share at the target), and
      the two locks resumed as a pair; parity of resumed and uninterrupted folds
- [ ] City file: `layouts` and the raw sections in `packages/measures` (round trip, `city/bad-shape` under
      `/layouts/scope`, byte-identical cities without them); Rust twin
- [ ] `section`: the four sections' schemas, versions, indices, `buildSections` order; Rust twin

## Phase 7: scenarios, lint, duplicates, usage, contradictions

- [ ] `scenario`: scenarios and stacks in harness order; `bill`: price, cost, budget; `--budget` failing after writing
- [ ] `lint`: each finding kind and each non-finding, fixes word for word; `--check` failing after writing
- [ ] `duplicates`: normalisation, sentences, shingles at 79 % and 80 %, buckets and the common-shingle cut
- [ ] `usage`: both line formats, the window with `CITYMAP_NOW`, scenario attribution, inlined unknown; CLI
      `transcripts` streaming with the modification-time skip; a city with and without transcripts lays the same layout
      bytes
- [ ] `contradiction`: rule sentences, subjects, candidates and their cut, prompt, verdicts, cache text; CLI `model`
      against a fake loopback server (answers, refusals, a non-loopback URL, a missing verdict, the cache's mode)
- [ ] `hints`: make lazy and make eager, largest first
- [ ] Observability: every `instructions/*` line in order, asserted on the corpus in both CLIs

## Phase 8: parity

- [ ] `bun run parity --instructions`: build the corpus; both CLIs in single state, folded with `--lock`, and resumed;
      city files, SVGs, locks and logs byte for byte, usage and contradictions included
- [ ] Rust tests twin every TypeScript test of `packages/instructions` and the CLI's instruction cases, by name

## Phase 9: arrows and drawing

- [ ] `packages/themes`: edge, scope and source colours per brightness; a test proves 3:1 on every theme's ground
- [ ] `arrows`: which edges are arrows, strong and faint, anchors in integers, the curve and its head
- [ ] `packages/svg`: arrows over the lots from plain `SvgArrow`s, titled; Rust twin; SVG parity on the corpus
- [ ] `packages/scene`: arrow batches per kind and weight (plan and arcs over roofs), the roadworks flag in the lot
      table and the shader

## Phase 10: the viewer

- [ ] The worker: parse the sections, keep both cities, build each layout's scene, pick index and arrow batches
- [ ] Layout switch in the "City layout" popover, enabled for a city file; switching keeps view, kinds, scenario and
      selection as the blueprint says
- [ ] Arrow legend with mixed states; batches shown and hidden without rebuilding
- [ ] Selecting a file: its edges only, strong; its card's "Reaches" and "Reached by"
- [ ] Scenarios in the drawer: lit stack, the bill with and without a price, sessions, hints, the empty states
- [ ] Buildings: height from tokens, windows by usage, colour by scope, source, usage and findings, folder tint per
      instruction, roadworks
- [ ] Hover cards and search by `source/path`; every copy line word for word
- [ ] Logs: `viewer/instructions`, `viewer/instruction-layout`, `viewer/arrows`, `viewer/scenario`,
      `viewer/sections-failed`

## Phase 11: proof

- [ ] Unit tests at 100 % in every package touched; `bun run check`; `bun run parity --instructions`
- [ ] End to end (light and dark) on the corpus city file: layout switch by keyboard, each arrow kind, a selected file's
      edges, a scenario's bill and hints, the four new colour-by choices, roadworks, axe clean, no card overlap at every
      width, INP and CLS budgets on a 4x slowed phone
- [ ] Budgets measured on the corpus scaled up synthetically (10,000 laid files; 1 GB of generated transcripts): the
      graph under 2 s, transcripts under 10 s, the lay under 1 s at 12,000 lots; recorded in the blueprint
- [ ] A local instruction city of the operator's own sources laid and looked at on the machine only; nothing of it
      committed, posted or attached anywhere
- [ ] Privacy check of the whole branch: `git grep` for private repository names, person names and machine paths; none

## Phase 12: fold-back

- [ ] Fold-back: reconcile the spec with what shipped, re-derive the blueprint, its defaults and completeness from it,
      update the architecture, viewer and buildings specs and their blueprints where they changed, and verify every
      symbol, file, constant, log line and reference named in them exists as named
