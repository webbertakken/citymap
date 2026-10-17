# Buildings

Every file's lot carries a building, and the building shows facts about its files. The ground plan
([ground plan](../006-ground-plan/ground-plan.md)) decides where lots lie; this spec decides what stands on them. How
people switch and read it lives in the [viewer](../004-interface-design/viewer.md).

## Terms

| Term         | Meaning                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| measure      | One fact about a file, read from its source: size, tested, kind, recency, churn, authors, comments.      |
| source       | Where the city came from: a GitHub repository live, a picked folder, or the CLI (with its full history). |
| channel      | A visual property of a building: height, windows (floors and their lit share), colour.                   |
| mapping      | Which measure drives which channel.                                                                      |
| availability | Which measures a source can give; a measure it cannot give is unknown, never guessed.                    |

## Measures

| Measure  | Meaning                                                          | Live GitHub           | Picked folder                                 | CLI                           |
| -------- | ---------------------------------------------------------------- | --------------------- | --------------------------------------------- | ----------------------------- |
| size     | how big the file is: lines where they can be counted, else bytes | bytes (from the tree) | lines, or bytes from the git index when large | lines and bytes               |
| tested   | how far the file is exercised by tests, from 0 to 1              | by name               | coverage report, else by name                 | coverage report, else by name |
| kind     | the file's land use and language                                 | yes                   | yes                                           | yes                           |
| recency  | when the file last changed                                       | no                    | no                                            | yes                           |
| churn    | how many commits changed the file                                | no                    | no                                            | yes                           |
| authors  | how many people changed the file                                 | no                    | no                                            | yes                           |
| comments | its comment lines, and its `TODO`, `FIXME` and `XXX` marks       | no                    | yes, when contents are read                   | yes                           |

- **Tested by name**: a source file counts as tested (1) when a test file names it by the common conventions of its
  language: `foo.ts` and `foo.test.ts`, `foo.spec.ts` or `__tests__/foo.ts`; `foo.py` and `test_foo.py` or
  `foo_test.py`; `foo.go` and `foo_test.go`; `Foo.java` and `FooTest.java`; `foo.rs` and `tests/foo.rs` (tests inside a
  file are not knowable by name). The test may sit beside the file, or in a mirrored test tree: the two folders, with
  their source and test folders (`src`, `lib`, `main`, `test`, `tests`, `__tests__`, `spec` and the like) left out, are
  the same, or one ends the other (`tests/components/x/test_sensor.py` names `homeassistant/components/x/sensor.py`).
  Otherwise 0. Only source files are judged; others are unknown. It is a proxy and says so wherever it shows.
- **Coverage report**: the share of a file's executable lines that its tests ran, read from a report already on the
  machine: LCOV (`lcov.info`), Istanbul JSON (`coverage-final.json`), Cobertura XML and JaCoCo XML, found at their usual
  paths or named on the CLI (`--coverage=<file>`). Report paths are matched to the repository's paths; a file the report
  does not mention is unknown, not 0.
- **Size** counts lines when the file's contents are at hand and the repository is small enough to read them (the picked
  folder reads contents under 50 MB of tracked files, or, without git, until it has read 50 MB; the CLI always, for
  every file its clone holds); otherwise bytes. A city says which. A binary file has no lines.
- **Unknown** is a value of its own: a measure a source cannot give, or a file a report does not cover, is unknown, and
  every channel and card shows it as unknown, never as zero.

## A lot of several files

A lot can hold several files of one land use. Its building shows them together: size is their sum, tested their weakest,
recency their newest, churn their sum, authors the people across them, comments their sum. The card lists the files.

## Channels

- **Height** is size, on a logarithmic scale fitted to the city: the 5th percentile of its sizes stands one floor high,
  the 99th twelve floors; anything larger stays at twelve and the card gives its real size. A file of unknown size
  stands one floor high with a hatched roof.
- **Windows**: floors follow the height, and each floor has windows along its frontage. The lit share of windows is how
  tested the file is (a coverage of 0.6 lights six in ten windows, evenly spread); tested by name lights all or none.
  Unknown leaves the windows unlit and drawn in a neutral tone, distinct from dark.
- **Colour** is the folder's tint by default, as in the ground plan, so districts stay readable. A switch recolours
  every building by one measure on a ramp of its theme, colour-blind safe and readable on light and dark: tested (red
  through amber to green, with unknown grey), size, kind (the land use colours), recency, churn and authors. Folder plus
  six measures: seven choices.
- A measure the source cannot give is shown in the switch, unavailable, with its reason ("Needs the CLI's history",
  "Laid without history (--no-history)", "This city file has no measures").
- Buildings stand in the Buildings view (3D). In plan view the lots stay flat; the colour switch works in both. Colour
  by kind and by folder need no measures.

## The city file

- Measures live in their own section of the city, beside the layout, keyed by town and lot (an old town keeps its lots'
  keys): the source, which measures are available, how size is counted, whether tested comes from a coverage report or
  from names, and each lot's files with their values (and, from history, the people across them). The layout, the plat
  and the lockfile are untouched: a city with measures lays exactly as one without, and both CLIs write the same bytes
  (parity).
- Measures change at every commit; the layout stays stable. A lot's building may grow, shrink or light up between
  commits, while the lot itself stays where it is.
- A city file written without measures still opens; its buildings stand one floor high, unknown.

## Privacy

- A coverage report, and anything read from a picked folder, stays on the machine: it goes into a city file only when
  the person writes one with the CLI.
