# Town layout

Derived from [ground plan](../ground-plan.md) § Dimensions, Order, Structure, Archetypes, Deletion. The reference
implementation is the research prototype (`docs/research/city-layout/variants/town.ts`, `archetype.ts`); this blueprint
restates it in the fixed-point core. Module: `packages/ground-plan/src/town/`.

## Constants

All lengths in fixed units (`UNIT` = 64 per u). Provenance and ranges in [DEFAULTS](DEFAULTS.md).

| Name                   | Value                         | Name                     | Value              |
| ---------------------- | ----------------------------- | ------------------------ | ------------------ |
| `ROAD_WIDTH.lane`      | 40                            | `BLOCK_SHORT`            | 384 (6 u)          |
| `ROAD_WIDTH.street`    | 64                            | `BLOCK_LONG`             | 768 (12 u)         |
| `ROAD_WIDTH.collector` | 96                            | `MODULE`                 | 32 (0.5 u)         |
| `ROAD_WIDTH.avenue`    | 144                           | `PAVEMENT`               | 12                 |
| `ROAD_WIDTH.boulevard` | 208                           | `LOT_AREA`               | MODULE × 192       |
| `ROAD_WIDTH.highway`   | 176                           | `MARGIN`                 | 32 + PAVEMENT      |
| `FLATTEN_BLOCKS`       | 9                             | `MAX_CLASS`              | 4                  |
| `GROWTH_PCT`           | 135 %                         | `FLATTEN_HYSTERESIS_PCT` | 150 %              |
| `RENEWAL`              | vacant × 2 > remembered       | `LONG_CUT`               | 300 ‰ of diameter  |
| `JOG`                  | 192 (3 u)                     | `MIN_JOG`                | 128 (2 u)          |
| `RIVER`                | 160 (2.5 u)                   | `RADIAL_MAX_SCALE`       | 950 ‰              |
| `TILT`                 | ±114 angle steps (±0.175 rad) | `MAX_SPAN`               | 1946 steps (0.95π) |

`FLATTEN_LIMIT = FLATTEN_BLOCKS × (BLOCK_SHORT + 64) × (BLOCK_LONG + 64)`.

## Road class by tier

`cutClass(massMille, first)`: mass ≥ 3,000,000 ‰ boulevard then avenue; ≥ 300,000 avenue then collector; ≥ 30,000
collector then street; else street. `first` is the first cut of a folder's own land (its `top` cut). Thresholds are
`TIER_MASS_MILLE` (30,000, 300,000, 3,000,000). A remembered cut is reclassed at every lay by
`reclass(cls, massMille, first)`: up a tier while mass × 100 ≥ threshold × `TIER_BAND_PCT` (125), down while mass × 125
< the lower threshold × 100, logging `plat/reclass` (key, from, to); a river is never reclassed. A radial's ring and
spokes are classed afresh at each lay.

## Classify

`classifyNode(node, previous)`:

1. `flat` = no children, or `demand ≤ FLATTEN_LIMIT`; if `previous` is flat (and children exist) the bound is
   `FLATTEN_LIMIT × FLATTEN_HYSTERESIS_PCT / 100`; if `previous` is a district form the node is flat only without
   children or under `FLATTEN_LIMIT × 100 / FLATTEN_HYSTERESIS_PCT`.
2. Features (integers): `s1`, `s2` (‰ of mass in the heaviest two children), `f0` (‰ in own files), `lots` (flattened
   lot count when flat). Shares are `floorDiv(m × 1000, mass)`; mass 0 gives 0.
3. Flat: hamlet when `mass < 25,000` (`< 31,250` if previous is hamlet); else street village when `lots ≥ 40` and
   `f0 ≥ 600` (`≥ 32` and `≥ 480` if previous is street village); else neighbourhood.
4. District: margins in ‰, `radial = s1 − 600`, `twin = min(s2 − 300, s1 + s2 − 750)`, `polycentric = 1000`. Cold start
   (no previous or previous flat): the first rule with margin ≥ 0. Otherwise: an earlier rule with margin ≥ 100 wins;
   else the incumbent while its margin ≥ −150; else the first later rule with margin ≥ 100, else polycentric.

## Partition

`partition(node, poly, district)`, depth first, children before the parent's next sibling:

1. Classify with `plat.forms[path]`; on a change log `plat/switch` and `forget(path)` (drop every cut, grid and radial
   record whose key is `path`, or starts with `path/`, `path>` or `path#`). Store the form.
2. Record a `District` for depth 1, or for mass ≥ 15 ‰ of the town root's mass.
3. Flat: `neighbourhood(poly, flatten(node).lots, park demand, path, district, form)`. `flatten` lists own lots, then
   children by `(firstSeen, path)`, recursively.
