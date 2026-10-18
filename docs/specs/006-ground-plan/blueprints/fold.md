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
  `git -c core.quotepath=off log --first-parent --reverse --diff-merges=first-parent --raw -z --no-renames --ignore-submodules=none --no-abbrev --format=%x01%H%x02%ct%x02%ae%x02%an <commit> --`.
  `--ignore-submodules=none` keeps git from reading `.gitmodules` for each submodule's `ignore` setting: a blob-less
  clone without a checkout does not hold that blob (the log would fail), and a submodule set to `ignore = all` would
  vanish from the fold; every gitlink change is read, whatever `.gitmodules` says. Arguments are an array; `repoDir`
  must be an existing directory (`history/not-a-repo`). Before the log, `to` is resolved to its commit (`resolveCommit`)
  and the commits are counted on that commit (`countCommits`), so the count and the log walk the same history even when
  a ref moves.
- Every commit applies to the tree state; a commit the schedule does not lay builds no snapshot.
- The tree state is a sorted map path → { blob, identity, firstSeen }; each commit's raw entries apply in order: `A`
  adds (identity `${path}@${index}`), `D` deletes, `M`/`T` keep identity. Exact renames: within one commit, deleted and
  added paths with equal blob ids pair up in `compareKeys` order of the added path; the added path takes the deleted
  identity. Gitlinks (mode 160000) are not files: they move submodules (§ Submodules).
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
  file and folder born at 0 (`identity = path@0`), submodules read at their pins (§ Submodules), members from its root
  manifests. The CLI's `--no-history` lays it once instead of folding (no lock): the scale corpus is shown this way.
- `GIT_NO_LAZY_FETCH=1` is set, and blob reads allow no protocol (`GIT_ALLOW_PROTOCOL=none`, which every git honours),
  so a blob-less clone never fetches, but for two named exceptions: the root manifests of the commits it lays (below),
  and, with a file history, the laid commit's `.mailmap` blob, fetched alone
  ([buildings](../../008-buildings/blueprints/buildings.md) § Mailmap).
- The manifests' fetch (`packages/history/src/fetch-manifests.ts`, Rust `fetch_manifests.rs`), before the log (and
  before `readTree` lists its tree), only in a partial clone (`extensions.partialclone` or a `remote.<name>.promisor`
  set; `promisorRemotes(dir)`, `extensions.partialclone`'s remote first, then the promisor remotes in the config's
  order):
  1. The laid commits' root trees: `git log --first-parent --reverse --format=%T <head>` gives every commit's root tree
     by index; those of the commits `isLaid(schedule, index, from)` names (the single state: the one commit's), each
     tree once, are read through one `git cat-file --batch` (trees are held; `rootTree` parses `<mode> <name>\0<id>`
     entries, ids `idBytes` long, 20 or 32 by the head's length).
  2. Their manifests: each entry named as `isManifest` names, not a folder (`40000`) or a gitlink (`160000`): its blob.
     `laidManifests` is every such blob, each once, sorted: exactly the blobs the fold's `Workspaces.wanted` asks for.
  3. Those the clone does not hold (`heldBlobs`) are fetched in one call, as git's own lazy fetch asks for objects:
     `git -c fetch.negotiationAlgorithm=noop fetch <remote> --no-tags --no-write-fetch-head --recurse-submodules=no --filter=blob:none --stdin`,
     the blob ids on its input, `GIT_NO_LAZY_FETCH` left out and `GIT_TERMINAL_PROMPT=0`, killed after
     `MANIFESTS_FETCH_TIMEOUT` 30 s; each promisor remote in turn for what is still missing. Then the held blobs are
     listed again.
  4. One event, `history/manifests status=<held|fetched|unfetchable> blobs=<n> fetched=<n>` (and for `unfetchable`
     `reason=<timeout|exit-<code>>` and `error=<git's first line>`), after `history/schedule`; a full clone logs
     nothing. `unfetchable` when a wanted blob is still not held: every snapshot of that read carries
     `manifests: "unfetchable"`, and the fold goes on as before (`history/manifest-unavailable`, the fallbacks). The
     `BlobReader` is made after it, so its list of held blobs includes what was fetched.
- Every git call clears the variables a git hook sets (`GIT_DIR`, `GIT_INDEX_FILE` and the like), so a fold run from a
  hook reads the folder it was given.
- Failures: `history/git-failed` (exit code, stderr's first line), `history/parse` (offset), `history/bad-schedule` (a
  count or strides the schedule cannot use).

## Submodules

Module: `packages/history/src/submodules.ts`; spec: [ground plan](../ground-plan.md) § Submodules.

- `.gitmodules` at the root is read as the manifests are (its blob, at the commits that change it, newest readable blob
  as fallback) and parsed by `parseGitmodules(text)`: `[submodule "<name>"]` sections with `path` and `url` (quoted or
  bare values, `#` and `;` comments), giving `Map<path, { name, url }>`. A gitlink not named there takes its path as its
  name.
- `Pins.gitlinks`: the tree state's gitlinks, path → pinned commit. A raw entry whose new mode is 160000 sets it (`A`,
  `M`, `T`); a `D` of a path that is a gitlink, or a `T` away from 160000, removes it.
- The `.gitmodules` in force at a commit is the blob of the root file `.gitmodules` in the tree state
  (`gitmodulesAfter(entry, before)` follows it through raw entries): a `D` leaves none, and so does a gitlink at
  `.gitmodules`, which is no file and names nothing.
- `SubmoduleReader(dir)` finds a submodule's git data: `<common dir>/modules/<name>` (`git rev-parse --git-common-dir`,
  once), else the working tree's `<dir>/<path>/.git` (a directory, or a file `gitdir: <p>` resolved against
  `<dir>/<path>`); nested ones from their parent's git data (`<git data>/modules/<name>`, names from the parent's pinned
  `.gitmodules`), down to `SUBMODULE_DEPTH` = 8 levels.
