# Road hierarchy and its targets: procedural prior art

How procedural generators, games and real planning decide a road's class, how they grow it, and how they check the
result against targets; and what the ground plan can borrow for reclassing and for morphometric targets.

Claims are tagged **[verified]** (read in the source, or measured here, with how), **[inferred]** (from what) or
**[memory]** (recalled, not re-read for this note). No folds were run for this note: the measurements come from the city
JSON already on disk (`~/.cache/citymap/render/product/`, `/tmp/citymap-variants/`) via throwaway scripts in
`/tmp/pa-research/` (road polyline lengths by class, per town; road area as length × class width; ward polygon areas).

## Summary

- Prior art agrees on one point: **a road's class and a road's land are separate things, and land changes far less
  often than class.** OSM classes by importance, not width; SimCity (2013) upgrades narrow streets in place; Weber et al.
  settle a street's width once, after a delay; French alignment law widens a street only when the frontage is rebuilt.
- The livediagram regression is not a shortage of land but **land taken from laid lots**: in `apps/live`, reclassing
  added about 90 u² of road (+1.5 points of the town's land) while 64 reserve blocks stayed empty, and files without a
  lot went from 8 to 36. The road budget is also missing from demand: a neighbourhood's land includes half a *street*
  round it, so every class above a street is paid for out of the growth band.
- Generators steer hierarchy with **spacing**, not length shares (Chen et al. and MapGenerator: separation 400 / 100 /
  20; CityEngine: a street-to-crossing ratio; FHWA: spacing, then a "step back" over the area's mix). Length shares are
  a consequence of spacing and only converge on land large enough to hold several cells of each class.
- Our towns are small: `apps/live` and react's `packages` are each about 60 blocks, roughly 8 blocks across, i.e. one or
  two neighbourhood units by the spec's own rule. Honest arterial shares of 10 to 20% need roughly ten times that land.
  The current shares are hit partly through the "first cut one class up" rule, which puts avenues at collector spacing.
- **Recommendation**: (1) store a right of way per cut, separate from its class; (2) reserve, at lay, the width of the
  class the cut can reach before its next recut; (3) change a cut's width only when the cut itself is re-laid; (4) put a
  cut's road land into its land's demand; (5) assert targets **per town, conditioned on scale**: spacing first (ward
  size), length shares only for towns large enough to hold them, with stability and lots-without-land as hard limits.

## 1. What the existing outputs show

### 1.1 City-wide shares hide the towns

Length shares (local = lane + street, collector, arterial = avenue + boulevard), town roads only, highways excluded
**[verified: polyline lengths from the city JSON]**. "Before" is the fold without reclassing (`react-loops.json` matches
the brief's 65 files without a lot, so it is taken as react's before), "after" is with reclassing.

| City / town                   | Lots  | No lot | Local / collector / arterial | Note                              |
| ----------------------------- | ----- | ------ | ---------------------------- | --------------------------------- |
| livediagram, whole, before    | 4,303 | 15     | 93 / 5 / 2                   | 15 towns                          |
| livediagram, whole, after     | 4,274 | 44     | 83 / 12 / 5                  |                                   |
| livediagram `apps/live`, bef. | 1,935 | 8      | 86 / 9 / 4                   | polycentric                       |
| livediagram `apps/live`, aft. | 1,907 | 36     | 67 / 24 / 9                  | collectors now **over** target    |
| livediagram `packages`, aft.  | 927   | 4      | 85 / 8 / 6                   | before: 94 / 6 / 0, 3 without     |
| livediagram `apps/api`, aft.  | 43    | 0      | 40 / 60 / 0                  | radial; ring road is a collector  |
| react, whole, before          | 2,367 | 65     | 78 / 11 / 12                 |                                   |
| react, whole, after           | 2,380 | 52     | 66 / 18 / 15                 |                                   |
| react root town (both)        | 583   | 5      | 45 / 16 / 39                 | radial; 345 u of its 889 u avenue |
| react `packages`, before      | 1,299 | 60     | 97 / 3 / 0                   |                                   |
| react `packages`, after       | 1,312 | 47     | 76 / 17 / 7                  |                                   |
| takken.io, after              | 287   | 2      | 94 / 6 / 0                   |                                   |
| next.js (HEAD, older output)  | 8,150 | 376    | 81 / 12 / 7                  | 11 towns                          |

Observations:

- livediagram's city figure (83 / 12 / 5) averages one large town that overshoots collectors (24%) with eleven
  neighbourhood towns at 100% local, which is correct for them. A city-wide target judges the wrong unit **[verified]**.
- The extreme rows are small radial towns: a ring road classed by `cutClass(mass, true)` is a collector from 30 files up,
  so a 43-lot town is 60% collector, and react's 583-lot root carries an avenue ring **[verified: code and output]**.

### 1.2 Where livediagram's land went

| `apps/live`    | Land   | Road area      | Lot area | Reserve blocks | No lot |
| -------------- | ------ | -------------- | -------- | -------------- | ------ |
| before reclass | 5,796  | 1,817 (31.4%)  | 2,486    | 68             | 8      |
| after reclass  | 5,796  | 1,907 (32.9%)  | 2,625    | 64             | 36     |

(u², road area as length × class width) **[verified]**. Ninety u² is about sixty class-1 lots of land, the same order
as the 28 extra files without a lot, yet 64 reserve blocks stay empty and the lot area *rises*. So the loss is
**local**: a widened cut shaves the edge rows of the neighbourhoods that front it, and their reserve elsewhere in the
town cannot help **[inferred: from the table and the blueprint's absolute grids, 20% cell and 45% strip floors]**.

### 1.3 Road land is not in demand

`landFor` (packages/ground-plan/src/tree/tree.ts) gives a neighbourhood `(√(lotArea / density) + 2 × MARGIN)²` with
`MARGIN = U / 2 + PAVEMENT`: half a *street* round every leaf **[verified: code]**. A cut of class `c` clips
`ROAD_WIDTH[c] / 2` from each side, so a collector takes 0.25 u per side more than budgeted, an avenue 0.625 u, a
boulevard 1.125 u. That land comes out of the 1.35 growth band, and when a class rises mid-life it comes out of laid
rows **[inferred: from `split`, which clips with the class width, and `offsetFor`, which splits area without it]**.

### 1.4 Hierarchy measured as spacing

Wards (land bounded by collectors or bigger, recorded per side of a major cut) as blocks across, √(area / 91 u²), where
91 u² is a 6 × 12 u block plus its street share **[verified: ward polygons in the JSON; nested wards overlap, so
indicative]**:

| Town                       | Wards | Blocks across, p10 / p50 / p90 | In the spec's 3 to 8 |
| -------------------------- | ----- | ------------------------------ | -------------------- |
| livediagram `apps/live`, before | 4  | 2.0 / 3.3 / 4.8                | 3 of 4               |
| livediagram `apps/live`, after  | 11 | 3.1 / 3.6 / 6.4                | 10 of 11             |
| react `packages`, before   | 2     | 1.9 / 3.0 / 3.0                | 1 of 2               |
| react `packages`, after    | 8     | 1.9 / 3.9 / 5.9                | 6 of 8               |
| next.js main town          | 17    | 2.8 / 9.0 / 12.7               | 6 of 17              |

By the spacing measure, reclassing made the hierarchy **more** right; what went wrong is only the land it took.

## 2. How generators and planners decide and grow hierarchy

### 2.1 Parish and Müller (2001), CityEngine lineage

- Two classes, decided by the rule that proposes a segment: highways seek population peaks, streets fill a pattern.
  A segment's class is fixed at birth; there is no reclassing **[verified in ../city-layout/procedural-city-generation.md
  §3.1]**.
- Validation: images only.

### 2.2 CityEngine, Grow Streets

- Major and minor streets: "major streets are created until they enclose an area, called a quarter. Then the quarter is
  subdivided by minor streets" **[verified: [Grow a street](https://doc.arcgis.com/en/cityengine/latest/help/help-grow-a-street.htm)]**.
- Quarter size is steered by a target: "Street to Crossing Ratio = #Major street nodes / #Major crossing nodes ... The
  algorithm tries to fulfill this ratio (only the major streets and major crossings count!)" **[verified: same page]**.
- Widths come with the class at creation (minimum and maximum major roadbed lanes, sidewalk widths with deviation)
  **[verified: same page]**.
- Blocks and lots are dynamic shapes re-subdivided when the street graph changes, unless frozen as static shapes
  **[memory]**: CityEngine accepts that a width edit re-lays lots, which is exactly what citymap must not do.

### 2.3 Weber, Müller, Wonka and Gross, "4D cities" (2009)

The only paper here that grows a city over time with widths **[verified: [PDF](https://cgl.ethz.ch/Downloads/Publications/Papers/2009/Web09/Web09.pdf)]**:

- Every street carries `hierarchy ∈ {major, minor}`, `status ∈ {planned, built}` and a width in metres. Class is fixed
  by the expansion stage that made it (majors bound quarters, minors fill them).
- "Although their location will not change anymore, the newly generated streets are just planned. A street will be only
  be built when enough traffic demand is computed for the street."
- "A temporary street width can be computed according to the current street[i].traffic value. The final street width is
  computed after a user specified time span. At this time, the maximum capacity of the street is also set."
- "One of our important insights was to let the simulation first create planned geometry and have the actual building
  lag by several time steps."
- Control target: the ratio of major nodes of valence 2 to valence 4 "should correspond to a user-defined ratio (per
  street pattern)".

Lesson: **position at birth, width once, after a maturation delay**; planning (the reserve) leads building.

### 2.4 Chen et al. (2008) and MapGenerator: hierarchy as spacing

- Major roads are traced first, minor roads per region after them **[verified in ../city-layout/procedural-city-generation.md §3.3]**.
- MapGenerator encodes the three levels purely as separation: main `dsep 400`, major `dsep 100`, minor `dsep 20`; each
  level traces against the levels above it **[verified: [main_gui.ts](https://github.com/ProbableTrain/MapGenerator/blob/master/src/ts/ui/main_gui.ts)]**.
  The spacing ratio is 4 to 5 per level.
- Regenerating a level clears every level below it (`mainRoads` pre-generate clears major and minor roads, parks and
  buildings) **[verified: same file]**: a stability anti-pattern, and the reason a class rule must never re-trace land.

### 2.5 Galin, Peytavie, Guérin and Beneš, "Authoring hierarchical road networks" (2011)

- Three levels (highway, major, minor). The type of the road between sites `i` and `j` is `τij = min(σi, σj)`, the
  lesser of their sizes: "highways connect cities, major roads connect cities and towns" **[verified:
  [author PDF](https://hal.science/hal-01354487/file/network-author-version.pdf)]**.
- Levels are generated in decreasing importance, each constrained by the ones before.

Lesson: a road's class can follow **what it joins**, not only the land it crosses.

### 2.6 Strano et al. (2012): the backbone is stable

Two centuries of road growth near Milan: high-centrality roads stay put while fabric densifies around them **[verified
in ../city-layout/urban-morphology.md §7]**.

### 2.7 Townscaper

No road hierarchy at all; edits re-solve only the cells they touch, and a cell's look changes with its neighbours while
nothing moves **[memory: Stålberg's talks]**. Lesson: appearance may follow context freely; geometry may not.

### 2.8 Games

- SimCity (2013): narrow roads (dirt, low, medium, high density streets) "can be interchangeably upgraded or downgraded
  between each other"; the class sets the density that zones may reach, so **capacity rises inside the same footprint**;
  avenues are a separate, wide family **[verified, secondary: [SimCity wiki, Road](https://simcity.fandom.com/wiki/Road)]**.
- Cities: Skylines: upgrading a road to a wider type removes the zoned buildings it now overlaps; players lay the final
  width early instead **[memory]**. This is livediagram's regression, as a game mechanic.

### 2.9 Real planning

- **OSM**: `highway=*` "indicates the role and importance of the highway within the road network as a whole" and
  "distinguishes roads by function and importance rather by their physical characteristics" **[verified:
  [Key:highway](https://wiki.openstreetmap.org/wiki/Key:highway)]**. A narrow track can be a trunk.
- **FHWA functional classification**: spacing and context decide; when unsure, "take a 'step back' and determine whether
  any functional classification is under- or over-represented. If the area has a significant number of Minor Arterials,
  then the roadway could very well be best classified as a Major Collector" **[verified:
  [FHWA §3](https://www.fhwa.dot.gov/planning/processes/statewide/related/highway_functional_classifications/section03.cfm)]**.
  Mileage ranges are published **per context**: separate rural and urban systems, each for rural, urban and all states
  (urban system: other principal arterial 4 to 5%, minor arterial 7 to 14%, collectors 7 to 15%, local 63 to 75%; rural
  system local 62 to 74%) **[verified: same page, tables 3-5 and 3-6]**. They check a whole system, not a road.
- **Servitude d'alignement** (France; Sully's edict of 1607, law of 16 September 1807 for towns over 2,000 people): a
  plan fixes the future line; "si un riverain construit ou reconstruit ... il doit respecter l'alignement"; works that
  would prolong a building over the line are forbidden, so streets widen as frontage is rebuilt, without expropriation.
  Its lessons: in Paris it would have taken "plusieurs siècles"; piecemeal setbacks left ragged recesses; and "l'alignement
  ne facilite la circulation que s'il est réalisé sur toute une portion de rue" **[verified:
  [Alignement (urbanisme)](https://fr.wikipedia.org/wiki/Alignement_(urbanisme))]**.
- **Manhattan 1811**: avenue (100 ft) and street (60 ft) widths reserved at the plat, decades before the land filled
  **[verified in ../city-layout/urban-morphology.md §1.3]**.

## 3. How they validate

| Approach                                   | Kind          | Who                                                |
| ------------------------------------------ | ------------- | -------------------------------------------------- |
| Look at the pictures                       | none          | Parish and Müller, Chen et al., most generators    |
| Target ratio as an input the growth chases | control       | CityEngine street-to-crossing, Weber valence ratio |
| Spacing per level as the only knob         | control       | Chen et al., MapGenerator `dsep`                   |
| System-wide ranges per context, as a check | check         | FHWA tables, used with the "step back"             |
| Street-network metrics on real and generated maps | check  | OSMnx-style metrics (../city-layout/urban-morphology.md §8) |
| Optimise parameters towards indicator targets | inverse     | Vanegas et al. (2012), Talton et al. (2011) **[memory]** |

No generator found here validates hierarchy *over time*; none must keep lots in place while it does **[inferred: none
of the sources has a stability constraint]**. Citymap's targets therefore need a constraint order of their own.

## 4. What citymap can borrow

### 4.1 Class and right of way are separate (OSM, SimCity, Weber)

The plat keeps, per cut, a **right of way** (its width in the land) beside its **class**. Class follows the tier freely
within the ±25% band: it colours, labels, wards, counts in shares and seeds districts. The road is drawn at its class
inside its right of way; while the class is wider than the right of way, it is drawn at the right of way.

### 4.2 Reserve at lay what the cut can reach before its next recut (Manhattan, Weber's planned streets)

A side cannot outgrow `GROWTH_PCT` (135%) of its demand without recutting, so between recuts a cut's land grows at most
about 1.35 times. A cut laid at tier `i` reclasses up only at `1.25 × T_i`, so only cuts laid with mass in
`[1.25 / 1.35 × T_i, T_i)`, roughly `[0.93 T, T)`, can rise before a recut. Reserving the right of way of
`reclass(cls, mass × 135 / 100)` at lay therefore widens only cuts in that window: about 3% of a decade of mass per
threshold **[inferred: from the cap rule and band, assuming demand tracks mass; a margin covers drift]**.

### 4.3 Widen only when the cut is re-laid, both sides at once (alignment law)

The right of way changes only at a recut (`outgrown` or `starved`) or a fresh cut: moments when both sides re-lay
anyway, so the widening costs no extra movement. Never widen from one side's regrid: the Paris lesson is that piecemeal
setbacks leave ragged recesses and gain nothing until the whole stretch is aligned. A class that falls keeps its right
of way until the next recut, so a road that flickers across a threshold never moves land.

### 4.4 The parent pays for its roads (subdivision dedication)

Demand includes road land above a street: for each cut, `(ROAD_WIDTH[right of way] − U) × chord`. The chord is unknown
before layout; `√(land)` of the land being cut is a deterministic estimate, which the next recut corrects. Without this,
4.1 to 4.3 still leave a fresh avenue's extra width to starve its sides **[inferred: §1.3]**.

### 4.5 Class rules seen through spacing (Chen et al., FHWA, Galin et al.)

At the default density a block of about 91 u² holds roughly 24 to 30 files **[inferred: `LOT_AREA` = 1.5 u² over 50%
density]**. Then:

- A non-first cut becomes a collector at 375 files (300,000 ‰ × 1.25), land of about 14 blocks, sides of about 2.6
  blocks across: the low end of the spec's 3 to 8. The measured ward medians of 3.3 to 3.9 agree **[inferred, checked
  against §1.4]**.
- A folder's **first** cut is an avenue from 300 files: arterials at collector spacing. This, and radial rings classed
  as first cuts, is where react's 39% avenue root town and the 60% collector hamlet come from **[inferred: §1.1]**.
- A 60-block town (about 8 across) holds one or two collector cells each way and room for one arterial at most. The
  spec's 10 to 20% arterials needs arterial spacing about 1.5 to 3 collector spacings and several arterial cells: land
  of the order of 500 blocks, some 15,000 files at the default density **[inferred: grid length density 1/a + 1/b per
  class, shares as their ratios]**.

Galin's `min(σi, σj)` offers a second axis: a cut separating a heavy folder from a small one carries the small one's
class. It lowers lopsided cuts and so the land they take; whether it starves arterial share in big towns is open.

### 4.6 Targets per town, conditioned on scale

The most qualitative definition borrows FHWA's structure (ranges per context, checked over a system) and Chen's knob
(spacing):

1. **Unit**: a town, never the city. Old towns are judged as they stood, or skipped.
2. **Spacing first**: ward size in blocks across (spec: 3 to 8 between collectors), and district size between
   arterials (proposal: 1.5 to 3 ward widths). These hold at every scale.
3. **Shares second, with a sample floor**: assert the length shares only for towns holding at least about four cells of
   the class in question; below that, assert structure instead (no arterial below the town tier, at most one boulevard
   per town, the first cut of a town-tier folder at most an avenue).
4. **Per tier bands** (proposal, to calibrate): hamlet and village towns local ≥ 85%, arterial 0; town tier collector
   10 to 20%, arterial ≤ 10%; city and metropolis the spec's bands.
5. **Constraint order**: stability and files without a lot are hard limits that a hierarchy change may not worsen;
   spacing is a hard band; shares are soft bands. A change that improves shares and costs lots fails.
6. **Where**: a fixed corpus at pinned commits, asserted on HEAD lays in tests and as medians along the fold in the
   bench; constants calibrated offline (inverse design as a calibration tool, never at runtime: determinism and
   locality forbid an optimiser in the fold), each recorded in `blueprints/DEFAULTS.md`.

## 5. Recommendation

Adopt 4.1 to 4.4 together, and 4.6 for targets; treat 4.5 as spec questions.

| Choice                      | Gains                                                    | Costs                                                                 |
| --------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Right of way beside class   | reclassing never moves a lot; shares follow tier at once | a road may draw narrower than its class until its next recut          |
| Reserve to the band at lay  | most rises fit their reserve; mismatch rare              | about 3% of cuts per threshold lay one class wider; a little land     |
| Widen only at re-lay        | widening rides on movement that happens anyway           | a road that never recuts keeps its first width; a plat field to store |
| Demand pays for road land   | arterials stop eating the growth band                    | larger towns; the chord estimate drifts until the next recut          |
| Per-town, scale-aware goals | targets small towns can meet honestly                    | more assertions; bands to calibrate on a corpus                       |

Genuine forks for the operator (not decided here): whether thresholds count mass or land (with mass, collector spacing
in blocks shrinks as density rises); whether a folder's first cut keeps its class bump; whether radial rings follow the
ring's land rather than the folder's; whether Galin's lesser-side rule is worth a trial.

## 6. Experiment to run when a slot is free

Full-history folds (not run here) on livediagram, react, takken.io and next.js, each against today's reclassing:

1. Right of way frozen at lay, class reclassed: files without a lot, shares per town, ward spacing, stability.
2. Plus reservation to the band at lay.
3. Plus road land in demand.
4. Plus first-cut bump removed, as a probe of 4.5.

Pass: no town gains files without a lot over the no-reclass baseline, stability no worse than baseline, ward medians
within 3 to 8 blocks across, and shares within band only for towns above the sample floor.

## Sources

- Parish and Müller, Procedural modeling of cities, SIGGRAPH 2001: https://doi.org/10.1145/383259.383292
- Esri, CityEngine, Grow a street: https://doc.arcgis.com/en/cityengine/latest/help/help-grow-a-street.htm
- Weber, Müller, Wonka and Gross, Interactive geometric simulation of 4D cities, Eurographics 2009:
  https://cgl.ethz.ch/Downloads/Publications/Papers/2009/Web09/Web09.pdf
- Chen, Esch, Wonka, Müller and Zhang, Interactive procedural street modeling, SIGGRAPH 2008:
  https://doi.org/10.1145/1360612.1360702
- ProbableTrain, MapGenerator, main_gui.ts: https://github.com/ProbableTrain/MapGenerator/blob/master/src/ts/ui/main_gui.ts
- Galin, Peytavie, Guérin and Beneš, Authoring hierarchical road networks, 2011: https://hal.science/hal-01354487
- Strano et al., Elementary processes governing the evolution of road networks, 2012: https://arxiv.org/abs/1203.0300
- OpenStreetMap wiki, Key:highway: https://wiki.openstreetmap.org/wiki/Key:highway
- FHWA, Highway functional classification, section 3:
  https://www.fhwa.dot.gov/planning/processes/statewide/related/highway_functional_classifications/section03.cfm
- Wikipédia, Alignement (urbanisme): https://fr.wikipedia.org/wiki/Alignement_(urbanisme)
- SimCity wiki, Road: https://simcity.fandom.com/wiki/Road
- Vanegas et al., Inverse design of urban procedural models, SIGGRAPH Asia 2012 **[memory]**
