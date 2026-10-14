# Road hierarchy targets: real-city evidence

Angle: what urban morphology, official road statistics and street-network research say about road hierarchy shares by
settlement size, from hamlet to metropolis, and which per-tier target bands citymap could adopt.

Evidence tags: **verified** (fetched or measured in this pass, how stated), **inferred** (reasoned from named
evidence), **assumed** (from memory or unverified).

## Summary

- The spec's single band (local 65 to 75%, collector 10 to 15%, arterial and up 10 to 20%) is a **metropolitan**
  band. It comes from FHWA's urban-system ranges, which describe urban areas of 5,000 people and more, dominated by
  large urbanised areas (verified, FHWA tables 3-5 and 3-6). It is the wrong yardstick for a village or a small town.
- Measured in OpenStreetMap over 68 settlements in England and Germany, sampled by population decade (verified, own
  measurement, section 3):
  - The **local share is nearly constant**, about two thirds to three quarters at every size above a hamlet.
  - The **collector share falls with size** (village 31 to 53%, town 24 to 31%, city 11 to 21%, metropolis 15 to 23%,
    interquartile ranges).
  - The **arterial share rises with size**: none in villages, mostly none in places under 7,000 people (25% of
    them have any), then 3 to 17% in towns of 7,000 to 70,000, and 13 to 16% in cities over 70,000.
  - A settlement grows **more classes as it grows**, as Jiang's head/tail work predicts: one class for a hamlet, two
    for a village and small town, three from about 7,000 people.
- Citymap's tiers line up with these settlement sizes when one lot is read as one plot of about 2.3 people, and two
  independent checks (lot count and diameter in metres) agree (inferred, section 4). Most citymap towns are therefore
  real-world **villages and small towns**, where 10% arterials would be unrealistic. react's main town (583 lots,
  about 850 m across) has 39% avenues; a real settlement of that size has 0 to 13%.
- Real cities get hierarchy from **spacing**, not from shares: collectors every quarter to half mile, minor
  arterials no more than a mile apart in developed land (verified, FHWA). Shares follow from spacing and town size. A
  town narrower than one arterial spacing has at most one arterial line.
- Real cities upgrade roads mostly **without moving building lines**. The class is a function and a map symbol,
  widening happens into land reserved in advance (an improvement line), and the main roads are the most persistent
  part of the plan (verified: Highways Act 1980 s.73; Strano et al. 2012; DfT de-trunking).
- **Recommendation**:
  1. Replace the single band with the five per-tier bands below.
  2. Assert them over a corpus of real repositories as an outcome check, alongside structural rules: classes present
     per tier, and no road ending on a road of lower class. Do not feed them back into the layout as a controller.
  3. Make class relative to the town: no road above the class of the roads it ends on, and the town's tier caps its
     top class.
  4. Decouple reclassing from width: a reclass changes the class, and the carriageway widens only into land reserved
     for it, or at the next recut.

## 1. The question

Two coupled problems (from the brief):

1. Reclassing roads with their land's tier widened roads, which took land from neighbourhoods: livediagram's files
   without a lot rose from 15 to 44.
2. The spec's length-share targets cannot be met by small towns, and no per-archetype or per-tier targets exist,
   although the scope spec says the generator "measures its own output ... and asserts them per archetype"
   (`docs/specs/002-project-scope`).

This report answers from the real-city side: what hierarchy real settlements of each size have, and how real cities
change road class without disturbing plots.

## 2. What the literature says

### 2.1 Official classification statistics

**FHWA, Highway Functional Classification Concepts, Criteria and Procedures (2013), section 3** (verified, page
fetched). Tables 3-5 and 3-6 give mileage-extent guideline ranges from HPMS data, split by rural and urban system:

| Class                          | Rural system, all states | Urban system, all states |
| ------------------------------ | ------------------------ | ------------------------ |
| Interstate                     | 1 to 2%                  | 1 to 3%                  |
| Other freeways and expressways | 0 to 2%                  | 0 to 2%                  |
| Other principal arterial       | 2 to 6%                  | 4 to 5%                  |
| Minor arterial                 | 3 to 7%                  | 7 to 14%                 |
| Major collector                | 9 to 19%                 | 7 to 15% (major + minor) |
| Minor collector                | 4 to 15%                 | (in the line above)      |
| Local                          | 64 to 75%                | 63 to 75%                |

- Summed, rural is about 6 to 17% arterial and 13 to 34% collector, while urban is about 12 to 24% arterial and 7
  to 15% collector (inferred: sums of the rows). **Smaller and sparser systems trade arterials for collectors; the
  local share hardly moves.**
- The same page: "the total Collector mileage is typically one-third of the Local roadway network" (verified).
- It also gives spacing, not just shares: minor arterials "may typically vary from 1/8- to 1/2-mile in the central
  business district (CBD) and 2 to 3 miles in the suburban fringes. Normally, the spacing should not exceed 1 mile in
  fully developed areas" (verified, Table 3-2 text).
- And: "an expanse of a rural area of equal size would be served by a single Arterial" (verified).

**UK Department for Transport, Road lengths in Great Britain 2023** (verified, page fetched):

