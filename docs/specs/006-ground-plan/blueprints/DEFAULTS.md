# Defaults ledger

One row per value the spec leaves silent or qualitative. Provenance "prototype" means the research prototype at the
merge of PR #1, converted at 1 prototype unit = 8 fixed units.

| Default                       | Value                                                                                                                      | Provenance                        | Safe range       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------- |
| Fixed units per u (`UNIT`)    | 64                                                                                                                         | precision 1/64 u, coords < 2^21   | 32 to 256        |
| Direction length, angle steps | 4096, 4096                                                                                                                 | 0.09° resolution, products < 2^53 | fixed            |
| Rounding                      | floorDiv, or roundDiv half toward +∞                                                                                       | one rule per call site            | fixed            |
| Pavement                      | 12 (0.1875 u)                                                                                                              | prototype                         | 0 to 32          |
| Block long side               | 768 (12 u)                                                                                                                 | prototype                         | 384 to 1536      |
| Cut tilt                      | ±114 steps (±0.175 rad)                                                                                                    | prototype                         | 0 to 64          |
| Offset bisection steps        | 40                                                                                                                         | prototype                         | 30 to 60         |
| Cell kept for slots           | ≥ 20 % of its rectangle                                                                                                    | prototype                         | 10 to 40 %       |
| Slot kept                     | ≥ 45 % of its strip                                                                                                        | prototype                         | 30 to 60 %       |
| Back-to-back halves           | block depth ≥ 224 (3.5 u)                                                                                                  | prototype                         | 192 to 320       |
| Park strip share cap          | 600 ‰ of the neighbourhood                                                                                                 | prototype                         | 300 to 800 ‰     |
| District label threshold      | depth 1, or ≥ 15 ‰ of root mass                                                                                            | prototype                         | 5 to 50 ‰        |
| Bridges                       | 1, or 2 when the river exceeds 12 u                                                                                        | prototype                         | fixed            |
| Town radius factor            | 108 / 100                                                                                                                  | prototype                         | 100 to 120 / 100 |
| Outline jitter                | ±60 ‰ per vertex                                                                                                           | prototype                         | 0 to 100 ‰       |
| Town gap (`GAP`)              | 720 (11.25 u)                                                                                                              | prototype                         | 320 to 1600      |
| Highway end candidates        | ends ≥ 80 % of reach                                                                                                       | prototype                         | 60 to 95 %       |
| Highway bend fade             | parabola 4i(n − i)/n² (prototype: sine)                                                                                    | integer core, no trig             | fixed            |
| Warp octaves (town)           | [32, 1280], [15 ‰ d, 350 ‰ d], [70 ‰ d, 1100 ‰ d]                                                                          | prototype                         | amplitude < λ/5  |
| π for areas                   | 355 / 113                                                                                                                  | integer core                      | fixed            |
| Workspace member manifests    | package.json, Cargo.toml, pyproject.toml, go.mod, composer.json, pom.xml, build.gradle(.kts), mix.exs, *.csproj, *.gemspec | tree only, no contents            | extend by list   |
| Snapshot limits               | 2,000,000 files; paths up to 4,096 bytes; coordinates under 2^21                                                           | linux has ~96 k files             | fixed            |
| Split groups                  | `apps`                                                                                                                     | spec: each app its own town       | any group names  |
| Root workspace manifests      | package.json, pnpm-workspace.yaml, lerna.json, Cargo.toml, go.work, pyproject.toml (uv), deno.json(c)                      | the common monorepo tools         | extend by list   |
| Road tier band                | up at threshold × 1.25, down below threshold ÷ 1.25 (`TIER_BAND_PCT`)                                                      | spec                              | fixed            |
| Loop connector reach          | dead ends at most 3 u apart (`LOOP_REACH`), joined by a lane                                                               | spec: nearby street ends          | 2 to 4 u         |
| Dead end                      | farther than half a road plus 2 × pavement from any other road, and 2 u from the outline                                   | the engine's junction gaps        | fixed            |
| Lock save interval            | every 1,000 laid commits (`LOCK_EVERY`)                                                                                    | a few seconds of linux fold lost  | 100 to 10,000    |
| Stability move threshold      | centre shift over 16 fixed units (`MOVE_UNITS`), or a new slot                                                             | a quarter of a lot module         | 8 to 32          |
| Bench HEAD lays               | median of 5 (`HEAD_LAYS`)                                                                                                  | the first lay compiles            | 3 to 9           |
| Density default               | 50 %                                                                                                                       | spec                              | 20 to 80 %       |
