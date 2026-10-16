# Defaults ledger

One row per value the local repositories spec leaves silent or qualitative.

| Default                    | Value                                                        | Provenance                                                       | Safe range   |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------ |
| Directories listed at once | `WALK_IN_FLIGHT` 8, for a folder without git                 | enough to hide each listing's latency; gentle on the disk        | 4 to 16      |
| Walk progress              | `WALK_REPORT` every 1,000 files                              | a status update a few times a second, not one per file           | 250 to 5,000 |
| Checksum                   | not verified                                                 | git renames a complete index into place; `skipHash` writes zeros | fixed        |
| Unresolvable `HEAD`        | commit `"worktree"`                                          | the city model's own word for a tree without a commit            | fixed        |
| Picker id                  | `citymap-local`, mode `read`                                 | Chromium reopens the dialog where the last pick was              | fixed        |
| Remembered folders         | one, the last, keyed `last` in IndexedDB `citymap` / `local` | spec: the last folder                                            | fixed        |
| Tab title                  | "Local repository · citymap"                                 | spec: the name shows only on the person's screen                 | fixed        |
| Gitignore matcher          | `ignore` 7.0.12                                              | research: closest to git, MIT, no dependencies                   | 7.x          |
| Safari detection           | `navigator.vendor` is `Apple Computer, Inc.`                 | research: WebKit only; no feature tells hidden files apart       | fixed        |
| Phone detection            | `(pointer: coarse)`                                          | the viewer's own touch rule                                      | fixed        |