- Great Britain: 1% motorway, 12% A road, 8% B road, 79% C and unclassified.
- 75% of A roads, 80% of B roads and 57% of C and U roads are rural. Derived urban shares: about 8% A road, 4% B road,
  88% C and U. Derived rural shares: about 15% A, 10% B, 74% C and U (inferred: arithmetic on the published
  totals, motorways split assumed mostly rural).
- DfT's urban roads are those in settlements of 10,000 people and more (assumed: the classification note was not
  re-read in this pass).
- Class is administrative and changes without construction: "de-trunking" moved trunk A roads to local management
  (verified). A class change is a label change first.
- Motorways and A roads carry 65% of vehicle miles on 13% of the length (verified).

### 2.2 Street-network science

- **Jiang (2009), Street hierarchies: a minority of streets and a majority of traffic flow** (verified, abstract):
  "80 percent of streets are less connected (below the average), while 20 percent of streets are well connected";
  the top 20% carry 80% of flow, and the top 1% more than 20%. The hierarchy is a heavy tail, not a fixed class
  table.
- **Jiang and Yin (2014), the ht-index** (verified, abstract): a feature has ht-index h if "the pattern of far more
  small things than large ones recurs (h-1) times". Applied to streets, a larger city has more nested levels
  (inferred: ht-index rises with scale range). This is the mechanism behind "more classes as it grows".
- **Kalapala et al. (2006), Scale invariance in road networks** (verified, abstract): the road networks of the US,
  England and Denmark are self-similar; the dual degree distribution follows a power law with exponent 2.2 to 2.4,
  and "journeys, regardless of their length, have a largely identical structure". Once a network is large enough,
  shares stabilise. This matches the plateau measured above 70,000 people.
- **Strano et al. (2012), Elementary processes governing the evolution of road networks** (verified, abstract): over
  200 years north of Milan, growth is "densification" around centres plus "exploration" at the front, and
  "high-centrality roads ... constitute the backbone" and are stable through time. Main roads are the persistent
  layer; they are not re-laid as the town grows.
- **Barthelemy (2011), Spatial networks** (verified, abstract only): edge length has a cost, which shapes topology. No
  per-size class shares are given in what was read.
- **Boeing (OSMnx, global street-network indicators)**: already cited in
  [city-layout/urban-morphology.md](../city-layout/urban-morphology.md). The indicators read there are topological and
  geometric (degree, circuity, orientation). No length-share-by-class indicator was found (assumed: not re-checked in
  this pass). This report therefore measured shares directly from the same data source, OpenStreetMap.

### 2.3 Urban morphology

**Marshall (2005), Streets and Patterns** (assumed: from memory of the book, not re-verified in this pass):

- Hierarchy is **relational**: a route's status comes from its place in the whole network (continuity, depth from the
  main routes), not from the size of the land it serves.
- A coherent hierarchy has lower routes joining routes of the same or a higher tier. An important route that dead-ends
  on a minor one is an inversion.
- The traditional village high street fuses movement and place. It is the settlement's top route and its main
  frontage at once; separate arterials appear only as the settlement grows. The later "Link and Place" work (Jones,
  Boujenko and Marshall, 2007) formalises the two roles (assumed).

These three points bear directly on citymap (sections 5 and 7).

## 3. Measurement: 68 settlements by population decade

### Method (verified, reproducible: Appendix B)

- Place nodes (`place=hamlet|village|town|city`) with a numeric `population` tag, from Overpass, for England (1,237
  with population) and Germany (16,573).
- Bins by population: under 70, 70 to 700, 700 to 7,000, 7,000 to 70,000, and 70,000 and more. These are 2.3 times
  citymap's tier thresholds (section 4).
- Six places per bin and country, chosen deterministically (sorted by OSM id, evenly spaced). The top bin has all
  available places at or above 700,000 plus six from 70,000 to 700,000.
- Circle round the place node with radius from population at 3,000 people per km² of built-up land, floored at 250 m
  and capped at 8 km.
- Drivable ways only, length clipped exactly to the circle. Classes are mapped as below; `service`, `track` and paths
  are excluded.

| Group     | OSM `highway` (with `_link`)                  | England meaning           | Germany meaning (typical)            |
| --------- | --------------------------------------------- | ------------------------- | ------------------------------------ |
| arterial  | motorway, trunk, primary                      | motorways, A roads        | Autobahn, Bundesstraße               |
| collector | secondary, tertiary                           | B roads, C/through roads  | Landesstraße, Kreisstraße, collectors |
| local     | unclassified, residential, living_street      | unclassified, residential | Gemeindestraße                       |

### Results (verified, own measurement, October 2026 OSM)

Interquartile range per bin, both countries pooled (n = 12 per bin, 20 in the top bin):

| Population   | n  | Local   | Collector | Arterial | Any arterial | Classes present (median) | Median road km |
| ------------ | -- | ------- | --------- | -------- | ------------ | ------------------------ | -------------- |
| under 70     | 12 | 67-100% | 0-21%     | 0%       | 8%           | 1                        | 0.7            |
| 70 to 700    | 12 | 47-69%  | 31-53%    | 0%       | 0%           | 2                        | 1.3            |
| 700 to 7k    | 12 | 67-73%  | 24-31%    | 0-2%     | 25%          | 2                        | 4.2            |
| 7k to 70k    | 12 | 70-78%  | 11-21%    | 3-17%    | 83%          | 3                        | 35             |
| 70k and more | 20 | 63-71%  | 15-23%    | 13-16%   | 100%         | 3                        | 888            |