4. District form: items are child folders, then `path#lots` (own lots) and `path#park` (own docs), sorted by
   `(firstSeen, compareKeys(key))`. Radial and twin try first; when they decline,
   `split(centreOut(items), poly, mass, top = true, path, district)`.
5. Every block and lot laid inside without a district form takes this one.

`centreOut`: even indices to the right in order, odd to the left, the left reversed, then concatenated.

## Decide and split

`decide(ctx, items, poly, massMille, first, key, forced?, assign?)` returns the remembered decision (`first`: the
top-level cut, the only one that jogs by default; `forced`: a normal replacing the fresh rule; `assign`: fixed sides):

- A remembered cut whose line no longer crosses `poly`, or none of whose items remain, is forgotten.
- **Fresh cut** (one item and nothing remembered: none): split index `k` minimising `|Σ demand[0..k) − total/2|`
  (doubled to stay integral, ties to the lower `k`). Normal: the forced one, or the longest edge's direction or its
  perpendicular (whichever has the larger extent across it), rotated by `TILT × (unitMille(seed#tilt) − 500) / 500`
  angle steps. `c = offsetFor(poly, n, demandLeft / total)`. each side's cap is its demand × `GROWTH_PCT` / 100
  (`roundDiv`).
- **Remembered cut**: newcomers, in item order, join the side with more spare cap (ties left). When a side's demand
  exceeds its cap and both sides hold demand, log `plat/recut` (`reason=outgrown`) and move `c` to today's split with
  new caps; when one side is empty, raise the caps only. When both sides hold demand and the land the line leaves one
  side has fallen below its share of the demand shrunk by the band (`land × demand × GROWTH_PCT < own × total × 100`, in
  BigInt), the land around the line changed shape: log `plat/recut` (`reason=starved`) and move `c` the same way.

`split(items, poly, mass, top, key, district)`: decide; one item places it (folder: partition, own lots: neighbourhood,
park: park). Otherwise try the pinwheel; else emit the chord as a road of the cut's class (when both sides hold items),
record wards for collectors and up, and recurse into both halves (`key>L`, `key>R`), clipped with the road's width. When
one side is empty, the other recurses on the whole land under its own sub-key: cuts and grids are absolute, so its lots
stay put and its grid gains the vacated cells. Collectors and up give each half its own district seed (`seedOf(sub)`).

## Pinwheel (jogging cut)

Applies when `options.jog` allows it (`top-level`: the key is the root path or starts with `root>`), each side holds two
or more items, and the chord is at least `LONG_CUT` of the town's diameter. Both sides decide with the forced normal
`perp(n)` (keys `key>L`, `key>R`); both must be square (n·m ≥ |m|² × 9999/10000), all four parts non-empty, and
`|t1 − t2| ≥ MIN_JOG`. The main cut shifts by `±JOG/2` per side; four pieces are each two half-planes of the land, keys
`key>L>L`, `key>L>R`, `key>R>R`, `key>R>L`; four roads end in T-junctions round a plaza (inset by pavement). Wards and
district seeds as an unjogged cut.

## Radial

For a node classified radial, with at least one folder item:

- Core: the heaviest folder (ties to the earlier item). Ring: every other item; fewer than 3 declines.
- Remembered `RadialRecord` is dropped when its core changed; it is re-sectored when a ring item is new, or any item's
  demand exceeds its cap (log `plat/radial-resector`). Order keeps remembered items, newcomers at the end. A re-sector
  forgets every item's own records, so each lays afresh in its new sector.
- Start angle `unitMille(seed#radial) × TURN / 1000`. Sector bounds: for each ring item but the last, the least angle
  step whose sector area reaches its demand share (integer bisection over steps, at most `MAX_SPAN`); the last must span
  1 to `MAX_SPAN` steps, else decline.
- Core scale (‰): start `isqrt(coreDemand × 10^6 / totalDemand)`, then four rounds of
  `scale × isqrt(target × 10^6 / coreArea) / 1000`, capped at `RADIAL_MAX_SCALE`.
- Emits the ring road (`cutClass(mass, true)`) through the spokes' inner ends and one spoke per bound
  (`cutClass(mass, false)`); each sector is the land between two spoke lines beyond the core chord; the core is the
  inner polygon.

## Twin

The two heaviest folders take opposite banks, the rest join the bank with less demand, in item order. The decision is a
cut with `river: true` at `node.path`. Emits water (the band `c ± RIVER/2`), one bridge (a street of length
`RIVER + 4 × PAVEMENT`) at the middle, or two at a third and two thirds when the river is longer than 12 u; banks
recurse as `path>L`, `path>R` with their own district seeds.

