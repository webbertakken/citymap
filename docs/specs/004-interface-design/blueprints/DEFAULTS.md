# Defaults ledger

One row per value the viewer spec leaves silent or qualitative.

| Default                   | Value                                                                                    | Provenance                                  | Safe range                |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------- |
| Pan per arrow key         | `PAN_SHARE` 0.1 of the view                                                              | common map keyboard step                    | 0.05 to 0.25              |
| Zoom per `+`/`-`          | `KEY_ZOOM` 1.25                                                                          | four presses about double the scale         | 1.1 to 1.5                |
| Zoom per wheel step       | `WHEEL_ZOOM` 1.1                                                                         | smooth on a notched wheel                   | 1.05 to 1.25              |
| Fitted city               | `FIT_SHARE` 0.9 of the map                                                               | a margin so outlines never touch the edge   | 0.8 to 0.95               |
| Click or tap              | moves under `CLICK_SLOP` 4 px                                                            | a steady press, not a drag                  | 2 to 8 px                 |
| Hover card                | `CARD` 260 px wide, about 96 px tall (taller for a long address), 16 px from the pointer | fits a path and three lines of detail       | fixed                     |
| Lot top for picking       | `LOT_TOP` = lot base 0.03 + `LOT_HEIGHT` 0.12                                            | the scene's plinth heights                  | follows the scene         |
| Dimetric camera           | 30° elevation, 45° yaw                                                                   | spec                                        | fixed                     |
| Device pixel ratio        | at most 2                                                                                | spec (phones)                               | 1 to 2                    |
| Start theme               | Night atlas when the system prefers dark, else Paper atlas                               | spec                                        | fixed                     |
| Panel's districts         | the twelve largest top-level, wards left out                                             | readable without scrolling on a laptop      | 8 to 20                   |
| GitHub requests in flight | `IN_FLIGHT` 4, when a tree is read folder by folder                                      | gentle on GitHub; linux reads in about 14 s | 2 to 8                    |
| Vitals budgets            | LCP under 2.5 s, CLS 0, INP under 200 ms on a 4× slowed phone                            | spec, Core Web Vitals "good"                | fixed                     |
| Search: shortest query    | `MIN_QUERY` 2 characters                                                                 | one character matches most of a city        | 1 to 3                    |
| Search: hits shown        | `MAX_HITS` 7                                                                             | spec: at most seven choices                 | 5 to 7                    |
| Fly to a hit              | `FLY_SHARE` 0.4 of the map's shorter side, over `FLY_MS` 300 ms                          | the hit stands out with its neighbours seen | 0.2 to 0.6; 150 to 400 ms |
| Towns in the drawer       | `TOWNS_SHOWN` 7, by lots                                                                 | spec: at most seven choices                 | 5 to 7                    |
| Label must fit its land   | `LABEL_FIT` 0.6 of the text's width                                                      | a name may overhang its district a little   | 0.4 to 1                  |
| Repeated name distance    | `REPEAT_PX` 240 px                                                                       | two same names a hand apart read as one     | 160 to 400 px             |
| Glass                     | 88 % opaque, 12 px blur                                                                  | text keeps AA contrast over any map colour  | 80 to 95 %                |
| Control height            | 48 px for touch, 40 px for a pointer                                                     | spec: 48 and 32 px floors                   | at or above floor         |
| Interface font            | Inter variable, self-hosted (OFL-1.1)                                                    | spec: self-hosted; clear at 12 to 14 px     | fixed                     |
| Icons                     | lucide-react (ISC), 20 px, stroke 1.8                                                    | spec: self-hosted, one consistent set       | fixed                     |
