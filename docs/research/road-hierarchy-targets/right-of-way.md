# Right of way: widening a road without starving its neighbours

Angle: the land a widening road takes. Real planning reserves a right of way (the land a road may one day occupy)
before it widens the carriageway (the paved part). This note checks whether the engine can do the same, and at what cost
to stability (lots moved per commit) and to files without a lot (overflow).

Every claim is tagged **verified** (how), **inferred** (from what) or **assumed**.

## Summary

- **Recommendation:** every cut reserves a **band right of way** when it is laid: the width of the class its land would
  take if it filled its band (mass × 1.35). The carriageway is the width of today's class, and the rest is verge. A
  reclass within the right of way takes no land. A reclass beyond it keeps the road's width until the cut is next laid.
  Class and width are separate, so length shares follow the tier straight away.
- **Cost:** a right of way is needed on 6 of livediagram's cuts (78 u², 0.44% of the land) and on 4 of react's (67 u²,
  0.53%). A fresh HEAD lay with it leaves no more files without a lot: livediagram 4 → 4, takken.io 0 → 0 (verified,
  experiment below).
- **Why it matters:** in today's engine, one widening moves a median of 2 lots, but the spread is heavy-tailed: up to
  313 lots in one commit, because a near-full neighbourhood that loses a few slots re-lays its whole grid (verified).
  livediagram's neighbourhoods have the least headroom (45% of its lots sit in neighbourhoods at least 80% full, against
  8% for react), which explains why reclassing hurt livediagram and not react (inferred).
- **Rejected:** widening into the side with more slack (this halves new overflow but moves as many lots or more),
  growing the town (the land arrives at the rim, not beside the road), recutting on starvation (symmetric widening
  starves both sides, so a recut cannot help), and reserving the next class on every road (5.3% of livediagram's land).

## How a widening takes land today

All verified by reading `packages/ground-plan/src/town/cut.ts`, `neighbourhood.ts` and `fixed/polygon.ts` at `ef7878c`.

- A cut is a centreline `c`. `clip(poly, n, c, width)` never removes land itself: it only tags the new edge with the
  road's width. `inset` moves each edge inward by half its width plus pavement when a neighbourhood takes its land.
- Widening a road moves the land edge on **both** sides inward by half the width gained: street → collector 16 fixed
  units (0.25 u) per side, collector → avenue 24, avenue → boulevard 32.
- Grids are absolute. The cells and strips along the moved edge shrink. A strip that falls below 45% of its rectangle
  loses its slot, and so does a cell below 20%. A lot whose slot is gone takes a free one, which counts as moved.
- If the neighbourhood still has more lots than slots after narrowing its lot class, and a fresh grid would seat more,
  it **regrids**: every lot in it moves. If not, the lots that do not fit become overflow.
- `starved()` compares land on the centreline, so a wider road never triggers a recut. `landFor` adds a street-sized
  margin (`MARGIN` = 32 + 12) to every item whatever roads border it, so demand never sees the class of the roads round
  it.
- The `TIER_BAND_PCT` reclass sets `r.cls` and `split` clips with `ROAD_WIDTH[r.cls]`, so the width follows straight
  away. A radial's ring and spokes, and a pinwheel's roads, take their width from the class too.

## Experiment

Folds were not allowed (the machine is shared), so each test lays one commit: HEAD, from the repository's committed fold
lock (`~/.cache/citymap/repos/<repo>/citymap.lock.json`). These locks were written by the reclass build: livediagram
21:48 at index 3570, react 21:52 at index 14966, takken.io 21:47. The base lay matches the product cities: livediagram
4,274 lots and 44 without a lot, react 2,380 and 52 (verified, the same counts as `~/.cache/citymap/render/product`). One
lay takes under 1 s and under 320 MB.

Variants were patched into a throwaway worktree (removed since). The scripts and the engine diff are in
`/tmp/row/scripts/`:

- **Shock:** chosen cuts are drawn at a wider class while the plat stays as it is. That is exactly the land a reclass
  takes at the moment it fires. `all` widens every cut to its next class, and `near` only cuts within a doubling of the
  upward band (`mass × 2 ≥ threshold × 1.25`). `band` widens to the class at `mass × 1.35`, the right of way recommended
  here.
- **Mode:** `sym` widens about the centreline (today), while `one` shifts the centreline so that only the side with more
  land per demand loses width.
- **Single events** (`row1.ts`): one cut widened at a time, so each event matches one reclass in a fold.
- Moved lots use `scripts/stability/stability.ts` `compareCities` against the base lay: a change of slot, or a centre
  shift over 16 fixed units.

Limits:

- One step is not a fold. It measures what a widening costs when it fires, not how the fold recovers afterwards
  (regrids and recuts in later commits).
- The fold's own history adds starvation: a fresh HEAD lay of livediagram leaves 4 files without a lot, while the fold
  leaves 44 (verified).

### Results: everything at once (one lay from the lock)

| Repo        | Variant  | Cuts widened | Land taken | Overflow change | Lots moved   |
| ----------- | -------- | -----------: | ---------: | --------------: | ------------ |
| livediagram | band-sym |            6 |      78 u² |              +3 | 3 (0.1%)     |
| livediagram | near-sym |           13 |     197 u² |              +5 | 339 (8.3%)   |
| livediagram | near-one |           13 |     197 u² |              +0 | 279 (6.8%)   |
| livediagram | all-sym  |           53 |     946 u² |             +24 | 1,216 (29.8%) |
| livediagram | all-one  |           53 |     952 u² |              +8 | 992 (24.3%)  |
| react       | band-sym |            4 |      67 u² |              +2 | 6 (0.3%)     |
| react       | near-sym |            4 |      54 u² |              +0 | 3 (0.2%)     |
| react       | all-sym  |           34 |     432 u² |             +10 | 197 (10.0%)  |
| react       | all-one  |           34 |     427 u² |              +3 | 288 (14.6%)  |
| takken.io   | all-sym  |            6 |      81 u² |              +1 | 1 (0.4%)     |
| takken.io   | all-one  |            6 |      80 u² |              +0 | 0            |

Land: livediagram 17,918 u², react 12,605 u², takken.io 2,416 u² (verified). One lot needs 3 u² of land at the default
density (`LOT_AREA` 1.5 u² over 50%), so 946 u² is about 315 lots of land.

### Results: one widening at a time (sym, all candidates)

| Repo        | Events | Mean moved | Median | p90 | Max | Overflow added (sym / one) |
| ----------- | -----: | ---------: | -----: | --: | --: | -------------------------- |
| livediagram |     53 |       21.3 |      2 |  50 | 313 | +18 / +14                  |
| react       |     34 |        6.4 |      1 |  17 |  57 | +12 / +2                   |
| takken.io   |      6 |        0.3 |      0 |   1 |   1 | +1 / +0                    |

With one-sided widening the mean moved was 24.6 for livediagram and 9.0 for react, which is worse (verified).

The tail is regrids (verified with `plat/*` events):

- Widening the collector beside `apps/live/components/canvas` to an avenue (event 11) regrids it, and 313 lots move.
  That neighbourhood held 313 lots in 321 one-module slots.
- Event 0 (avenue → boulevard, mass 1,940) regrids `apps/live/hooks` and `apps/live/lib/reading`: 275 moved.
- Event 6 regrids `apps/live/components/plan`: 67 moved.

Headroom at HEAD (lots in neighbourhoods of 20 or more lots, occupancy of one-module slots, verified):

| Repo        | ≥ 80% full | ≥ 95% full |
| ----------- | ---------: | ---------: |
| livediagram |        45% |        19% |
| react       |         8% |         5% |
| takken.io   |         0% |         0% |

Of livediagram's 44 files without a lot, 25 sit in one neighbourhood, `apps/live/components/plan` (verified,
`town/overflow` events).

