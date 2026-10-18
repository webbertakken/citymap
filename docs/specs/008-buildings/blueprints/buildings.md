# Buildings blueprint

Derived from [buildings](../buildings.md) and the [viewer](../../004-interface-design/viewer.md) (Layout, Map, Hover and
select); research in [buildings](../../../research/buildings.md). Code: `packages/measures` (pure: the section, tests by
name, languages, text, coverage reports, lots, aggregation, scales), `packages/history` (contents at a commit, file
history), `apps/cli` (wiring), `packages/scene` (the buildings mesh, ramps, the lot table), `apps/web` (readers, the
Buildings view, colour by, cards); in Rust `rust/crates/measures`, `rust/crates/history`, `rust/crates/cli`.

## Domain and naming

| Term          | Identifier                                       | Meaning                                                                                   |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| measure       | `Measure`, `MEASURES`                            | `size`, `tested`, `kind`, `recency`, `churn`, `authors`, `comments`, in that order        |
| source        | `MeasuresSource`                                 | `cli`, `github`, `folder`                                                                 |
| measures      | `Measures`                                       | the city file's section: source, size unit, tested method, available measures, lots       |
| file measures | `FileMeasures`                                   | one file's values; a missing field is unknown                                             |
| lot measures  | `LotMeasures`                                    | a lot's files (by path) and the people across them                                        |
| city file     | `CityFile`, `parseCityFile`, `serialiseCityFile` | `{ city, measures }`: the layout and, beside it, the measures or null                     |
| tests by name | `testNames(paths)`, `namedBy(names, path)`       | the stems test files name, and whether a source path is one of them                       |
| language      | `languageOf(path)`                               | the file's language and its comment syntax, from its extension or name                    |
| text facts    | `countText(bytes, path)`                         | bytes, and for a text file lines, comment lines and marks                                 |
| report        | `parseReport(text, name)`                        | a coverage report read into `ReportFile[]`: paths as written, lines and their hits        |
| coverage      | `matchReports(reports, paths)`                   | each repository path's covered and executable lines, from every report                    |
| lot files     | `lotFiles(city, plat, files)`                    | each lot's live files, by town key and lot key                                            |
| building      | `Building` (`aggregate(lot, measures)`)          | one lot's measures together: size, tested, recency, churn, authors, comments, marks       |
| scale         | `Scales`, `cityScales(buildings)`                | the city's 5th and 99th percentiles per ordered measure                                   |
| floors        | `floorsOf(size, scale)`                          | 1 to 12                                                                                   |
| colour by     | `ColourBy`                                       | `folder` or one of `tested`, `size`, `kind`, `recency`, `churn`, `authors`                |
| lot table     | `lotTable(order, buildings, colourBy, theme)`    | four floats per lot: floors, lit share, packed colour, flags; the buildings mesh reads it |
| view mode     | `Mode`                                           | `plan` or `buildings`                                                                     |
| file history  | `FileHistory`                                    | per identity: last change, commits, authors; filled while the history is read             |
| author        | `Author` (`{ name, email }`)                     | a commit's raw author, as written (`%an`, `%ae`), never mapped by git                     |
| mailmap       | `Mailmap`, `parseMailmap`, `emailOf`             | the laid commit's `.mailmap`: which email each author's commits count under               |

## The city file (`packages/measures/src/section.ts`)

A city file is the city model's canonical JSON with one more top-level key, `measures`, when it has any:

```ts
type Measure = "size" | "tested" | "kind" | "recency" | "churn" | "authors" | "comments";
interface FileMeasures {
  readonly path: string;
  readonly bytes?: number; // the file's size in bytes
  readonly lines?: number; // text files: newline count, plus one when the last line has no newline
  readonly comments?: number; // comment lines, when the language's comment syntax is known
  readonly todos?: number; // TODO, FIXME and XXX marks inside comment lines
  readonly covered?: number; // executable lines a coverage report saw run
  readonly executable?: number; // executable lines the coverage reports know (at least 1)
  readonly named?: boolean; // a test file names it; source files of a known language, when tested is "name"
  readonly changed?: number; // epoch seconds of the last first-parent commit that changed it
  readonly commits?: number; // first-parent commits that changed it (the one that added it included)
  readonly authors?: number; // distinct author emails among those commits, as the laid commit's .mailmap maps them
}
interface LotMeasures {
  readonly files: readonly FileMeasures[]; // sorted by compareKeys(path); at least one
  readonly authors?: number; // distinct author emails across its files (history only)
}
interface Measures {
  readonly version: 1;
  readonly source: "cli" | "github" | "folder";
  readonly size: "lines" | "bytes";
  readonly tested: "coverage" | "name";
  readonly available: readonly Measure[]; // in MEASURES order
  readonly lots: Readonly<Record<string, Readonly<Record<string, LotMeasures>>>>; // town key -> lot key
}
interface CityFile {
  readonly city: City;
  readonly measures: Measures | null;
}
```

- Every number is a non-negative safe integer; the section carries no floats, as the city carries none.
- `serialiseCityFile({ city, measures })` is `canonicalJson(measures ? { ...city, measures } : city)`: a city without
  measures is byte for byte what `serialiseCity` writes, and the layout's keys and values are the same with or without
  them (only the `measures` key is added, sorted between `highways` and `repository`).
- `parseCityFile(text)`: JSON (`city/bad-json`), then the `measures` key split off and validated (`measures/bad-shape`
  with the JSON pointer; a `version` above 1 is `measures/too-new`), and the rest validated as a city with `parseCity`'s
  schema (`city/bad-shape`). A file without the key opens with `measures: null`.
