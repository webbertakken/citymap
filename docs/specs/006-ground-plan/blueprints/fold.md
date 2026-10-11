# Fold, history and operations

Derived from [ground plan](../ground-plan.md) § Input, Deletion, Invariants and
[architecture](../../003-system-architecture/architecture.md). Modules: `packages/ground-plan/src/fold/`,
`packages/history/src/`.

## Fold

```ts
function layCity(snapshot: Snapshot, plat: Plat, options: Options): { city: City; plat: Plat; events: PlatEvent[] }
function foldHistory(snapshots: Iterable<Snapshot>, options: Options, start?: Plat): { city: City; plat: Plat }
```

- `layCity` is pure: it copies the plat (structural sharing allowed, never mutation of the input) and returns the new
  one. Same inputs, same outputs, bit for bit.
- `foldHistory` lays every snapshot in order and returns the last city. With `start` (a lockfile), the first snapshot
  must be the lockfile's commit; it is laid once to restore runtime state (`last` towns) before folding on.
- **Locality cache**: the fold skips re-laying a folder whose subtree digest (FNV-1a over its sorted
  `identity@path` list and the options), input polygon and plat records are unchanged since the previous lay, reusing
  its output and plat entries. The cache is an optimisation: with it off, results are identical (tested).
- `Options`: `densityPct` (50, range 20 to 80), `landUses`, `order` (`centre-out` | `first-seen`), `jog` (`off` |
  `top-level` | `all`; default `top-level`), `warp` (true).

## History (`packages/history`)

- `readHistory(repoDir, { from?, to = "HEAD" })` yields snapshots, oldest first, from **one** streaming process:
  `git -c core.quotepath=off log --first-parent --reverse --diff-merges=first-parent --raw -z --no-renames --no-abbrev
  --format=%x00%H%x00%ct <to>`. Arguments are an array; `repoDir` must be an existing directory (`history/not-a-repo`).
- The tree state is a sorted map path → { blob, identity, firstSeen }; each commit's raw entries apply in order:
  `A` adds (identity `${path}@${index}`), `D` deletes, `M`/`T` keep identity. Exact renames: within one commit, deleted
  and added paths with equal blob ids pair up in `compareKeys` order of the added path; the added path takes the
  deleted identity. Submodules (mode 160000) are skipped and counted.
- `folderFirstSeen`: the first index at which a folder holds any file, kept for folders ever seen.
- `GIT_NO_LAZY_FETCH=1` is set, so a blob-less clone never fetches.
- Failures: `history/git-failed` (exit code, stderr's first line), `history/parse` (offset).

## Observability

Every decision point emits a structured event, collected in `events` and printed by the CLI with `--verbose`; the
fingerprint is the first token:

| Event                    | When                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `plat/switch`            | a folder's form changes (path, from, to, mass)                 |
| `plat/recut`             | a remembered cut moves (key, demands, caps)                    |
| `plat/radial-resector`   | a radial layout re-sectors (path)                              |
| `plat/renew`             | a neighbourhood renews (key, vacant, remembered)               |
| `plat/narrow`            | a neighbourhood narrows its lot class (key, from, to)          |
| `plat/grow`              | a town's outline grows (key, from, to)                         |
| `plat/old-town`          | an archetype switch freezes an old town (key, from, to, lots)  |
| `plat/forget`            | remembered records are dropped (key, count)                    |
| `town/overflow`          | lots without room (key, count)                                 |
| `history/skip-submodule` | a submodule entry is skipped (path)                            |

Each run ends with one summary line: `fold/done repository=… commits=… lots=… overflow=… ms=…`.

## Performance and limits

- Budgets on the development machine, measured by `bun run bench` (growth checks, not absolute ceilings in CI):
  lay one HEAD snapshot of next.js (~30 k files) under 400 ms; home-assistant under 600 ms; a 1,200-commit react
  fold under 20 s with the locality cache; linux HEAD under 5 s and its full fold cached incrementally on disk.
- Limits: 2,000,000 files per snapshot, path depth 64, 10,000 children per folder; beyond them a named rejection
  (`snapshot/too-large`, `tree/too-deep`, `tree/too-wide`).
- Memory: one tree state and one plat in memory; snapshots stream.

## Security and trust

- Repository paths are untrusted data: never interpolated into shell strings, regexes or HTML (renderers escape).
- `git` runs with an argument array, a fixed set of flags, and no hooks (`-c core.hooksPath=/dev/null`).
- The engine bounds work by the limits above, so a hostile tree cannot exhaust the machine silently.

## Testing

Every spec rule maps to a test, named after the rule (traceability table in the plan's fold-back step):

- **Unit**: each fixed-point function, land use rules (table-driven from the prototype's cases), sharing, chain
  collapse, classify (every threshold and band), decide (fresh, remembered, recut, empty side), pinwheel guards,
  radial (decline cases, re-sector), twin, neighbourhood (green, high street, span, renewal, newcomers), placement,
  highways, old towns.
- **Property**: determinism (lay twice, compare serialised output); plat round-trip; locality (a commit touching one
  folder leaves every other folder's lots in place); no lot overlaps another (sampled point-in-polygon).
- **Golden**: `toMatchFileSnapshot` city JSON for three small fixtures (hamlet, twin, radial) and the takken.io HEAD
  snapshot, outside the formatter.
- **Corpus** (local, not in CI): the reference repositories' HEAD stats and stability (per-commit and deleting-commit
  movement) within the prototype's numbers in `variants/README.md`.