## Options judged

| Option                                                | Lots moved at a reclass                                     | Files without a lot                                 | Land cost                       | Verdict                     |
| ----------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- | ------------------------------- | --------------------------- |
| Today: widen about the centreline                     | median 2, tail 313 (regrid)                                 | +18 over 53 events (livediagram)                    | none upfront                    | the problem                 |
| **Band right of way** (verge to the class at × 1.35)  | 0 within the right of way                                   | 0 at the reclass; fresh lay +0                      | 0.4 to 0.5% of land at HEAD     | **recommended**             |
| Deferred width (class now, width at next lay)         | 0                                                           | 0                                                   | none                            | **recommended as fallback** |
| Next class right of way on every cut                  | 0                                                           | fresh lay +5 (livediagram)                          | 5.3% (livediagram), 3.4% (react) | too costly                  |
| One-sided: the side with more slack takes the width   | mean 24.6 vs 21.3 (livediagram), 9.0 vs 6.4 (react)         | +14 vs +18, +2 vs +12                               | none upfront                    | rejected                    |
| Recut on starvation (width-aware `starved`)           | a recut per reclass                                         | none cured                                          | none                            | rejected                    |
| Grow the town                                         | none, or a recut cascade                                    | none cured                                          | outline                         | rejected                    |
| Road class margin in demand (`landFor`)               | a recut when demand passes the cap                          | fewer over time                                     | a share of demand               | complement, not a cure      |

Reasons:

- **Band right of way.** A cut's sides recut when either outgrows its cap, which is 1.35 times its demand at the last
  cut. Until then, if mass grows with demand, the land's mass stays under about 1.35 times what it was when the cut was
  laid (inferred). An upward reclass needs threshold × 1.25, so a cut needs a verge only when its mass × 1.35 reaches
  that point (mass at least 0.93 times a threshold). That window is 13% of a decade (inferred). So most roads never
  carry a verge, and those that do are the ones about to widen. When the cut is laid again (a fresh cut or a recut), the
  land beside it is re-laid anyway, and the right of way is set again at no extra disturbance. Downgrades just widen the
  verge, so nothing moves either way. The verge can be drawn as a grass strip, which also reads as a planned widening.