- `lots` keys are town keys, then lot keys: a lot key alone is not unique, as an old town keeps its lots' keys while the
  new town beside it reuses them. Vacant lots have no entry. Lots whose files are all unknown in every measure are still
  listed, so the card can list their files.
- Availability (`available`) by source:

| Source                  | size | tested | kind | recency | churn | authors | comments | size counted in |
| ----------------------- | ---- | ------ | ---- | ------- | ----- | ------- | -------- | --------------- |
| `cli` (folded)          | yes  | yes    | yes  | yes     | yes   | yes     | yes      | lines           |
| `cli` (folded, no map)  | yes  | yes    | yes  | yes     | yes   | no      | yes      | lines           |
| `cli` (`--no-history`)  | yes  | yes    | yes  | no      | no    | no      | yes      | lines           |
| `github`                | yes  | yes    | yes  | no      | no    | no      | no       | bytes           |
| `folder`, contents read | yes  | yes    | yes  | no      | no    | no      | yes      | lines           |
| `folder`, not read      | yes  | yes    | yes  | no      | no    | no      | no       | bytes           |

- "No map" is a fold whose laid commit's `.mailmap` a partial clone does not hold and could not fetch (§ Mailmap): its
  authors are unknown, its files and lots carry no `authors`, and `available` leaves `authors` out. The section carries
  no reason field: a `cli` city whose `available` holds `recency` but not `authors` is that city, and no other.
- `tested` is `coverage` when at least one coverage report was read and matched at least one file, else `name`.
- The reason an unavailable measure gives (`unavailableReason(measure, measures)`): recency, churn and authors "needs
  the CLI's history" (or "laid without history" for a `cli` source); authors, in a `cli` city with recency, "The laid
  commit's .mailmap could not be fetched"; comments "needs the files' contents"; a city without measures gives "this
  city file has no measures" for every measure but kind (kind is the lot's land use and the path's language, always
  known).

## Tests by name (`packages/measures/src/by-name.ts`)

- Families, by extension (lower case): `js` (`ts tsx mts cts js jsx mjs cjs vue svelte`), `py` (`py`), `go` (`go`),
  `jvm` (`java kt kts scala groovy`), `rs` (`rs`), `rb` (`rb`), `cs` (`cs`), `php` (`php`), `c`
  (`c cc cpp cxx h hh hpp hxx m mm`), `swift` (`swift`), `dart` (`dart`), `ex` (`ex exs`). A path's stem is its file
  name before the last dot; a name without a dot, or starting with its only dot, has no family.
- Markers (each strips to the named stem; case-sensitive):

| Family  | Suffix markers (any land use)                                           | Prefix markers (land use `tests` only) |
| ------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `js`    | `.test` `.spec` `.tests` `.e2e` `.unit` `-test` `-spec` `_test` `_spec` | none                                   |
| `py`    | `_test` `_tests`                                                        | `test_`                                |
| `go`    | `_test`                                                                 | none                                   |
| `jvm`   | `Test` `Tests` `IT` `Spec`                                              | `Test`                                 |
| `rs`    | `_test` `_tests`                                                        | none                                   |
| `rb`    | `_spec` `_test`                                                         | `test_`                                |
| `cs`    | `Test` `Tests`                                                          | none                                   |
| `php`   | `Test`                                                                  | none                                   |
| `c`     | `_test` `_unittest` `_tests`                                            | `test_`                                |
| `swift` | `Test` `Tests`                                                          | none                                   |
| `dart`  | `_test`                                                                 | none                                   |
| `ex`    | `_test`                                                                 | none                                   |

- A marker strips only when something is left (`Test.java` names nothing by its suffix).
- `testNames(paths)`: for each path of a family whose land use (`classifyLandUse`) is not `vendored`, `generated` or
  `fixtures`: the stems its markers strip, and, when its land use is `tests` and one of its folders is a test folder
  (`test tests __tests__ __test__ spec specs testing`, case-insensitive), its own stem. Each named stem is kept as
  `(family, folder, stem)` with the folder reduced: its segments that are source or test folders
  (`src lib main source test tests __tests__ __test__ spec specs testing unit integration`, case-insensitive) left out,
  the rest joined by `/`.
- `namedBy(names, path)`: for a path of land use `source` and a family, true when some named `(family, folder', stem)`
  has the same family and stem and either reduced folder ends the other at a segment boundary (the empty folder ends
  every folder). Stored as two sets per `family|stem`: the named folders, and every ending of every named folder; a
  source checks its folder's endings against the first and its folder against the second, so the work is linear in the
  paths' depth. Any other path is not judged: `named` is absent.

## Languages and text (`packages/measures/src/language.ts`, `text.ts`)

- `languageOf(path)` → `{ name, comments } | null`, by the lower-cased extension, else by the file name (`Dockerfile`,
  `Makefile`, `CMakeLists.txt`, `Jenkinsfile`, `Gemfile`, `Rakefile`). `comments` is the syntax: line markers and block
  pairs, or `none` (JSON: its comments are known to be 0).

