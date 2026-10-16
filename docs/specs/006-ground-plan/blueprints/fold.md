# Fold, history and operations

Derived from [ground plan](../ground-plan.md) § Input, Fold schedule, Deletion, Invariants and
[architecture](../../003-system-architecture/architecture.md). Modules: `packages/ground-plan/src/fold/`,
`packages/history/src/`.

## Fold

```ts
function layCity(snapshot: Snapshot, plat: Plat, options: Options): { city: City; plat: Plat; events: PlatEvent[] };
function foldHistory(snapshots: Iterable<Snapshot>, options: Options, start?: Plat): { city: City; plat: Plat };
```

- `layCity` is pure: it copies the plat (structural sharing allowed, never mutation of the input) and returns the new
  one. Same inputs, same outputs, bit for bit.
- `foldHistory` lays every snapshot it is given in order and returns the last city; which commits become snapshots is
  the reader's fold schedule. With `start` (a lockfile), the first snapshot must be the lockfile's commit; it is laid
  once to restore runtime state (`last` towns) before folding on.
- **Resumption is exact**: the lockfile carries every record of the plat but not the order the records were made in
  (canonical JSON sorts keys; a parsed plat holds them sorted), and the runtime state (`last` towns, the locality cache)
  is rebuilt by laying the lock's commit again. Both are exact only because no rule reads a plat record in insertion
  order (records are read in `compareKeys` order, or by slot index) and every lay is settled: laying a snapshot again on
  the plat its lay produced decides nothing and draws the same city, and `last` holds only the towns the last lay laid.
  A rule that judges the plat must judge it as the lay leaves it (renewal is judged after slots that are gone are
  dropped).
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

- `readHistory(repoDir, { from?, to = "HEAD", strides? })` yields snapshots, oldest first, of the commits the fold
  schedule lays (§ Fold schedule), from **one** streaming process:
  `git -c core.quotepath=off log --first-parent --reverse --diff-merges=first-parent --raw -z --no-renames --no-abbrev --format=%x01%H <commit> --`.
  Arguments are an array; `repoDir` must be an existing directory (`history/not-a-repo`). Before the log, `to` is
  resolved to its commit (`resolveCommit`) and the commits are counted on that commit (`countCommits`), so the count and
  the log walk the same history even when a ref moves.
- Every commit applies to the tree state; a commit the schedule does not lay builds no snapshot.
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
  hold files, sorted. A blob that cannot be read (a blob-less clone never fetches) logs `history/manifest-unavailable`,
  and the manifest is known by its newest blob the repository holds since the manifest was last added (`Workspaces`
  keeps each manifest's blob ids since then; `fallbacks` names the older blobs of a manifest whose wanted blob could not
  be read, the chunk reads them in one more pass, and `resolve` takes the newest that reads); when it holds none, the
  manifest declares nothing. What a read knows is thus a function of the history alone, and a read that begins at a
  lock's commit knows what a read from the root knows. No manifest at all leaves `workspaces` out.