- **Deferred width.** This covers the case where mass outruns the band while demand stays inside its caps. That is
  likely in small folders, whose demand is mostly the fixed `2 × MARGIN` margin (inferred from `landFor`); how often it
  happens is **assumed** rare and needs measuring. The road takes its new class (hierarchy, casing, length shares) at
  once, but its carriageway is capped at its right of way until the cut is laid again. The spec's road graph already
  gives every edge both a class and a width.
- **Every cut at the next class.** Over 80% of that land goes to roads that will not widen before their next recut
  (inferred: 53 candidates against 6 inside the band).
- **One-sided widening.** Land per demand on a side says little about slot headroom, so the absorbing side often loses
  slots twice as deep and regrids (verified: events 3 and 4 moved 84 and 128 lots one-sided, against 1 and 4
  symmetric). A slot-aware choice might do better (untested), but the road itself would still jump sideways.
- **Recut on starvation.** A symmetric widening shrinks both sides by the same margin, so moving `c` to today's split of
  demand changes nothing (inferred from `decide`).
- **Growing the town.** Outline growth adds land at the rim, and cuts are absolute (spec § Structure), so a neighbourhood
  inside never receives it unless every cut between it and the rim recuts (inferred). The land a widening takes (0.4 to
  5%) is also below the 1.35 growth trigger.
- **Road class margin in demand.** Giving `landFor` a class-aware margin would size land for the roads round it. But
  demand is built bottom-up and the bordering classes are only known top-down (inferred). It helps fresh cuts, not a
  laid one.

## Proposed spec delta (for the operator to decide)

Ground plan § Structure, after "Every cut is a street":

- Every cut reserves a right of way when it is laid: the width of the class its land would take at its band (its mass
  times 1.35). Its carriageway is its class's width; the rest is verge.
- A road reclassed within its right of way widens into its verge and takes no land. One reclassed beyond it keeps its
  carriageway until the cut is next laid. A narrowed road leaves verge. Radial rings and spokes, and pinwheel roads, do
  the same.

§ Dimensions, the road widths row becomes carriageway widths.

Blueprint delta (layout.md):

- `CutRecord.row` (fixed units) is set at a fresh cut and at every recut:
  `max(ROAD_WIDTH[cls], ROAD_WIDTH[reclass(cls, roundDiv(mass × GROWTH_PCT, 100), first)])`.
- `split` and `pinwheel` clip with `row`, not with `ROAD_WIDTH[cls]`. The road edge carries `cls` and the width
  `min(ROAD_WIDTH[cls], row)`, and the verge is drawn as a block of kind `verge`, or as part of the road style.
- Logging: `plat/reclass` gains `fit=verge|deferred`, and a recut logs the new `row`. The deferred count is the number to
  watch.
- Migration: a record without `row` takes `ROAD_WIDTH[cls]`. Nothing moves, because this is exactly today's land.
- The same field goes on `RadialRecord` for the ring and spokes.

## Trade-offs

- Up to about 0.5% of the land stays verge at any time, so a few files lose a lot at the margin. The fresh lays showed
  none (livediagram, takken.io), and the fold will tell.
- Class and width separate for a while: a road can be a collector by class and street-wide until its cut is laid again.
  Length-share targets count class, so they are met; anything that reads width as class must read class.
- A recut sets the right of way again, and that can take land where the right of way widens. A recut moves lots anyway,
  so this adds no new kind of disturbance, but recuts may disturb slightly more.
- This removes the disturbance the tier band causes, which frees the threshold choice in problem 2. Per-archetype
  targets can then be tuned for form alone, without paying in overflow.
- It does not fix the fold's own starvation (44 against 4 on a fresh lay), nor the whole-neighbourhood regrid that
  amplifies any land loss. That is another angle: let displaced lots move instead of the grid.

## Verification still owed (needs one fold slot each)

- Full folds of livediagram and react with the band right of way: overflow (target: back to 15 for livediagram, no worse
  than 52 for react) and length shares (unchanged from reclass: react 65 / 17 / 18).
- `bun scripts/stability.ts` on react (1,200 commits from 2017-06-01) and takken.io, against the stability reports in
  `~/.cache/citymap/render/stability-*.md`.
- The `fit=deferred` count over each fold, to check the "mass outruns demand" assumption.

## Reproduction

- Shared clones with their locks are in `/tmp/row/{livediagram,react,takken.io}`.
- To rerun, apply `/tmp/row/scripts/engine-variants.diff` to a worktree at `ef7878c`.
- Then run `bun scripts/row.ts /tmp/row/<repo> lock|fresh`, `bun scripts/row1.ts /tmp/row/<repo> all|near`, and
  `bun scripts/row-occ.ts /tmp/row/<repo>`.