| Syntax      | Line markers | Blocks       | Languages (extensions)                                                                                                                                                                                                                                                       |
| ----------- | ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c`         | `//`         | `/*` `*/`    | TypeScript (ts tsx mts cts), JavaScript (js jsx mjs cjs), Java, Kotlin (kt kts), Scala, Groovy (groovy gradle), C (c h), C++ (cc cpp cxx hh hpp hxx), C# (cs), Go, Rust (rs), Swift, Dart, Objective-C (m mm), Protocol Buffers (proto), Zig, Sass (scss), Less, Jenkinsfile |
| `css`       | none         | `/*` `*/`    | CSS                                                                                                                                                                                                                                                                          |
| `hash`      | `#`          | none         | Python (py), Ruby (rb), Shell (sh bash zsh fish), Perl (pl pm), R (r), Elixir (ex exs), YAML (yaml yml), TOML, CMake (cmake, CMakeLists.txt), Dockerfile, Makefile (mk, Makefile), Nix, Terraform (tf), PowerShell (ps1), Gemfile, Rakefile                                  |
| `php`       | `//` `#`     | `/*` `*/`    | PHP                                                                                                                                                                                                                                                                          |
| `dash`      | `--`         | none         | SQL, Lua, Haskell (hs), Elm                                                                                                                                                                                                                                                  |
| `markup`    | none         | `<!--` `-->` | HTML (html htm), XML (xml xsd xsl), SVG, Vue, Svelte, Markdown (md mdx)                                                                                                                                                                                                      |
| `semicolon` | `;`          | none         | INI (ini), Clojure (clj cljs), Lisp (lisp el)                                                                                                                                                                                                                                |
| `percent`   | `%`          | none         | Erlang (erl), TeX (tex)                                                                                                                                                                                                                                                      |
| `none`      | none         | none         | JSON (json)                                                                                                                                                                                                                                                                  |

- `countText(bytes, path)` → `{ bytes, lines?, comments?, todos? }`:
  - `bytes` is the length. A file with a zero byte among its first `BINARY_PROBE` 8,000 bytes is binary (git's own
    test): only `bytes`.
  - `lines`: the number of `\n` bytes, plus one when the file is not empty and does not end with `\n`.
  - With a known syntax, lines are scanned one by one (split at `\n`, a trailing `\r` dropped, leading and trailing
    ASCII space and tab trimmed): inside a block, the line is a comment line, and the block ends after its closing
    marker; otherwise a line that starts with a line marker, or with a block's opening marker, is a comment line (the
    block stays open when its closing marker does not follow on the line); a code line that opens a block without
    closing it opens the block for the next lines. Strings are not parsed: a marker inside a string counts.
  - `todos`: in comment lines, each `TODO`, `FIXME` or `XXX` (upper case) whose neighbours are not ASCII letters, digits
    or `_`.
  - Without a known syntax: `lines` only. Bytes are scanned as bytes (every marker is ASCII), so TypeScript and Rust
    count alike whatever the encoding.

## Coverage reports (`packages/measures/src/reports/`)

```ts
interface ReportFile {
  readonly path: string; // as the report writes it
  readonly lines: ReadonlyMap<number, number>; // line number -> hits, every executable line
}
interface Report {
  readonly format: "lcov" | "istanbul" | "cobertura" | "jacoco";
  readonly roots: readonly string[]; // Cobertura's <source> folders, in order
  readonly files: readonly ReportFile[];
}
```

- `parseReport(text, name)` tells the format by its content: text whose first non-blank character is `{` or `[` is
  Istanbul JSON (an array is not an object of files: `coverage/unreadable`); one whose first element (after the XML
  declaration, comments and a doctype) is `coverage` is Cobertura, `report` JaCoCo; text holding a line starting `SF:`
  is LCOV. Anything else is `coverage/unreadable` (detail `name`).
- **LCOV**: per record (`SF:` to `end_of_record`): `DA:<line>,<hits>[,…]`; a line repeated takes the larger count;
  negative or non-numeric counts are 0; a record without `DA` lines is left out. Several records for one path join.
- **Istanbul JSON**: an object of files (a value may be wrapped as `{ data: … }`); the path is the value's `path`, else
  its key. A line's hits are the largest count of the statements starting on it (`statementMap[k].start.line`, count
  `s[k]`); a file without statements is left out. Not an object: `coverage/unreadable`.
- **XML**: `scanXml(text)` yields start tags (name and attributes), end tags and self-closing tags in order, skipping
  the declaration, processing instructions, comments, a doctype and CDATA; attribute values decode
  `&lt; &gt; &amp; &quot; &apos;` and numeric references (`&#N;`, `&#xH;`); anything else stays as written. Unterminated
  markup ends the scan.
- **Cobertura**: `<source>` texts are the roots; for each `<class filename>`, the `<line number hits>` directly inside
  its `<lines>` (not those under `<methods>`); classes sharing a file name join, a line taking its larger count.
- **JaCoCo**: each `<sourcefile name>` inside `<package name>` is the path `package/name` (just `name` in the default
  package); its `<line nr mi ci>` lines, hits `ci` (covered instructions), executable when `mi + ci > 0`.
- Usual paths (`USUAL_REPORTS`), looked for at the repository's root and in every folder that directly holds a manifest
  (`isManifest`), in this order: `coverage/lcov.info`, `lcov.info`, `coverage/coverage-final.json`,
  `coverage/cobertura-coverage.xml`, `coverage.xml`, `cobertura.xml`, `target/site/jacoco/jacoco.xml`,
  `build/reports/jacoco/test/jacocoTestReport.xml`. A report over `MAX_REPORT_BYTES` (256 MB) is skipped and logged.