Pooled length shares (local / collector / arterial) by country:

| Population    | England    | Germany    |
| ------------- | ---------- | ---------- |
| under 70      | 87 / 13 / 0  | 70 / 20 / 10 |
| 70 to 700     | 63 / 37 / 0  | 63 / 37 / 0  |
| 700 to 7k     | 66 / 27 / 7  | 73 / 24 / 4  |
| 7k to 70k     | 76 / 17 / 7  | 72 / 18 / 11 |
| 70k to 700k   | 73 / 12 / 15 | 67 / 20 / 13 |
| 700k and more | 69 / 15 / 16 | 59 / 24 / 17 |

Read-out:

- English cities of 70,000 and more land inside the spec's band (local 66 to 76, collector 7 to 18, arterial 9 to 17).
  The spec's band is a good **metropolis** target and should stay as such.
- The village figure (a collector at 31 to 53%) is one road: the through road or high street, in a network of a
  kilometre or so. That is Marshall's fused high street, measured.
- Arterials appear between 7,000 and 70,000 people. This matches FHWA's spacing: at 3,000 people per km², 7,000 people
  cover about 2.3 km², a circle 1.7 km across, about one arterial spacing (inferred).
- German core samples at 700,000 and more show more collectors (Berlin 29%, Hamburg 26%). The 8 km cap samples the
  inner city, where collectors are densest, and German `tertiary` tagging is generous (inferred).

### Caveats

- OSM classes are administrative and vary by country. The two-country agreement suggests the pattern is not a tagging
  artefact, but bands should not be read to the percentage point.
- Through roads crossing a small place are counted. In citymap, inter-town roads are highways across open country,
  excluded from the shares. Small citymap towns should therefore sit at or below the real arterial figures (inferred).
- `population` tags sometimes give a parish or municipality. Shripney (8,900, mostly fields; 52% arterial) and Pinnow
  (one road, 100% collector) are such outliers; the interquartile ranges absorb them.
- The circle model ignores real built-up outlines; small samples (n = 12 per bin) give ranges, not precise moments.

## 4. Mapping citymap tiers onto real settlements

Tiers are by mass in files: hamlet under 30, village under 300, town under 3,000, city under 30,000, metropolis above
(ground-plan spec, Archetypes).

Two independent checks (inferred):

1. **Lots as plots.** A lot is one file's plot; a plot houses one household of about 2.3 people (assumed: UK about
   2.4, Germany about 2.0). The tier thresholds 30 / 300 / 3,000 / 30,000 then read as about 70 / 700 / 7,000 /
   70,000 people, which are the bins of section 3.
2. **Metres per u.** A local street is 1 u and a block's short side 6 u. Real local right-of-way is about 10 to 15 m,
   and real short block sides are 60 to 100 m, so 1 u is about 12 m. react's main town is 71 u across (from
   `landArea2` in `~/.cache/citymap/render/product/react.json`), about 850 m. At 3,000 people per km² that holds about
   1,700 people. Its 583 lots times 2.3 give about 1,340. The two estimates agree within the slack of either
   assumption.

FHWA's one-mile arterial spacing is then about 134 u. Of the citymap towns measured below, only next.js (154 u) and
its `packages` town (139 u) are wider than one arterial spacing.

| Citymap tier | Mass (files)    | Real analogue   | Typical citymap examples                                     |
| ------------ | --------------- | --------------- | ------------------------------------------------------------ |
| hamlet       | under 30        | under 70 people | small workspace islands                                      |
| village      | 30 to 300       | 70 to 700       | takken.io, redux, studio-worker, most islands and old towns  |
| town         | 300 to 3,000    | 700 to 7,000    | react, typescript, game-ci-cli, livediagram `apps/live`      |
| city         | 3,000 to 30,000 | 7k to 70k       | next.js `packages`                                           |
| metropolis   | 30,000 and more | 70k and more    | none in the corpus measured (linux-scale repositories would) |

## 5. Where citymap stands

Shares per town from the existing renders in `~/.cache/citymap/render/product/` (verified: road polylines summed per
class, highways excluded; renders of about 21:47 to 21:52, after the reclass commit `711c93d`, except next.js and
typescript, which are older). The tier is read from the lot count, as the render carries no root mass.

