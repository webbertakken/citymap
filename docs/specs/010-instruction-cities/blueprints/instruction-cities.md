# Instruction cities blueprint

Derived from [instruction cities](../instruction-cities.md), with the
[ground plan](../../006-ground-plan/ground-plan.md) (separate towns), the [buildings](../../008-buildings/buildings.md),
the [viewer](../../004-interface-design/viewer.md) (layout toggles, variants, hover and select) and the
[architecture](../../003-system-architecture/architecture.md) (Rust implementation, boundaries). Values the spec leaves
silent are in [DEFAULTS.md](DEFAULTS.md); decisions taken where the spec was first silent are recorded in the spec and
in the ledger.

Code: `packages/instructions` (pure: the grammar, the walk, scopes, both projections, scenarios and stacks, the lint,
duplicates, contradiction candidates, usage lines, hints, the bill, the sections), its Rust mirror
`rust/crates/instructions` (`citymap-instructions`); `packages/history` (tracked files, the first library's history and
contents); `apps/cli/src/instructions/` and `rust/crates/cli/src/instructions/` (reading the machine, the fold of both
layouts, transcripts, the local model, the city file); `packages/measures/src/section.ts` and its Rust module (the city
file's extra keys); `packages/themes` (arrow, scope and source colours); `packages/svg` (arrows in the SVG);
`packages/scene` (arrow geometry, roadworks); `apps/web/src/instructions/` and its components (the layout switch, the
arrow legend, scenarios, cards).

## Domain and naming

| Term             | Identifier                                      | Meaning                                                                             |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| source           | `Source`, `SourceKind`                          | `{ name, kind }`; kind `home`, `library` or `project`                               |
| instruction      | `FileKind` `"instruction"`                      | a held `.md` file (case-sensitive extension)                                        |
| code             | `FileKind` `"code"`                             | a held file of a code extension (`CODE_EXTENSIONS`) or a harness settings file      |
| file             | `InstructionFile`                               | an instruction or code file the city lays, with its scope, tokens, pages and edges  |
| harness          | `Harness`, `HARNESSES`                          | `pi`, `claude`, in that order                                                       |
| entry            | `Entry`                                         | `{ file, harnesses }`: a file a harness loads first                                 |
| edge             | `Edge`, `EdgeKind`, `EDGE_KINDS`                | `{ to, kind, line }`; kinds in the spec's order (below)                             |
| reference        | `Reference`                                     | one match of the grammar in an instruction: kind, raw path, line, explicit, fenced  |
| resolution       | `Resolution`                                    | where a reference lands: `held`, `outside`, `broken` or `placeholder`               |
| scope            | `Scope`, `SCOPES`                               | `global injected project role on-demand code unreached`, best first                 |
| scenario         | `Scenario`                                      | `{ harness, folder, stack, injected, tokens }`                                      |
| stack            | `Scenario.stack`                                | file indices in load order                                                          |
| page             | `PAGE_FILE`                                     | one projected file, `NNNNN.instr`, one lot of land                                  |
| page share       | `share`, `PAGE_TOKEN_STEPS`, `pageShare(graph)` | estimated tokens one page holds: 40, 100, 200, 400 or 1,000                         |
| estimated tokens | `estimateTokens(text)`                          | `ceil(utf16Length(text) / 4)`                                                       |
| graph            | `Graph`, `buildGraph(input, reader)`            | sources, entries, files, edges, outside counts, broken references                   |
| projection       | `Projection`, `project(graph, layout, share)`   | towns, and one projected path per page and per code file                            |
| layout           | `Layout`, `LAYOUTS`                             | `source`, `scope`, in that order; `source` is the default                           |
| usage            | `Usage`, `readUsage(lines, scenarios, window)`  | sessions per scenario and reads per file and scenario, over `USAGE_DAYS`            |
| finding          | `Finding`, `FindingKind`, `FINDING_KINDS`       | `{ kind, file, line, fix, other?, path? }`                                          |
| duplicate        | `duplicates(files, texts)`                      | sentence and paragraph pairs across two instructions                                |
| candidate        | `Candidate`, `contradictionCandidates(...)`     | a pair of rule sentences in one stack sharing a subject, differing in modality      |
| verdict          | `Verdict`                                       | the local model's answer for one candidate: contradicts or not                      |
| hint             | `Hint`, `hintsFor(scenario, sections)`          | `{ kind: "lazy" \| "eager", file, tokens, reads? }`                                 |
| bill             | `billOf(scenario, price)`                       | a stack's tokens, and with a price what a thousand calls cost, cached and uncached  |
| price            | `Price`                                         | `{ uncached, cached }`, micro-units per million input tokens                        |
| arrow            | `Arrow`, `arrowsOf(sections, layout, townOf)`   | an edge drawn: from, to, kind, `strong`, `within`                                   |
| roadworks        | `ROADWORKS` flag                                | the lot table's flag bit 2: the lot's file has a finding                            |
| sections         | `InstructionSections`, `parseSections(raw)`     | `instructions`, and when read `findings`, `usage`, `contradictions`                 |
| reader port      | `Reader`                                        | what the walk asks of the machine; the CLI answers from the disk, tests from memory |

- Scope identifiers are kebab case (`on-demand`); their words in copy and town names are the spec's (`on demand`).
- "Instruction city" is the only name for the whole; "graph", "projection" and "sections" are its parts. Never "doc",
  "rule file" or "context file" in identifiers.

## Module layout

`packages/instructions/src/` (pure; depends on no workspace package; its only library is valibot, as
`packages/measures`), each module with its test beside it, mirrored one for one in `rust/crates/instructions/src/`
(snake case; functions keep their names in snake case):

| TypeScript         | Rust               | Holds                                                                                      |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| `terms.ts`         | `terms.rs`         | the types and constants above                                                              |
| `tokens.ts`        | `tokens.rs`        | `estimateTokens`, `utf16Length`                                                            |
| `text.ts`          | `text.rs`          | `splitLines`, `fenceMask` (which lines are fenced), `prose(lines, mask)`                   |
| `grammar.ts`       | `grammar.rs`       | the reference patterns, `scanReferences(text)`, `isPlaceholder(token)`                     |
| `code.ts`          | `code.rs`          | `scanCode(text, path, candidates)`: imports, joined strings, inject, depend, cite          |
| `settings.ts`      | `settings.rs`      | `settingCommands(json)`: the commands of a harness settings file, `commandPaths(command)`  |
| `harness.ts`       | `harness.rs`       | `HARNESS_ENTRIES`, `MOUNT_FOLDERS`, `STACKED_FILE`, `SETTINGS_FILES`, `harnessesOf(entry)` |
| `resolve.ts`       | `resolve.rs`       | `resolveReference(reference, holder, reader)`: the resolution order                        |
| `walk.ts`          | `walk.rs`          | `buildGraph(input, reader)`: the breadth-first walk, the hop limit, edges                  |
| `scope.ts`         | `scope.rs`         | `scopesOf(graph)`, `discoveryOrder(graph)`, `firstParent(graph, file)`                     |
| `project.ts`       | `project.rs`       | `neutral(segment)`, `RESERVED`, `pageShare`, `project`                                     |
| `scenario.ts`      | `scenario.rs`      | `scenariosOf(graph, harnesses)`, `stackOf(graph, harness, folder)`                         |
| `lint.ts`          | `lint.rs`          | `lint(graph, texts, scenarios)`: every finding kind but duplicates                         |
| `duplicates.ts`    | `duplicates.rs`    | `normalise`, `sentencesOf`, `paragraphsOf`, `shingles`, `duplicates`                       |
| `contradiction.ts` | `contradiction.rs` | `ruleSentences`, `contradictionCandidates`, `promptOf`, `parseVerdict`, `cacheText`        |
| `usage.ts`         | `usage.rs`         | `readPiLine`, `readClaudeLine`, `scenarioOf`, `readUsage`                                  |
| `hints.ts`         | `hints.rs`         | `hintsFor`                                                                                 |
| `bill.ts`          | `bill.rs`          | `parsePrice`, `billOf`, `overBudget`                                                       |
| `arrows.ts`        | `arrows.rs`        | `arrowsOf`, `isArrow`, `isStrong`, `ARROW_KINDS_OFF_WITHIN`                                |
| `section.ts`       | `section.rs`       | the four sections' types, `buildSections`, `parseSections`, the versions                   |
| `index.ts`         | `lib.rs`           | the public surface                                                                         |

- `citymap-instructions` depends on `regress` (the grammar runs on an ECMAScript engine, so `\w`, `^`, `$` and
  lookbehind mean what they mean in TypeScript), `serde` and `serde_json`; nothing else, no I/O.
- The machine is read only in the apps: `apps/cli/src/instructions/` (`args`, `read.ts` the sources and the `Reader`,
  `snapshot.ts` the projection as engine input, `fold.ts` both layouts, `transcripts.ts`, `model.ts`, `run.ts`) and
  `rust/crates/cli/src/instructions/` (`mod.rs`, `read.rs`, `snapshot.rs`, `fold.rs`, `transcripts.rs`, `model.rs`). Git
  is run only by `packages/history` (`listTracked`, `isRepository`, `readHistory`, `listTree`, `readBlobs`) and
  `citymap-history`, as the architecture's boundary says.

## The command line (`apps/cli/src/args.ts`, `rust/crates/cli/src/args.rs`)

`--instructions` switches the command from one repository to an instruction city; its positionals are the repositories,
one or more, in order.

```ts
interface InstructionsCommand {
  readonly kind: "instructions";
  readonly repos: readonly string[]; // as given, in order
  readonly libraries: readonly string[]; // --library values, as given
  readonly entries: readonly string[]; // --entry values, in order; empty means the harness defaults
  readonly harnesses: readonly Harness[]; // --harness values in HARNESSES order; empty means every harness present
  readonly to: string; // the first library's commit (default HEAD)
  readonly history: boolean; // false with --no-history
  readonly lock: boolean;
  readonly out: string | null;
  readonly svg: string | null;
  readonly theme: ThemeName;
  readonly camera: Camera;
  readonly densityPct: number;
  readonly jog: "off" | "top-level" | "all";
  readonly warp: boolean;
  readonly loops: boolean;
  readonly toggles: readonly Toggle[];
  readonly price: Price | null; // --price=<uncached>,<cached>
  readonly budget: number | null; // --budget=<tokens>
  readonly check: boolean; // --check
  readonly contradictions: boolean; // --contradictions
  readonly verbose: boolean;
}
```

| Flag                     | Meaning                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `--instructions`         | lay the positionals as one instruction city                                                 |
| `--library=<repository>` | repeatable; names one of the positionals a library                                          |
| `--entry=<path>`         | repeatable, ordered; an entry anywhere on the machine (`~/` expanded, else from the cwd)    |
| `--harness=<name>`       | repeatable; `pi` or `claude`                                                                |
| `--price=<u>,<c>`        | per million input tokens, uncached then cached, decimals with at most six places            |
| `--budget=<tokens>`      | a positive integer; fails the run when any stack exceeds it                                 |
| `--check`                | fails the run when there is any finding                                                     |
| `--contradictions`       | asks the local model to judge the contradiction candidates (§ Contradictions)               |
| `--to`, `--lock`         | fold the first library's history to `--to`, and lock it (below)                             |
| `--no-history`           | lay every source as it is now                                                               |
| layout flags             | `--density`, `--jog`, `--toggles`, `--no-warp`, `--no-loops`, `--theme`, `--camera`, as now |

Rejections, each a `CitymapError` with its code, the same in both CLIs:

| Code                            | When                                                                                | Exit |
| ------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| `cli/usage`                     | a flag of the other command: `--separate`, `--coverage`, `--no-measures`, `--tests` | 2    |
| `cli/usage`                     | a flag of this command without `--instructions` ("--check needs --instructions")    | 2    |
| `cli/usage`                     | `--harness` not `pi` or `claude`; a bad `--price` or `--budget`                     | 2    |
| `cli/usage`                     | `--lock` with `--no-history`; `--to` or `--lock` given without `--library`          | 2    |
| `instructions/no-repositories`  | `--instructions` without positionals: "name one or more repositories"               | 1    |
| `instructions/not-a-repository` | a positional that is not a git work tree (`git rev-parse --is-inside-work-tree`)    | 1    |
| `instructions/duplicate-source` | two positionals resolving to one folder                                             | 1    |
| `instructions/unknown-library`  | a `--library` that resolves to no positional                                        | 1    |
| `instructions/entry-missing`    | an `--entry` the machine does not hold (detail `entry`, as given)                   | 1    |
| `instructions/entry-outside`    | an `--entry` outside the home folder and outside every source                       | 1    |
| `instructions/no-entries`       | no `--entry` and none of the default harness entries exists                         | 1    |
| `instructions/over-budget`      | `--budget` exceeded; the message lists every scenario over it with its tokens       | 1    |
| `instructions/findings`         | `--check` and at least one finding; the message counts them by kind                 | 1    |

- Messages: a flag of the other command says "--separate is not read for an instruction city" (its own name); `--to`
  given explicitly (not its default) or `--lock` without a library says "history applies to the first library; name one
  with --library"; a bad price says "--price is two decimals, uncached and cached, not …"; a bad budget says "--budget
  is a whole number of tokens above 0, not …". `--voronoi` is read as for a repository.
- Order of checks: parse (exit 2), then sources (repositories, libraries), then entries, all before any file is read;
  `instructions/over-budget` and `instructions/findings` are raised after `--out` and `--svg` are written, so a hook can
  still show the city it refused. With both, the budget is reported first.
- The usage text gains one paragraph, word for word in both CLIs:

```text
Instruction cities: citymap --instructions <repository>... [options]
  --library=<repository>  name one of the repositories a library (repeatable)
  --entry=<path>          an entry a harness loads first (repeatable; default: the harnesses' own)
  --harness=<name>        pi or claude (repeatable; default: every harness whose entry exists)
  --price=<u>,<c>         input price per million tokens, uncached and cached
  --budget=<tokens>       fail when a scenario's stack exceeds this many estimated tokens
  --check                 fail when the lint finds anything
  --contradictions        judge contradictions with studio-worker's default local model
```

## Sources and files (`apps/cli/src/instructions/read.ts`, `packages/history/src/tracked.ts`)

- Source names: `home` for the home source; a repository's folder name (`basename(realpath(repo))`). A name already
  taken is suffixed `-2`, `-3` in order given (`home` is taken first). Sources are kept in the order: `home`, then the
  positionals as given. A source's `root` (an absolute path) stays in the CLI: the city file never holds it.
- The home folder is `$HOME` in both CLIs (never a password-database lookup), so a test or the parity run points it at a
  fixture home.
- A repository's held files: `listTracked(dir)` (`git ls-files -z --cached`, the history package's environment, run at
  the work tree's top level), less `SKIPPED`: lock files (`bun.lock`, `bun.lockb`, `package-lock.json`, `yarn.lock`,
  `pnpm-lock.yaml`, `Cargo.lock`), `.gitkeep`, and images and fonts by extension
  (`png jpg jpeg gif webp avif svg ico bmp pdf woff woff2 ttf otf eot`), case-insensitive.