## Neighbourhood

`neighbourhood(poly, lots, parkDemand, key, district, form)`:

1. Park strip: when `parkDemand > 0`, a remembered line along the longest edge's normal leaves
   `min(600 ‰, parkDemand / area)` of the land as park beyond a lane. A remembered line that no longer crosses the land
   is laid afresh.
2. Land = `inset(poly, PAVEMENT)`; empty land counts every lot as overflow (`town/overflow`).
3. Grid (remembered `GridRecord`): direction of the land's longest edge; origin and pitch fit the land:
   `rows = max(1, roundDiv(across + 64, BLOCK_SHORT + 64))`, `cols` likewise with `BLOCK_LONG`; pitches are
   `floorDiv(extent + 64, count)`.
4. Rows boundaries become streets (the street village's `high` boundary a collector), column boundaries lanes.
5. Cells in serpentine order (even rows forward, odd rows backward); a cell clipped below 20 % of its rectangle holds no
   slots; cells whose depth (row pitch less a street) is at least 224 hold back-to-back halves.
6. Slots: `⌊(s1 − s0) / (MODULE × span)⌋` per half, the second half reversed; a strip clipped below 45 % is dropped.
   Slot id `r,c,h,k`.
7. First lay: a hamlet's green is the full cell nearest the land's centroid (when two or more full cells exist and
   one-module slots still hold every lot); `span` = modules in the blocks the lots need ÷ lots, 1 to `MAX_CLASS`,
   narrowed until every lot fits. Later lays: when the slots at `span` hold fewer than the lots, `span` narrows until
   they fit (or reaches 1), the remembered slots clear, and `plat/narrow` is logged (key, from, to). Then, when the
   slots still hold fewer than the lots and the park line is a remembered one, a fresh park line (sized to today's park
   demand) with a fresh grid on the land it leaves is tried: when it holds more lots, both are kept and `plat/repark` is
   logged (key); a line laid on small land can otherwise keep most of the land it grew into. Then, when the slots still
   hold fewer than the lots and a fresh grid on today's land holds more, the grid record is dropped and the
   neighbourhood lays afresh, logging `plat/regrid` (key). Nothing is drawn until this is settled.
8. Street village order: slots by row distance from `high`, then serpentine index.
9. Renewal: when remembered keys that are vacant are more than half of all remembered, log `plat/renew` and clear the
   slots.
10. Remembered lots keep their slots (a slot gone frees its lot); newcomers take the first free slot after their
    folder's last lot, else the first free slot; none free is overflow. Vacant remembered lots draw as vacant.
11. Blocks: `green` for the green cell, `built` for used cells, `reserve` otherwise.
12. Address: issued at first placement as `${key}:${r}.${c}.${h}.${k}` (row, block, side, index along it) into
    `plat.addresses[lotKey]`, never changed after.

## Park, reserve, wards

- Park and reserve: the polygon inset by pavement, when non-empty.
- Ward: for a collector-or-larger cut, each side holding two or more items records a `District` with `ward: true`, named
  after its heaviest folder.

## Loop connectors

`loopConnectors(roads, shapes, outline)` (`town/connectors.ts`) runs once per town after `partition` and before the
warp, when `options.loops` is not `false` (the CLI's `--no-loops` turns it off). It never touches the plat: connectors
follow the roads of each lay and move no lot.

1. A dead end is the first or last point of a street or lane that lies farther than half another road's width plus
   `2 × PAVEMENT` from every other road, and farther than `2 u` from the town's outline (an exit, not a dead end).
2. Candidate pairs: two dead ends of different roads at most `LOOP_REACH` (3 u) apart, sorted by distance (a stable
   sort, so equal distances keep the order of their ends).
3. Closest first, each end joins at most one lane; a lane that would touch any lot or block (crossing an edge, along an
   edge, or lying inside one) is skipped.
4. Each kept pair becomes a lane from end to end. All tests are in integers (BigInt where squared terms pass 2^53).

## Organic layer

When `options.warp`: `plat.diameter` is fixed at the first lay (`2 × isqrt(area2 / 2 × 113 / 355)`); the warp seed is
`fnv1a(town key)`, octaves `[32, 1280]`, `[15 ‰ × diameter, 350 ‰ × diameter]`, `[70 ‰ × diameter, 1100 ‰ × diameter]`.
Outline, roads, blocks, districts and water are densified (steps 80, 48, 64, 80, 64) and warped; lots are warped point
by point. The warp never touches the plat.
