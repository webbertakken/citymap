# Buildings and their measures

What the measures of a building can be read from, how tests are found by name, how colours stay readable for everyone,
and how a facade of lit windows is drawn for a large city, as researched for [buildings](../specs/008-buildings/buildings.md).

## Coverage reports in the wild

Four formats cover nearly every language's coverage tool; each names files its own way.

| Format        | Written by                                                                                 | Usual paths                                                                                    | How a file is named                                                                                    | Lines                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| LCOV          | Istanbul/nyc, c8, Vitest and Jest (`lcov` reporter), lcov/geninfo (C, C++), cargo-llvm-cov | `coverage/lcov.info`, `lcov.info`                                                              | `SF:` then a path: absolute on the machine that ran the tests, or relative to the project root         | `DA:<line>,<hits>[,<checksum>]`; `LF`/`LH` totals; `end_of_record`                              |
| Istanbul JSON | Istanbul/nyc, c8, Vitest and Jest (`json` reporter)                                        | `coverage/coverage-final.json`                                                                 | the object's keys (and each value's `path`): absolute paths                                            | none directly: statements (`statementMap`, `s`); a line is covered when a statement starting there ran |
| Cobertura XML | coverage.py (`coverage xml`), Istanbul (`cobertura`), gcovr, coverlet, cargo-tarpaulin     | `coverage.xml`, `coverage/cobertura-coverage.xml`, `cobertura.xml`                             | `<class filename>` relative to one of the `<sources><source>` roots (absolute)                         | `<class><lines><line number hits>`; methods repeat the same lines                               |
| JaCoCo XML    | JaCoCo (Maven, Gradle), Kover                                                              | `target/site/jacoco/jacoco.xml`, `build/reports/jacoco/test/jacocoTestReport.xml`              | `<package name="com/x">` and `<sourcefile name="Foo.java">`: relative to a source root it never names | `<line nr mi ci mb cb>`: missed and covered instructions                                        |

- Istanbul's own line coverage takes, per line, the highest count of the statements starting on it
  (`FileCoverage.getLineCoverage`); a line with no statement is not executable.