- `matchReports(reports, paths)`: each report path is normalised (`\` to `/`, a `file://` prefix dropped, `.` segments
  dropped, `..` folding into its parent, a leading `/` or drive remembered) and matched, the first that finds a path
  winning. A Cobertura file is tried joined to each of its roots first (absolute or relative), then as written.
  1. relative: joined to each base, deepest first: the report's own folder and every folder above it (for a report from
     outside the repository, only the root);
  2. its longest ending, at a segment boundary, that is a path of the repository;
  3. the one path of the repository that it ends (JaCoCo's package paths); with several, the one under the report's
     deepest base, if exactly one; else unmatched.
- Matched lines join across reports: a line is executable when any report lists it, covered when any saw it run. A file
  gets `executable` (the count of its lines) and `covered` only when it has at least one executable line. Unmatched
  report paths are counted for the log, never guessed.

## File history (`packages/history`)

- The log format gains the commit's committer time and its raw author, email then name:
  `--format=%x01%H%x02%ct%x02%ae%x02%an`. Never `%aE`: git maps it through the working tree's `.mailmap` (and
  `mailmap.file`, `mailmap.blob`), and `--no-mailmap` does not stop it. `parseRawLog` reads
  `RawCommit { sha, time, author: { name, email }, entries }`: the name is everything after the third `\x02`, so a name
  holding one stays whole; a header without them reads time 0 and an author of "" and "".
- `FileHistory` (`file-history.ts`): `record(identity, time, email)` for each entry of each commit that leaves the path
  live (added, modified, renamed in; not deleted, not a submodule), after the commit is applied, so a rename counts
  under the identity it carries, with the email the mailmap gives the commit's author (`emailOf`). Per identity:
  `changed` the largest time, `commits` the count, the set of authors (emails lower-cased in ASCII, interned to
  integers). `of(identity)` and `authorsAcross(identities)`.
- `readHistory(dir, { fileHistory })` records into it while reading; every commit is recorded, resumed folds included (a
  resume applies every earlier commit too), so a resumed city's measures match the uninterrupted fold's. The mailmap is
  the target's (`to`, resolved before the log), read once before the log starts, and only when a file history is asked
  for; a resume reads the same target's, so the lock carries nothing for it.

- Merges are counted once, by the merge's author: the history read is the first-parent one the fold reads.
- `listTree(dir, commit)` (`contents.ts`): `git ls-tree -r -z` at the commit, submodules left out;
  `readBlobs(dir, blobs, onBlob)`: `git cat-file --batch` for each distinct blob the repository holds
  (`BlobReader.readBytes`, the answer's chunks joined once when whole; a partial clone's missing blobs are never asked
  for, so nothing is fetched). The CLI counts each blob's bytes (`countText`) for every path that holds it; a blob not
  held gives the path no size, no lines, no comments. In Rust the history reader hands the files' history over as its
  last item (`HistoryItem::Files`).

### Mailmap (`packages/history/src/mailmap.ts`, `rust/crates/history/src/mailmap.rs`)

- `readMailmap(dir, commit, blobs)` (Rust `read_mailmap`): `git ls-tree -z --full-tree <commit> -- .mailmap` names the
  root entry, whichever folder of the repository the CLI was given. A regular file (mode `100644` or `100755`) is read
  through the reader's `BlobReader` (never fetched) and parsed: status `read`. No entry is `absent`; a symbolic link, a
  folder or a submodule is `not-a-file` (git does not follow a `.mailmap` link in a checkout either). Both map nobody.
- A regular file whose blob the clone does not hold is fetched, that one object and nothing else
  (`fetchBlob(dir, blob)`, Rust `fetch_blob`): the promisor remotes are `extensions.partialclone`, then each
  `remote.<name>.promisor` set true, in config order (`git config --get-regexp`), each tried in turn until one gives the
  object, as git's own lazy fetch does:
  `git -c fetch.negotiationAlgorithm=noop fetch --quiet --no-tags --no-write-fetch-head --recurse-submodules=no --filter=blob:none <remote> <blob>`,
  with `GIT_TERMINAL_PROMPT=0` (no credential prompt), `GIT_NO_LAZY_FETCH=1` (nothing else is fetched on the side) and
  standard input closed, killed after `MAILMAP_FETCH_TIMEOUT` 30 s. Then `git cat-file blob <blob>` reads it and it is
  parsed: status `fetched`. When no remote gives it, the status is `unfetchable` with a reason: `no-promisor` (no
  promisor remote: a clone that is not partial yet lacks the blob), `timeout`, or `exit-<code>` (git's exit code, from
  the last remote tried). An unfetchable `.mailmap` makes the authors unknown: the reader calls
  `fileHistory.forgetAuthors()` (Rust `FileHistory::forget_authors`), after which `authorsKnown` (Rust
  `authors_known()`) is false; the commits are still recorded for recency and churn.
- One log line, after `history/schedule`:
  `history/mailmap status=<read|fetched|absent|not-a-file|unfetchable> entries=<n>` (`n` the commit emails it has lines
  for, 0 unless read or fetched); an unfetchable one adds `reason=<no-promisor|timeout|exit-N>` and, when git said why,
  `error=<git's first stderr line>`.
- `parseMailmap(text)` (Rust `Mailmap::parse`), as git's `mailmap.c` reads a blob: the text ends at its first NUL; it
  splits at `\n` (a `\r` stays in the line); a line starting `#` is skipped. A pair is a `<`, the first `>` after it,
  the email between them (as written, not trimmed) and the name before the `<` trimmed of space, tab, `\r` and `\n`
  (none when empty). The first pair needs a non-empty email; what follows its `>`, when not empty, is read for a second
  pair, whose email may be empty. A line without a first pair maps nothing; text after a second pair is ignored.
- The four forms, by what the line gives (first pair: proper; second: as committed):

| Line                                                    | Entry, keyed by the commit email                           |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `Proper Name <commit@email>`                            | simple: the name only (no email change)                    |
| `<proper@email> <commit@email>`                         | simple: email `proper@email`                               |
| `Proper Name <proper@email> <commit@email>`             | simple: email `proper@email` (and the name)                |
| `Proper Name <proper@email> Commit Name <commit@email>` | by name `Commit Name`: email `proper@email` (and the name) |