| Town                      | Lots  | Across (u) | Tier    | Local | Collector | Arterial | Proposed band (L / C / A) | Verdict                    |
| ------------------------- | ----- | ---------- | ------- | ----- | --------- | -------- | ------------------------- | -------------------------- |
| react                     | 583   | 71         | town    | 45    | 16        | 39       | 65-80 / 20-35 / 0-10      | far too arterial           |
| react `packages`          | 1,312 | 85         | town    | 76    | 17        | 7        | 65-80 / 20-35 / 0-10      | collectors slightly low    |
| livediagram `apps/live`   | 1,907 | 86         | town    | 67    | 24        | 9        | 65-80 / 20-35 / 0-10      | in band                    |
| livediagram `packages`    | 927   | 70         | town    | 85    | 8         | 6        | 65-80 / 20-35 / 0-10      | too few collectors         |
| next.js                   | 2,071 | 154        | town    | 83    | 15        | 2        | 65-80 / 20-35 / 0-10      | too few collectors         |
| next.js `turbopack`       | 1,180 | 89         | town    | 88    | 5         | 7        | 65-80 / 20-35 / 0-10      | too few collectors         |
| typescript                | 745   | 67         | town    | 77    | 16        | 7        | 65-80 / 20-35 / 0-10      | collectors slightly low    |
| game-ci-cli               | 570   | 64         | town    | 58    | 21        | 21       | 65-80 / 20-35 / 0-10      | too arterial               |
| next.js `packages`        | 3,479 | 139        | city    | 69    | 13        | 18       | 65-80 / 10-25 / 5-15      | arterial slightly high     |
| takken.io                 | 132   | 39         | village | 91    | 9         | 0        | 55-80 / 20-45 / 0         | high street missing        |
| react old town            | 144   | 37         | village | 53    | 47        | 0        | 55-80 / 20-45 / 0         | edge of band               |
| next.js `crates`          | 264   | 40         | village | 58    | 42        | 0        | 55-80 / 20-45 / 0         | in band                    |
| next.js `evals/evals`     | 254   | 50         | village | 92    | 8         | 0        | 55-80 / 20-45 / 0         | high street missing        |
| livediagram `apps/help`   | 88    | 46         | village | 93    | 7         | 0        | 55-80 / 20-45 / 0         | high street missing        |
| redux old town 2          | 61    | 32         | village | 85    | 15        | 0        | 55-80 / 20-45 / 0         | collectors low             |

Pattern: citymap is **too arterial at the town tier and too poor in collectors at the village and town tiers**. That
is the inverse of the real gradient, where small places are collector-led.

Causes, read from the code (inferred: `partition.ts` passes the folder's own `massMille` with `first = true` to
`split`, and `cutClass` uses only that mass):

- Every folder of town-tier mass, at any depth, gets an avenue for its first cut. Avenue length therefore grows with
  the number of nested town-tier folders, not with the town's size. react's main town has 345 u of avenue on 889 u of
  road: about five town diameters of arterial in a place real evidence gives at most one.
- The same holds for nested city-tier folders and boulevards, so the spec's "a town therefore has at most one
  boulevard" is not guaranteed (inferred, not observed in the corpus).
- A nested folder's first cut ends on its parent's cut. A town-tier child (avenue) inside a town-tier parent's later
  cut (collector) ends an avenue on a collector: Marshall's hierarchy inversion.
- Villages get their collector only as a folder's first cut. A village-tier town whose root splits into one big and
  several small items spends that collector on a short cut, so no high street emerges (inferred from takken.io and
  `evals/evals`).

## 6. Proposed per-tier bands

Length shares of a town's roads, highways excluded. Local is lane plus street; arterial is avenue plus boulevard.
Bands are the measured interquartile ranges, widened to round numbers and cross-checked against FHWA's rural and urban
ranges and DfT's urban and rural splits. The metropolis row keeps the spec's existing band, slightly widened for
collectors.

| Tier       | Mass (files)    | Real analogue | Local    | Collector | Arterial and up | Classes present                        | Sources                                     |
| ---------- | --------------- | ------------- | -------- | --------- | --------------- | -------------------------------------- | ------------------------------------------- |
| hamlet     | under 30        | under 70      | 85-100%  | 0-15%     | 0%              | 1 (lane, street)                       | section 3, under-70 bin                     |
| village    | 30 to 300       | 70 to 700     | 55-80%   | 20-45%    | 0%              | 2: one collector line, the high street | section 3; Marshall (high street)           |
| town       | 300 to 3,000    | 700 to 7k     | 65-80%   | 20-35%    | 0-10%           | 2, an avenue optional                  | section 3; FHWA rural; collector ≈ local ÷ 3 |
| city       | 3,000 to 30,000 | 7k to 70k     | 65-80%   | 10-25%    | 5-15%           | 3 (avenue)                             | section 3; DfT urban ≥ 10k                  |
| metropolis | 30,000 and more | 70k and more  | 60-75%   | 10-20%    | 10-20%          | 3 to 4 (boulevard)                     | section 3; FHWA urban; spec band            |

Constants these imply (one row each for `blueprints/DEFAULTS.md`, with this report as provenance):

- `LENGTH_SHARE_BANDS` per tier: the table above, in per cent.
- `CLASSES_BY_TIER`: hamlet 1, village 2, town 2 (3 tolerated), city 3, metropolis 4.
- `ARTERIAL_SPACING`: about 134 u (one mile at about 12 m per u); `COLLECTOR_SPACING`: about 34 to 67 u (a quarter to
  half a mile). The spec's "3 to 8 blocks across between collectors" (7 u pitch, 21 to 56 u) is already consistent
  with this.

## 7. Defining and enforcing targets qualitatively

The most qualitative definition has three layers. Each layer is checkable, and none feeds back into the layout.