- Manifest blobs are read through one `git cat-file --batch`, pipelined: each chunk of the log asks for the blobs its
  snapshots need (`Workspaces.wanted` takes the schedule's `isLaid`; a manifest changed twice between two snapshots is
  read once, at its later blob, and one changed inside a window is resolved at the window's end). In a partial clone,
  where asking for a missing blob costs git seconds, the blobs it holds are listed once (`--batch-all-objects`) and only
  those are asked for. A batch process that exits mid-answer (git before 2.44 on a failed fetch) marks that blob
  unavailable and the rest go to a fresh one.
- A single state: `readTree(dir, commit)` reads one commit's tree (`git ls-tree -r`) as a snapshot at index 0, every
  file and folder born at 0 (`identity = path@0`), submodules skipped, members from its root manifests. The CLI's
  `--no-history` lays it once instead of folding (no lock): the scale corpus is shown this way.
- `GIT_NO_LAZY_FETCH=1` is set, and blob reads allow no protocol (`GIT_ALLOW_PROTOCOL=none`, which every git honours),
  so a blob-less clone never fetches.
- Every git call clears the variables a git hook sets (`GIT_DIR`, `GIT_INDEX_FILE` and the like), so a fold run from a
  hook reads the folder it was given.
- Failures: `history/git-failed` (exit code, stderr's first line), `history/parse` (offset), `history/bad-schedule` (a
  count or strides the schedule cannot use).

## Fold schedule

Module: `packages/history/src/schedule.ts`; spec: [ground plan](../ground-plan.md) § Fold schedule.

```ts
interface Strides {
  readonly tail: number; // TAIL_COMMITS: the tail holds at least this many commits
  readonly window: number; // WINDOW: the stride before the tail
  readonly coarseAfter: number; // COARSE_AFTER: commits older than the last this many take the coarse stride
  readonly coarseWindow: number; // COARSE_WINDOW: the stride of the oldest commits
  readonly grain: number; // ZONE_GRAIN: zone boundaries are multiples of it
}
const FOLD_STRIDES: Strides; // { tail: 1000, window: 100, coarseAfter: 10_000, coarseWindow: 1000, grain: 1000 }
interface FoldSchedule {
  readonly commits: number;
  readonly coarseEnd: number;
  readonly tailStart: number;
  readonly strides: Strides;
}
function foldSchedule(commits: number, strides?: Strides): FoldSchedule;
function isLaid(schedule: FoldSchedule, index: number, from?: number): boolean;
function laidCount(schedule: FoldSchedule, from?: number): number;
function countCommits(dir: string, commit: string): Promise<number>; // ancestry.ts
```

- `foldSchedule` is pure. `tailStart = max(0, floor((commits - tail) / grain) * grain)` and
  `coarseEnd = max(0, floor((commits - coarseAfter) / grain) * grain)`; `coarseEnd <= tailStart` holds whenever
  `coarseAfter >= tail`.
- `isLaid(schedule, index, from = 0)`: `index === from`, or `index > from` and either `index >= tailStart` or
  `(index + 1) % stride === 0`, where the stride is `coarseWindow` below `coarseEnd` and `window` otherwise. The first
  laid index (the lock's commit on a resume, or 0) is always laid; every index from `tailStart` on is laid, so the last
  commit is too, and so is any commit beyond the count.
- `laidCount(schedule, from = 0)`: how many indices from `from` to `commits - 1` are laid; 0 when `from >= commits`.
- Rejections, all `history/bad-schedule` with the offending field: `commits` not a non-negative safe integer; a stride
  field not a positive safe integer; `grain` not a multiple of `window` and of `coarseWindow` (a window would straddle a
  zone boundary); `coarseAfter` below `tail`.
- `countCommits` runs `git rev-list --first-parent --count <commit> --` and returns the number it prints; a failure is
  `history/git-failed`.
- `readHistory` builds the schedule with `options.strides ?? FOLD_STRIDES`, emits `history/schedule` before the first
  snapshot, and lays `isLaid(schedule, index, from)`. `strides` is an option for tests and measurements, never a CLI
  flag (the CLIs pass `FOLD_STRIDES`, so a lock never mixes schedules and needs no setting key for it); `EVERY_COMMIT`
  (a tail and coarse zone of `Number.MAX_SAFE_INTEGER`, strides and grain 1) folds every commit.
- Snapshot indices are commit indices: a window's snapshot has its last commit's index and commit id, and its files keep
  the indices of the commits they first appeared at.

## Observability

Every decision point emits a structured event, collected in `events` and printed by the CLI with `--verbose`; the
fingerprint is the first token:

| Event                          | When                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `plat/switch`                  | a folder's form changes (path, from, to, mass)                       |
| `plat/recut`                   | a remembered cut moves (key, reason, demands, caps)                  |
| `plat/radial-resector`         | a radial layout re-sectors (path)                                    |
| `plat/renew`                   | a neighbourhood renews (key, vacant, remembered)                     |
| `plat/narrow`                  | a neighbourhood narrows its lot class (key, from, to)                |
| `plat/regrid`                  | a neighbourhood lays its grid afresh (key)                           |
| `plat/reclass`                 | a laid road changes class with its land's tier (key, from, to)       |
| `plat/repark`                  | a neighbourhood lays its park line afresh to seat its lots (key)     |
| `plat/grow`                    | a town's outline grows (key, from, to)                               |
| `plat/old-town`                | an archetype switch freezes an old town (key, from, to, lots)        |
| `plat/forget`                  | remembered records are dropped (key, count)                          |
| `plat/tier`, `plat/gateway`, … | the toggles' decisions: [toggles](toggles.md) § Observability        |
| `town/overflow`                | lots without room (key, count)                                       |
| `history/skip-submodule`       | a submodule entry is skipped (path)                                  |
| `history/manifest-unavailable` | a root manifest blob cannot be read (path, index)                    |
| `history/schedule`             | the fold schedule, once per read (commits, coarse, tail, from, laid) |

Each run ends with one summary line: `fold/done repository=… commits=… laid=… lots=… overflow=… ms=…`, where `commits`
counts the commits the run folded (from the first laid index to the last, inclusive) and `laid` the snapshots it laid.

## Performance and limits

- Budgets on the development machine, measured by `bun run bench` (growth checks, not absolute ceilings in CI): lay one
  HEAD snapshot of next.js (~30 k files) under 400 ms; home-assistant under 600 ms; a 1,200-commit react fold under 20 s
  with the locality cache, laid commit by commit (`EVERY_COMMIT`) so it times the lay machinery, not the schedule; linux
  HEAD under 5 s and its full fold cached incrementally on disk; the rest of the scale corpus at HEAD, vscode (~20 k
  files) under 800 ms and godot (~14 k files) under 400 ms.
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
- `bun run bench --folds` also folds the fast reference repositories (`FOLDS`: takken.io, redux, studio-worker,
  game-ci-cli, livediagram) in full on the fold schedule, logging each fold's files without a lot beside a fresh lay of
  the same tree (`bench/fold repo commits overflow fresh`), and ratchets the folded total against
  `scripts/bench/fold-baseline.json`.
- With `--lock`, the CLI saves the lock every `LOCK_EVERY` (1,000) laid snapshots as well as at the end, logging
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
- **Fold schedule**: zones and anchoring for the real strides (1,999 commits fold every commit; 2,000 and 77,277 take
  windows), each window inside one zone, a fresh fold of one more commit adding one laid commit except at a boundary,
  resumes, `laidCount` against a brute-force count, every rejection; the reader on small strides: laid indices, renames
  chained inside a window, a file born and deleted inside one, births keeping their own index, a manifest changed inside
  a window, a resume, and `history/schedule`.
- **Property**: determinism (lay twice, compare serialised output); plat round-trip; locality (a commit touching one
  folder leaves every other folder's lots in place); no lot overlaps another (sampled point-in-polygon).
- **Resumption** (`fold.test.ts`, ported to Rust): on a synthetic history with deletions, renewals and a root switch, a
  lay from a plat read back from a lockfile (sorted records, fresh locality cache) draws the same city and plat as from
  the plat it was written from; laying each commit again on the plat its lay produced changes nothing; and a fold
  resumed from a lock saved at several commits writes the uninterrupted fold's lock. On the corpus, `bun run parity`
  resumes each fold from a lock saved part way, in both CLIs (Rust blueprint § Parity).
- **Golden**: `toMatchFileSnapshot` city JSON for three small fixtures (hamlet, twin, radial) and the takken.io HEAD
  snapshot, outside the formatter.
- **Corpus** (local, not in CI): the reference repositories' HEAD stats and stability (per-step and deleting-step
  movement) within the prototype's numbers in `variants/README.md`. `bun scripts/stability.ts <repo> [from] [count]`
  lays the fold schedule from `from` (a fresh plat there, or the root's fold at 0); `--lock=<file>` starts from a
  lockfile's commit and plat instead, so the last commits of a real fold can be measured one by one.