- Keys compare case-insensitively in ASCII only: emails, and names in the fourth form (git's `strcasecmp`). A later line
  for the same key wins: a simple entry's email is replaced only by a line that gives one; a named entry is replaced
  whole.
- `emailOf(mailmap, author)` (Rust `Mailmap::email_of`): the entry of the author's email, else the author's email. With
  named entries, the one of the author's name, when there is one, gives the email; otherwise the simple entry does. An
  entry that gives no email leaves the author's email. `FileHistory` then lower-cases the result in ASCII.

## The CLI (`apps/cli`, `rust/crates/cli`)

- Flags: `--coverage=<file>` (repeatable; a report to read instead of the usual paths), `--no-measures` (write the city
  without its measures section, as before).
- After the fold, unless `--no-measures`: the target's contents (`listTree`, `readBlobs`), tests by name over the last
  snapshot's paths (only when no report matches), the reports (the named ones, or those at the usual paths, read from
  the working directory, sorted by path), the file history (folds only), the lots' files
  (`lotFiles(city, state.plat, snapshot.files)`), and the section (`buildMeasures`). The plat, the lock and the city's
  layout are computed before and never read back: they are byte-identical with and without measures.
- Rejections: a named `--coverage` file that does not exist is `coverage/missing` (exit 1); one that cannot be read as a
  report is `coverage/unreadable` (exit 1). A report at a usual path that cannot be read is skipped and logged.
- Logs (both CLIs, same lines): `measures/report path=<as found> format=<f> files=<n> matched=<m>` per report read;
  `measures/report-skipped path=<p> reason=<unreadable|too-large>`; then
  `measures/done source=cli size=lines tested=<coverage|name> lots=<n> files=<n> read=<n> unread=<n>` (files on lots;
  tree files read and not held) before `fold/done`.

## Lots (`packages/measures/src/lots.ts`)

- `lotFiles(city, plat, files)`: identities to paths from the snapshot's files; for a town that is not old, each lot's
  members from `plat.towns[town.key].shares` (every record of every folder and use, by lot key); for an old town, from
  the `OldTown` whose `town.key` is the town's key (`members`). A lot's files are its members that are live, as paths,
  sorted; a lot with none falls back to its own `path`. Vacant lots are skipped.
- `buildMeasures({ source, size, history, authors, comments, city, lots, factsOf, authorsAcross })` assembles the
  section; `factsOf(path)` returns the file's fields, and `available` follows from `source`, `history`, `authors` (the
  history's `authorsKnown`) and `comments` (`availableFor`). Without authors, the CLI gives `factsOf` no `authors` and
  `buildMeasures` no `authorsAcross`.

## Buildings, aggregation and scales (`packages/measures/src/building.ts`)

- `aggregate(lot)` → `Building`: `size` the sum of the files' sizes in the city's unit (`lines` or `bytes`), unknown
  only when every file's is; `tested` the smallest share among files with a value (`covered / executable`, or `named` as
  1 or 0), unknown when none has one; `changed` the newest; `commits`, `comments`, `todos` sums of known values;
  `authors` the lot's own count; `files` the paths.
- `cityScales(buildings)`: for size, churn and authors, the 5th and 99th percentiles (nearest rank, over buildings with
  a known positive value); for recency, the 5th percentile and the newest.
- `floorsOf(size, scale)`: unknown or at most the 5th percentile, 1; at least the 99th, 12; between,
  `1 + 11 · (ln s − ln p5) / (ln p99 − ln p5)` rounded to the nearest integer. A scale whose ends are equal gives 1
  below and 12 above it.
- `shareOf(value, scale)` (colour): log for size, churn and authors, linear in time for recency, clamped to 0 to 1.

## The Buildings view (`packages/scene`, `apps/web`)

