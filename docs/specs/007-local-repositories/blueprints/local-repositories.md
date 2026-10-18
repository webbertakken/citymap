# Local repositories blueprint

Derived from [local repositories](../local-repositories.md); measurements in
[local folders](../../../research/local-folders.md). Code: `apps/web/src/local/` (reading), the viewer's
`components/useLocalRepository.tsx`, `components/LocalButton.tsx` and `components/LocalMenu.tsx` (the surface). Nothing
here is in the engine or the CLI, so the Rust implementation is untouched.

## Domain and naming

| Term          | Identifier                       | Meaning                                                                              |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| folder        | `Folder`                         | what the person picked, read through one interface whatever the browser gave         |
| handle folder | `handleFolder(handle)`           | a `FileSystemDirectoryHandle` (Chromium): reads only what is asked for               |
| listed folder | `listedFolder(files)`            | the folder input's `File`s, every file listed up front (Firefox)                     |
| git data      | `GitData`                        | where the index and `HEAD` live inside the folder, and the object id width           |
| index         | `readIndex(bytes, idBytes)`      | `.git/index` decoded into the tracked paths                                          |
| walk          | `walkFolder(folder, onCount)`    | a folder without git, read file by file, honouring its `.gitignore` files            |
| local read    | `readLocal(folder, onPhase)`     | the folder to a snapshot: `stateSnapshot(name, commit, paths, members)`              |
| support       | `localSupport()`                 | `"handle"`, `"input"`, `"safari"` or `"none"` (a phone, or no folder access at all)  |
| remembered    | `rememberFolder`, `recallFolder` | the last handle, in IndexedDB (Chromium)                                             |
| phase         | `LocalPhase`                     | `index`, `folder`, `manifests`, `laying`, `drawing` (`LISTING` comes before)         |
| local failure | `LocalError` with `LocalCode`    | a named rejection; never the engine's `CitymapError`, so the Rust code list is apart |
| sentence      | `describeLocal(failure, name)`   | a failure in one sentence, naming the folder                                         |
| ports         | `LocalPorts`, `browserPorts`     | the browser's side: support, the folder dialog, recall and remember; tests stand in  |

## Interfaces and contracts

### `Folder` (`local/folder.ts`)

```ts
type Kind = "file" | "directory";
interface Folder {
  readonly name: string; // the picked folder's own name
  kind(path: string): Promise<Kind | null>; // null: nothing there
  read(path: string): Promise<Uint8Array>; // a file's bytes
  list(path: string): Promise<readonly { name: string; kind: Kind }[]>; // a directory's entries, any order
}
```

- Paths are relative to the folder, `/`-separated, without a leading `/`; `""` is the folder itself.
- `handleFolder(handle)`: walks segment by segment with `getDirectoryHandle`; the last segment is tried as a file
  (`getFileHandle`), then, on `TypeMismatchError`, as a directory. `NotFoundError` on the way is `null` for `kind`.
  `read` is `(await handle.getFile()).arrayBuffer()`. `list` iterates `entries()`.
- `listedFolder(files)`: the name is the first segment of the first file's `webkitRelativePath`; every file is indexed
  by the rest of its path, and every folder above it is a directory. `list` and `kind` answer from that index.
- DOM failures become local failures where they are named (`localised(error, path)`): `NotAllowedError` and
  `SecurityError` are `local/denied`; `NotFoundError` while reading and `NotReadableError` are `local/vanished`. Any
  other error passes through unchanged. The folder dialog's and the permission request's failures go through it too.

### `readIndex(bytes, idBytes)` (`local/git-index.ts`)

Returns `{ version: 2 | 3 | 4, paths: string[], sizes: number[], gitlinks: string[] }`, `paths` in the index's order
without repeats, `sizes` each path's stat size (the 32-bit word at byte 36), in the same order, `gitlinks` the
submodules' paths.

1. At least `12 + idBytes` bytes, starting `DIRC`, else `local/bad-index` (`reason: "header"`). The version (big-endian
   32-bit at 4) is 2, 3 or 4, else `local/index-version` (`version`). The entry count is at 8.
2. Each entry: 40 bytes of stat data (the mode is the 32-bit word at 24), the object id (`idBytes`), 16-bit flags. With
   bit `0x4000` (extended) a further 16 bits follow; extended in version 2 is `local/bad-index` (`reason: "extended"`).
