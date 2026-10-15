# Defaults ledger

One row per value the viewer spec leaves silent or qualitative.

| Default                   | Value                                                                                    | Provenance                                  | Safe range        |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------- |
| Pan per arrow key         | `PAN_SHARE` 0.1 of the view                                                              | common map keyboard step                    | 0.05 to 0.25      |
| Zoom per `+`/`-`          | `KEY_ZOOM` 1.25                                                                          | four presses about double the scale         | 1.1 to 1.5        |
| Zoom per wheel step       | `WHEEL_ZOOM` 1.1                                                                         | smooth on a notched wheel                   | 1.05 to 1.25      |
| Fitted city               | `FIT_SHARE` 0.9 of the map                                                               | a margin so outlines never touch the edge   | 0.8 to 0.95       |
| Click or tap              | moves under `CLICK_SLOP` 4 px                                                            | a steady press, not a drag                  | 2 to 8 px         |
| Hover card                | `CARD` 260 px wide, about 96 px tall (taller for a long address), 16 px from the pointer | fits a path and three lines of detail       | fixed             |
| Lot top for picking       | `LOT_TOP` = lot base 0.03 + `LOT_HEIGHT` 0.12                                            | the scene's plinth heights                  | follows the scene |
| Dimetric camera           | 30° elevation, 45° yaw                                                                   | spec                                        | fixed             |
| Device pixel ratio        | at most 2                                                                                | spec (phones)                               | 1 to 2            |
| City select width         | 18rem                                                                                    | a long repository name with "(GitHub)"      | 15 to 22rem       |
| Start theme               | Night atlas when the system prefers dark, else Paper atlas                               | spec                                        | fixed             |
| Panel's districts         | the twelve largest top-level, wards left out                                             | readable without scrolling on a laptop      | 8 to 20           |
| GitHub requests in flight | `IN_FLIGHT` 4, when a tree is read folder by folder                                      | gentle on GitHub; linux reads in about 14 s | 2 to 8            |
| Vitals budgets            | LCP under 2.5 s, CLS 0, INP under 200 ms on a 4× slowed phone                            | spec, Core Web Vitals "good"                | fixed             |