1. **Bands as outcomes, asserted over a corpus.** A morphometrics test measures every town of the fixture corpus (the
   ten clones at HEAD, plus a few sampled commits) and asserts, per tier:
   - the median town lies inside the band;
   - every town lies inside the **envelope**: the band widened by 10 points, roughly the min-max of the real samples.

   Real settlements of one size scatter (Marlborough 21% arterial, Pinnow all collector), so demanding every town inside
   the interquartile band would be stricter than reality. Towns with under about 100 u of road are exempt from shares
   and checked on classes present only: one cut more or less swings a tiny town's shares by tens of points.
2. **Structure, asserted per town.** These hold in every coherent real network, regardless of size:
   - classes present match `CLASSES_BY_TIER`;
   - **no road ends on a road of lower class** (Marshall);
   - every collector and arterial line reaches the town edge or a road of equal or higher class at both ends (FHWA:
     arterials form "an integrated network ... without stub connections");
   - a town narrower than one arterial spacing has at most one arterial line.
3. **Spacing as the generative rule.** Real planners specify spacing and let shares follow. In citymap, spacing is
   already implied by the cut tree (halving land) and the neighbourhood limit. Keeping class tied to land size relative
   to the town (section 8, rule 2) is the citymap form of spacing.

Why not steer classes to hit the bands (a feedback controller)? A road's class would then depend on the whole town's
share, so one commit in one folder could reclass roads anywhere. That breaks the Locality invariant and adds churn,
which is exactly what stability measures (inferred). Bands are a test of the rules, not an input to them.

## 8. Reclassing without starving land: how real cities do it

Real cities change road class constantly and building lines rarely. The mechanisms:

| Real mechanism                                                                                                    | Evidence                                                                                      | Citymap analogue                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Class is a function and a symbol, not a width.** A-roads run through villages between the same house fronts; de-trunking relabels without building. | DfT 2023 (verified); FHWA tables 3-5 and 3-6: minor arterials and major collectors share one lane width, 10 to 12 ft (verified) | Reclass changes the class (colour, casing, label, hierarchy metrics); the carriageway keeps its laid width. |
| **Improvement lines**: the authority prescribes the line a street will widen to; no new building may stand inside it. | Highways Act 1980 s.73 (verified)                                                              | At laying, a cut whose land is within the band below the next threshold reserves the next class's width as verge. A reclass up widens into the verge. |
| **Widening at redevelopment.** Plots are re-laid when they are rebuilt anyway.                                     | Haussmann cut through plots, at great cost (earlier research)                                  | A road takes its class's full width only when its cut recuts (outgrown or starved), when lots on both sides move in any case.     |
| **Bypass and exploration.** New arterials come at the growing edge, not by widening the core.                      | Strano et al. 2012 (verified)                                                                  | New top classes arrive with new top-level cuts and highways; interior roads are not widened.                                     |
| **Main roads persist.** High-centrality roads are the stable backbone.                                            | Strano et al. 2012 (verified)                                                                  | Downward reclass changes the class only; width never shrinks (a road diet leaves a verge).                                       |

Applied as rules:

1. **Reclass is paint.** `reclass` may change `rec.cls` freely, within the ±25% band. The land a road takes is
   `rec.width`, a new remembered field set at laying and changed only at a recut, when `rec.c` moves anyway. Effect:
   reclassing can never cost a lot its slot; livediagram's rise from 15 to 44 files without a lot comes from width
   taking land, so it should disappear (inferred, needs a fold to verify).
2. **Class relative to the town** (Marshall):
   - A cut's class is the lower of its land's tier class (today's rule), the highest class among the roads it ends
     on, and the town's top class.
   - The top class per town tier is: hamlet street, village collector, town collector (an avenue only above the
     band), city avenue, metropolis boulevard.

   This removes nested avenues and inversions. It also gives villages a high street, because the root's first cut is
   then the town's one collector line.
3. **Optional improvement line.** Reserve the next class's width only for cuts whose land mass is within the band
   below the next threshold. The cost is at most 0.5 to 1 u of verge on a handful of major cuts per town (the width
   steps are 0.5, 0.75 and 1 u). When the road widens, it does so without moving a lot.

## 9. Recommendation and trade-offs

Adopt, in this order:

1. **Per-tier bands** (section 6) in the ground-plan spec, replacing the single Length shares row. Record the
   constants in `DEFAULTS.md`, with this report as provenance.
2. **Corpus morphometrics test** asserting the median-in-band, envelope and structural rules (section 7).
3. **Reclass is paint, width at recut** (section 8, rule 1). This answers problem 1 directly.
4. **Class relative to the town** (section 8, rule 2). This is the change that moves react, game-ci-cli and the
   collector-poor towns toward the bands. Calibrate it against the corpus test, not by hand.

Trade-offs:

| Choice                        | Gains                                                                                    | Costs                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-tier bands                | Targets that real places of that size meet; small towns stop failing an impossible test | Five rows instead of one, and bands rest on 68 OSM samples and two national datasets: indicative, not standards                              |
| Outcome test, no controller   | Locality and stability untouched; a regression shows as a failing tier                   | Bands are not guaranteed per town; tuning the class rules takes iterations                                                                   |
| Reclass is paint              | Zero land taken by reclassing; matches how real roads are relabelled                     | An old avenue may be narrower than a fresh one until its cut recuts. The renderer should draw the laid width and show the class by symbol. |
| Improvement line              | Widening without moving lots                                                             | A little land held as verge on major cuts (the map reads it as a green verge, which real arterials often have)                              |
| Class relative to the town    | Coherent hierarchy, no inversions, villages get a high street                            | A cut's class now depends on its ancestors' classes; an ancestor's reclass can cascade paint changes down (cheap once reclass is paint)    |
| Tier mapping (lot ≈ 2.3 people) | Ties every tier to measurable real places                                              | Rests on an assumption about households per plot; a different density setting shifts the analogue by a factor under 2, inside the bands   |

Open forks for Webber (not decided here):

- Should the envelope be the band ±10 points, or the real min-max per bin?
- Should improvement lines exist at all, or is width-at-recut enough? (Simplest: width at recut only.)
- Should the town tier's top class be a collector (real evidence) or an avenue (today's look, with more contrast)?

