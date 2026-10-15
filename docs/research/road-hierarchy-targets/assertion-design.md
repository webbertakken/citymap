# Assertion design for road hierarchy targets

How to make the morphometric targets (road length shares, blocks between collectors) enforceable and meaningful in
software, without flaky or brittle tests. Companion angle to the road reclassing question.

Evidence tags: **verified** (measured, with the command), **inferred** (reasoned from named code or data), **assumed**.

## Summary

- A road length share is a population statistic. It means something for a large network and nothing for a town of
  five roads, where one road is 25 to 100% of the length. Asserting the spec's 65-75 / 10-15 / 10-20 band per town is
  therefore brittle by construction, and asserting it per city is ill-defined until the population is pinned.
- The best reference is not a fixed band but **today's tree laid fresh** (a HEAD lay, no history). Fresh lays of react
  and livediagram land near the targets with almost no lot-less files; the folded cities drift from them and starve
  land. The gap between fold and fresh lay is the quantity that reclassing and every other plat rule should keep small.
- Recommended ladder, each check where it is deterministic and cheap enough:
  1. **Rules** as unit and property tests (CI, fail): class by tier, band hysteresis, hierarchy never inverts, no
     starved lots on ample land.
  2. **Golden morphometric summaries** (CI, reviewed diff, not a band).
  3. **Corpus HEAD lays on pinned path lists** (bench, fail on scale-aware bands per tier for aggregates large enough).
  4. **Corpus folds on pinned commit ranges** (bench, run on demand for layout changes, ratchet: fail when overflow,
     stability or fold-to-fresh divergence regress).
  5. **Report** every share per town, tier and form, with its granularity; the delta goes into the PR and
     `~/PR_RESULTS.md`. Shares alone never fail a small town.
- Targets are set **per tier** (by town mass), with **form signatures** asserted as structure (a radial has a ring,
  a twin a river), not as per-form share bands: the corpus holds one to three towns per form and tier cell, too few to
  calibrate a band.

## Evidence

All numbers come from existing city JSON (full-history folds) under `~/.cache/citymap/render/product/` (with
reclassing) and `/tmp/citymap-variants/` (`*-before.json`, `react-loops.json`: without reclassing), plus two HEAD lays
(react, livediagram; 155 and 197 ms, 84 and 106 MB peak). Scripts: `/tmp/citymap-assert/{shares,agg,wards,head}.ts`.
Length is the polyline length of each road in the city JSON (warped coordinates).

### 1. The population changes the answer (verified, `agg.ts`)

| City (with reclass) | All towns + highways | All towns | Live towns only |
| ------------------- | -------------------- | --------- | --------------- |
| react               | 66 / 20 / 14         | 66 / 18 / 15 | 65 / 17 / 18 |
| livediagram         | 87 / 10 / 4          | 83 / 12 / 5  | 79 / 15 / 6  |
| takken.io           | 94 / 6 / 0           | 94 / 6 / 0   | 91 / 9 / 0   |
| next.js             | 78 / 13 / 9          | 81 / 12 / 7  | 80 / 13 / 8  |

Local / collector / arterial and up, in %. The brief's figures match "live towns only". Old towns are kept whole and
are all local roads, so including them pulls every city towards local; highways add arterial length. A target without
a pinned population is not a target.

### 2. Granularity: one road can be the whole statistic (verified, `shares.ts`)

Largest single road as a share of its town's road length, live towns:

| Town                       | Roads | Lots  | Largest road | Shares (L / C / A) |
| -------------------------- | ----- | ----- | ------------ | ------------------ |
| livediagram/apps/router    | 1     | 7     | 100%         | 100 / 0 / 0        |
| livediagram/apps/api       | 4     | 43    | 60%          | 40 / 60 / 0        |
| next.js/crates             | 15    | 264   | 42%          | 58 / 42 / 0        |
| react (main, radial)       | 49    | 583   | 22%          | 45 / 17 / 39       |
| takken.io                  | 34    | 132   | 9%           | 91 / 9 / 0         |
| next.js/packages           | 333   | 3,479 | 9%           | 69 / 13 / 18       |
| react/packages             | 129   | 1,312 | 4%           | 76 / 17 / 7        |
| livediagram/apps/live      | 104   | 1,907 | 4%           | 67 / 24 / 9        |