- The home source holds the entries that lie in no repository source (as paths relative to `$HOME`) and the harness
  settings files that exist and are not links (`SETTINGS_FILES`: `.claude/settings.json`).
- Symbolic links: every path is resolved with `realpath` before it is placed; a file whose real path lies in a
  repository source is that source's file. The deepest source root holding a real path owns it.
- A held file is an instruction when its path ends `.md`; code when it ends in `CODE_EXTENSIONS`
  (`ts tsx mts cts js jsx mjs cjs json sh bash svelte`) or is a settings file; anything else is held (references to it
  resolve) but never laid.
- Test code (`TEST_CODE`: a file name matching `\.(test|spec)\.[^/]+$`, or any folder named `test`, `tests`,
  `__tests__`, `e2e` or `fixtures`) is held but never scanned as code that loads or uses a file.
- Laid files: a library lays every held instruction and code file. A project lays its root `AGENTS.md` and `CLAUDE.md`
  (hop 0), every non-test code file that names a file of another source (hop 0; § Code), and what those reach within
  `MAX_HOPS` 2 edges inside the project (hop counts below). The home source lays all it holds.
- Text: each laid file is read whole, decoded as UTF-8 with replacement (`TextDecoder` and `String::from_utf8_lossy`
  alike). A file over `MAX_SCAN_BYTES` 4,194,304 is laid with its tokens but not scanned (`instructions/not-scanned`).
- Lines split at `\n`; a trailing `\r` is dropped for scanning; tokens count the raw text. A scanned line over
  `MAX_LINE_CHARS` 10,000 UTF-16 units is skipped by the grammar and counted (`long-lines`), which bounds every
  pattern's backtracking.

### The reader port (`packages/instructions/src/walk.ts`)

```ts
interface Reader {
  text(file: FileRef): string | null; // a held file's text; null when not scanned
  locate(absolute: string): Located; // a path on the machine, after realpath, against the sources
}
type FileRef = { readonly source: number; readonly path: string };
type Located =
  | { kind: "held"; file: FileRef }
  | { kind: "folder"; source: number; path: string; index: string | null } // index: the first held of INDEXES
  | { kind: "unheld"; source: number; path: string; exists: boolean } // inside a repository source, not held
  | { kind: "outside" }; // in no repository source (the home folder's other files included)
```

- `INDEXES`: `README.md`, `index.md`, `docs/index.md`, in that order.
- The home source never answers `unheld`: a path under `$HOME` in no repository source is `outside`.

## The reference grammar (`packages/instructions/src/grammar.ts`)

Only instructions are scanned by the grammar; code is scanned by § Code. Patterns, written once and shared (Rust runs
them on `regress` with the same source text, flags `g` only, no `u`, so `\w` is `[A-Za-z0-9_]`):

