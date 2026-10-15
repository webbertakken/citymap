# Fold, history and operations

Derived from [ground plan](../ground-plan.md) § Input, Deletion, Invariants and
[architecture](../../003-system-architecture/architecture.md). Modules: `packages/ground-plan/src/fold/`,
`packages/history/src/`.

## Fold

```ts
function layCity(snapshot: Snapshot, plat: Plat, options: Options): { city: City; plat: Plat; events: PlatEvent[] };
function foldHistory(snapshots: Iterable<Snapshot>, options: Options, start?: Plat): { city: City; plat: Plat };
```

- `layCity` is pure: it copies the plat (structural sharing allowed, never mutation of the input) and returns the new
  one. Same inputs, same outputs, bit for bit.
- `foldHistory` lays every snapshot in order and returns the last city. With `start` (a lockfile), the first snapshot
  must be the lockfile's commit; it is laid once to restore runtime state (`last` towns) before folding on.
- **Locality cache**: a fold carries, per town, the last result of laying out each folder: the folder's content digest
  (a 64-bit hash of its lots, docs and children's digests), its land polygon and widths, its district seed, and the
  town's constants (options, land area, root). When all match on the next lay, and the folder's own plat record (its
  form, and its grid, cut or radial record) is still present, the recorded roads, blocks, lots, districts, water,
  overflow and lot area are appended again and the folder's subtree is skipped; overflow events repeat, decisions do
  not. A folder's plat records change only in its own layout or when an ancestor forgets them, which removes the record
  the check looks for. Results with the cache are identical to results without it (tested). District labels are filtered
  by the root's mass at the end of the lay, so the root's growth does not invalidate the cache.
- `Options`: `densityPct` (50, range 20 to 80), `landUses`, `order` (`centre-out` | `first-seen`), `jog` (`off` |
  `top-level` | `all`; default `top-level`), `warp` (true).

## History (`packages/history`)

- `readHistory(repoDir, { from?, to = "HEAD" })` yields snapshots, oldest first, from **one** streaming process:
  `git -c core.quotepath=off log --first-parent --reverse --diff-merges=first-parent --raw -z --no-renames --no-abbrev --format=%x00%H%x00%ct <to>`.
  Arguments are an array; `repoDir` must be an existing directory (`history/not-a-repo`).
- The tree state is a sorted map path → { blob, identity, firstSeen }; each commit's raw entries apply in order: `A`
  adds (identity `${path}@${index}`), `D` deletes, `M`/`T` keep identity. Exact renames: within one commit, deleted and
  added paths with equal blob ids pair up in `compareKeys` order of the added path; the added path takes the deleted
  identity. Submodules (mode 160000) are skipped and counted.
- `folderFirstSeen`: the first index at which a folder holds any file, kept for folders ever seen.
- Workspace manifests: when a commit adds or changes a root `package.json`, `pnpm-workspace.yaml`, `lerna.json`,
  `Cargo.toml`, `go.work`, `pyproject.toml` or `deno.json(c)`, its blob is read (`git cat-file blob`) and its member
  patterns parsed: JSON `workspaces` (array or `{ packages }`), `packages` in pnpm and Lerna, `[workspace] members` and
  `exclude`, `go.work` `use`, `[tool.uv.workspace] members` and `exclude`, Deno `workspace`. Patterns are globs (`*`,
  `**`, `!` negation) matched against the folders of the tree; `snapshot.workspaces` lists the matching folders that
  hold files, sorted. A blob that cannot be read (a blob-less clone never fetches) logs `history/manifest-unavailable`
  and leaves the patterns as they were; no manifest at all leaves `workspaces` out.
- Manifest blobs are read through one `git cat-file --batch`, pipelined: each chunk of the log asks for the blobs its
  snapshots need (a manifest changed twice between two snapshots is read once). In a partial clone, where asking for a
  missing blob costs git seconds, the blobs it holds are listed once (`--batch-all-objects`) and only those are asked
  for. A batch process that exits mid-answer (git before 2.44 on a failed fetch) marks that blob unavailable and the
  rest go to a fresh one.
- A single state: `readTree(dir, commit)` reads one commit's tree (`git ls-tree -r`) as a snapshot at index 0, every
  file and folder born at 0 (`identity = path@0`), submodules skipped, members from its root manifests. The CLI's
  `--no-history` lays it once instead of folding (no lock): the scale corpus is shown this way.
- `GIT_NO_LAZY_FETCH=1` is set, and blob reads allow no protocol (`GIT_ALLOW_PROTOCOL=none`, which every git honours),
  so a blob-less clone never fetches.
- Every git call clears the variables a git hook sets (`GIT_DIR`, `GIT_INDEX_FILE` and the like), so a fold run from a
  hook reads the folder it was given.
- Failures: `history/git-failed` (exit code, stderr's first line), `history/parse` (offset).

## Observability

Every decision point emits a structured event, collected in `events` and printed by the CLI with `--verbose`; the
fingerprint is the first token:

| Event                    | When                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| `plat/switch`            | a folder's form changes (path, from, to, mass)                   |
| `plat/recut`             | a remembered cut moves (key, reason, demands, caps)              |
| `plat/radial-resector`   | a radial layout re-sectors (path)                                |
| `plat/renew`             | a neighbourhood renews (key, vacant, remembered)                 |
| `plat/narrow`            | a neighbourhood narrows its lot class (key, from, to)            |
| `plat/regrid`            | a neighbourhood lays its grid afresh (key)                       |
| `plat/reclass`           | a laid road changes class with its land's tier (key, from, to)   |
| `plat/repark`            | a neighbourhood lays its park line afresh to seat its lots (key) |
| `plat/grow`              | a town's outline grows (key, from, to)                           |
| `plat/old-town`          | an archetype switch freezes an old town (key, from, to, lots)    |
| `plat/forget`            | remembered records are dropped (key, count)                      |
| `town/overflow`          | lots without room (key, count)                                   |
| `history/skip-submodule` | a submodule entry is skipped (path)                              |

Each run ends with one summary line: `fold/done repository=… commits=… lots=… overflow=… ms=…`.

## Performance and limits

- Budgets on the development machine, measured by `bun run bench` (growth checks, not absolute ceilings in CI): lay one
  HEAD snapshot of next.js (~30 k files) under 400 ms; home-assistant under 600 ms; a 1,200-commit react fold under 20 s
  with the locality cache; linux HEAD under 5 s and its full fold cached incrementally on disk; the rest of the scale
  corpus at HEAD, vscode (~20 k files) under 800 ms and godot (~14 k files) under 400 ms.
- Incremental lays: the history reader hands over the same `files` array and `folderFirstSeen` map while a commit only
  edits files (snapshots are immutable). `layCity` keeps, per file list (a `WeakMap`), its land uses, workspace groups
  and members, and live identities, and per file list, tree options, input shares and folder map, its built tree; layout
  keeps a town's shares by reference (it never changes them). `classifyLandUse` remembers a million paths
  (`remembering`). Loop connectors find nearby roads, dead ends and shapes through a uniform grid (`town/grid.ts`). All
  of it is exact: folded cities are byte-identical to the engine without it.
- `bun run bench` (`scripts/bench`) reads the repositories under `~/.cache/citymap/repos` (or `$CITYMAP_REPOS`). A HEAD
  lay is timed on a snapshot of `git ls-tree -r HEAD` (files only, every one born at commit 0), built before the clock
  starts; the figure is the median of five lays from an empty plat, so it says what a lay costs rather than what
  compiling it does. A fold is timed from the first commit, reading included. One line per budget: `bench/within`,
  `bench/over` (exit code 1) or `bench/skipped` with `reason=no-repository`.
- After the budgets, the bench lays each corpus repository (`CORPUS` in `scripts/bench/corpus.ts`) at HEAD once and logs
  every live town: `bench/town repo town tier verdict shares largest inversions overflow`. Tier is by lots on the spec's
  decades; shares are road length local (lane, street) / collector / arterial; largest is the longest road's share;
  inversions are road ends that meet a lesser road. A town's shares are judged only for a tier with targets
  (`TIER_TARGETS`, provisional: town and up) and when its largest road is at most `COARSE_SHARE` (5 %); otherwise its
  verdict is `untargeted` or `coarse`, reported, never failed.
- The ratchet sums files without a lot, inversions and towns outside their bands over the corpus and compares them with
  `scripts/bench/baseline.json`: any rise fails the bench (`bench/ratchet worse=…`); `bun run bench --rebase` records
  the run's totals as the new baseline, deliberately, in the commit that earns it.
- With `--lock`, the CLI saves the lock every `LOCK_EVERY` (1,000) laid commits as well as at the end, logging
  `lock/saved`, so a long fold cut short resumes near where it stopped.
- Limits: `MAX_FILES` (2,000,000) files per snapshot, checked by `layCity` (`snapshot/too-large`); `MAX_PATH_BYTES`
  (4,096 UTF-8 bytes) per path, checked as the reader admits a path (`snapshot/bad-path`), which also bounds a path's
  depth at 2,048 folders; `COORD_LIMIT` on the laid city (`city/too-large`). Folders are not bounded in width: real
  repositories hold over 20,000 files in one folder (TypeScript's baselines), and the file limit bounds the work.
- Memory: one tree state and one plat in memory; snapshots stream.

## Security and trust

- Repository paths are untrusted data: never interpolated into shell strings, regexes or HTML (renderers escape).
- `git` runs with an argument array, a fixed set of flags, and no hooks (`-c core.hooksPath=/dev/null`).
- The engine bounds work by the limits above, so a hostile tree cannot exhaust the machine silently.

## Testing

Every spec rule maps to a test, named after the rule (traceability table in the plan's fold-back step):

- **Unit**: each fixed-point function, land use rules (table-driven from the prototype's cases), sharing, chain
  collapse, classify (every threshold and band), decide (fresh, remembered, recut, empty side), pinwheel guards, radial
  (decline cases, re-sector), twin, neighbourhood (green, high street, span, renewal, newcomers), placement, highways,
  old towns.
- **Property**: determinism (lay twice, compare serialised output); plat round-trip; locality (a commit touching one
  folder leaves every other folder's lots in place); no lot overlaps another (sampled point-in-polygon).
- **Golden**: `toMatchFileSnapshot` city JSON for three small fixtures (hamlet, twin, radial) and the takken.io HEAD
  snapshot, outside the formatter.
- **Corpus** (local, not in CI): the reference repositories' HEAD stats and stability (per-commit and deleting-commit
  movement) within the prototype's numbers in `variants/README.md`.