A band 5 points wide (collector 10-15%) cannot be judged when one road weighs more than 5%: a single reclass jumps
the share across the whole band. In the product renders only 5 of 25 live towns have every road under 5%.

### 3. The tier decides whether arterials can exist (verified from data, inferred from `cut.ts`)

- Every live town under about 300 lots has 0% arterial, as `cutClass` gives an avenue only to land of mass ≥ 300,000 ‰
  (and `reclass` lifts it only at 375,000 ‰). takken.io's 0% is the rule working, not a defect.
- Town tier (300 to 3,000 lots): arterial 2 to 39%. Polycentric towns sit at 6 to 9% (react/packages, livediagram
  live and packages); radial towns spread widely (react 39%, game-ci-cli 21%, typescript 7%, next.js 2%), as the ring
  road takes the folder's first class and its length depends on the core's size.
- City tier (3,000 lots and up): one town, next.js/packages, at 69 / 13 / 18, inside the spec's band.
- Inferred scaling: within one tier the arterials are a fixed number of chords (length ∝ √area) while local streets
  grow with area, so arterial share falls roughly as 1/√lots inside a tier and jumps at each threshold. A single
  band cannot hold across tiers, nor across the width of one tier for small towns.

### 4. Fresh lay against fold (verified, `head.ts` + `agg.ts`)

| City        | Lay                          | Live L / C / A | Files without a lot |
| ----------- | ---------------------------- | -------------- | ------------------- |
| react       | HEAD lay (fresh plat)        | 71 / 19 / 10   | 0                   |
| react       | fold, before reclass (1)     | 79 / 8 / 14    | 65                  |
| react       | fold, with reclass           | 65 / 17 / 18   | 52                  |
| livediagram | HEAD lay (fresh plat)        | 71 / 20 / 9    | 10                  |
| livediagram | fold, before reclass         | 92 / 6 / 2     | 15                  |
| livediagram | fold, with reclass           | 79 / 15 / 6    | 44                  |

(1) `react-loops.json`, the variant without reclassing; its 65 lot-less files match the brief's before figure.

- The fresh lay of today's tree is close to the spec's local and arterial bands and starves almost nothing; collector
  share runs a little high (18 to 20%).
- Reclassing moves the fold towards the fresh lay's hierarchy, but on livediagram it nearly triples lot-less files,
  while the fresh lay of the same tree, with the same road classes, has 10. Inferred: the starvation is path
  dependence (roads widened beside remembered grids), not a cost the hierarchy itself demands.
- So "fold within tolerance of the fresh lay, and no worse on overflow" is a target any repository can meet,
  independent of size, and it encodes exactly the stability-versus-quality tension of problem 1.

### 5. A scale-free target already exists: blocks between collectors (verified, `wards.ts`)

The spec's Dimensions table asks for 3 to 8 blocks across between collectors. Measured as √(blocks in the smallest
ward holding each block):

| Town             | Fold before reclass             | Fold with reclass        | HEAD lay                 |
| ---------------- | ------------------------------- | ------------------------ | ------------------------ |
| react/packages   | 2 wards, 126 blocks in no ward  | 8 wards, 5 of 8 in band  | 12 wards, 6 of 11 in band |
| livediagram/live | 4 wards, 34 blocks in no ward   | 11 wards, 7 of 8 in band | 15 wards, 7 of 13 in band |

