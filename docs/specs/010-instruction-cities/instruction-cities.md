# Instruction cities

A repository of agent instructions (agents files, rules, instruction sets) is laid as a city of its layers: what every
session loads, what it loads on demand, and what nothing reaches. Instructions are not structured by folder but by the
references between them, so the city is laid from those references. A projection turns them into a tree of files before
the engine sees it; the [ground plan](../006-ground-plan/ground-plan.md) then lays that tree like any other, and the
[buildings](../008-buildings/buildings.md) stand on it.

## Terms

| Term             | Meaning                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| instruction      | A Markdown file (`.md`) the repository tracks.                                                   |
| entry            | An instruction a harness loads first; a session starts there.                                    |
| reference        | A path in one instruction that names another.                                                    |
| eager reference  | A reference the harness loads with the instruction that holds it: `@path.md`.                    |
| lazy reference   | A reference an agent follows only when it needs to: a plain path or a Markdown link.             |
| route            | A chain of references from an entry to an instruction.                                           |
| place            | An instruction's first route, which decides where it is laid.                                    |
| layer            | How an instruction reaches a session: always, on demand, or unreached.                           |
| page             | A slice of an instruction, one lot of land.                                                      |
| estimated tokens | An instruction's size as a model reads it: its characters divided by four, rounded up.           |
| projection       | The tree of pages the references give, laid by the engine in place of the repository's own tree. |

## Asking for one

- `citymap <repository> --instructions` lays the repository as an instruction city.
- `--entry=<path>` names an entry, relative to the repository's root; it may be given more than once, and its order is
  the order of the walk. Without it, the entries are `AGENTS.md` and then `CLAUDE.md`, each where the repository has it.
- `--entry` without `--instructions` is refused, by name. So is an entry the repository does not track, and a repository
  with no entry at all.
- Every other option keeps its meaning: `--no-history`, `--to`, `--lock`, `--svg`, `--out`, themes and toggles.
- Both CLIs lay instruction cities, byte for byte alike (see [architecture](../003-system-architecture/architecture.md)
  § Rust implementation); the projection lives in `packages/instructions` and its Rust mirror, `citymap-instructions`.

## References

- An eager reference is `@` followed by a path ending in `.md`: `@./x.md`, `@../x.md`, `@x.md`, `@~/x.md` or `@/x.md`,
  as the harness reads it.
- A lazy reference is a path ending in `.md` that starts with `./`, `../` or `~/`, plain or in inline code, or the
  target of a Markdown link (`[text](x.md)`).
- References inside fenced code blocks are examples, not references, and are not read.
- A relative path resolves against the folder of the instruction that holds it.
- A path starting with `~/` or `/` names the machine, not the repository, and counts as outside: a city never depends on
  where the repository is checked out.
- A reference to a path outside the repository, or to a path the repository does not track, is skipped and counted, by
  kind (outside, missing).
- A reference from an instruction to itself is skipped.

## The walk

- The walk is breadth first from the entries, in their order. Each instruction's references are taken eager before lazy,
  each kind in reading order.
- An instruction's place is the first route that reaches it. Every reference that reaches an instruction already placed
  is one of its other routes.
- The walk is deterministic: the same commit gives the same places, on any machine.

## Layers

- **Always**: an entry, or an instruction whose place is eager all the way from its entry.
- **On demand**: an instruction whose place has at least one lazy reference.
- **Unreached**: an instruction no route reaches.
- Each layer is a town of its own, `always`, `on demand` and `unreached`, laid apart as separate towns are (see
  [ground plan](../006-ground-plan/ground-plan.md) § Separate towns). A layer with no instruction has no town.

## The projection

- An instruction is a folder of its pages, named by its path without `.md`, with a trailing `README` or `RULES` dropped
  (`rules/git/RULES.md` is `rules/git`); a child's name drops its parent's name where it begins with it (`git` under
  `rules`).
- Within always and on demand, each instruction's folder sits inside its place's previous instruction, so districts
  follow the references; an entry's own pages sit beside its children, not around them. An on-demand instruction whose
  place passes through always instructions sits under their names in the on-demand town.
- Within unreached, instructions are grouped by the folder they sit in.
- A page holds 40 estimated tokens (`TOKENS_PER_PAGE`; 3 lines of the reference corpus, at about 13 tokens a line, the
  smallest share at which a corpus of 50 instructions lays districts rather than one neighbourhood; safe from 20 to
  200). An instruction has at least one page.
- A name the engine reads as a land use of its own (`docs`, `tests`, `testing`, `specs`, `examples`, `samples`,
  `fixtures`, `vendor`, `generated` and the like) is suffixed so that every page is source land; an instruction city has
  no parks and nothing off the map.
- Files that are not instructions (scripts, configuration, tools) are not laid.

## History

- The projection is made at every laid commit, from that commit's instructions, and the fold sees projected trees; a
  folded instruction city is as stable as any other, and moves only where references changed.
- `--no-history` lays the single state, as for any repository.

## Buildings

- Every page carries a building, and every page of an instruction stands as tall as the whole instruction's estimated
  tokens, on the city's fitted scale (see [buildings](../008-buildings/buildings.md) § Channels).
- Size is counted in estimated tokens, and the city says so; tested, recency, churn, authors and comments are unknown,
  with the reason "An instruction city".
- Colour by folder tints each instruction alike, so an instruction reads as one block.

## The city file

- Beside the measures, an `instructions` section names the entries, and for each instruction its path, layer, estimated
  tokens, place (the route as paths from its entry) and other routes, and for each page its instruction; and the count
  of skipped references by kind.
- A city file without the section is not an instruction city; one with it opens in any viewer that reads city files.

## The viewer

- Selecting a page selects its instruction: the card names the instruction's path, its layer, its estimated tokens, its
  place, and every other route that reaches it.
- The search finds instructions by path.
- The towns list names the layers, with each layer's instructions and estimated tokens.

## Observability

- The CLI logs, in its `key=value` lines, the entries, the instructions reached and unreached, the references taken, the
  other routes, the skipped references by kind with their paths, and each layer's instructions and estimated tokens.

## Not now

- Other routes drawn on the map (as tram lines).
- Instruction cities from a GitHub repository or a picked folder in the viewer.
- A session's live reading lit on the map as a harness loads its instructions.
