# Instruction cities

Agent instructions (agents files, rules, instruction sets, skills, a knowledge wiki) are mostly documents, spread over
several repositories and the harness configuration in a person's home folder. They are organised less by folder than by
how a session reaches them: what a harness loads first, what those files include, what an agent reads when a trigger
applies, and what code loads or uses. An instruction city lays them as a city, shows every way one reaches another as an
arrow, and says what each session costs. The [ground plan](../006-ground-plan/ground-plan.md) lays the city from a
projection, and the [buildings](../008-buildings/buildings.md) stand on it.

## Terms

| Term             | Meaning                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| source           | A repository given to the city, or the home source: the harness files named as entries outside every one.  |
| instruction      | A Markdown file (`.md`) a source holds.                                                                    |
| file             | An instruction, or a code or configuration file that loads, runs or uses one.                              |
| harness          | An agent runtime that loads instructions (pi, Claude Code), with its own rules for what it loads.          |
| entry            | A file a harness loads first, such as `~/.pi/agent/AGENTS.md` or `~/.claude/CLAUDE.md`.                    |
| edge             | One way a file reaches another, of one kind (below).                                                       |
| scope            | When a file reaches a session: global, injected, project, role, on demand, code, or unreached.             |
| scenario         | One session's starting point: a harness, a working folder and a machine.                                   |
| stack            | Everything a scenario loads before its first turn, in order.                                               |
| page             | A slice of an instruction, one lot of land.                                                                |
| estimated tokens | A file's size as a model reads it: its characters divided by four, rounded up.                             |
| projection       | The tree of pages the city lays in place of the sources' own trees, one per layout.                        |
| layout           | How the projection groups files into towns: by source, or by scope.                                        |
| usage            | How often sessions actually read a file, measured from harness transcripts on the machine.                 |
| finding          | A defect the lint names: a broken reference, a stale index entry, a duplicate, a contradiction, and so on. |
| hint             | A suggestion to make an instruction eager or lazy, with the tokens it moves.                               |

## Asking for one

- `citymap --instructions <repository>...` lays the given repositories as one instruction city. The first is the library
  the entries point into; the order of the rest is the order of their towns.
- `--entry=<path>` names an entry, anywhere on the machine; it may be given more than once, and its order is the order
  of the walk. Without it, the entries are the harness entries that exist: `~/.pi/agent/AGENTS.md`,
  `~/.claude/CLAUDE.md` and `~/AGENTS.md`, in that order.
- `--harness=<name>` names the harnesses whose rules apply (`pi`, `claude`); without it, every harness whose entry
  exists.
- An entry the machine does not hold, a repository that is not a git repository, and an empty list are refused, by name.
- History applies to the first repository only: `--to` and `--lock` fold its history, with every other source at its
  current state; `--no-history` lays all of them as they are.
- Both CLIs lay instruction cities, byte for byte alike (see [architecture](../003-system-architecture/architecture.md)
  § Rust implementation); the projection lives in `packages/instructions` and its Rust mirror, `citymap-instructions`.
  Usage, contradictions and prices are read on the machine and kept apart from the layout (below), so parity holds.

## Files

- A source's files are what git tracks, less lock files, images and fonts; the home source holds only the entries and
  the harness settings named below. A symbolic link is its target: an entry that links into a repository is that
  repository's file.
- A source given after the first lays only its own entry files (`AGENTS.md`, `CLAUDE.md`), the instructions they reach,
  and code that names a file of another source; its other code is not instructions, and is not laid.
- Test code (`*.test.*`, `*.spec.*`, and files under `test`, `tests`, `__tests__`, `e2e` and `fixtures`) never counts as
  code that loads or uses a file.

## Edges