```ts
const INCLUDE = /(?<![\w.])@((?:~\/|\/|\.{1,2}\/)?[\w./-]+\.md)\b/g; // path: group 1
const LINK = /\]\((?!https?:|mailto:)([^)\s#]+?\.md)(?:#[^)]*)?\)/g; // path: group 1
const REFER = /(?<![@\w./~-])((?:~|\.{1,2})\/[^\s`'"()<>|,;]+)/g; // path: group 1, trailing . : , stripped
const INLINE = /`([\w.-]+(?:\/[\w.-]+)+)`/g; // path: group 1; a refer, never explicit
```

- Fences (`fenceMask`): a line whose first non-space character, after at most three spaces, opens a run of three or more
  backticks or tildes opens a fence; the fence closes at a later line of at most three spaces and a run of the same
  character at least as long, followed only by spaces or tabs. An unclosed fence runs to the end of the file
  (CommonMark). The opening and closing lines are fenced. Fenced lines are kept for line numbers and blanked for the
  grammar; the lint scans them separately for includes (§ Lint).
- `scanReferences(text)` runs every pattern over each prose line, collects matches with their UTF-16 offset, and keeps
  them in reading order (line, then offset). Where two matches overlap, the one starting first wins; on the same start
  the priority is include, link, refer, inline. So a link's target is a link, never a refer.
- A match is **explicit** when it is an include, a link, or a refer starting `./`, `../` or `~/`; inline paths are not.
- **Placeholders** (`isPlaceholder(token)`): the token is the match's path (group 1) extended right to the next space,
  tab, backtick or end of line. It is a placeholder when its path is `path/file.md` or `x.md` (or ends `/path/file.md`
  or `/x.md`), or the token holds `<`, `>`, `[`, `]`, `*` or `…`. A placeholder is no reference: no edge, no count, no
  finding.
- Resolution (`resolveReference`), in order:
  1. `~/` joins `$HOME`; `@/…` is a path on the machine as written; a link starting `/` joins its source's root (a
     repository's own convention); every other path joins the folder of the file that holds it.
  2. The path is located (`Reader.locate`). `held` is the target. `folder` with an index is the index; without one it is
     `outside`.
  3. An inline path that is not `held` there is tried from its source's root, then from the root of each source the same
     file names, in source order. A file names a source when its text holds `~/` followed by the source's root relative
     to `$HOME` (for a source outside the home folder, its absolute root). The first `held` wins.
  4. Otherwise: `unheld` that does not exist, from an explicit reference, is **broken**; `unheld` that exists (an
     ignored file), `outside`, and any inline path not found are **outside**, counted by kind.
- A reference from a file to itself is dropped. Two files are joined by at most one edge: the first found in the walk
  keeps its kind and line.
- An instruction's refer or link that lands on a code file of a project is a citation of code: no edge, and the code is
  not laid on its account (counted as `cited-code`).

## Code (`packages/instructions/src/code.ts`)

Code files of every source but test code are scanned once, in the walk's order.

- **Imports**: `(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+)["']`; the path joined to the
  file's folder, then tried as written and with `.ts`, `.tsx`, `.js`, `/index.ts`, `/index.js`, the first held file
  winning: a `depend` edge.
- **Joined strings**: the text with every `["'`]\s*,\s*["'`]` replaced by `/`, so `path.join("a", "b.md")` reads as
  `"a/b.md"`.
- **Candidates**: every held path of the file's own source that holds a `/`, and every held path of each other source
  whose name the joined text holds (a word bounded by start, end or a character outside `[\w.-]`). A candidate occurs
  where the joined text holds it bounded on the left by start, `/`, a quote, a space or `(`, and on the right by end, a
  quote, a space, `)` or `,`.
- An occurrence inside a string literal (the nearest quote before it on the line pairs with one after it) of an
  instruction is `inject`; of another source's non-instruction file `depend`. An occurrence of an instruction outside
  any string is `cite`. Other occurrences are not edges.
- **Settings** (`settings.ts`): a harness settings file is parsed as JSON; every string value of a key named `command`,
  at any depth, is a command; `commandPaths` takes each token starting `~/` or `/` and running to the next space, quote,
  backtick, `;`, `|`, `&`, `<`, `>`, `(` or `)`. A held target is a `run` edge; a target the machine does not hold is a
  **broken setting** (§ Lint). A settings file that is not JSON is logged (`instructions/settings-unreadable`) and read
  as having no commands.

## Harnesses and entries (`packages/instructions/src/harness.ts`)

| Harness  | Entries (default)                      | Stacked file | Mount folders                                                         | Settings                  |
| -------- | -------------------------------------- | ------------ | --------------------------------------------------------------------- | ------------------------- |
| `pi`     | `~/.pi/agent/AGENTS.md`, `~/AGENTS.md` | `AGENTS.md`  | `~/.pi/agent/extensions`, `~/.pi/agent/skills`, `~/.pi/agent/prompts` | none                      |
| `claude` | `~/.claude/CLAUDE.md`                  | `CLAUDE.md`  | `~/.claude/agents`, `~/.claude/skills`, `~/.claude/commands`          | `~/.claude/settings.json` |

- Default entries, in the spec's order: `~/.pi/agent/AGENTS.md`, `~/.claude/CLAUDE.md`, `~/AGENTS.md`, those that exist.
- An entry's harnesses: the harness whose table row names it; a `--entry` named by no row belongs to every harness the
  run applies.
- Harnesses that apply: `--harness` values, else each harness with at least one existing entry of its own row.
- Mounts: a mount folder that is itself a link into a source mounts every held file under its target; otherwise each
  link directly inside it whose target lies in a source mounts that file, or every held file under that folder. The edge
  runs from the harness's first entry that exists; a harness without one mounts nothing.
- Mount folders hold agents, skills, commands and extensions; pi's commands are its prompt templates (`prompts`).
- Stack edges: each harness loads its stacked file (`AGENTS.md` for pi, `CLAUDE.md` for Claude Code) from the working
  folder up. For each project and each harness that applies, a stack edge runs to the project's root stacked file when
  held, from the home folder's stacked file when it is an entry (`~/AGENTS.md` for pi), else from the harness's first
  existing entry (`~/.claude/CLAUDE.md` for Claude Code).

## The walk (`packages/instructions/src/walk.ts`)

```ts
interface GraphInput {
  readonly sources: readonly { name: string; kind: SourceKind; held: readonly string[]; named: string }[];
  readonly entries: readonly Entry[];
  readonly harnesses: readonly Harness[];
  readonly mounts: readonly { harness: Harness; files: readonly FileRef[] }[];
  readonly projectSeeds: readonly FileRef[]; // a project's code that names another source's file
}
```

1. Seeds, in order: the entries (in their order), then each library's held instructions and code (sorted by
   `compareKeys`, source order), then each project's entry files and seeds (hop 0), then the home source's settings.
2. Before the queue runs, the structural edges are added in this order: mounts (harness order, files sorted), then stack
   edges (project order). Their targets join the queue.
3. The queue is first in, first out. A file is scanned once; its edges are added in reading order (grammar matches for
   an instruction; imports, then candidates in the order of their first occurrence, for code; commands for settings),
   and each new target is queued.
4. Hop limit: a project file's hop is 0 for its seeds; a target in a project gets `hop(from) + 1` when the edge comes
   from the same project, else 1. A target whose hop would exceed `MAX_HOPS` is not laid and gets no edge, unless it is
   already laid; such misses are counted (`beyond`).
5. The walk ends when the queue is empty. Files are then numbered: by source order, then path (`compareKeys`). Edges are
   stored on their `from` file in the order they were added.

- The walk is deterministic for the same files: every collection is ordered by the rules above, never by a hash.

## Scopes (`packages/instructions/src/scope.ts`)

- `SCOPE_RANK`: global 0, injected 1, project 2, role 3, on-demand 4, code 5, unreached 6.
- Seeds: every entry is `global`; every code file a project lays at hop 0 is `code`.
- What an edge gives its target: `include` the scope of the file that holds it; `stack` project; `mount` role, or code
  for a code file; `inject` injected; `refer` and `link` on-demand; `run` and `depend` code; `cite` nothing.
- `scopesOf(graph)`: a relaxation to the fixed point. Edges are visited in file order then edge order; a target takes a
  scope when it has none or when the new one ranks better; the loop repeats until a pass changes nothing (at most
  `SCOPES.length` passes over each edge, as a scope only improves). A file still without one is `unreached`.
- `discoveryOrder(graph)`: the position at which the breadth-first walk from the entries (and then the project seeds, in
  their order) over non-cite edges first reaches each file; unreached files have none.
- `firstParent(graph, file)` (the by-scope layout): among the edges into the file that are not `cite`, from a file of
  the same scope and the same source that comes earlier in the discovery order, and whose edge gives this scope, the one
  from the earliest; none when there is no such edge.

## Projections (`packages/instructions/src/project.ts`)

```ts
interface Projection {
  readonly layout: Layout;
  readonly towns: readonly string[]; // town folders, in town order
  readonly pages: readonly { path: string; file: number; page: number }[]; // sorted by compareKeys(path)
  readonly at: readonly string[]; // per file: its folder (instruction) or page path (code)
}
```

- `neutral(segment)`: leading dots dropped; every run of characters outside `[A-Za-z0-9_-]` becomes `-`; an empty result
  is `x`; a result whose lower case is in `RESERVED` gains the suffix `-x`. `RESERVED` is every folder name the ground
  plan's land use reads as other than source and that has no leading dot (neutral names never do); a CLI test asserts
  every projected path classifies as `source`, so the two lists cannot drift.

  ```text
  vendor vendored third_party third-party thirdparty node_modules external deps dist generated __generated__
  fixtures __fixtures__ fixture __snapshots__ snapshots baselines golden goldens test tests __tests__ spec specs e2e
  integration-tests testing __mocks__ examples example demo demos playground playgrounds samples sample docs doc
  documentation website site scripts script tools tooling hack ci
  ```

- Collisions: two segments of one folder that neutralise alike, or an instruction's folder that equals a sibling folder,
  take `-2`, `-3` in `compareKeys` order of their original paths.
- **By source**: towns are the sources, named by `neutral(name)`; a file's folder is its source's folders, each
  neutralised, then, for an instruction, `neutral(name without .md)`; a code file is one page named
  `neutral(file name)` + `.instr` in its folder.
- **By scope**: towns are the scopes that hold a file, in rank order, named by their words (`global`, `injected`,
  `project`, `role`, `on demand`, `code`, `unreached`); inside, a district per source (`neutral(name)`); inside that, a
  file's folder is its chain of first parents (outermost first), each named by its route name, then its own: the route
  name is the whole path without `.md`, slashes as dashes, neutralised. A file's pages and its children's folders share
  its folder, so an entry's own pages lie beside its children.
- Pages: an instruction has `max(1, ceil(tokens / share))` pages, `00001.instr` upwards (five digits, as `MAX_LOTS`
  needs at most five); a code file has one.