3. The path: version 2 and 3, the bytes up to the first zero byte (the flags' 12-bit length is not trusted: 4,095 means
   "4,095 or more"), then padding so the entry's length is `(fixed + length + 8) & ~7` from its start, `fixed` being 62
   or 64 with a SHA-1 id (74 or 76 with SHA-256). Version 4: a varint `strip` (git's offset encoding:
   `value = byte & 127`, and while the high bit is set, `value = ((value + 1) << 7) | (next & 127)`), then the
   zero-terminated suffix; the path is the previous path's bytes less `strip` from the end, plus the suffix. `strip`
   beyond the previous path, a missing zero byte, or an entry past the end is `local/bad-index` (`reason: "entry"`,
   `at`).
4. Mode `0160000` (a submodule) goes to `gitlinks`, not `paths`; mode `040000` (a sparse folder) is
   `local/sparse-index`. A path seen already (a conflict's stages 1 to 3) is left out. Paths are decoded as UTF-8,
   invalid bytes as U+FFFD, as Node decodes git's output for the CLI.
5. Extensions follow until `idBytes` bytes remain: a 4-byte signature and a 32-bit size; one that overruns is
   `local/bad-index` (`reason: "extension"`). `link` is `local/split-index`, `sdir` is `local/sparse-index`; a signature
   starting `A` to `Z` is optional and skipped; any other is `local/index-extension` (`name`).
6. Exactly `idBytes` bytes remain (the checksum), else `local/bad-index` (`reason: "trailer"`). The checksum is not
   verified: git replaces the index by renaming a complete file, and `index.skipHash` writes zeros there.

### Git data (`local/git-data.ts`)

`findGit(folder)` returns `GitData | null`:

1. `.git` is a directory: the git data is `.git`.
2. `.git` is a file: its `gitdir: <path>` line. An absolute path, or one that climbs out of the folder (`..` past the
   top), is `local/outside`; one inside is followed. A `.git` file without that line is `local/bad-git-file`.
3. No `.git`, but `HEAD` is a file and either `objects` and `refs` are directories or `config` sets `bare = true` in
   `[core]` (the folder input lists no empty folders, so a fresh bare repository shows neither): git's own data (a bare
   repository or the `.git` folder itself) is `local/no-working-tree`.
4. Otherwise `null`: a folder without git.

- `idBytes`: 32 when `config` holds `objectformat = sha256` in its `[extensions]` section (case-insensitive, spaces
  free), else 20. A missing `config` means 20.
- `headCommit(folder, git)`: `HEAD` holding a hex id is that commit (`how: "detached"`); `ref: <name>` is the loose ref
  file `<git>/<name>` (`how: "ref"`), else the `packed-refs` line `<id> <name>` (`how: "packed"`); otherwise
  (`how: "none"`: an unborn branch, reftable refs) the commit is `"worktree"`, which the city model accepts.
- The index is `<git>/index`; none there is `local/no-index`.

### The walk (`local/walk.ts`)

- From `""`, `WALK_IN_FLIGHT` 8 directories listed at once. In each directory, a `.gitignore` file is read first and its
  rules (`ignore` 7.0.12, case-sensitive) apply to the paths beneath that directory, relative to it.
- An entry is ignored when the last rule that decides it, from the top folder's rules down to the deepest, ignores it;
  `test(path)` reports `ignored` or `unignored`, and a deeper decision replaces a shallower one. A directory is tested
  as `path/`, and an ignored directory is not listed. An entry named `.git` is always left out.
- `onCount(files)` reports every `WALK_REPORT` 1,000 files. More than `MAX_FILES` files is `local/too-large`.

### `readLocal(folder, onPhase)` (`local/read.ts`)

Returns
`{ snapshot, source: "index" | "walk", index: { version, entries, submodules } | null, head: how | null, unread }`,
`unread` naming the tracked root manifests the working tree lacks.

1. `onPhase({ phase: "index" })`; `findGit`. With git data: the `config`, the index (`readIndex`), the commit. Without:
   `onPhase({ phase: "folder", files })` as the walk counts, and the commit is `"worktree"`.
2. No paths is `local/empty`; more than `MAX_FILES` is `local/too-large`; a path over `MAX_PATH_BYTES` UTF-8 bytes is
   `local/long-path`.
3. `onPhase({ phase: "manifests" })`: each tracked root manifest (`isManifest`) is read from the working tree and parsed
   with `patternsOf`; one that cannot be read is left out and named in `unread`, as the CLI leaves out a manifest it
   cannot read. Members: `resolveWorkspaces(patterns, folders)` over every folder holding a file.