## Sources

- FHWA (2013) Highway Functional Classification Concepts, Criteria and Procedures, section 3, tables 3-2, 3-5, 3-6.
  https://www.fhwa.dot.gov/planning/processes/statewide/related/highway_functional_classifications/section03.cfm
- Department for Transport (2024) Road lengths in Great Britain: 2023.
  https://www.gov.uk/government/statistics/road-lengths-in-great-britain-2023/road-lengths-in-great-britain-2023
- Highways Act 1980, section 73, Power to prescribe improvement line for widening street.
  https://www.legislation.gov.uk/ukpga/1980/66/section/73
- Jiang, B. (2009) Street hierarchies: a minority of streets and a majority of traffic flow. IJGIS 23(8).
  https://arxiv.org/abs/0802.1284
- Jiang, B. and Yin, J. (2014) Ht-index for quantifying the fractal or scaling structure of geographic features. Annals
  of the AAG 104(3). https://arxiv.org/abs/1305.0883
- Kalapala, V., Sanwalani, V., Clauset, A. and Moore, C. (2006) Scale invariance in road networks. Phys. Rev. E 73.
  https://arxiv.org/abs/physics/0510198
- Strano, E., Nicosia, V., Latora, V., Porta, S. and Barthelemy, M. (2012) Elementary processes governing the evolution
  of road networks. Scientific Reports 2. https://arxiv.org/abs/1203.0300
- Barthelemy, M. (2011) Spatial networks. Physics Reports 499. https://arxiv.org/abs/1010.0302
- Marshall, S. (2005) Streets and Patterns. Spon Press, London. (Content cited from memory; not re-verified.)
- Jones, P., Boujenko, N. and Marshall, S. (2007) Link and Place: a guide to street planning and design. Local
  Transport Today. (Assumed; not re-verified.)
- Boeing, G. (2017) OSMnx: new methods for acquiring, constructing, analyzing, and visualizing complex street networks.
  Computers, Environment and Urban Systems 65. (Method lineage for the OSM measurement.)
- OpenStreetMap contributors, via the Overpass API (overpass-api.de, maps.mail.ru mirror), data © OpenStreetMap
  contributors, ODbL. Queried October 2026.
- Earlier citymap research: [city-layout/urban-morphology.md](../city-layout/urban-morphology.md) (FHWA urban ranges,
  OSM samples of nine dense fabrics, street width ratios).

## Appendix A: per-settlement measurements

Sorted by population; shares of drivable length inside the sampling circle (verified, own measurement).