- `View` gains `mode: "plan" | "buildings"`; `basis(mode)`: plan looks straight down (eye `(0, 1, 0)`, screen up
  `(0, 0, −1)`); buildings from `ELEVATION` 30° and `YAW` 45°: eye `(cos30·sin45, sin30, cos30·cos45)`, screen right
  `unit(forward × up)`, screen up `right × forward`. `project`, `pan`, `fit` (over the bounds' four corners) and
  `unproject(view, viewport, screen, height)` use the basis, as they did before plan view stood alone. Switching keeps
  `centre` and `zoom`; the person's view is kept, and a fitted view stays fitted.
- The view switch is a `<fieldset class="glass segmented">`, legend "View", of two buttons, "Plan" and "Buildings",
  `aria-pressed`, first among the top-right controls. Logged as `viewer/mode` (`mode`).
- `buildScene` draws vacant lots flat in the reserve colour (layer `vacant`) and every other lot into `Scene.buildings`:
  - `positions` (x, ring, z): the ring is 0 at the foot and 1 at the top; `lots` (one float per vertex, the lot's
    index); `facades` (two floats per vertex: the distance along its wall, and the wall's length; −1 and −1 on a roof);
    `indices`, roofs first (`roofIndices` of them), then walls; `order`: per lot `{ town, key, district, use }` in index
    order.
  - One roof (a fan) and one wall per edge (a quad, its own four vertices), as the plinths were; every triangle wound to
    face outwards (a lot running clockwise with y north has each triangle turned), so the material draws front faces
    only and a wall facing away costs nothing.
  - Two geometries share the vertices: every face for the Buildings view, the roofs alone for plan view, where no wall
    shows from straight above.
- `lotTable(order, buildings, colourBy, theme)` → `Float32Array` of `4 × DATA_COLUMNS × rows`: per lot `floors`, the lit
  share (−1 unknown), the colour packed as `r · 65536 + g · 256 + b` (exact in a float), and flags (1: size unknown).
  Uploaded as an RGBA float `DataTexture` of `DATA_COLUMNS` 1,024 columns.
- The shader (`ShaderMaterial`, GLSL 3): a vertex reads its lot's texel (`texelFetch`), its height is `LOT_HEIGHT` in
  plan view and `floors · FLOOR_HEIGHT` in the Buildings view (`uniform uBuildings`), on top of the lots' base height. A
  roof is the lot's colour; in the Buildings view a roof of unknown size is hatched (stripes `HATCH` 0.2 u wide, 30 %
  darker). A wall is the colour shaded by its facing (the screen-space normal from `dFdx`/`dFdy`, lit from the north
  west: 0.72 to 0.95), with a dark seam at its ends (`SEAM` 0.03 u); in the Buildings view its windows: floors of
  `FLOOR_HEIGHT` 0.25 u, columns every `WINDOW_PITCH` 0.25 u (at least one per wall), each window the middle 50 % of its
  column and 30 % to 80 % of its floor. Window `k` (row by row from the ground, `k = floor · columns + column`) is lit
  when `floor((k + 1) · s + ε) > floor(k · s + ε)`; lit windows are `WINDOW_LIT` (warm), unlit the wall's colour at 40
  %, unknown (`s < 0`) `windowUnknown(theme)` (a neutral grey of the theme).
- Picking in the Buildings view (`hitAt`): from the height of the tallest building down to 0, in steps of `RAY_STEP` 0.1
  u of height, the ray's ground point is picked; the first lot hit whose height reaches the step's height is the hit;
  below every building, the ground pick at height 0 answers. Plan view picks the ground as before.
- Labels are projected at the ground in either view.

## Colour by (`packages/scene/src/colour-by.ts`, `apps/web/src/components/Legend.tsx`)

- `ColourBy` is one of `COLOUR_BY` (`folder tested size kind recency churn authors`), `folder` by default, on every
  visit. A building's colour: folder, `theme.lot(district, use === "source")`; kind, `KIND_COLOURS[use]`; a measure, its
  ramp at `shareOf(value, scale)` (tested: the share itself); unknown, the theme's `unknownColour(theme)` grey.
- Ramps, five stops each, linear between them in sRGB, per theme brightness (`theme.dark`):

| Measure | Light themes                                                | Dark themes                                                 |
| ------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| tested  | `#B84A00 #E69F00 #F0E442 #56B4A0 #00785A`                   | `#E8743B #F0B341 #F0E442 #5CC8A8 #2FB98A`                   |
| size    | viridis 0 to 0.8: `#440154 #414487 #2A788E #22A884 #7AD151` | viridis 0.2 to 1: `#414487 #2A788E #22A884 #7AD151 #FDE725` |
| recency | cividis 0 to 0.8: `#00204C #31446B #666970 #958F78 #CBBA69` | cividis 0.2 to 1: `#31446B #666970 #958F78 #CBBA69 #FFE945` |
| churn   | magma 0 to 0.8: `#000004 #3B0F70 #8C2981 #DE4968 #FE9F6D`   | magma 0.2 to 1: `#3B0F70 #8C2981 #DE4968 #FE9F6D #FCFDBF`   |
| authors | as churn                                                    | as churn                                                    |

- `KIND_COLOURS`: source `#0072B2`, config `#E69F00`, assets `#CC79A7`, ci `#56B4E9`, examples `#009E73`, generated
  `#999999`, vendored `#8C6D31`, tests `#D55E00`, fixtures `#F0E442`, docs `#B5B5B5`.
- `unknownColour`: `#9A9A9A` on light themes, `#6E6E6E` on dark ones. `WINDOW_LIT` `#FFD27A`; `windowUnknown` `#B8BCC2`
  (light) and `#8A8F98` (dark).
- The legend: a "Colour by" button (a `Popover`, its face naming the choice) opens a `<fieldset>`, legend "Colour by",
  of seven radio inputs: "Folder", "Tested", "Size", "Kind", "Recency", "Churn", "Authors"; an unavailable one is
  disabled, its reason beside it as its description (`aria-describedby`). Choosing closes the popover and is logged as
  `viewer/colour-by` (`by`). Below it, the scale of the choice: folder, the legend's swatches as before; a measure, its
  ramp as a gradient with its ends' values ("0 %" and "100 %"; "120 lines" and "9,800 lines"; dates; counts) and the
  unknown swatch with "Not known"; kind, one swatch per land use present. In the Buildings view, three lines more:
  "Height: size, 1 to 12 floors (20 lines to 400 lines); a hatched roof, not known", the ends in the city's unit when it
  has sizes; "Lit windows: tested share (by name: all or none)" or "(coverage report)"; "Grey windows: not known".
- On a phone (below 760 px) the legend folds behind a "Legend" button (`aria-expanded`), closed at first; both hide
  while the drawer's sheet is open.
- The view switch shows its icons only, its words kept as its buttons' names, where the search shares the top row (up to
  1,300 px wide); on a phone only "Buildings" shows, switching between the views.
- With no measures, every measure but kind is disabled ("this city file has no measures").

## Cards (`apps/web/src/card`)