- Paths take three forms: absolute (Istanbul JSON always; LCOV from most JavaScript tools), relative to the report's
  project (LCOV with `projectRoot`, coverage.py's Cobertura with its `<source>`), and relative to a source root the
  report does not name (JaCoCo). A monorepo writes one report per package, its relative paths from that package.
- So a path is matched three ways, in order: joined to the folders the report lies in (deepest first, so
  `packages/a/coverage/lcov.info` resolves `src/x.ts` to `packages/a/src/x.ts`) and to its own roots; then by its longest
  ending that is a path of the repository (absolute paths); then by being the ending of exactly one path of the
  repository (JaCoCo's `com/x/Foo.java` is `src/main/java/com/x/Foo.java`).
- Go's `coverage.out` is a fifth format (`mode:` then `file:line.col,line.col n count`, files named by import path); it
  is not one of the four and stays out.
- XML here needs only elements, attributes, comments, CDATA and the five named entities plus numeric ones: neither
  report uses namespaces, and both are written by machines. A small scanner reads it the same way in TypeScript and
  Rust, so the two CLIs cannot differ by their XML libraries.

## Tests found by name

A source file is "tested by name" when a test file's name says it tests it. Measured over the reference corpus (23 public
repositories at their heads, 126,827 source files of a known language), with three rules:

| Rule                                                                                     | Sources found tested |
| ---------------------------------------------------------------------------------------- | -------------------- |
| Same folder, or the folder with test and source folders (`src`, `test`, …) left out     | 8.4 %                |
| The same, or either folder (so left out) ending the other: mirrored and flat test trees | 15.7 %               |
| The same stem anywhere in the repository                                                 | upper bound, 40 %+   |

| Repository     | Language   | By folder | By folder ending | Stem anywhere |
| -------------- | ---------- | --------- | ---------------- | ------------- |
| home-assistant | Python     | 0.0 %     | 72.8 %           | 97.6 %        |
| redux          | TypeScript | 47.4 %    | 52.6 %           | 68.4 %        |
| livediagram    | TypeScript | 46.6 %    | 46.6 %           | 53.0 %        |
| game-ci-cli    | TypeScript | 36.1 %    | 38.3 %           | 52.4 %        |
| spring-boot    | Java       | 38.2 %    | 38.2 %           | 56.8 %        |
| kubernetes     | Go         | 27.9 %    | 38.0 %           | 67.3 %        |
| vue            | TypeScript | 28.8 %    | 28.8 %           | 45.4 %        |
| go             | Go         | 22.0 %    | 24.4 %           | 40.6 %        |
| vscode         | TypeScript | 20.5 %    | 21.0 %           | 36.8 %        |
| bitcoin        | C++        | 10.9 %    | 20.1 %           | 25.3 %        |
| django         | Python     | 0.1 %     | 10.5 %           | 75.4 %        |
| next.js        | TS, Rust   | 3.9 %     | 4.4 %            | 29.7 %        |
| react          | JavaScript | 1.6 %     | 1.6 %            | 11.8 %        |
| rust           | Rust       | 0.7 %     | 0.7 %            | 49.6 %        |
| linux          | C          | 0.3 %     | 0.9 %            | 7.1 %         |

- Mirrored trees are common: home-assistant tests `homeassistant/components/x/sensor.py` in
  `tests/components/x/test_sensor.py`, Maven projects `src/main/java/…/Foo.java` in `src/test/java/…/FooTest.java`.
  Leaving the source and test folders out and letting either folder end the other finds them (0 to 73 % on
  home-assistant) without matching a stem anywhere, which over-counts common stems (`__init__`, `index`, `utils`).
- Where the convention is elsewhere, the proxy finds little, honestly: Rust keeps unit tests inside the file; React names
  tests by feature (`ReactDOMFizzServer-test.js`); Rails keeps `test/cases/base_test.rb` for `lib/active_record/base.rb`;
  linux tests through kselftest and KUnit by subsystem. The viewer says "by name" wherever it shows the proxy.
- Test markers per language: JavaScript and TypeScript `foo.test.ts`, `foo.spec.ts`, `foo-test.js`, `__tests__/foo.ts`;
  Python `test_foo.py`, `foo_test.py`; Go `foo_test.go`; Java, Kotlin, Scala `FooTest`, `FooTests`, `FooIT`, `FooSpec`,
  `TestFoo`; Rust `tests/foo.rs`, `foo_test.rs`; Ruby `foo_spec.rb`, `foo_test.rb`; C# `FooTests.cs`; PHP `FooTest.php`;
  C and C++ `foo_test.cc`, `foo_unittest.cc`, `test_foo.c`; Swift `FooTests.swift`; Dart `foo_test.dart`; Elixir
  `foo_test.exs` for `foo.ex`.
- Measured with the shipped rule, and against a real coverage report, in the blueprint's measurements (citymap itself).

## Colours everyone can read

- Red against green is the pair most people with colour-vision deficiency (about 1 in 12 men) cannot tell apart, so
  "tested" runs from Okabe and Ito's vermilion (`#D55E00`) through orange (`#E69F00`) to bluish green (`#009E73`): a
  ramp chosen for the common deficiencies, which also changes in lightness, so it reads in greyscale.
- Ordered measures (size, recency, churn, authors) use perceptually uniform ramps from matplotlib: viridis for size,
  cividis for recency (designed for deuteranopia and protanopia), magma for churn and authors. Each is cut so its ends
  stay clear of the ground: on a light map from the dark end to 80 %, on a dark map from 20 % to the light end.
- Kind uses the land uses' colours: Okabe and Ito's eight, with grey for the rest, one per land use that takes a lot.
- Unknown is a neutral grey of the theme, never a ramp's end, so it never reads as "low".

## Windows for a large city

linux lays 75,123 lots. The plan view already draws every lot as a plinth (a top and one side per edge), merged into one
mesh per layer: about 20 vertices per lot, 1.5 million vertices in all.

- A building is the same shape as a plinth, only taller, so the buildings add no vertices if the plinth's height is
  chosen in the vertex shader: each vertex knows its lot and whether it is on the top ring, and the lot's height comes
  from a data texture (`texelFetch`, WebGL 2). The plan and the Buildings view share one mesh; switching changes one
  uniform.
- Windows are drawn in the fragment shader, never as geometry: each wall knows its length and where along it a fragment
  lies; floors and columns follow from the height and a window pitch, and the lit share lights windows by a
  Bresenham-like rule (window `k` lit when `floor((k + 1) s) > floor(k s)`), evenly spread, the same on every frame.
- Colour, height, lit share and flags per lot live in one float texture of 1,024 columns (75,123 lots fit in 74 rows):
  changing what the colour means rewrites 300,000 floats and uploads one texture, without touching the geometry, so it
  answers within a frame.
- Picking stays on the CPU: the screen point's ray is walked down from the tallest building's top, and at each step the
  plan's own pick index answers which lot lies under the ray there; the first lot whose building reaches that height is
  hit. At most a few dozen look-ups per pointer move.