4. Submodules (`local/submodules.ts`, `readSubmodules(folder, gitlinks)` → `{ paths, sizes, submodules, unread }`,
   `sizes` each read path's bytes from its submodule's own index, `unread` by path, as parallel reads finish in any
   order; `readLocal` returns them as `submodules: { read, unread }`, `read` naming each top submodule with its file
   count): each gitlink's folder is looked up in the picked folder; its `findGit` (a `.git` file whose `gitdir` stays
   inside the picked folder, measured from the submodule's folder, or a `.git` directory) gives its git data, whose
   index (`readIndex`, its own `idBytes`) lists its tracked paths, prefixed with the gitlink's folder; its own gitlinks
   follow down to `SUBMODULE_DEPTH` 8 levels. A folder that is missing or empty (not checked out), git data outside the
   picked folder, no index, an index of a kind not read, or a depth beyond is the one file `<folder>/.gitlink`, logged
   `viewer/local-submodule-unread path reason` (`not-checked-out`, `outside`, `bad-git-file`, `no-index`, `index`,
   `depth`); it never fails the read. Submodule paths count towards `MAX_FILES` and `MAX_PATH_BYTES` as any.
5. The snapshot is `stateSnapshot(folder.name, commit, paths, members, gitlinks)`, the builder `citymap --no-history`
   uses.

### Support (`local/support.ts`)

`localSupport(window)`, first match: `(pointer: coarse)` is `"none"`; `showDirectoryPicker` present is `"handle"`;
`navigator.vendor` `Apple Computer, Inc.` is `"safari"`; `webkitdirectory` on inputs is `"input"`; else `"none"`. The
viewer reads it through `useSyncExternalStore` with `"none"` while prerendering, so nothing hydrates differently.

### Remembered folder (`local/remember.ts`)

- IndexedDB database `citymap`, version 1, store `local`, key `last`: the handle, and nothing else.
- `rememberFolder(handle)` after a successful read through a handle; `recallFolder()` on mount (`null` when there is
  none). Either failing is logged and leaves the menu without the item; it never stops a read.
- Opening again: `queryPermission({ mode: "read" })`, then, unless `granted`, `requestPermission` within the click;
  anything but `granted` is `local/denied`.

## Behaviour and state

`useLocalRepository({ ports, lay, theme, begin, status, setStatus, setError, present })` holds the remembered handle, a
busy flag and the status before an opening began; the city, status, notice and loading card stay the viewer's. It
returns `{ support, busy, pick, again, input }`, `again` being `{ name, open }` or null. `Viewer` takes
`folders?: LocalPorts` (the browser's by default) and hands the result to `LocalButton`, beside the search box, and to
`ViewControls` (`local?: LocalRepository`), which renders `LocalMenu` in More.

1. **Pick** (`"handle"`): the button's click calls `showDirectoryPicker({ id: "citymap-local", mode: "read" })` within
   the gesture (`PICKER_ID`). `AbortError` (the dialog closed) changes nothing.
2. **Pick** (`"input"`): the button's click clicks a hidden `<input type="file" webkitdirectory>` that lives outside the
   popover; the status becomes `LISTING` "Listing the folder's files…" until `change` or `cancel`; `cancel`, or a
   `change` with no files, puts the status back as it was.
3. **Again**: More's item closes More, then as above, through the remembered handle and its permission.
4. **Read**: a load begins on the viewer's loading card (`begin("local", name)`, source `local`; see the
   [viewer blueprint](../../004-interface-design/blueprints/viewer.md) § Loading), and the status under it is the last
   city's again. `localStep` takes each phase to the card: `index` "Reading the git index", `folder` "Reading the
   folder" ("{n} files found"), `manifests` "Reading workspace manifests", `lay` "Laying out {n} files", `draw` "Drawing
   the map"; the status line says the same ("{name}: reading the git index…"). A read cannot be stopped part way: one
   cancelled is dropped once it ends. The snapshot is laid by the viewer's `lay` (the city's worker, with the job's
   signal, its progress, the map's theme and the colour asked for).
5. **Shown**: the viewer's `present(job, laid, name)` draws it as every load ends (`draw`, titled "Local repository"):
   the title card names the folder, the tab says "Local repository · citymap"; the status gains " · local, single state,
   not folded"; the bundled city selection is cleared; the address loses its query (`history.replaceState` to the bare
   path). Through a handle, it is remembered.