- `expand(path, commit)`: the pinned tree,
  `git --git-dir=<git data> --work-tree=<git data> -c core.quotepath=off ls-tree -r -z <commit>`, each entry's path
  prefixed with `<path>/`; nested gitlinks expand in turn. Every git call on git data names the git data as its own
  working tree: git would otherwise change into its configured `core.worktree` and fail where that folder is gone (a
  submodule deinitialised, moved or removed), though the objects are all there. The reader keeps each reading (by parent
  git data, path, name and commit) only until `forget`: a pin asked for twice in one prepare is read once.
- Unread (no git data, the commit or a tree missing, depth exceeded): the one entry `<path>/.gitlink` with blob id the
  pinned commit, and `history/submodule-unavailable` (path, index, reason: `no-git-data`, `missing-commit`, `depth`,
  `bad-name`).
- In the fold, a submodule is expanded at each commit the schedule lays, judged without the resume's `from`
  (`isLaid(schedule, at)`), and at `from`, when its pin moved since its last expansion (or it is new, or gone): the
  difference between the last expansion and this one is applied as one commit at that index (`D` for paths gone, `A` for
  new paths, `M` for changed blobs, exact renames by equal blob ids), after the commit's own entries. So a resumed read
  expands at the same indices as the uninterrupted one, and births carry the same indices.
- Each reading is named by the `.gitmodules` in force at its own expansion point: a pin that moves away and back while
  `.gitmodules` renames its submodule is read under each name in turn. Where git's output splits into chunks never
  changes a reading.
- `Pins` keeps the gitlinks and their last expansions. `prepare(commits, first, expandsAt, gitmodules, readTexts)` runs
  before a chunk of the log is applied: it follows the chunk's raw entries (gitlinks and `.gitmodules` blobs only, which
  expansions never change) to every expansion point, and reads each pin that will have moved there, all in parallel. Its
  readings wait in `ready`, keyed by path, pin and the `.gitmodules` blob in force there, each with the number of
  expansions that take it; then the reader forgets. `move(index, gitmodules)` is synchronous: it takes each moved pin's
  reading by the same key, drops a reading its last expansion took, emits the events in path order, and returns the
  changes; a pin not prepared is `engine/invariant`.