- A lot's card (file) gains rows from its building, after its own: "Size" (`1,240 lines` or `12.4 kB`, the other unit as
  its note when both are known), "Tested" (`62 %` noted "coverage report", or "A test names it" / "No test names it"
  noted "by name"), "Changed" (`3 days ago`, the date as its note), "Commits", "Authors", "Comments" (`120 lines`, with
  the marks: "2 TODOs"), each of the last four only when the city has it. An unknown value says "Not known" with why as
  its note ("Its contents were not read here", "The coverage report does not cover it", "Only source files are judged by
  name", "No commit read changed it"); measures the city does not have say so in one row each, "Changed, commits,
  authors" and "Comments", "Not known" with `unavailableReason` as the note; a city with recency but not authors shows
  "Changed" and "Commits" as usual and "Authors", "Not known", noted "The laid commit's .mailmap could not be fetched".
  A lot of several files adds "{n} files" listing their names (at most `FILES_SHOWN` 7, then "and N more").
- With no measures (a city file without them), no measure rows show.

## Readers in the browser (`apps/web/src/github`, `apps/web/src/local`, `apps/web/src/lay`)

- **GitHub**: the tree's blob entries carry `size`; `readRepository` returns `{ snapshot, sizes }` (path to bytes), no
  extra request. Facts: `bytes`; tested by name over the snapshot's paths.
- **Folder**: the git index's stat size (the 32-bit word at byte 36 of each entry) is each tracked path's bytes. When
  the tracked files sum to under `CONTENTS_LIMIT` 50,000,000 bytes, every tracked file is read (`CONTENTS_IN_FLIGHT` 8
  at once) and counted (`countText`): size is lines, comments are available. A folder without git is walked; its files
  are read under the same limit (their sizes known only then). Then the usual report paths, each read if present, and
  matched. Phase "Reading the files" (`contents`, "{n} of {m} files") and "Looking for coverage reports" (`coverage`).
- **Lay**: `layHere(snapshot, { facts })` lays, then builds the section from
  `lotFiles(city, state.plat, snapshot.files)`; the worker hands it back beside the city. Nothing read from the folder
  leaves the page.

## Errors and edge cases

| Case                                          | Handling                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| City file without `measures`                  | opens; every building one floor, unknown; colour by offers folder and kind |
| `measures.version` above 1                    | `measures/too-new`; the file is refused as any bad city is                 |
| Measures whose lots name a town or lot absent | ignored: no building shows them                                            |
| Blob not held (partial clone)                 | no size, no lines: unknown, hatched roof, one floor                        |
| Binary file                                   | bytes only; in a lines city its size is unknown                            |
| Empty file                                    | 0 lines: one floor                                                         |
| Every size equal                              | the scale's ends are equal: one floor                                      |
| Report path outside the repository            | unmatched, counted                                                         |
| Report line hits negative or not numbers      | 0                                                                          |
| Two reports name one file                     | their lines join                                                           |
| Executable 0                                  | no `covered`/`executable`: unknown                                         |
| Lot of several files, some unknown            | sums and the weakest over the known; unknown only when none is             |
| Folder over 50 MB of tracked files            | bytes from the index; comments unavailable                                 |
| A file that vanishes while read (folder)      | that file's facts are unknown; counted in `viewer/local-contents` `unread` |
| No `.mailmap` at the laid commit              | nobody is mapped; `history/mailmap status=absent`                          |
| `.mailmap` blob not held (partial clone)      | that one blob fetched; `history/mailmap status=fetched`                    |
| `.mailmap` blob not fetchable                 | authors unknown, reason on switch and card; `status=unfetchable reason=…`  |
| No promisor remote, blob missing              | `status=unfetchable reason=no-promisor`; authors unknown                   |
| Fetch hangs (a prompt, a stalled network)     | killed after 30 s; `status=unfetchable reason=timeout`; authors unknown    |
| `.mailmap` a link, folder or submodule        | nobody is mapped; `history/mailmap status=not-a-file`                      |
| A working tree `.mailmap`, `mailmap.*` config | never read: the city is the same with or without a checkout                |
| A mailmap line that is not one of the forms   | maps nothing (no `<`, no `>`, an empty first email); the rest still read   |

## Observability

- CLI: the `measures/*` lines above, and `history/mailmap` (status, entries, and for an unfetchable one its reason and
  git's error) once per fold with measures. Viewer: `viewer/mode` (`mode`), `viewer/colour-by` (`by`), `viewer/measures`
  (`source`, `size`, `tested`, `lots`) when a city with measures is shown, `viewer/measures-none` when without,
  `viewer/local-contents` (`files`, `bytes`, `read`, `unread`), `viewer/local-coverage` (`path`, `format`, `files`,
  `matched`) and `viewer/local-coverage-skipped` (`path`, `reason`).

## Performance and limits

- linux: 75,123 buildings, about 1.5 million vertices in one mesh (as the plinths were); the lot table is 75 rows of
  1,024 texels, 1.2 MB; a colour change rewrites and uploads it (under 20 ms on a desktop). Picking walks at most
  `ceil(12 · FLOOR_HEIGHT / RAY_STEP)` = 30 steps.
- CLI: one `ls-tree` and one `cat-file --batch` over held blobs; each distinct blob counted once. History tracking keeps
  one record per identity and one integer per author per identity. The mailmap is one blob, read once and parsed in one
  pass; each commit's author costs one or two map lookups.
- Folder: contents read only under 50 MB.

## Testing

- Unit (100 %): the section's round trip and rejections; every family's markers and the folder endings; every syntax's
  comment counting and marks, binary and empty files; each report format, including wrapped Istanbul files, Cobertura
  method lines, JaCoCo default packages, XML entities, comments and CDATA; path matching's three ways and ambiguity;
  `lotFiles` on a fold with old towns; the mailmap's four forms, its malformed lines, its case rules and its later-wins
  rule, checked against git's own `%aE` on a repository of nasty identities; the laid commit's mailmap read with and
  without a checkout, with a different working tree `.mailmap` and `mailmap.file` set, and at an earlier `--to`, all
  giving the same city; a mailmap that is absent, a link, a folder, fetched into a partial clone (that one blob, and no
  other object, arrives), unfetchable offline, unfetchable without a promisor remote, and a fetch that outlives its
  timeout; a city without authors (its section, the switch's reason, the card's row); aggregation, scales and floors at
  their ends; ramps' ends and unknown; the lot table; the view basis, pan, fit and unproject in both modes; ray picking
  over buildings of known heights; the legend, colour by (keyboard, disabled with reasons), and cards with measures.
- Rust: the same tests, case for case (tests by name, text, the XML scanner, the four formats, matching, lots, the
  section, the CLI's measures on temporary repositories, a partial clone included).
- Parity: `bun run parity` compares city files with measures on every mode, and a mode with a coverage report written
  into the clone at a usual path in each of the four formats. Its `checkout` mode folds a clone with a checkout whose
  working tree `.mailmap` and `mailmap.file` merge many authors into one, and must match the `fold` mode's
  `--no-checkout` clone byte for byte, in each CLI. Its `partial` mode folds a blob-less `--no-checkout` clone, which
  fetches the `.mailmap` when its laid commit has one, and its authors (`available`, every file's and lot's `authors`)
  must match the `fold` mode's, in each CLI.
- End to end: the view switch, colour by from the keyboard, unavailable measures (a city without authors: the switch's
  reason and the card's row), a picked fixture folder with an LCOV report, the cards, axe in light and dark, no card
  overlap at every width, and the vitals.

## Behaviour and state

- Viewer state gains `mode` (`plan` at first, on every visit), `colourBy` (`folder` at first) and the shown city's
  `measures` (or null). A new city keeps the mode and the colour by; a colour by the new city cannot give falls back to
  `folder`. Drilling into a town keeps both.
- The lot table depends on the scene, the measures, the colour by and the theme; it is rebuilt only when one changes.
  The mesh depends on the scene only.

## Security and trust

- Report contents, file contents and paths are data: parsed by bounded scanners (no XML entities beyond the five and
  numeric ones, so nothing expands), never evaluated; a report over 256 MB is not read.
- Author emails never leave the history reader: the section holds counts only. A picked folder's contents and reports
  stay in the page; they reach a city file only through the CLI, run by the person.
- The CLI reads reports from the working directory and the named files only; git never fetches (`GIT_ALLOW_PROTOCOL`
  `none`, `GIT_NO_LAZY_FETCH`), with one named exception: the laid commit's `.mailmap` blob, when a partial clone does
  not hold it, is fetched by its object id from the clone's own promisor remote, alone (`GIT_NO_LAZY_FETCH` stays set,
  so the fetch brings nothing else), without prompts, within 30 s. Why this one: it is one small file that decides every
  author count, while sizes and comments would need the whole tree.
- The mailmap is data from the history: parsed line by line in one pass, never handed to git. Nothing outside the laid
  commit (the working tree, `mailmap.file`, `mailmap.blob`, `log.mailmap`) changes a count.

## Presentation and accessibility

- Copy: the view switch "Plan" and "Buildings"; the legend's "Colour by", its seven choices and their reasons; the
  scales' words above; the cards' rows above. British English, sentence case.
- The colour-by choices are native radio inputs in a fieldset; a disabled one keeps its reason readable (4.5:1) and as
  its description. The legend's ramps carry their end values as text, so no colour alone says anything; unknown has a
  swatch and words.
- Windows lit against unlit differ in lightness (lit `#FFD27A` against a wall at 40 %), and unknown windows are grey, so
  the facade reads without colour vision.

## Web experience

- The buildings add no request and no layout shift: the legend and the view switch keep their boxes; the legend's scale
  area has a fixed height per choice. Switching the view or the colour changes uniforms or one texture within a frame
  (INP under 200 ms on a 4x slowed phone, linux included).

## Constants and configuration

| Constant                | Value            | Where                               |
| ----------------------- | ---------------- | ----------------------------------- |
| `MEASURES_VERSION`      | 1                | `packages/measures/src/section.ts`  |
| `BINARY_PROBE`          | 8,000 bytes      | `packages/measures/src/text.ts`     |
| `MAX_REPORT_BYTES`      | 268,435,456      | `packages/measures/src/reports/`    |
| `USUAL_REPORTS`         | eight paths      | `packages/measures/src/reports/`    |
| `FLOORS`                | 1 to 12          | `packages/measures/src/building.ts` |
| `PERCENTILES`           | 5 and 99         | `packages/measures/src/building.ts` |
| `FLOOR_HEIGHT`          | 0.25 u           | `packages/scene/src/buildings.ts`   |
| `WINDOW_PITCH`          | 0.25 u           | `packages/scene/src/buildings.ts`   |
| `DATA_COLUMNS`          | 1,024            | `packages/scene/src/buildings.ts`   |
| `RAY_STEP`              | 0.1 u            | `apps/web/src/view/hover.ts`        |
| `ELEVATION`, `YAW`      | 30°, 45°         | `apps/web/src/view/view.ts`         |
| `CONTENTS_LIMIT`        | 50,000,000 bytes | `apps/web/src/local/contents.ts`    |
| `CONTENTS_IN_FLIGHT`    | 8                | `apps/web/src/local/contents.ts`    |
| `FILES_SHOWN`           | 7                | `apps/web/src/card/measures.ts`     |
| `MAILMAP_FETCH_TIMEOUT` | 30 s             | `packages/history/src/mailmap.ts`   |