This is meaningful in a town of any size and shows reclassing's benefit more clearly than length shares do. Caveat
(verified): radial towns record no wards for their ring and spokes (react's folded main town: 16 collectors, 0 wards),
so the metric must be computed from the road graph (faces bounded by collector-or-larger edges), not from the plat's
`ward` districts.

## Options compared

| Check                                  | Guards                                  | Deterministic           | Brittleness                                    | Cost        | Verdict                                  |
| -------------------------------------- | --------------------------------------- | ----------------------- | ---------------------------------------------- | ----------- | ---------------------------------------- |
| Share bands on golden towns            | shares of 3 synthetic towns             | yes                     | high: towns of tens of roads, granularity      | < 50 ms     | no; snapshot the summary instead         |
| Golden morphometric summary snapshot   | any change, as a reviewed diff          | yes                     | none (changes are reviewed, not judged)        | < 50 ms     | yes, CI                                  |
| Property tests on rules                | class by tier, band, hierarchy, overflow | yes with a fixed seed  | low: rules are exact                           | ms per run  | yes, CI                                  |
| Property tests on shares               | shares of random towns                  | yes with a fixed seed   | high: random small towns are all granularity   | ms          | no                                       |
| Corpus HEAD lays, per-tier bands       | hierarchy at real scale                 | only on pinned inputs   | low if bands are scale-aware and aggregated    | ~0.2 s/repo | yes, bench (fail)                        |
| Corpus folds, ratchet vs baseline      | overflow, stability, fold-fresh drift   | only on pinned ranges   | low: compares with itself, not with ideals     | 20 s+/repo  | yes, bench on demand (fail on regress)   |
| Per-archetype share bands              | form-specific hierarchy                 | yes                     | high: 1 to 3 towns per cell, uncalibratable    | n/a         | no; assert form structure instead        |
| Report only                            | visibility                              | n/a                     | none, but easy to ignore                       | free        | yes, for everything not guarded above    |

Sources of flakiness here are not randomness (the integer core is deterministic, verified by the spec's invariant
and the golden tests) but **moving inputs**: the clones under `~/.cache/citymap/repos` change when fetched, so a
corpus check against live clones is not reproducible. Pinning removes that.

## Recommendation

### Metrics live in one pure module

`packages/ground-plan/src/morphometrics/`: pure functions over a `Town` or `City`, no I/O, each unit tested on tiny
hand-built cities.

- `lengthShares(towns)`: lane + street = local, collector, avenue and up = arterial. **Population pinned**: live towns
  only, highways and old towns excluded, length on the drawn (warped) geometry; spec states this.
- `granularity(towns)`: the largest single road's share; every share is reported with it.
- `collectorCells(town)`: faces of the road graph bounded by collector-or-larger edges, and blocks across each
  (√count). Computed from roads, so radial rings and spokes count.
- Counts: roads per class, boulevards per town, lot-less files (`stats.overflow`).
- Later, from the research list: orientation entropy, node degree, dead-end share, block shape factor.

The scope spec's "asserts them per archetype" is then honoured as: per **tier** bands for shares, per **form**
structural signatures.

### Layer 1: rules, CI, fail (unit and property tests)

Exact statements from the spec, cheap and never brittle. With `fast-check` (already a dev dependency) on a **fixed
seed** in CI; a separate local explore script may run random seeds and turn any counterexample into a fixed case.

- `cutClass` and `reclass` as pure properties: `reclass` is idempotent; monotone in mass; inside the band
  `[T ÷ 1.25, T × 1.25)` a class never flips (no flapping); outside it, `reclass` equals `cutClass`.
- Hierarchy never inverts: a road's class is at most the class of the first cut of its enclosing folder. Inferred
  counterexample worth a test: a parent laid at mass 290 keeps a collector until 375 under the band, while a child
  that freshly cuts at mass 310 gets an avenue, so the child outranks its parent (fresh cuts use `cutClass`, laid
  cuts `reclass`).
- At most one boulevard per town, as the spec claims. Inferred counterexample: a town root and a child both at mass
  ≥ 3,000,000 ‰ each take a boulevard first cut. Either the test or the spec sentence must change.
- No starved lots on ample land: a fresh lay of a generated tree with room ≥ 100% has `overflow = 0`, and a short
  generated growth sequence (≤ 20 commits, ≤ 300 files) folds to an overflow no larger than its fresh lay's. Sizes
  are kept small for the 200 ms test budget (inferred from react: 7,252 files in 155 ms, so a 300-file lay is a few
  ms). `fold.test.ts` already has a seeded generator to build on.

### Layer 2: golden morphometric summaries, CI, reviewed diff

Beside each golden JSON, a short `__golden__/<town>.metrics.txt` (shares, granularity, cells across, overflow) via
`toMatchFileSnapshot`. It never judges; it makes every layout change show its morphometric delta in review, in a
form a person reads in seconds. Add one golden per tier boundary (masses just below and above 300 and 3,000 files)
so reclass and tier behaviour have visible fixtures.

### Layer 3: corpus HEAD lays, bench, fail

- Inputs **pinned**: committed path lists (with first-seen order) for a fixed commit of each corpus repository, or
  a pinned commit per `Budget`. Path lists need no clone and no git, so the check reproduces anywhere. Only public
  repositories go in committed fixtures (the licence and privacy of livediagram and takken.io path lists is an open
  question for Webber).
- Grouped by tier of each town's mass; shares asserted only on the **tier aggregate** of all live towns in that tier
  across the corpus, and only when its granularity is under the band's half width; otherwise reported.
- Bands per tier, proposed from section 3 and 4 and to be recorded in `DEFAULTS.md` with provenance and a safe range:

| Tier (town mass)   | Local      | Collector | Arterial and up | Structural assertion                               |
| ------------------ | ---------- | --------- | --------------- | -------------------------------------------------- |
| hamlet (< 30)      | 100%       | 0         | 0               | no collector                                       |
| village (30-300)   | report     | report    | 0               | each folder ≥ village mass has a collector first cut |
| town (300-3,000)   | 60 to 80%  | 10 to 25% | 5 to 20%        | cells 3 to 8 blocks across for most cells          |
| city (≥ 3,000)     | 65 to 75%  | 10 to 15% | 10 to 20%       | as town; at most one boulevard (once settled)      |

  The city row is the spec's FHWA band, which describes whole urban networks; lower tiers widen it by the measured
  spread, as a town is the size of the 2 to 4 km² samples where real fabrics range from 39 to 90% local.
- Cells across: fail when fewer than half of a town's cells lie in 3 to 8, for towns with 4 or more cells.

### Layer 4: corpus folds, bench on demand, ratchet

Full folds are 20 s and more per repository, so they run on demand for any change to `town/`, `plat/` or constants,
on pinned commit ranges, one repository at a time. A committed baseline holds, per repository:

- lot-less files at the end, moved-per-commit (from `scripts/stability`), reclass and recut events per commit;
- the drift from the fresh lay: the largest of the three share differences between the fold and a HEAD lay of the
  same final tree.

A change fails when any guard regresses beyond its tolerance (overflow: more than max(2, 5%) above baseline;
stability: more than 0.5 points; drift: more than 3 points) unless the baseline is updated in the same commit with
the measured reason in the commit message. Shares may trade; guards may not. Under this gate the reclass commit would
have failed on livediagram (overflow 15 to 44) while passing on react (65 to 52), which is the signal problem 1 needs.

### Layer 5: report

`bun run bench --report` prints every live town's tier, form, shares, granularity, cells and overflow, and the delta
against the baseline. The delta is the "resulting value" recorded in the PR description and `~/PR_RESULTS.md`, so
targets that are not guarded still steer each change.

## Trade-offs

- **Tier bands, not per-town bands**: honest about granularity, but a single misbehaving small town can hide inside a
  healthy aggregate. Mitigated by the per-town report and the structural assertions, which do hold at small scale.
- **Fresh lay as reference**: makes targets meaningful for any size and turns stability into a measurable cost; but
  it assumes the fresh lay is good. It is only as good as layer 3 says, so both are needed.
- **Ratchet baselines**: catch regressions without inventing ideals, but freeze today's imperfections. Every
  out-of-band value stays listed in the report and in `AMBIGUITIES.md` until fixed, so the baseline records, never
  suppresses.
- **Pinned path lists**: reproducible and offline, but they age; refreshing them is a deliberate commit that shows its
  own metric delta.
- **Fold checks on demand, not in CI**: keeps CI fast and the machine free; a layout change could merge without them.
  The pre-push hook can require a fresh fold report when `town/`, `plat/` or `constants.ts` change.
- **No per-archetype share bands**: loses some specificity; radial towns, the widest spread in the corpus (2 to 39%
  arterial), would need their ring counted separately. Revisit once the corpus holds five or more towns per form and
  tier.

## Open questions

- Population: does the spec's length-share row describe live towns only (as recommended), or the whole city with old
  towns and highways?
- Committed corpus: may path lists of private repositories (livediagram, takken.io) be committed, or only public ones?
- The two inferred rule conflicts (child outranking parent under the band; two boulevards in one town): fix the code,
  or relax the spec sentence?