- Memory: between chunks `ready` is empty and the reader keeps nothing; what stays is each gitlink's last expansion.
  `Pins.held` counts the readings each holds.
- A single state expands every gitlink once.
- `Snapshot.submodules`: the gitlinks' paths (read or not), sorted, when any.

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

| Event                           | When                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| `plat/switch`                   | a folder's form changes (path, from, to, mass)                       |
| `plat/recut`                    | a remembered cut moves (key, reason, demands, caps)                  |
| `plat/radial-resector`          | a radial layout re-sectors (path)                                    |
| `plat/renew`                    | a neighbourhood renews (key, vacant, remembered)                     |
| `plat/narrow`                   | a neighbourhood narrows its lot class (key, from, to)                |
| `plat/regrid`                   | a neighbourhood lays its grid afresh (key)                           |
| `plat/reclass`                  | a laid road changes class with its land's tier (key, from, to)       |
| `plat/repark`                   | a neighbourhood lays its park line afresh to seat its lots (key)     |
| `plat/grow`                     | a town's outline grows (key, from, to)                               |
| `plat/old-town`                 | an archetype switch freezes an old town (key, from, to, lots)        |
| `plat/forget`                   | remembered records are dropped (key, count)                          |
| `plat/tier`, `plat/gateway`, …  | the toggles' decisions: [toggles](toggles.md) § Observability        |
| `town/overflow`                 | lots without room (key, count)                                       |
| `history/submodule-unavailable` | a submodule's pin cannot be read (path, index, reason)               |
| `history/submodule`             | a submodule expanded (path, index, files)                            |
| `history/manifest-unavailable`  | a root manifest blob cannot be read (path, index)                    |
| `history/schedule`              | the fold schedule, once per read (commits, coarse, tail, from, laid) |
| `history/mailmap`               | the target's `.mailmap`, with a file history (status, entries)       |

Each run ends with one summary line: `fold/done repository=… commits=… laid=… lots=… overflow=… ms=…`, where `commits`
counts the commits the run folded (from the first laid index to the last, inclusive) and `laid` the snapshots it laid.

## Performance and limits

- Budgets on the development machine, measured by `bun run bench` (growth checks, not absolute ceilings in CI): lay one
  HEAD snapshot of next.js (~30 k files) under 400 ms; home-assistant under 600 ms; a 1,200-commit react fold under 20 s
  with the locality cache, laid commit by commit (`EVERY_COMMIT`) so it times the lay machinery, not the schedule; linux
  HEAD under 5 s and its full fold cached incrementally on disk; the rest of the scale corpus at HEAD, vscode (~20 k
  files) under 800 ms and godot (~14 k files) under 400 ms.
- Submodules: one `ls-tree` per distinct pin a laid commit reaches, kept for the read; a pin moved many times inside a
  window costs one read. A blob-less clone without submodule data costs nothing but the unread events. Budget: a fold of
  a repository with submodules initialised spends under 10 % of its time in `expand` (measured on deno, Phase 7).
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
- A submodule name or path from `.gitmodules` that is absolute, holds a `..` segment, a backslash or NUL is not followed
  (git refuses such names too): the submodule is unread (`reason: bad-name`). A `gitdir:` line is followed only when it
  resolves inside the repository's folder or its common git dir. Git data found is only read (`ls-tree`, `cat-file`),
  never written.
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
- **Submodules** (`submodules.test.ts`, real repositories made in a temporary folder): `.gitmodules` parsing; a pin read
  through `.git/modules` and through the submodule's own `.git`; nested; not initialised and a missing commit (one
  `.gitlink`, the event); a moved pin's births, deletions and renames; a pin moved twice inside a window read once; a
  resume expanding at the same indices; `readTree` with each case; a working folder gone; a pin moved away and back
  while `.gitmodules` renames it, read the same whatever the chunks (`read-submodules.test.ts`, `Pins.prepare` with the
  log split several ways); a `.gitmodules` that is a gitlink; no reading held past its move across 50 moves of one pin.
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