| Settlement | Country | Population | Radius (m) | Road km | Local % | Collector % | Arterial % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Stean | England | 10 | 250 | 0.3 | 100 | 0 | 0 |
| Verwood | England | 15 | 250 | 1.5 | 70 | 30 | 0 |
| Lower Merridge | England | 18 | 250 | 0.5 | 100 | 0 | 0 |
| Rhode | England | 22 | 250 | 0.6 | 100 | 0 | 0 |
| Neuwuischke - Nowy Wuježk | Germany | 27 | 250 | 0.5 | 100 | 0 | 0 |
| Brandon Parva | England | 30 | 250 | 0.6 | 82 | 18 | 0 |
| Sankt Gregor | Germany | 33 | 250 | 0.5 | 100 | 0 | 0 |
| Plainsfield | England | 37 | 250 | 0.8 | 100 | 0 | 0 |
| Neudorf | Germany | 39 | 250 | 1.2 | 59 | 41 | 0 |
| Höfenneusig | Germany | 43 | 250 | 0.9 | 100 | 0 | 0 |
| Gränze - Hrańca | Germany | 49 | 250 | 0.9 | 56 | 44 | 0 |
| Pröttitz | Germany | 55 | 250 | 1.1 | 40 | 14 | 46 |
| Groß Ellingen | Germany | 112 | 250 | 1.1 | 53 | 47 | 0 |
| Pinnow | Germany | 147 | 250 | 0.7 | 0 | 100 | 0 |
| Romaldkirk | England | 169 | 250 | 1.6 | 66 | 34 | 0 |
| Nun Monkton | England | 250 | 250 | 1.2 | 66 | 34 | 0 |
| Saxton | England | 250 | 250 | 1.3 | 100 | 0 | 0 |
| Hattgenstein | Germany | 261 | 250 | 1.6 | 52 | 48 | 0 |
| Warburton | England | 342 | 250 | 1.0 | 40 | 60 | 0 |
| Chilton Foliat | England | 363 | 250 | 1.2 | 30 | 70 | 0 |
| Palingen | Germany | 400 | 250 | 1.3 | 100 | 0 | 0 |
| Berglicht | Germany | 458 | 250 | 2.9 | 76 | 24 | 0 |
| Vernham Dean | England | 552 | 250 | 1.5 | 67 | 33 | 0 |
| Prisannewitz | Germany | 643 | 261 | 1.0 | 49 | 51 | 0 |
| Nether Poppleton | England | 815 | 294 | 3.3 | 70 | 30 | 0 |
| Sefton | England | 1,020 | 329 | 2.1 | 44 | 56 | 0 |
| Heretsried | Germany | 1,036 | 332 | 3.7 | 71 | 29 | 0 |
| Tiddische | Germany | 1,169 | 352 | 3.0 | 63 | 37 | 0 |
| Fowlmere | England | 1,200 | 357 | 2.6 | 68 | 32 | 0 |
| Tollwitz | Germany | 1,248 | 364 | 4.7 | 82 | 18 | 0 |
| Wieda | Germany | 1,295 | 371 | 2.8 | 74 | 26 | 0 |
| Gillenfeld | Germany | 1,441 | 391 | 6.4 | 72 | 28 | 0 |
| Wells-next-the-Sea | England | 2,165 | 479 | 10.1 | 78 | 12 | 9 |
| Harlington | England | 2,297 | 494 | 7.1 | 71 | 29 | 0 |
| Jägersburg | Germany | 3,111 | 575 | 9.8 | 71 | 16 | 12 |
| Fordingbridge | England | 5,998 | 798 | 15.7 | 56 | 31 | 13 |
| Marlborough | England | 8,395 | 944 | 24.3 | 69 | 10 | 21 |
| Grimlinghausen | Germany | 8,418 | 945 | 20.9 | 70 | 21 | 9 |
| Shripney | England | 8,900 | 972 | 8.7 | 48 | 0 | 52 |
| Altdorf | Germany | 11,312 | 1,096 | 34.9 | 78 | 22 | 0 |
| Mablethorpe | England | 12,531 | 1,153 | 27.6 | 81 | 10 | 9 |
| Kleinblittersdorf | Germany | 12,995 | 1,174 | 34.8 | 62 | 18 | 20 |
| Illingen, Saar | Germany | 16,573 | 1,326 | 30.2 | 70 | 30 | 0 |
| Bad Saulgau | Germany | 17,011 | 1,343 | 55.1 | 76 | 18 | 6 |
| Ingleby Barwick | England | 20,378 | 1,470 | 83.6 | 81 | 18 | 1 |
| Broadstairs | England | 24,903 | 1,626 | 62.3 | 78 | 16 | 6 |
| Exmouth | England | 32,563 | 1,859 | 56.6 | 73 | 24 | 3 |
| Bensheim | Germany | 39,642 | 2,051 | 110.3 | 72 | 12 | 16 |
| Burnley | England | 73,500 | 2,793 | 261.0 | 76 | 7 | 17 |
| Castrop-Rauxel | Germany | 73,751 | 2,797 | 157.1 | 61 | 24 | 15 |
| Hemel Hempstead | England | 81,100 | 2,933 | 264.8 | 68 | 18 | 14 |
| Bath | England | 88,859 | 3,071 | 267.7 | 74 | 12 | 14 |
| Esslingen am Neckar | Germany | 92,261 | 3,129 | 243.5 | 64 | 29 | 7 |
| Iserlohn | Germany | 94,536 | 3,167 | 215.2 | 72 | 20 | 9 |
| Heilbronn | Germany | 131,653 | 3,737 | 335.7 | 67 | 17 | 16 |
| Ilford | England | 168,168 | 4,224 | 731.9 | 75 | 9 | 16 |
| Bournemouth | England | 183,491 | 4,412 | 459.3 | 75 | 16 | 9 |
| Kassel | Germany | 204,021 | 4,653 | 652.9 | 69 | 18 | 12 |
| Greenwich | England | 285,000 | 5,499 | 1277.6 | 71 | 13 | 16 |
| Mannheim | Germany | 310,000 | 5,735 | 1043.4 | 66 | 19 | 14 |
| Frankfurt am Main | Germany | 701,350 | 8,000 | 1657.8 | 59 | 18 | 24 |
| Leeds | England | 766,399 | 8,000 | 2161.2 | 68 | 16 | 16 |
| Birmingham | England | 1,036,878 | 8,000 | 2403.0 | 66 | 18 | 15 |
| Köln | Germany | 1,069,200 | 8,000 | 1797.3 | 57 | 23 | 20 |
| München | Germany | 1,505,036 | 8,000 | 2078.7 | 65 | 23 | 12 |
| Hamburg | Germany | 1,862,565 | 8,000 | 1695.5 | 56 | 26 | 18 |
| Berlin | Germany | 3,769,962 | 8,000 | 2098.9 | 56 | 29 | 14 |
| London | England | 8,908,083 | 8,000 | 3088.3 | 71 | 12 | 17 |