- Page share (`pageShare(graph)`): the first of `PAGE_TOKEN_STEPS` (40, 100, 200, 400, 1,000) at which the pages of all
  files number at most `MAX_LOTS` 12,000; when even 1,000 is over, 1,000, logged `instructions/over-lots`. Both layouts
  take the same share, so they hold the same lots.
- Towns are declared by the projection: the snapshot the CLI builds names every town folder in `workspaces`, and the
  fold runs with `separate: ["workspaces"]`. No file lies at the projection's root, so the main town has no land and is
  not laid; no manifest and no `apps` folder exists.
- Town order: the projection gives it (by source, `home` then the repositories as given; by scope, `SCOPE_RANK`), in
  `Projection.towns`. The engine takes it from the snapshot: `Snapshot.townOrder` (optional, a list of town roots) puts
  the parts whose roots it names first, in its order, ahead of the rest, which keep the engine's own order (first seen,
  then name). Without it the engine lays as it does today, byte for byte. This is a ground plan change, specified there
  before it is built (plan 0017, phase 6).

### The projection as engine input (`apps/cli/src/instructions/snapshot.ts`)

- `projectionSnapshot(projection, { repository, commit, index, births })`: `files` are the pages, sorted, each with an
  identity kept for life (`births`: per layout, a page's identity is `<its projected path at birth>@<index at birth>`,
  keyed by the file's own identity and the page number), and `firstSeen` its birth index; `folderFirstSeen` the smallest
  `firstSeen` beneath each folder; `workspaces` the towns; `townOrder` `Projection.towns`; `repository`
  `INSTRUCTIONS_REPOSITORY` (`instructions`); `commit` the first library's laid commit, else `worktree`.
- A file's own identity: in the first library, the history reader's identity (it follows exact renames); elsewhere
  `<source>/<path>@0`.

## Laying both layouts (`apps/cli/src/instructions/fold.ts`)

- Without history (`--no-history`, or no library): one graph of every source as it is; both projections; each laid once
  (`layCity` at index 0) with its own `initialState(options)`.
- With history: the first library's first-parent history is read (`readHistory`, `FOLD_STRIDES`, `to`), its files' texts
  at each laid commit read through `listTree` and `readBlobs` (each blob decoded once, kept by blob id); every other
  source is read once, as it is. The share is chosen once, from the graph at the target, and kept for every commit. For
  each laid commit: the graph, both projections, both snapshots, and each layout's `layCity` on its own state. The
  by-source city and plat are the run's; the by-scope city rides beside it.
- `--lock`: the by-source plat is saved to `citymap.lock.json` and the by-scope plat to `citymap.scope.lock.json`, both
  at the first library's root, on the same schedule as a repository's lock; a resume reads both and resumes only when
  both are for these options and the same commit, else neither (`lock/ignored reason=…` as today, plus `reason=pair`).
- Layout options: `--density`, `--jog`, `--toggles`, `--no-warp`, `--no-loops` as for a repository; land uses are the
  defaults; `order` centre-out.
- The SVG draws the by-source city, with its arrows (§ Arrows).

## The city file

`packages/measures/src/section.ts` (and `rust/crates/measures/src/section.rs`) gains two kinds of top-level key beside
`measures`: `layouts`, other layouts of the same city, and the instruction sections, kept as raw values for
`packages/instructions` to validate.

```ts
interface CityFile {
  readonly city: City; // the default layout (by source for an instruction city)
  readonly measures: Measures | null; // null for an instruction city
  readonly layouts: { readonly scope: City } | null; // validated with parseCity's schema
  readonly sections: Readonly<Partial<Record<SectionKey, unknown>>>; // raw; SECTION_KEYS
}
const SECTION_KEYS = ["contradictions", "findings", "instructions", "usage"] as const;
```

- `serialiseCityFile` writes `canonicalJson({ ...city, measures?, layouts?, ...sections })`; a city with none of them is
  byte for byte today's file. `parseCityFile` splits each key off before the city is validated; a bad `layouts.scope` is
  `city/bad-shape` with its pointer under `/layouts/scope`.
- An instruction city writes no `measures` section (spec): its pages are not a repository's files, and its only size,
  estimated tokens, lives in the `instructions` section.

### Sections (`packages/instructions/src/section.ts`)

Every number is a non-negative safe integer; indices point into `instructions.files` (files), `instructions.sources`
(sources) and `instructions.scenarios` (scenarios).

```ts
interface InstructionsSection {
  readonly version: 1; // INSTRUCTIONS_VERSION
  readonly sources: readonly { name: string; kind: SourceKind }[]; // home first, then as given
  readonly harnesses: readonly Harness[]; // those that apply, HARNESSES order
  readonly entries: readonly { file: number; harnesses: readonly Harness[] }[]; // in walk order
  readonly share: 40 | 100 | 200 | 400 | 1000;
  readonly files: readonly {
    source: number;
    path: string; // within its source, `/`-separated
    kind: "instruction" | "code";
    scope: Scope;
    tokens: number;
    pages: number; // at least 1
    at: { source: string; scope: string }; // its folder or page path in each projection
    edges: readonly { to: number; kind: EdgeKind; line: number }[]; // line 0 for stack and mount
  }[];
  readonly outside: Readonly<Partial<Record<EdgeKind, number>>>; // references to files no source holds
  readonly scenarios: readonly {
    harness: Harness;
    folder: number; // a source: home or a project
    stack: readonly number[]; // load order
    injected: readonly number[]; // the injected files of the stack, sorted
    tokens: number;
  }[];
  readonly price?: { uncached: number; cached: number }; // micro-units per million input tokens
  readonly budget?: number;
}
interface FindingsSection {
  readonly version: 1;
  readonly findings: readonly {
    kind: FindingKind;
    file: number;
    line: number; // 1-based; 0 when the finding is about the whole file
    fix: string; // one sentence (§ Lint)
    other?: number; // duplicates: the other file
    path?: string; // broken reference or setting: the path as written
  }[]; // sorted by file, line, kind
}
interface UsageSection {
  readonly version: 1;
  readonly days: number; // USAGE_DAYS
  readonly sessions: readonly number[]; // per scenario
  readonly reads: readonly { file: number; scenario: number; sessions: number }[]; // sessions > 0; sorted
}
interface ContradictionsSection {
  readonly version: 1;
  readonly model: string;
  readonly judged: number; // candidates with a verdict
  readonly pairs: readonly { a: { file: number; line: number }; b: { file: number; line: number } }[];
}
```

- `buildSections` writes every list in the order stated, so both CLIs write the same bytes.
- `parseSections(raw)`: `null` without `instructions` (not an instruction city); a `findings`, `usage` or
  `contradictions` key without `instructions` is `instructions/missing`; each section is validated with valibot
  `strictObject` schemas (Rust: `deny_unknown_fields`): `instructions/bad-shape`, `findings/bad-shape`,
  `usage/bad-shape`, `contradictions/bad-shape`, each with its JSON pointer; a version above 1 is `<section>/too-new`;
  an index past its list is `<section>/bad-index` with its pointer.
- `findings` is written on every instruction city (an empty list when clean); `usage` only when at least one transcript
  was read; `contradictions` only when every candidate has a verdict (§ Contradictions).
- Classification: every field is derived from the sources at the laid state (rebuilt on every run, never migrated),
  except `price` and `budget` (the run's flags) and the `usage` and `contradictions` sections (read on the machine at
  the run). Nothing is restored from an earlier city file. A newer section version is refused, as measures are.
- Privacy: sources are named by folder name; paths are within sources; no machine path, host name, user name or
  transcript content is written. Logs carry counts and source-relative paths only.

## Edges and arrows (`packages/instructions/src/arrows.ts`)

- `isArrow(edge, from, to)`: every edge but a `depend` within one source (an import: a `depend` across sources is code
  naming another source's file). Duplicate pairs (§ Duplicates) are arrows of the kind `duplicate`, drawn but never
  edges.
- `arrowsOf(sections, layout, townOf)`: one arrow per arrow edge whose two files are both placed in the layout, with
  `within` (both in one town) and `strong`: true between towns, and always for `include`, `stack`, `mount`, `inject`,
  `run` and `depend`.
- Anchors: a file's anchor is the mean of its lots' centroids in that layout (integer `floorDiv` of the sums, so both
  CLIs agree). An arrow whose two anchors coincide is not drawn.
- Geometry: a quadratic Bézier from anchor to anchor, its control point the midpoint moved left of travel by
  `ARROW_BEND` 0.18 of the length; a head of two strokes at ±`HEAD_ANGLE` 0.4 rad back from the end, of length
  `min(HEAD_MAX, 0.25 × length)`.
- Plan view and SVG: on the lots, below the labels. Strong arrows `STRONG_WIDTH` 2.6 px at opacity 0.9; faint
  `FAINT_WIDTH` 0.8 px at 0.12 opacity. Dash per kind, a second cue beside colour: include, stack, mount, inject, run,
  depend solid; refer dashed (6, 4); link long-dashed (12, 4); cite dotted (1, 4); duplicate dash-dot (8, 3, 1, 3).
- Buildings view: the curve arcs over the roofs: its ends at the two buildings' tops, its control point lifted to the
  higher top plus `ARC_LIFT` 0.35 of the length; `ARROW_SEGMENTS` 16 segments.
- Colours (`packages/themes/src/instructions.ts`, `EDGE_COLOURS`), per theme brightness, each at least 3:1 against every
  theme's ground (light 4.4:1 at worst, dark 5.8:1 at worst, checked by a test):

| Kind      | Light     | Dark      |
| --------- | --------- | --------- |
| include   | `#B83A00` | `#FF8A5B` |
| stack     | `#9A6200` | `#F5B84A` |
| mount     | `#A2367E` | `#E58FC8` |
| inject    | `#7A6A00` | `#F0E442` |
| run       | `#B0004F` | `#FF7AA8` |
| depend    | `#00704F` | `#4FD1A1` |
| refer     | `#005A9E` | `#6CC4F5` |
| link      | `#3F5F8A` | `#A9BFDD` |
| cite      | `#5F6B78` | `#AEB7C2` |
| duplicate | `#6A3FA0` | `#C3A3F0` |

- `SCOPE_COLOURS` (lots, by source): global as include, injected as stack, project as inject, role as mount, on demand
  as refer, code as depend, unreached as cite, each in its brightness. `SOURCE_COLOURS` (lots, by scope): sources in
  order take `#005A9E #B83A00 #00704F #A2367E #9A6200 #6A3FA0 #7A6A00 #5F6B78` (light) or
  `#6CC4F5 #FF8A5B #4FD1A1 #E58FC8 #F5B84A #C3A3F0 #F0E442 #AEB7C2` (dark), cycling after eight.
- Rust: `citymap-themes` holds the same tables; `citymap-svg` draws arrows from the plain `SvgArrow` list the CLI
  computes (`{ from, control, to, head: [left, right], colour, width, opacity, dash, kind }`), so `svg` still depends on
  the ground plan's model types only. Each arrow is one `<path>` with a `<title>` naming its kind, from and to.

## Buildings (`apps/web/src/instructions/table.ts`, `packages/scene/src/buildings.ts`)

- `instructionTable(order, sections, layout, colourBy, theme)` writes the lot table the buildings mesh already reads:
  per lot `floors`, the lit share, the packed colour, and flags.
- Floors: a page of an instruction takes `floorsOf(tokens, scale)` of its whole instruction, the scale `cityScales` over
  the instructions' tokens (5th and 99th percentiles, nearest rank, one value per file); a code file's page 1 floor.
- Lit share: the file's usage share (sessions that read it, over every scenario's sessions in the window); −1 (unknown)
  without a usage section and for global, injected, project and role files.
- Flags: bit 1 size unknown (never set here); bit 2 `ROADWORKS`, the file has a finding. The shader reads both bits; a
  roadworks lot draws diagonal stripes of `ROADWORKS_COLOUR` `#E69F00` and its own colour, `ROADWORKS_STRIPE` 0.1 u
  wide, on its top (plan) and roof (Buildings), in every colour by.
- Colour by gains `scope`, `source`, `usage` and `findings` (`ColourBy`), offered only for an instruction city, whose
  legend lists Folder, Scope, Source, Usage and Findings (five choices; the file measures are not listed). The default
  is the layout's: scope by source, source by scope. Folder tints every page of an instruction with the tint of the
  instruction's folder (`theme.lot(district)` of the folder holding its pages). Usage uses the size ramp (viridis) at
  the share, unknown grey. Findings: none `#005A9E` / `#6CC4F5`, some `#B83A00` / `#FF8A5B`.

## Usage (`packages/instructions/src/usage.ts`, `apps/cli/src/instructions/transcripts.ts`)

- Where: pi's sessions under `$HOME/.pi/agent/sessions/` (every `*.jsonl` one folder down), Claude Code's under
  `$HOME/.claude/projects/` (every `*.jsonl` one folder down). Files are listed sorted by path; a file whose
  modification time is before the window's start is skipped unread.
- The window: `USAGE_DAYS` 30 days ending at the run's clock, `$CITYMAP_NOW` (epoch seconds) when set, else now. A
  session counts when its first timestamp lies in the window.
- pi (`readPiLine`): a session file's first line with `"type":"session"` gives `id`, `cwd` and `timestamp` (ISO 8601). A
  read is an assistant `message` line whose `content` holds
  `{ "type": "toolCall", "name": "read", "arguments": { "path" } }`.
- Claude Code (`readClaudeLine`): a line's `sessionId`, `cwd` and `timestamp`; a read is an `assistant` line whose
  `message.content` holds `{ "type": "tool_use", "name": "Read", "input": { "file_path" } }`. Sidechain lines count for
  their session. A session spread over several files is one session (by `sessionId`).
- Lines are read one at a time; a line that does not hold `"toolCall"`, `"tool_use"`, `"session"` or `"sessionId"` is
  skipped before parsing; a line that is not JSON, or lacks a field it needs, is skipped and counted (`skipped`). Only
  reads with the harness's own read tool count; shell commands are not read.
- A read's path: `~/` expanded, a relative path joined to the session's `cwd`, then `realpath` and `Reader.locate`; a
  held file of the city counts once per session. Reads of anything else are counted (`outside`), never kept.
- `scenarioOf(harness, cwd)`: the project whose root equals or holds `cwd` (the deepest), else the home scenario; a
  harness the run does not apply is skipped.
- `readUsage` gives sessions per scenario and, per file and scenario, the sessions that read it. A file of global,
  injected, project or role scope carries no reads: the viewer says "Inlined by the harness, so never read with a tool"
  ("Inlined by code, so never read with a tool" for injected).
- Nothing of a transcript is kept but these counts; transcripts are never copied, and their paths are not logged.

## Scenarios, stacks and the bill (`packages/instructions/src/scenario.ts`, `bill.ts`)

- Scenarios: for each harness that applies (in order), the home folder, then each project (in order).
- `stackOf(graph, harness, folder)`, each file once, in order:
  1. the harness's entries that exist, in entry order, then its stacked files from the outermost folder inwards, each a
     held file of the home folder (when an entry) or of the project (pi: `~/.pi/agent/AGENTS.md`, `~/AGENTS.md`, the
     project's root `AGENTS.md`; Claude Code: `~/.claude/CLAUDE.md`, the project's root `CLAUDE.md`);
  2. after each file, what it includes, depth first in reading order, recursively;
  3. the files the harness's mounts load, and their includes;
  4. the injected files whose injecting code is reached from the harness (its settings' `run` edges, its code mounts,
     and `depend` edges from those, transitively) and loads on this machine, and their includes.
- Host-name checks (`hostChecks(text)` in `code.ts`): a line of code holding the word `hostname` (any case:
  `os.hostname()`, `$HOSTNAME`, `socket.gethostname()`) checks the host; the names it checks are the string literals on
  that line (`"…"`, `'…'`, or a backtick literal without `${`). Injecting code without such a line loads on every
  machine; with them, it loads where one of its names equals this machine's host name (ASCII case-insensitive). This
  machine's host name is `$CITYMAP_HOST` when set, else the system's (`os.hostname()`; Rust the `gethostname` crate). It
  is never written or logged: only the scenario's `injected` list reflects it.
- `tokens`: the sum of the stack's files' tokens.
- `parsePrice("3,0.3")` → `{ uncached: 3_000_000, cached: 300_000 }` (micro-units; at most six decimals; no sign, no
  exponent). `billOf(scenario, price)`: tokens, and for a thousand calls `tokens × 1000 × price / 10¹²` in the price's
  unit, for both rates, rounded to the cent half up. The currency is the person's own; no symbol is shown.
- `overBudget(scenarios, budget)`: every scenario whose tokens exceed the budget, in scenario order.

## Lint (`packages/instructions/src/lint.ts`)

Each finding has a kind, a file, a line and a fix in one sentence (copy below, `{…}` filled in). The map shows a file
with findings as roadworks; `--check` fails the run when there is any.

Kinds (`FindingKind`, `FINDING_KINDS`, in this order), each with its detection and its fix:

- `broken-reference`: an explicit reference resolved broken (§ The reference grammar), placeholders excluded. Fix:
  "Point {path} at a file that exists, or remove the reference."
- `broken-setting`: a settings command's path the machine does not hold. Fix: "Fix the command in {file} so it names a
  file that exists."
- `stale-index-entry`: in a laid `README.md` with at least one index line, an index line naming an instruction or folder
  its source does not hold (fix: "Remove the index line for {path}, or restore the file."); or a held instruction
  directly in its folder, or a direct subfolder holding a `README.md`, that no index line names (fix: "Add an index line
  for {path} to this README.md.").
- `example-as-reference`: an include inside a fenced block of a global file. Fix: "Indent the example or remove the @,
  so the harness does not inline it."
- `duplicate-context-file`: two files of one stack whose bytes are equal, on the later in stack order, `other` the
  earlier. Fix: "Load {other} once and remove this copy from the stack."
- `malformed-text`: a line opening `<<<<<<< ` or `>>>>>>> `, or a line `=======` (conflict markers, on any line; fix:
  "Resolve the merge conflict markers."); or in prose a line opening `+ ` right after one opening `- `, or the reverse
  (fix: "Remove the diff lines left in the text.").
- `pointer-loaded-eagerly`: an include whose line holds `see`, `read` or `follow` (any case, a whole word) before the
  `@`, whose target is over `POINTER_TOKENS` 1,000. Fix: "Drop the @ so {path} ({tokens} tokens) is read when needed,
  not inlined on every call."
- `orphan`: an unreached instruction with no `inject`, `depend` or `cite` edge into it. Fix: "Link {file} from an index,
  or remove it."
- `duplicate`: § Duplicates, on the later file of the pair, `other` the earlier. Fix: "Keep this text in one file and
  refer to it from the other."

Shared definitions:

- An index line: a list item (`-`, `*`, `+`, or `1.` after up to three spaces) whose first link target or first path
  token (bare or in backticks) names a `.md` file or a folder ending `/`, resolved from the `README.md`'s folder.
- A finding is one per file, line and kind (and path, for broken references and stale index entries); a pair of
  duplicate context files gives one finding however many stacks hold both.

## Duplicates (`packages/instructions/src/duplicates.ts`)

- `normalise(text)`: lower case (ASCII and Latin-1 only, § Rust parity); Markdown removed: links become their text,
  inline code its content, and `*`, `_`, `` ` ``, `#`, `>` and list markers dropped; every run of whitespace one space;
  trimmed.
- Sentences: prose lines joined within a paragraph, split after `.`, `!` or `?` followed by a space; a sentence of fewer
  than `DUPLICATE_MIN_WORDS` 6 words is ignored. Two sentences of two different instructions duplicate when their
  normalised texts are equal.
- Paragraphs: runs of prose lines between blank lines (fenced lines excluded); shingles are the sets of five consecutive
  normalised words (`SHINGLE_WORDS`); a paragraph with fewer than `MIN_SHINGLES` 3 shingles is ignored. Two paragraphs
  of two different instructions duplicate when `100 × |A ∩ B| ≥ DUPLICATE_SHARE × min(|A|, |B|)`, `DUPLICATE_SHARE` 80.
- Each pair of files with a duplicate gives one `duplicate` arrow and one finding per duplicated sentence or paragraph
  (its line the later file's). Sentences are bucketed by text and paragraphs by shingle, so the work is linear in the
  text plus the pairs found; a shingle held by more than `COMMON_SHINGLE` 50 paragraphs is not used as a bucket.

## Contradictions (`packages/instructions/src/contradiction.ts`, `apps/cli/src/instructions/model.ts`)

- Rule sentences (`ruleSentences`): sentences (as above, not normalised away) holding a modal phrase. Positive:
  `always`, `must`, `should`, `do`; negative: `never`, `must not`, `mustn't`, `should not`, `shouldn't`, `do not`,
  `don't`, `avoid`; whole words, any case; a sentence with phrases of both kinds is neither.
- Subject: the sentence's words of four or more letters, lower case, less the modal words and `STOP_WORDS` (a fixed list
  of 60 English function words in `contradiction.ts`). Two rules share a subject when they share at least
  `SUBJECT_WORDS` 2 such words.
- Candidates: pairs of rule sentences of opposite modality from files one stack loads (the same file included), sharing
  a subject; each unordered pair once, ordered by file then line; at most `MAX_CANDIDATES` 200 per run, the pairs
  sharing most subject words first (ties by order), logged when cut.
- Only with `--contradictions`: without it no candidate is asked and no section is written (`status=off`).
- The model: local only, through studio-worker's local API, its default chat model. The discovery file is
  `$CITYMAP_STUDIO_WORKER` or `$HOME/.config/minis-studio-worker/local-api.json` (`{ url, token }`); a `url` whose host
  is not `127.0.0.1`, `::1` or `localhost` is refused (`instructions/model-not-local`, logged; no model). The model is
  the one studio-worker uses when none is named: `GET <url>/models`, the first entry of `kind` `llm` with `enabled`
  true; its `id` names the model in every request and in the cache key (none: `status=no-model reason=no-default`). Each
  candidate is one `POST <url>/v1/chat/completions` with the bearer token, `model` that `id`, `temperature` 0,
  `max_tokens` 16, `deadline_ms` `MODEL_DEADLINE_MS` 30,000 and `promptOf(a, b)`: the system message "You judge whether
  two rules for a coding agent contradict each other. Answer yes or no." and the user message "Rule A: {a}\nRule B:
  {b}\nDo they contradict?". `parseVerdict`: the first word of the answer, lower case, `yes` or `no`; anything else is
  no verdict (logged).
- Cache: keyed by SHA-256 (hex) of `cacheText(a, b, model)`: the model name, then the two sentences in byte order, each
  on its own line. Kept at `$XDG_CACHE_HOME/citymap/contradictions/<key>.json` (else `$HOME/.cache/…`), mode 600, as
  `{"contradicts":true}` or `false`. A cached verdict is never asked again.
- Outcome: when every candidate has a verdict (cached or answered), the `contradictions` section is written with the
  pairs judged to contradict; otherwise (no flag, no discovery file, no default model, the model refused or unreachable,
  a verdict missing) none is, and the run logs why. No candidates: an empty section (`judged: 0`).
- Contradictions never shape the layout and are not findings; cards list them.

## Hints (`packages/instructions/src/hints.ts`)

- Make lazy: a file of the scenario's stack of global, project or role scope over `POINTER_TOKENS`, reached in the stack
  through an include written as a pointer (§ Lint). Its saving: its tokens plus those of the files only it brings into
  the stack.
- Make eager: an on-demand file read in more than `EAGER_SHARE` (`2 × reads > sessions`) of the scenario's sessions,
  when the usage section exists. It adds its tokens to every call and saves its reads.
- `hintsFor` lists them largest saving (or addition) first, then by file; the city never edits a file. Hints are
  computed by the viewer and the CLI from the sections, never stored.

## The viewer (`apps/web/src/instructions/`, `apps/web/src/components/`)

- Opening: the city's worker parses the file once (`parseCityFile`, then `parseSections`); with sections it keeps both
  cities and builds each layout's scene, pick index and arrow batches as it does a town's shapes, the shown layout
  first.
- **Layout switch**: in the "City layout" popover, above the toggles, a `<fieldset>` legend "Instruction layout" of two
  radio inputs, "By source" and "By scope", enabled for a city file (both layouts are in it) while the toggles stay
  disabled. A change shows the other layout as a load of its own (the loading card's `read` phases), keeping the view
  when both layouts have the town shown, else fitting; logged `viewer/instruction-layout layout`. The layout starts by
  source on every visit.
- **Arrows**: `packages/scene/src/arrows.ts` builds, per kind and weight, one batch of line segments (positions and the
  kind's dash) in the worker as typed arrays; the canvas draws each batch with one screen-space line material (width in
  CSS pixels, dash in pixels). A legend switch shows or hides batches, never rebuilding them. Arrows are not drawn in
  the walk.
- **Arrow legend**: under the colour legend, a `<fieldset>` legend "Arrows" of one checkbox per kind (and duplicate),
  each with its swatch, its dash sample, its name and its count. Refer, link and cite start mixed
  (`aria-checked="mixed"`, description "Between towns only"); activating a mixed or unchecked box checks it (all of that
  kind), a checked one unchecks it. Logged `viewer/arrows kind state`.
- **Selecting a file** draws only its own edges, in and out, strong, hiding every other arrow, and its card lists them:
  "Reaches ({n})" and "Reached by ({n})", each row the kind's swatch, the kind and the other file as a button that
  selects it and flies to it; at most `EDGES_SHOWN` 7 per list, then "Show all {n}".
- **Scenarios**: for an instruction city the drawer holds "Scenarios" above the towns: each scenario a button "{harness}
  · {folder}" with "{tokens} tokens" beside it (`aria-pressed`), seven then "Show all". Selecting one lights its stack
  (other lots mixed to `DIM_SHARE` 0.25 toward the ground, in the worker's lot table) and shows its card under
  "Selected": the bill ("{tokens} estimated tokens on every call"), with a price "{uncached} per thousand calls,
  {cached} cached", the sessions in the window ("{n} sessions in the last 30 days", or "No transcripts read"), the stack
  largest first ("{tokens} · {source}/{path}" buttons, seven then "Show all"), then its hints ("Make lazy: saves
  {tokens} tokens a call" / "Make eager: adds {tokens} tokens a call, saves {reads} reads"). Escape clears it. Logged
  `viewer/scenario harness folder`.
- **Cards**: a page's hover card names the instruction (its file name), its place (source › folders), and rows: "Kind"
  ("Instruction" or "Code"), "Scope" (the scope's words, with its meaning: "Loaded by every session" for global, "Loaded
  by code on some machines" for injected, "Loaded in this project" for project, "Loaded by a subagent, skill or
  extension" for role, "Read when an agent follows a reference" for on demand, "Code that loads or uses instructions"
  for code, "No route reaches it" for unreached), "Estimated tokens", "Page" ("{n} of {m}"), "Usage" ("Read in {n} of
  {m} sessions", or "Not known" noted "Inlined by the harness, so never read with a tool" or "No transcripts read"),
  "Findings" (each finding's fix), "Contradictions" (the other rule's file and line, or "Not judged" noted "Laid without
  --contradictions, or no local model answered"). Search finds files by `source/path`.

## Behaviour and state

- CLI run, in order: `parsed` → `sources-read` (repositories, libraries, entries checked) → `walked` (graph, scopes,
  share) → `laid` (both layouts, each commit) → `read` (usage, contradictions) → `written` (`--out`, `--svg`, locks) →
  `judged` (budget, then check) → exit. A failure before `written` writes nothing; a failure in `judged` keeps what was
  written.
- Graph invariants: every edge's two files are laid; no edge from a file to itself; at most one edge per ordered pair;
  every laid file has exactly one scope; every entry is global; every project file's hop is at most `MAX_HOPS`.
- Projection invariants: every page path classifies as source land; no two pages share a path; both layouts hold the
  same pages; every town folder holds at least one page; no file lies at the root.
- Viewer state gains `instructionLayout` (`source` at first, on every visit and every new city), `arrowKinds` (each kind
  `on`, `mixed` or `off`; refer, link and cite `mixed`, the rest `on`, reset for every new city), `scenario` (a scenario
  index or null; cleared by Escape, by selecting a file, and by a new city) and the shown city's `sections` (or null).
  Selecting a file clears the scenario and the scenario clears the selection: one is shown at a time.
- A city without sections shows none of the additions: no layout group, no arrow legend, no scenarios, the colour-by
  choices of a repository.
- Switching layouts keeps the arrow kinds, the colour by when the new layout offers it (else its default), the scenario
  and the selected file (reselected in the other layout by its file index, its card unchanged).
- Presentation states: an instruction city with no scenario (no harness entry, `--harness` naming none present) shows
  "Scenarios" with "No harness entry was found, so no session is billed."; a scenario whose stack is empty shows "This
  scenario loads nothing before its first turn."; a city with no edges shows the arrow legend's kinds at 0 and disabled;
  a city whose sections fail validation is refused with the notice "This instruction city could not be read: {reason}"
  and the last city stays.

## Errors and edge cases

| Case                                                  | Handling                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| No entry exists and none named                        | `instructions/no-entries`                                                          |
| An entry is a link into a repository                  | that repository's file; the home source does not hold it                           |
| An entry outside home and every source                | `instructions/entry-outside`                                                       |
| A repository given twice (or two links to one)        | `instructions/duplicate-source`                                                    |
| Two repositories with one folder name                 | the later named `-2`                                                               |
| A source without a held instruction                   | laid with what it has; a town with no pages is not laid                            |
| A file that vanishes between listing and reading      | laid as 0 tokens, unscanned; `instructions/unreadable path=…`                      |
| An instruction of 0 characters                        | one page, 0 tokens, one floor                                                      |
| A file not valid UTF-8                                | decoded with replacement characters; tokens count the decoded text                 |
| A reference cycle                                     | each file scanned once; edges kept; the walk ends                                  |
| A reference into the home folder outside every source | outside, never broken                                                              |
| An explicit reference to an ignored file that exists  | outside, never broken                                                              |
| A folder reference without an index                   | outside                                                                            |
| An include of a non-`.md` path                        | not an include (the pattern needs `.md`); a refer when it starts `./`, `../`, `~/` |
| Settings that are not JSON                            | no commands; `instructions/settings-unreadable`                                    |
| A mount link whose target is in no source             | no mount; counted `mount-outside`                                                  |
| More pages than `MAX_LOTS` at 1,000                   | laid at 1,000; `instructions/over-lots lots=…`                                     |
| No library and `--to` or `--lock`                     | `cli/usage`                                                                        |
| A transcript line too long or not JSON                | skipped, counted                                                                   |
| No transcripts                                        | no usage section; `instructions/usage-none reason=no-transcripts`                  |
| Transcripts but none in the window                    | a usage section with 0 sessions; windows lit at share 0                            |
| A model answer that is neither yes nor no             | no verdict; the section is not written; `instructions/verdict-unreadable`          |
| Laid without `--contradictions`                       | no section; `instructions/contradictions status=off`                               |
| Discovery file present, model unreachable             | no section; `instructions/contradictions status=no-model reason=…`                 |
| studio-worker has no enabled `llm` model              | no section; `status=no-model reason=no-default`                                    |
| Injecting code checks a host this machine is not      | its injected files leave this machine's stacks; they keep their `injected` scope   |
| A city file with `findings` but no `instructions`     | `instructions/missing`; the file is refused as any bad city is                     |
| A section index past its list                         | `<section>/bad-index`                                                              |
| A city file from before (no sections)                 | opens as before; no layout switch, arrows, scenarios                               |

## Security and trust

- Every file, transcript and settings value is data: the grammar runs per line under `MAX_LINE_CHARS`, so its worst
  backtracking is bounded; JSON is parsed, never evaluated; no path reaches a shell; git runs only through the history
  package with argument arrays and its environment (no fetch: `GIT_NO_LAZY_FETCH`, `GIT_ALLOW_PROTOCOL=none`).
- The CLI reads only: the named repositories' held files, the entries, the settings files, the mount folders' links, the
  transcripts' folders and the discovery file; it writes only `--out`, `--svg`, the locks (with `--lock`) and the
  contradiction cache.
- Rule sentences leave the process only to the local model, over loopback, with the discovery file's bearer token, which
  is never logged. A non-loopback URL is refused. The cache holds verdicts keyed by a hash, not the sentences.
- Transcripts are read where they are; only counts per file reach the city file; their contents, paths and session ids
  are never written or logged.
- An instruction city is private by default: the CLI never uploads it; the repository's tests and examples use only the
  fixture corpus (§ Testing).

## Observability

Both CLIs print the same `code key=value` lines, in this order (the walk's lines before the fold's, the outcome's after
`fold/done`):

- `instructions/source name kind held laid` per source; `instructions/entry file harnesses` per entry (`file` as
  `source/path`); `instructions/harnesses on`.
- `instructions/walk files edges beyond cited-code long-lines not-scanned` once.
- `instructions/scopes source global injected project role on-demand code unreached` per source.
- `instructions/edges include refer link stack mount inject run depend cite` once.
- `instructions/outside include refer link inline setting` and `instructions/broken references settings` once.
- `instructions/pages share lots max` once; `instructions/over-lots lots` when over.
- `instructions/scenario harness folder files tokens` per scenario.
- `instructions/findings` with one count per kind and `total`.
- `instructions/duplicates sentences paragraphs pairs`.
- `instructions/usage days sessions reads outside skipped files` or `instructions/usage-none reason`.
- `instructions/contradictions status candidates cached asked found model` (`status`: `off`, `judged`, `none`,
  `no-model`, `incomplete`, `not-local`), with `reason` when not judged; `instructions/candidates-cut kept of` when cut.
- `instructions/hints lazy eager`.
- Failures and skips: `instructions/settings-unreadable file`, `instructions/unreadable path`,
  `instructions/not-scanned path bytes`, `instructions/verdict-unreadable`, `instructions/model-not-local`.
- `--budget`: `instructions/budget limit over` (scenarios over as `harness:folder:tokens`, comma-separated).
- Viewer: `viewer/instructions files edges scenarios layout` when an instruction city shows,
  `viewer/instruction-layout layout`, `viewer/arrows kind state`, `viewer/scenario harness folder` (`none` when
  cleared), `viewer/sections-failed reason` (to `console.error`; the file is refused with a notice).

## Performance and limits

- Pages: at most `MAX_LOTS` 12,000 at the chosen share, the bound the ground plan lays in under a second (spec).
- Graph: each laid file read once and scanned once; per line, four patterns over at most 10,000 units. Code candidates:
  a source's held paths are matched only in code that names that source, each path a bounded substring search; budget
  under 2 s for 10,000 laid files on the development machine, both CLIs.
- History: one graph per laid commit (the fold schedule bounds them); blobs decoded once by id; the other sources read
  once.
- Transcripts: files older than the window are not opened; lines prefiltered by substring before parsing; memory is one
  line plus the counts. Budget: 1 GB of transcripts in under 10 s.
- Contradictions: at most 200 candidates a run, each at most 30 s; cached verdicts cost one file read.
- Viewer: arrows at most the edges plus duplicate pairs; at 50,000 arrows and 16 segments, 1.6 million vertices in at
  most twenty batches, built in the worker; a legend switch changes a batch's visibility within a frame; a selection
  builds one small batch on the main thread (one file's edges). The scenario dimming and colour by are lot tables made
  in the worker. INP under 200 ms on a 4x slowed phone; no new request; CLS 0 (the arrow legend and the layout fieldset
  keep fixed boxes; the drawer's scenarios scroll inside it).

## Accessibility (WCAG 2.2 AA)

- The layout switch is native radio inputs in a fieldset; the arrow legend native checkboxes with `aria-checked="mixed"`
  for the mixed state and its description; scenarios are buttons with `aria-pressed`; every edge in a card is a button
  naming its kind and its file. All are reachable by keyboard in reading order, with the viewer's focus ring.
- Arrows differ by colour and dash, the legend names each kind in text, and every edge is listed on its card, so no
  meaning rests on colour alone (1.4.1). Arrow colours meet 3:1 against every theme's ground (1.4.11); legend text
  4.5:1.
- Roadworks stripes and the findings colour carry the same fact twice; findings are listed in text on the card.
- Selection and scenario changes are announced by the drawer's `aria-live="polite"` "Selected" section. No motion is
  added; nothing animates under reduced motion.

## Testing

Unit tests at 100 % in `packages/instructions`, the CLI and the viewer; each TypeScript test has its Rust twin, named
alike. Fixtures are the corpus below.

| Spec rule                                                             | Test (TypeScript; Rust twin alike)                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `--instructions`, `--library`, `--entry`, `--harness` and rejections  | `args.test.ts` instructions cases; `run.test.ts` each `instructions/*` code            |
| History applies to the first library; `--no-history`                  | `fold.test.ts` folds the corpus library's two commits; single state alike              |
| Files: git-held, less lock files, images, fonts; links are targets    | `read.test.ts` on the corpus (a linked entry, a skipped lock file)                     |
| A project lays its entry files and code naming another source, 2 hops | `walk.test.ts` "lays a project within two hops"                                        |
| Test code never loads or uses                                         | `walk.test.ts` "skips test code"                                                       |
| Each edge kind found as the table says                                | `grammar.test.ts`, `code.test.ts`, `settings.test.ts`, `walk.test.ts` mounts           |
| Fenced references are not read                                        | `text.test.ts` fences (closed, unclosed, tildes, longer closers)                       |
| Resolution order, folders as indexes, `~/` to home                    | `resolve.test.ts` each step                                                            |
| Outside counted; broken only when explicit; placeholders              | `resolve.test.ts`, `grammar.test.ts` placeholders                                      |
| Citation of code not followed                                         | `walk.test.ts` "cites a project's code without laying it"                              |
| No self edge; one edge per pair, first kind                           | `walk.test.ts`                                                                         |
| Scopes: seeds, per edge, best route, cite sets none, unreached        | `scope.test.ts`                                                                        |
| Breadth first, deterministic                                          | `walk.test.ts` "walks the same twice" and a shuffled-input property test               |
| Both layouts kept; viewer switches                                    | `section.test.ts` round trip; `LayoutSwitch.test.tsx`; end to end                      |
| By source and by scope naming; first parent; entry beside children    | `project.test.ts`                                                                      |
| Towns declared by the projection; no root town                        | `snapshot.test.ts` lays the corpus: towns equal sources, no `instructions` town        |
| Reserved names suffixed; every lot source land                        | `project.test.ts`; CLI `snapshot.test.ts` against `classifyLandUse`                    |
| Page share from `PAGE_TOKEN_STEPS` and `MAX_LOTS`                     | `project.test.ts` each step's boundary                                                 |
| Arrows: which, strong and faint, legend defaults, selection           | `arrows.test.ts`; `ArrowLegend.test.tsx`; `ViewerInstructions.test.tsx`                |
| Arrows in plan, SVG and over roofs                                    | `scene/arrows.test.ts`; `svg render.test.ts` arrows; end to end screenshot             |
| Buildings: height from tokens, code one floor, windows by usage       | `instructions/table.test.ts`                                                           |
| Colour by scope, source, usage, findings                              | `colour-by.test.ts`; `Legend.test.tsx`                                                 |
| Usage: both formats, window, inlined unknown, separate section        | `usage.test.ts` per line kind; `transcripts.test.ts`; same layout bytes                |
| Scenarios and stacks in harness order; both harnesses stack upwards   | `scenario.test.ts`                                                                     |
| Injected files by this machine's host-name check                      | `code.test.ts` `hostChecks`; `scenario.test.ts` with `CITYMAP_HOST` set                |
| Towns in the order the projection gives                               | ground plan `compose.test.ts` `townOrder`; CLI `snapshot.test.ts`                      |
| Bill, `--price`, `--budget`                                           | `bill.test.ts`; `run.test.ts` over-budget lists every scenario                         |
| Each lint finding and its fix                                         | `lint.test.ts`, one case per kind and per non-finding (placeholders)                   |
| Duplicates: normalisation, sentences, shingles at 80 %                | `duplicates.test.ts` at 79 % and 80 %                                                  |
| Contradictions: flag, default model, candidates, local, cache         | `contradiction.test.ts`; `model.test.ts` with a fake loopback server                   |
| Without the model, none and says so                                   | `model.test.ts` no flag, no discovery file, refused URL, no default, a verdict missing |
| Hints, largest first, never editing                                   | `hints.test.ts`                                                                        |
| City file sections, optional, versions, validation                    | `section.test.ts` (both packages)                                                      |
| Observability lines                                                   | `run.test.ts` asserts the line sequence on the corpus                                  |
| Parity                                                                | `bun run parity --instructions` (below)                                                |

- **Fixture corpus** (`packages/instructions/fixtures/corpus/`, invented content, the repository's licence): `home/`
  (`.pi/agent/AGENTS.md`, `.claude/CLAUDE.md`, `AGENTS.md`, `.claude/settings.json` with one good and one broken hook,
  `.claude/agents` and `.pi/agent/extensions` link plans, transcripts in both formats under `.pi/agent/sessions/` and
  `.claude/projects/`, a contradiction cache), `library/` (`guides/style.md`, an index `README.md` with a stale line, a
  `docs/` folder to suffix, a pointer include over 1,000 tokens, an example include in a fence, a duplicated paragraph,
  a contradictory rule pair, conflict markers, an orphan, a script that injects an instruction, and one that injects
  another only on a host named `machine-a`), `project-a/` (`AGENTS.md`, `CLAUDE.md`, code naming a library file, a test
  file naming one, a document three hops away), `library-history.json` (two commits of the library: a rename and an
  edit). `scripts/ instruction-fixtures.ts` builds them into a temporary folder: each repository `git init` and
  committed (the library's two commits in order, fixed author and dates), links made, `$HOME` the built `home/`;
  `CITYMAP_NOW` fixed so the transcripts lie in the window, and `CITYMAP_HOST` `machine-a`.
- **Parity**: `bun run parity --instructions` builds the corpus, runs both CLIs with
  `--instructions library project-a --library=library --out --svg --check --contradictions --price=3,0.3 --budget=…` in
  single state and folded (with `--lock`, then resumed), and compares city files, SVGs, locks and logs byte for byte
  (timings blanked); usage and contradictions are compared too, the cache prefilled so no model is asked.
- **End to end** (Playwright, dark and light): open the corpus city file; switch layouts from the keyboard; toggle each
  arrow kind; select a file and read its edges; select a scenario and read its bill and hints; colour by scope, source,
  usage, findings; roadworks visible; axe clean; no card overlap at every width; INP and CLS budgets on a 4x slowed
  phone.

## Constants and configuration

| Constant                  | Value                        | Where                                       | Safe range             |
| ------------------------- | ---------------------------- | ------------------------------------------- | ---------------------- |
| `MAX_HOPS`                | 2                            | `packages/instructions/src/terms.ts` (spec) | fixed                  |
| `PAGE_TOKEN_STEPS`        | 40, 100, 200, 400, 1,000     | `terms.ts` (spec)                           | fixed                  |
| `MAX_LOTS`                | 12,000                       | `terms.ts` (spec)                           | fixed                  |
| `POINTER_TOKENS`          | 1,000                        | `terms.ts` (spec)                           | fixed                  |
| `USAGE_DAYS`              | 30                           | `terms.ts` (spec)                           | fixed                  |
| `DUPLICATE_SHARE`         | 80 (%)                       | `terms.ts` (spec)                           | fixed                  |
| `SHINGLE_WORDS`           | 5                            | `terms.ts` (spec)                           | fixed                  |
| `EAGER_SHARE`             | one half                     | `terms.ts` (spec)                           | fixed                  |
| `TOKEN_CHARS`             | 4                            | `tokens.ts` (spec)                          | fixed                  |
| `MAX_SCAN_BYTES`          | 4,194,304                    | `apps/cli/src/instructions/read.ts`         | 1 MB to 16 MB          |
| `MAX_LINE_CHARS`          | 10,000                       | `grammar.ts`                                | 2,000 to 50,000        |
| `PAGE_DIGITS`             | 5                            | `project.ts`                                | fixed                  |
| `DUPLICATE_MIN_WORDS`     | 6                            | `duplicates.ts`                             | 4 to 10                |
| `MIN_SHINGLES`            | 3                            | `duplicates.ts`                             | 1 to 5                 |
| `COMMON_SHINGLE`          | 50                           | `duplicates.ts`                             | 20 to 200              |
| `SUBJECT_WORDS`           | 2                            | `contradiction.ts`                          | 1 to 4                 |
| `MAX_CANDIDATES`          | 200                          | `contradiction.ts`                          | 50 to 1,000            |
| `MODEL_DEADLINE_MS`       | 30,000                       | `apps/cli/src/instructions/model.ts`        | 5,000 to 120,000       |
| `INSTRUCTIONS_REPOSITORY` | `instructions`               | `apps/cli/src/instructions/snapshot.ts`     | fixed                  |
| `ARROW_BEND`              | 0.18                         | `arrows.ts`                                 | 0.1 to 0.3             |
| `HEAD_ANGLE`, `HEAD_MAX`  | 0.4 rad, 0.6 u               | `arrows.ts`                                 | 0.3 to 0.6; 0.3 to 1 u |
| `STRONG_WIDTH`            | 2.6 px, opacity 0.9          | `packages/scene/src/arrows.ts`              | 2 to 4 px              |
| `FAINT_WIDTH`             | 0.8 px, opacity 0.12         | `packages/scene/src/arrows.ts`              | 0.5 to 1.5 px          |
| `ARC_LIFT`                | 0.35                         | `packages/scene/src/arrows.ts`              | 0.2 to 0.6             |
| `ARROW_SEGMENTS`          | 16                           | `packages/scene/src/arrows.ts`              | 8 to 32                |
| `ROADWORKS_STRIPE`        | 0.1 u, `#E69F00`             | `packages/scene/src/buildings.ts`           | 0.05 to 0.2 u          |
| `DIM_SHARE`               | 0.25                         | `apps/web/src/instructions/table.ts`        | 0.1 to 0.4             |
| `EDGES_SHOWN`             | 7                            | `apps/web/src/card/instructions.ts`         | fixed                  |
| `INSTRUCTIONS_VERSION`    | 1 (and each other section's) | `section.ts`                                | fixed                  |

## Assets and external resources

- The fixture corpus: invented text and code written for this repository, under its licence, at
  `packages/instructions/fixtures/corpus/`; built reproducibly by `scripts/instruction-fixtures.ts` (fixed authors,
  dates and `CITYMAP_NOW`).
- studio-worker's local API: an optional external program on the machine, reached over loopback; its absence is a
  supported state. The model name and its answers are not assets of this repository.
- The line material for arrows comes from three.js's examples (`three/examples/jsm/lines`), already a dependency.

## Rust parity

- The grammar's patterns are the same source text on `regress`; offsets compared in UTF-16 units (`regress`'s UTF-16
  input), so overlaps resolve alike.
- Lower-casing for duplicates and subjects is ASCII plus Latin-1 only (`[A-Z]` and `À`–`Þ` but `×`), written as code in
  both, so `toLowerCase` and `to_lowercase` never disagree.
- `estimateTokens` counts UTF-16 units (`encode_utf16().count()`), as `.length`.
- Sorting is `compareKeys` (byte order) everywhere; maps read in order are `IndexMap`.
- JSON: `canonicalJson`; sections serialised from their types with fields in byte order of their names.
- Host name: `os.hostname()` and the `gethostname` crate (latest at the time it is added); tests and parity set
  `CITYMAP_HOST`, so neither reads the system's.
- SHA-256: `node:crypto` and the `sha2` crate; HTTP: `fetch` and `ureq` (latest at the time it is added), both with the
  same body bytes (`canonicalJson` of the request).