6. **Failed**: the card goes, the notice says the failure's sentence; the last city stays, and the status goes back to
   what it said of it. **Cancelled** (the card's Cancel or Escape): nothing is shown, logged or remembered.

While a read runs, the button and More's item are disabled, so no second opening starts.

## Presentation and UX

- `LocalButton`, right beside the search box (`.finder` holds both): with `"handle"` and `"input"`, a glass icon button
  (icon `FolderGit2`, 48 by 48 px, the search box's height, 8 px to its right) named "Open a local repository", and its
  tooltip (`role="tooltip"`, `.tooltip.local-tip`, under the button, aligned to its right edge), also its description:
  "Open a local repository: as it is now, not folded over its history. For a folded city, run
  `citymap <folder> --out=city.json`, then open the file." The tooltip shows while the pointer rests on the button or
  the tooltip, and while the button has keyboard focus; Escape hides it. With `"safari"` and `"none"` there is no
  button.
- The button hangs outside the search box's box, so the search keeps its place and width whether the button is there or
  not. Below 1,100 px wide, where the search sits under the title, its width leaves 56 px for the button
  (`min(440px, 100vw - 3 × 16 px - drawer - 56px)`); below 760 px, on a fine pointer only (a phone has no button), its
  right edge sits 56 px further in.
- More, after "Open a city file…": a group headed "Local repository" (`popover-heading`):
  - `"handle"` and `"input"` with a remembered folder: a button "Open {name} again" (icon `FolderClock`); without one,
    no group.
  - `"safari"`: the line "Safari hides a folder's .git and .gitignore from pages: open a local repository in Chrome,
    Edge or Firefox, or run the CLI."
  - `"none"`: nothing.
- Failure sentences (`describeLocal(error, name)`):

| Code                    | Sentence                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `local/denied`          | The browser did not allow reading {name}.                                                                               |
| `local/split-index`     | {name} has a split index, which is not read here: run "git update-index --no-split-index", then try again.              |
| `local/sparse-index`    | {name} has a sparse index, which is not read here: run "git sparse-checkout reapply --no-sparse-index", then try again. |
| `local/index-version`   | {name}'s git index is version {version}; versions 2 to 4 are read.                                                      |
| `local/index-extension` | {name}'s git index needs its "{name}" extension, which is not read here.                                                |
| `local/bad-index`       | {name}'s git index could not be read; it may be damaged.                                                                |
| `local/no-index`        | {name} has no git index yet: nothing is checked out or staged.                                                          |
| `local/outside`         | {name} keeps its git data outside the folder (a linked worktree or a submodule): pick the main checkout.                |
| `local/bad-git-file`    | {name}'s .git file does not say where its git data is.                                                                  |
| `local/no-working-tree` | {name} is git's own data, not a working tree: pick the repository's folder.                                             |
| `local/vanished`        | A file in {name} changed or vanished while it was read: try again.                                                      |
| `local/too-large`       | {name} holds {files} files, more than the {MAX_FILES} a city holds.                                                     |
| `local/long-path`       | {name} holds a path longer than 4,096 bytes.                                                                            |
| `local/empty`           | There are no files to lay in {name}.                                                                                    |

- Any other failure (the city's worker's): "{name} could not be laid: {message}."; a failure before a folder is known
  names it "the folder".

## Accessibility

- The button is a native button after the search field in reading order, with the glass controls' focus ring; the
  explanation is its description (`aria-describedby`), read by a screen reader whether the tooltip shows or not.
- "Open {name} again" is a native button in More's list, with the menu's focus ring; the Safari line is plain text in
  the list.
- The phases are the loading card's and the status line's text (`aria-live="polite"`, the card announcing nothing), so
  each phase is announced once; a failure is the notice's `role="alert"`.
- The hidden folder input carries `aria-label="Repository folder"` and is never focusable (`hidden`).

## Web experience

- Nothing loads until it is used: the reader is part of the page, `ignore` arrives by dynamic import for a folder
  without git, and IndexedDB is opened once, after the first paint, only where support is `"handle"`.
- The button appears after hydration (support is known only in the browser) and hangs beside the search box, which keeps
  its place and width, so it shifts nothing (CLS 0); its tooltip floats. The menu's items exist only while More is open
  and the menu floats; the status and the notice already float.
- Reading and decoding run on the main thread between awaits (the index of linux decodes in tens of milliseconds);
  laying runs in the city's worker, so input stays answered (INP).

## Data and persistence

- Persisted: the last handle only (IndexedDB `citymap` version 1, store `local`, key `last`). No path, name or content
  is stored; the name is read from the handle itself.
- Restore: `recallFolder()` on mount; a record that is not a directory handle is ignored and logged.
- Migration: none at version 1; a later version replaces the store in `onupgradeneeded`.

## Security and trust

- Everything read stays in the page: no request is made for a local repository (the reader takes no fetcher), nothing is
  written to the address, and the tab title holds no name. IndexedDB holds the handle only, never contents or paths.
- Repository content is untrusted: the index is bounds-checked at every read and its paths are data; the walk is bounded
  by `MAX_FILES` files, and browsers do not follow symbolic links when listing.
- `gitdir` is followed only inside the picked folder; the page cannot reach anything else.

## Performance and limits

- Through a handle, a read costs `HEAD`, a ref, `config`, the index (linux: 10 MB) and the root manifests.
- Through the folder input, the browser's own listing dominates (linux: 3.4 to 3.6 s); finding the index then takes
  under 60 ms. The page cannot shorten the listing, only say that it runs.
- Measured from the pick to the city shown (`apps/web/scripts/measure-local.ts`), on a loaded machine: takken.io 0.2 s
  (Chromium) and 0.5 s (Firefox); next.js (34,000 files) 1.2 s and 3.0 s; linux (96,000 files) 4.0 s and 8.6 s.
- `readIndex` is one pass over the bytes; the snapshot and the lay are the GitHub path's.

## Observability

Every line through `src/log.ts`: `viewer/local-pick how` (`handle`, `input`, `again`), `viewer/local-cancelled how`,
`viewer/local-listed entries`, `viewer/local-index version entries submodules`, `viewer/local-submodule path files`,
`viewer/local-submodule-unread path reason`, `viewer/local-commit how`, `viewer/local-walk files`,
`viewer/local-manifest-unread path`, `viewer/local-read source files ms`, `viewer/local-failed reason` (to
`console.error`), `viewer/local-remember-failed reason`, `viewer/local-recall-failed reason`,
`viewer/local-recalled found`. `ms` runs from the start of the read to the city shown. No line carries the folder's
name, except the viewer's own `viewer/open`.

## Constants and configuration

`WALK_IN_FLIGHT` 8 and `WALK_REPORT` 1,000 (in `local/walk.ts`), `MAX_FILES` and `MAX_PATH_BYTES` from the engine, the
database name, version and key (in `local/remember.ts`); provenance in [DEFAULTS](DEFAULTS.md).

## Assets and external resources

- `ignore` 7.0.12 (MIT, no dependencies), loaded only for a folder without git (a dynamic import).
- `fake-indexeddb` 6.2.5 (Apache-2.0), in unit tests only.
- Picture of the menu and a city opened from its own folder: `docs/img/local.png`, from the end-to-end staging.
- Index fixtures in `apps/web/src/local/testing/indexes/`, written by git itself through
  `apps/web/scripts/index-fixtures.ts`, each beside git's own listing (`git ls-files --stage`).

## Testing

| Spec rule                                               | Test                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| the files are what git tracks; versions 2 to 4; formats | `git-index.test.ts`: every fixture against git's listing, links kept, submodules out               |
| split and sparse indexes, other kinds named             | `git-index.test.ts`: the `link` and `sdir` fixtures, and damaged bytes, each by code               |
| worktrees, submodules, git's own data, no index         | `git-data.test.ts`, `read.test.ts` over `listedFolder` fixtures                                    |
| submodules read through their own index; unread ones    | `submodules.test.ts` (handle and listed folders); `e2e/local.spec.ts` with a real submodule        |
| a folder without git honours `.gitignore`               | `walk.test.ts`: nesting, negation, anchoring, ignored folders never listed                         |
| equal to `citymap --no-history`                         | `apps/web/scripts/local-equals-cli.ts` over the corpus, and over each index rewritten as v3 and v4 |
| Chromium reads only what it needs                       | `folder.test.ts`: a recording handle; `e2e/local.spec.ts` through an origin private folder         |
| remembered, permission asked again                      | `remember.test.ts` (fake IndexedDB); end to end after a reload                                     |
| not on a phone, not in Safari                           | `support.test.ts`; `ViewerLocal.test.tsx`; the phone project end to end                            |
| the button beside the search box, its tooltip           | `LocalButton.test.tsx`; `e2e/local.spec.ts` measures it beside the search box, search unmoved      |
| phases, the status, the failures shown and logged       | `ViewerLocal.test.tsx`; `e2e/local.spec.ts` per failure                                            |
| privacy: no request, no address, no name in the title   | `ViewerLocal.test.tsx`; `e2e/local.spec.ts` watches every request                                  |
| the folder input path, axe light and dark               | `e2e/local.spec.ts`; `e2e/viewer.spec.ts` judges More with the group open                          |
| the time it takes                                       | `scripts/measure-local.ts` (Firefox headed under `xvfb-run`: headless Firefox has no WebGL)        |