## Appendix B: measurement script

Inputs: `places-<country>.json` from `area["ISO3166-2"="GB-ENG"]` or `area["ISO3166-1"="DE"]` (admin level 2 or 4), then
`node[place~"^(city|town|village|hamlet)$"](area.a);out;`. Run with `EP=<overpass url> OUT=results.jsonl bun measure.ts GB-ENG`;
the run is resumable and takes about 30 minutes per country on a congested public Overpass.

```ts
// Road length shares by OSM highway class, for settlements sampled by population decade.
// Usage: bun measure.ts  (reads places-*.json, writes results.jsonl, resumable)
import { existsSync, appendFileSync, readFileSync } from "node:fs";

const BINS = [0, 70, 700, 7_000, 70_000, 700_000, 1e12];
const PER_BIN = 6;
const DENSITY = 3000; // people per km² of built-up land, for the sampling radius
const ENDPOINTS = (process.env.EP ?? "https://overpass-api.de/api/interpreter").split(",");
const CLASSES = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street";

type Place = { id: number; lat: number; lon: number; name: string; pop: number; place: string; country: string };

const pop = (s?: string) => {
  if (!s) return NaN;
  const t = s.replace(/[ ,.]/g, "");
  return /^[0-9]+$/.test(t) ? +t : NaN;
};

function sample(country: string): Place[] {
  const d = JSON.parse(readFileSync(`places-${country}.json`, "utf8"));
  const all: Place[] = d.elements
    .map((e: any) => ({ id: e.id, lat: e.lat, lon: e.lon, name: e.tags.name ?? "?", pop: pop(e.tags.population), place: e.tags.place, country }))
    .filter((p: Place) => Number.isFinite(p.pop) && p.pop > 0)
    .sort((a: Place, b: Place) => a.id - b.id);
  const out: Place[] = [];
  for (let b = 0; b < BINS.length - 1; b++) {
    const inBin = all.filter((p) => p.pop >= BINS[b]! && p.pop < BINS[b + 1]!);
    const n = Math.min(PER_BIN, inBin.length);
    for (let i = 0; i < n; i++) out.push(inBin[Math.floor((i * inBin.length) / n)]!);
  }
  return out;
}

const radius = (p: number) => Math.min(8000, Math.max(250, 1000 * Math.sqrt(p / (Math.PI * DENSITY))));

function clipLen(ax: number, ay: number, bx: number, by: number, r: number): number {
  // Length of segment AB inside the circle of radius r round the origin.
  const dx = bx - ax, dy = by - ay;
  const a = dx * dx + dy * dy;
  if (a === 0) return 0;
  const b = 2 * (ax * dx + ay * dy);
  const c = ax * ax + ay * ay - r * r;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return 0;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-b - s) / (2 * a));
  const t1 = Math.min(1, (-b + s) / (2 * a));
  return t1 > t0 ? (t1 - t0) * Math.sqrt(a) : 0;
}

async function measure(p: Place, k: number) {
  const r = radius(p.pop);
  const q = `[out:json][timeout:300];way[highway~"^(${CLASSES})(_link)?$"](around:${Math.ceil(r)},${p.lat},${p.lon});out geom;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[(k + attempt) % ENDPOINTS.length]!;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(360_000), method: "POST", headers: { "User-Agent": "citymap-research/1.0" }, body: new URLSearchParams({ data: q }) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const d: any = await res.json();
      const len: Record<string, number> = {};
      const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180), ky = 110_540;
      for (const w of d.elements) {
        if (!w.geometry) continue;
        const cls = w.tags.highway.replace("_link", "");
        for (let i = 1; i < w.geometry.length; i++) {
          const g0 = w.geometry[i - 1], g1 = w.geometry[i];
          const l = clipLen((g0.lon - p.lon) * kx, (g0.lat - p.lat) * ky, (g1.lon - p.lon) * kx, (g1.lat - p.lat) * ky, r);
          if (l > 0) len[cls] = (len[cls] ?? 0) + l;
        }
      }
      return { ...p, r: Math.round(r), len: Object.fromEntries(Object.entries(len).map(([c, l]) => [c, Math.round(l)])) };
    } catch (e) {
      console.log(`retry ${p.name} ${attempt} ${(e as Error).message}`);
      await Bun.sleep(15_000 * (attempt + 1));
    }
  }
  console.log(`FAILED ${p.country} ${p.name}`);
  return null;
}

const OUT = process.env.OUT ?? "results.jsonl";
const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
const countries = process.argv.slice(2).length ? process.argv.slice(2) : ["GB-ENG", "DE"];
let k = 0;
for (const c of countries)
  for (const p of sample(c)) {
    k++;
    if (done.has(p.id)) continue;
    const m = await measure(p, k);
    if (m) {
      appendFileSync(OUT, JSON.stringify(m) + "\n");
      console.log(`ok ${c} ${p.name} pop ${p.pop} r ${m.r}`);
    }
    await Bun.sleep(3000);
  }
console.log("DONE");
```