| Kind    | From → to                       | How it is found                                                                                    | Loads it |
| ------- | ------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| include | instruction → file              | `@path`, as the harness reads it: `@./x.md`, `@../x.md`, `@x.md`, `@~/x.md`, `@/x.md`              | yes      |
| refer   | instruction → file              | a path starting `./`, `../` or `~/`, or a path in inline code (`` `docs/x.md` ``)                  | on read  |
| link    | instruction → instruction       | a Markdown link to a `.md` file                                                                    | on read  |
| stack   | entry → a project's `AGENTS.md` | the harness loads every `AGENTS.md` from the working folder up (pi)                                | yes      |
| mount   | entry → each file in a folder   | a symbolic link from a harness folder (`~/.claude/agents`, `~/.pi/agent/extensions`) into a source | yes      |
| inject  | code → instruction              | code names the instruction's path in a string, its pieces joined (`path.join("a", "b.md")`)        | yes      |
| run     | settings → code                 | a harness setting runs the file (a hook command in `~/.claude/settings.json`)                      | runs it  |
| depend  | code → file                     | a relative import, or code that names another source's file by path and source                     | uses it  |
| cite    | code → instruction              | code names an instruction outside a string (a comment pointing at a spec)                          | no       |

- References inside fenced code blocks are examples, not references, and are not read.
- A relative path resolves against the folder of the file that holds it; an inline-code path not found there resolves
  from its source's root; a path to a folder means its index (`README.md`, `index.md`, `docs/index.md`).
- `~/` resolves to the home folder of the machine the city is laid on, so cross-repository references land in the
  sources given. The city file names sources and paths within them, never a path on the machine.
- A reference to a file no source holds is outside, and is counted by kind; a reference into a source to a path it does
  not hold is broken, and is a finding (below) when it was explicit (`@`, `./`, `../`, `~/`, a link, a setting).
- An instruction's reference to a project's code is a citation of code: it is not followed and the code is not laid.
- A file reaching itself is not an edge; two files are joined by at most one edge, its kind the first found.

## Scopes

- The entries are **global**. An include keeps the scope of the file that holds it; every other edge sets its own: stack
  gives **project**, mount gives **role** (a subagent, a skill, an extension's documents), inject gives **injected**
  (loaded by code, often only on some machines), refer and link give **on demand**, and run, depend, and a mount of code
  give **code**. Code a project lays is code from the start.
- A file takes the best scope of every route that reaches it, in the order global, injected, project, role, on demand,
  code; a cite never sets a scope. A file no route reaches is **unreached**.
- The walk is breadth first from the entries in their order, edges in reading order; it is deterministic for the same
  files.

## Layouts

Both layouts are laid and kept in the city file, and the viewer switches between them as it switches toggle variants
(see [viewer](../004-interface-design/viewer.md)).

- **By source** (the default): a town per source, named by it (`home`, and each repository's folder name); within it the
  source's own folders, and an instruction as a folder of its pages. Scope is the lots' colour. Folders change slowly,
  so this layout is stable over history.
- **By scope**: a town per scope that holds a file, named by it (`global`, `on demand`); within it a district per
  source, and each file inside the file that first reached it with an edge of the same scope, an entry's own pages
  beside its children. Source is the lots' colour. A file moves when its first route changes.
- An instruction's pages fill one folder named by its file name without `.md` (by source) or by its whole path, slashes
  as dashes (by scope); a code file is one lot.
- Towns are declared by the projection itself, not by folders named `apps` or a manifest: nothing scaffolds them.
- A name the engine reads as a land use of its own (`docs`, `tests`, `specs`, `examples`, `fixtures`, `vendor` and the
  like) is suffixed, so every lot is source land; an instruction city has no parks and nothing off the map.
- A page holds a fixed share of estimated tokens, the smallest of 40, 100, 200, 400 and 1,000 (`PAGE_TOKEN_STEPS`) at
  which the city takes at most 12,000 lots (`MAX_LOTS`): a single library of a few dozen instructions lays districts at
  40, and several repositories with a wiki stay under a second to lay.

## Arrows

- Every edge but an import within one source is an arrow from its file to its target, curved, with a head, coloured by
  kind; an edge between towns is drawn strong, an edge within a town faint, except include, stack, mount, inject, run
  and depend, which are always strong.
- Arrows lie over the lots in plan view and the SVG, and arc over the roofs in the Buildings view.
- The legend names each kind, and switches it on and off; refer, link and cite start off within a town.
- Selecting a file draws only its own edges, in and out, strong, and lists them on its card.

## Buildings

- Every page of an instruction stands as tall as the whole instruction's estimated tokens, on the city's fitted scale; a
  code file stands one floor.
- Windows are lit by usage (below): the share of sessions in the window that read the file; unknown when there is no
  transcript.
- Colour by folder tints each instruction alike; colour by scope, by source, by usage and by findings are added.

## Usage

- Usage is read from the transcripts harnesses keep on the machine (pi's session files; Claude Code's transcripts), over
  the last 30 days (`USAGE_DAYS`): for each file, how many sessions read it with a tool, and how many sessions there
  were per scenario.
- Instructions a harness inlines (global, project and role scopes) are never read with a tool, so their usage is
  unknown, not zero, and says why.
- Usage is a section of its own beside the layout; a city laid without transcripts has none, and lays the same bytes.

## Stacks and the bill

- The city lists its scenarios: each harness, with the home folder and each given project's folder as the working
  folder, on this machine; a scenario says which injected files its machine loads.
- A stack is what the scenario loads before its first turn, in the harness's order: its entries, the `AGENTS.md` files
  it stacks, everything they include, recursively, what its mounts and injections load, each once.
- Selecting a scenario lights its stack on the map and dims the rest; its card gives the stack's files and estimated
  tokens, largest first.
- The bill is a stack's estimated tokens, paid on every model call of every session in that scenario; with `--price`
  (per million input tokens, cached and uncached), the card adds what a thousand calls cost.
- `--budget=<tokens>` fails the run, by name and with every scenario over it, when a stack exceeds it, for a pre-commit
  hook or a CI check.

## Lint

Each finding has a kind, a file, a line, and a fix in one sentence; the map shows a file with findings as roadworks, and
`--check` fails the run when there is any.

- **Broken reference**: an explicit reference to a path its source does not hold. A placeholder is not a reference:
  `path/file.md`, `x.md`, `<…>`, `[…]` and paths with `*`.
- **Broken setting**: a harness setting that runs or loads a file that does not exist.
- **Stale index entry**: a `README.md` index line naming a file that does not exist, or a file in its folder that no
  index line names.
- **Example taken as a reference**: an include inside a fenced block in an entry's reach, which the harness may inline.
- **Duplicate context file**: two files a stack loads with the same content.
- **Malformed text**: merge conflict markers, or lines of a diff left in place (a line opening with `+ ` or `- ` right
  after one opening with the other, in prose).
- **Pointer loaded eagerly**: an include written as a pointer ("see `@…`") whose target is over 1,000 estimated tokens
  (`POINTER_TOKENS`).
- **Orphan**: an instruction no route reaches and no code uses.

## Duplicates and contradictions

- **Duplicates** are found without a model: sentences that read the same once case, Markdown and whitespace are removed,
  and paragraphs whose word shingles (five words) overlap by 80% or more (`DUPLICATE_SHARE`); each pair is a duplicate
  arrow and a finding.
- **Contradictions** are judged by a local model, never a hosted one: the candidates are pairs of rule sentences from
  files one stack loads that share a subject and differ in modality (always and never, must and must not); the model's
  verdict is cached by the pair's content and model name. Contradictions are a section of their own, never shaping the
  layout, and a city laid without the model has none and says so.

## Hints

- **Make lazy**: an eager file (global, project or role scope) over `POINTER_TOKENS`, written as a pointer or in a stack
  where few sessions touch its subject; the hint gives the tokens every call saves.
- **Make eager**: an on-demand file read in more than half the sessions of a scenario (`EAGER_SHARE`); the hint gives
  the tokens it adds and the reads it saves.
- Hints are listed on the scenario's card, largest saving first; the city never edits a file.

## The city file

- Beside the measures, an `instructions` section names the sources, entries and scenarios, and for each file its source,
  path, kind, scope, estimated tokens, pages and edges; a `findings` section, a `usage` section and a `contradictions`
  section are optional, each written only when it was read.
- A city file without the `instructions` section is not an instruction city; one with it opens in any viewer that reads
  city files.

## Privacy

- Instruction sources are often private. A city of them is laid on the machine and stays there; no image, name, count or
  path from one goes into this repository, a pull request, an issue or any public page. Public examples use a fixture
  corpus in this repository.
- Transcripts are read where they are and never copied: only counts per file reach the city file.

## Observability

- The CLI logs, in its `key=value` lines, the sources and entries, the files by source and scope, the edges by kind, the
  references outside and broken, each scenario's stack and bill, the findings by kind, the usage window and its
  sessions, and the page share chosen.

## Not now

- A session's live reading lit on the map as it happens.
- Instruction cities from GitHub or a picked folder in the viewer.
