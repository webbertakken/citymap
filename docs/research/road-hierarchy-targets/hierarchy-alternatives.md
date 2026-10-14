# Road hierarchy: alternatives to mass-based reclassing

What should decide a road's class, and when may a laid road change class, so that the hierarchy reads right, meets
per-tier targets, takes no land the lots need, and moves no lots? This note compares five signals for the class (mass,
cut depth, land served, through-traffic, a fixed quota per town) and four timings for a change of class (in place,
at the next recut, a right of way reserved up front, paint only).

Companion note: [assertion design](assertion-design.md) (how targets are asserted). This note does not repeat it.

## Recommendation in brief

1. **Keep mass as the signal.** It is the land a road serves, weighted by land use. It is local, integer, cheap, and
   monotone: a child cut never outranks its parent. No alternative did better on all four criteria (table below).
2. **Change when a class takes effect.** A laid road takes a new class only when its own line is decided again: a
   fresh cut, a recut (outgrown or starved), or a forget (archetype switch or renewal). The ±25% band still says when a
   road *wants* a new class; the recut is when it gets one. Widening then lands at a moment when the lots beside the
   line are moving anyway.
3. **Make the starvation guard see road width.** `starved()` measures each side's land at width 0, so a road that
   widens in place takes land that no guard sees. Measuring the land each side actually gets after the road's width
   comes off makes any widening that starves a side trigger the recut, and so step 2.
4. **Targets per town tier, not per city, and asserted rather than enforced.** No classifier should be tuned per town
   to hit a share. A share is a property to check over aggregates (see the companion note), backed by structural rules
   that hold in a town of any size: a major road never ends on a lesser one, and a town's arterials are connected.

The main trade-off is that a road reaches its class late: up to one growth band (1.35×) after it crosses the reclass
threshold. HEAD shares drift a little below a fresh lay's, in exchange for no land taken behind the grids' backs.

## Method and its limits

Folds, stability runs and the bench were off limits (shared machine). Evidence comes from:

- **Existing outputs.** Full-history folds before reclassing (`/tmp/citymap-variants/*-before.json`, and for react the
  bundle at commit `4907219`) and after it (`~/.cache/citymap/render/product/*.json`,
  `/tmp/citymap-variants/react-reclass.json`). My road shares count town roads only, not highways. The brief's figures
  (react 65/17/18) include highways, so they differ by a point or two.
- **Fresh lays.** One lay with a fresh plat, warp off, at 8 points of history (30%, 40% … 100% of first-parent
  commits) for takken.io, livediagram and react, and at HEAD only for next.js and home-assistant. Each lay took 0.1 to
  11 s and peaked at 60 to 530 MB. A copy of the code in `/tmp/cm-hier` tags every road with its cut key, the mass of
  the land it divides, that land's area, its kind (cut, pinwheel, pinwheel cross cut, ring, spoke, grid) and whether it
  is a folder's first cut. The layout itself was not changed.
- **Offline reclassing.** Each rule reclasses the tagged cuts of a lay, keeping the geometry fixed (`/tmp/hier-research/rules.ts`).
  The land taken is Σ length × width over all roads, against the town's land. This is first order: a real lay under
  another rule would shift lines slightly.
- **Churn** stands in for reclass events. It is the share of cut keys present in two consecutive samples whose class
  differs. It counts net drift over about 10% of history per step, not oscillation, and leaves the ±25% band out. It
  ranks the rules; it is not a moved-lots figure.
- **Through traffic** is edge betweenness, by Brandes' algorithm, on the road graph of each lay (length-weighted
  shortest paths). Road ends are snapped to the nearest road within 130 fixed units, because T-junctions stop half a
  road width short of the centre line. A cut's score is the length-weighted mean over its edges.
- **T-violations** count cut ends that meet a road of a lower class: a major road ending on a minor one. Readers of a
  map see this as a hierarchy error.

Claims below are tagged: **verified** (how), **inferred** (from what) or **assumed**.

## What reclassing did, by town

Full-history folds, frozen classes (before) against the ±25% band (after). Shares are local/collector/arterial in %.
Verified with `shares.ts` and `towns.ts` over the JSON files listed above.

| Town (tier)                 | Before: shares | Before: no lot | After: shares | After: no lot | Wards before → after |
| --------------------------- | -------------- | -------------- | ------------- | ------------- | -------------------- |
| react `packages` (town)     | 97/3/0         | 60             | 76/17/7       | 47            | 4 → 10 (whole city)  |
| livediagram `apps/live` (town) | 86/9/4      | 8              | 67/24/9       | 36            | 6 → 19 (whole city)  |
| livediagram `packages` (town) | 94/6/0       | 3              | 85/8/6        | 4             |                      |
| takken.io (village)         | 100/0/0        | 2              | 91/9/0        | 2             | 0 → 2                |
| redux, game-ci-cli, studio-worker | unchanged | unchanged     | unchanged     | unchanged     |                      |

- All of livediagram's rise in files without a lot (15 → 44) is in `apps/live`: 8 → 36 (verified, per-town stats).
- With today's classes known from the start, a fresh lay of the same tree at HEAD seats every `apps/live` file (0
  without a lot) at 64/23/13 (verified, fresh lay). Old towns hold some files in the fold and none in a fresh lay, so
  the two are not identical. The gap still shows that the hierarchy itself fits the land. The lots are lost because
  roads widen under grids laid for narrower roads (inferred).
- Reclassing also re-seeds district tints. Collectors and up give each half its own seed (`split` in `cut.ts`), so
  wards went from 6 to 19 on livediagram and the map's colours changed widely
  (`/tmp/citymap-views/reclass-livediagram.png`). The moved-lots metric does not count this, but a reader sees it as
  change (verified: ward counts and image).

### Why widening starves lots unseen

- A folder's demand is its lot land plus a margin of half a **street** and the pavement on each side (`landFor`,
  `MARGIN = U / 2 + PAVEMENT`). It holds nothing for wider roads (verified, `tree.ts`).
- `split` clips each side by the road's full width (`clip(poly, r.n, r.c, width)`), but `starved()` measures each
  side at width 0 (`clip(poly, r.n, r.c, 0)`). A road widened in place takes `(new − old) / 2 × chord` from each side,
  and the guard never notices (verified, `cut.ts`).
- Grids are absolute and remembered. The strip a wider road takes falls on the outer row of cells, which may then drop
  under the 20% cell or 45% strip limits. Narrow, repark and regrid can only re-seat lots on the land that is left
  (inferred from the blueprint's neighbourhood steps). One widening costs only 1 to 3% of a side's area (16 to 40 fixed
  units deep against sides of 1,000 to 2,000), but it lands where the lots are.

## The alternatives

### Results

Fresh lays at HEAD, one row per town of tier village and up (the full list is in `/tmp/hier-research/results.txt`).
Cells give shares, then road land as a percentage of town land, then T-violations against cut ends.

| Town (tier, form)                   | mass (today)            | depth                | land served (share)   | quota by land served   | quota by betweenness  |
| ----------------------------------- | ----------------------- | -------------------- | --------------------- | ---------------------- | --------------------- |
| takken.io (village, polycentric)    | 88/12/0 · 21.3 · 3/26   | 88/12/0 · 21.3 · 3   | 60/40/0 · 24.2 · 2    | 88/12/0 · 21.3 · 3     | 86/14/0 · 21.5 · 1    |
| livediagram apps/help (village)     | 81/19/0 · 22.7 · 3/45   | 89/11/0 · 21.8 · 2   | 41/59/0 · 27.0 · 1    | 89/11/0 · 21.8 · 2     | 89/11/0 · 21.9 · 4    |
| livediagram apps/live (town)        | 64/23/13 · 27.1 · 4/94  | 71/22/6 · 25.1 · 2   | 52/30/18 · 29.1 · 0   | 67/23/10 · 26.3 · 1    | 66/24/10 · 26.3 · 7   |
| livediagram packages (town)         | 76/16/8 · 24.3 · 3/46   | 79/13/8 · 24.0 · 4   | 48/30/22 · 29.7 · 1   | 73/16/12 · 25.4 · 3    | 72/17/11 · 25.2 · 8   |
| livediagram apps/api (town, radial) | 62/25/13 · 28.6 · 0/22  | 59/28/13 · 28.9 · 0  | 25/38/38 · 37.1 · 0   | 62/29/9 · 28.0 · 1     | 58/31/11 · 28.7 · 6   |
| react (town, radial)                | 59/16/24 · 26.8 · 0/33  | 73/3/24 · 25.4 · 0   | 49/3/48 · 31.5 · 0    | 76/14/10 · 22.9 · 23   | 78/14/9 · 22.5 · 7    |
| react packages (town)               | 65/21/14 · 28.5 · 4/103 | 84/10/6 · 24.8 · 4   | 43/39/17 · 31.4 · 9   | 74/17/9 · 26.6 · 10    | 75/16/9 · 26.5 · 10   |
| next.js (town)                      | 86/11/3 · 26.9 · 12/821 | 95/5/0 · 25.3 · 11   | 82/12/6 · 28.1 · 11   | 78/13/9 · 29.2 · 13    | not computed          |
| next.js packages (city)             | 67/16/18 · 37.0 · 4/561 | 81/6/12 · 34.0 · 2   | 68/15/17 · 39.3 · 1   | 69/14/16 · 36.4 · 1    | not computed          |
| home-assistant (city)               | 79/13/8 · 37.4 · 6/3027 | 96/2/2 · 32.9 · 4    | 89/5/5 · 36.0 · 4     | 72/13/15 · 39.4 · 5    | not computed          |

Churn across the 8 samples: the share of cuts present in consecutive samples that change class.

| Rule                     | takken.io | livediagram | react  |
| ------------------------ | --------- | ----------- | ------ |
| mass                     | 0.0%      | 6.2%        | 8.3%   |
| depth                    | 0.0%      | 1.7%        | 3.3%   |
| land served (share)      | 12.7%     | 7.9%        | 21.5%  |
| quota by land served     | 7.9%      | 10.7%       | 10.7%  |
| quota by betweenness     | 22.2%     | 23.2%       | 32.2%  |

Spearman's rank correlation between mass classes and betweenness: 0.35 to 0.61 in polycentric towns, 0.20 in
apps/help, −0.38 in react's radial (verified, `rules.ts`).

Rule definitions, as tested:

- **mass**: `cutClass` as shipped. Tier of the divided land's mass, one class above for a folder's first cut. Ring takes
  the first class and spokes the others.
- **depth**: the town tier's first class, one class lower per nesting level (folder levels below the town plus binary
  cut levels within a folder).
- **land served**: the cut's land as a share of the town's land. ≥ 1/4 is arterial (town tier and up), ≥ 1/16 is
  collector (village and up), and anything smaller is local.
- **quota**: per town, rank the cuts by score and assign arterial, then collector, until each reaches the middle of the
  tier band proposed in the companion note (town 5 to 20% arterial, city 10 to 20%), never past its top.
- Two hybrids were also tested: **mass with depth decay** (one class lower per binary cut level within a folder) and
  **ring down** (a radial ring takes a non-first class).

### Judgement per alternative

**Mass (the current signal).** Readability is good: classes are monotone in the cut tree, with 0 to 4% T-violations,
mostly at pinwheel and grid ends. Wards follow folder weight, which is what a reader expects. Churn is moderate (6 to
8%). In towns, shares are near the targets with a collector surplus (16 to 25%). In cities it falls short:
home-assistant reaches 79/13/8. Thousands of small sibling folders yield deep binary cut trees, whose sub-cuts drop
below the tiers within two or three levels. Land is the baseline. Verdict: keep. The faults belong to timing and the
land budget, not to the signal.

**Cut depth ("frame first, frozen", [urban morphology § 9.5](../city-layout/urban-morphology.md)).** This is the most
stable rule (churn 1.7 to 3.3%), and it takes the least land. Readability is fine on deep folder trees. But a big flat
town is deep in *binary* cuts, not in folders, so arterials vanish: react packages 84/10/6, home-assistant 96/2/2,
next.js 95/5/0. Depth knows shape but not size, so a large folder at depth 2 reads like a small one. It changes class
only when the town's tier changes or the tree restructures. Verdict: reject as the signal. Its stability is worth
copying, and the timing policy below gets most of it without losing size.

**Land served (area share of the town).** As a relative share it overshoots badly (apps/api 38% arterial, react 48%,
apps/help 59% collector) and takes the most land (+2 to +8 points). Worse, every road's share shrinks as the town
grows. Every road then drifts down while new land drifts up, which gives the highest churn of the local rules (react
21.5%). An absolute area rule is just mass with docs and growth bands mixed in, and the band makes it noisier. Verdict:
reject.

**Fixed quota per town (rank-based, by land served or betweenness).** This hits the targets by construction: react
packages 74/17/9, home-assistant 72/13/15, next.js 78/13/9. But a rank is global. A newcomer anywhere can promote or
demote a road elsewhere, which breaks the spec's locality invariant ("a commit changes the city only in the folders it
touches"). Churn is 8 to 11% by land served and 22 to 32% by betweenness. Ranking also ignores the cut tree, so
hierarchy inversions appear: react 23 of 33 ends when the long radial ring falls past the arterial cap and its spokes
take its place. A quota is a controller tuned to the metric that judges it, so the share stops meaning anything.
Verdict: reject as a classifier. A quota belongs in the assertion, not the generator.

**Through traffic (betweenness).** This is the most faithful to what road classes mean in the real world, and its
quota hits targets as well as the area quota. But it can only be measured after the layout. Its class sets widths that
change the layout, so it is either a fixed-point iteration or paint without land. It is global (churn 22 to 32%), the
worst for locality. It is float-heavy (an integer Dijkstra would be needed for the integer core), and it costs O(V·E)
per lay. home-assistant has about 3,000 cut ends plus its grids, roughly 10⁸ to 10⁹ steps per commit over 70,000
commits. Its correlation with mass is only moderate (0.35 to 0.61). In radial towns the ring scores *low* (ρ = −0.38),
because the core's grid carries the shortest paths. Verdict: reject as a driver. It is worth keeping as a diagnostic
in the morphometrics report: "the arterials carry the through paths" is a fair readability check, and is not
time-critical.

**Hybrids.** Depth decay helps two towns (react packages 73/13/14, livediagram packages 79/13/8) and cuts churn a
little (5.1 to 5.8%). It halves home-assistant's arterials (92/3/5) and next.js's collectors (90/7/3). Ring down fixes
react's 24% arterial but pushes it to 27% collector. Neither is a clear gain. The radial ring is an archetype fact (the
ring alone is 38% of react's road length) and is best handled as an archetype allowance in the targets.

## Timing: when a new class takes effect

| Policy                                  | Land taken                         | Lots moved                  | Hierarchy at HEAD                 | Notes                                                    |
| --------------------------------------- | ---------------------------------- | --------------------------- | --------------------------------- | -------------------------------------------------------- |
| Frozen at birth (before)                | least                              | none from class             | under-classed (react 97/3/0)      | classes reflect the repository's age, not its size        |
| In place, ±25% band (now)               | silent, unguarded                  | lots lost at grid edges     | near a fresh lay                  | livediagram 15 → 44 without a lot; tints churn            |
| **At the next recut (recommended)**     | taken with the line's own move     | only those the recut moves  | lags by up to one growth band     | land and tint change land on an already-moving line       |
| Right of way reserved one class up      | +6 to +11 points road land         | none                        | as now                            | about a third more road land; streets read too wide       |
| Reserved only near a threshold          | +0 to +4.5 points                  | none                        | as now                            | land kept for roads that may never widen                  |
| Paint only (class drawn, width fixed)   | none                               | none                        | as now in colour                  | an avenue drawn one street wide misreads the width scale  |

Land figures are from fresh lays at HEAD (verified: road land recomputed with every cut one class up, and with only
cuts whose mass lies within 1.25× below or above a tier threshold widened).

### Why the recut is the right moment (inferred, from the cut rules)

- A remembered cut recuts when a side's demand passes 1.35× its demand at the last cut (`GROWTH_PCT`). A road wants
  to move up at 1.25× the tier threshold (`TIER_BAND_PCT`).
- A cut laid at mass m₀ below a threshold T must grow by 1.25 T / m₀ (> 1.25) before it wants a new class. When m₀ <
  0.93 T, which covers almost every cut, that growth already includes a recut, because newcomers join the side with
  more spare band and so both sides grow. Growth therefore always brings a recut. Deferring the class to the next recut
  delays it by at most one band: the road widens somewhere between 1.25 T and about 1.69 T of mass. That is still the
  right tier, and it adds a second layer of hysteresis for free.
- At a recut the line moves to today's split and both sides' grids re-seat. The lots that a widening would disturb sit
  beside that line, and they are moving anyway. Ward tints re-seed at the same moment, so colour change follows real
  change.
- Moving down: shrinking never causes an `outgrown` recut. A road on shrunk land stays wide until a starved recut, a
  renewal or a switch. This costs land only where land has been vacated, and moves nothing. Accepted.
- Gaps (assumed, to verify by fold): a cut whose growth all goes to one side while the other side is empty never
  recuts (caps rise only). It keeps its class, which is right while one side is empty, because no road is drawn.
  Pinwheel cross cuts and radial spokes have their own re-decide paths (a radial re-sector already re-lays every item).

### The guard fix

`starved()` should compare the land each side actually gets, `clip(poly, r.n, r.c, ROAD_WIDTH[r.cls])` and its mirror,
against its share of the demand. Today it compares land at width 0. With that change:

- Any loss of land from roads, whether from first-lay widths or a later class, is seen and answered by a recut. It is
  never left silently to the grid's edge rows.
- Under the deferred policy the recut is also where the new class lands. The two rules then hold each other up: a
  class change can only come with a recut, and a recut fixes any starvation the class causes.
- Optional refinement: `offsetFor` splits land by demand at the centre line, so a wide road takes proportionally more
  from the smaller side. Offsetting by demand plus each side's half of the road's width beyond a street would remove
  that bias (inferred; untested).

## Targets per tier: what the signal can reach

The mass rule gives hamlets no collectors and villages no arterials (`FIRST_CLASS`, `OTHER_CLASS`), so a whole-city
share cannot be held against the spec's urban band. livediagram's 79/15/6 is the correct outcome for a region of
hamlets, villages and three towns. Measured spreads at HEAD under the mass rule:

| Tier    | Towns measured                                 | Local    | Collector | Arterial                              |
| ------- | ---------------------------------------------- | -------- | --------- | ------------------------------------- |
| village | takken.io, apps/help, next.js bench, crates    | 63 to 88 | 12 to 37  | 0 by construction                     |
| town    | apps/live, packages ×2, apps/api, react, next.js | 59 to 86 | 11 to 25 | 3 to 24 (radial 13 to 24)             |
| city    | next.js packages, home-assistant               | 67 to 79 | 13 to 16  | 8 to 18                               |

This supports the companion note's per-tier bands, with two additions from this angle:

- **An archetype allowance for radial.** The ring is the archetype's defining road and is long: react's ring is 38% of
  its road length. Count it apart, or raise the arterial ceiling for radial towns, rather than demoting it.
- **Structural rules over shares** that hold in a town of any size and that the mass signal already almost meets:
  - No major road ends on a lesser one. Under mass this is 0 to 4% of cut ends today; its exceptions are worth fixing.
  - Arterials and collectors form one connected network per town.
  - Betweenness is reported, not asserted: the arterials should hold a large share of the town's through paths.

home-assistant's 8% arterial at city tier is the one real shortfall. Its cause is binary cut depth over thousands of
small siblings. Fixing it belongs in the classing of a polycentric folder's cut tree, for example a folder's first two
binary levels taking the folder's tier. That is a design fork, not a timing question, and is out of this note's scope.

## Trade-offs of the recommendation

- **Gains:** no land is taken behind a grid's back. Lot moves and tint changes from reclassing land only where a line
  moves anyway. The class signal stays local and integer, with the monotone hierarchy it has today. No new global
  computation.
- **Costs:** classes lag growth by up to one band, so a fold's HEAD shares sit a little below a fresh lay's: about
  2 to 4 points of collector or arterial in towns near a threshold (inferred from the fresh-lay vs fold gap; to be
  measured). Wide roads persist on shrunk land. Recuts may come slightly more often once `starved()` sees road width,
  which is a real move made visible where today there is a silent loss.
- **Not solved here:** city-tier arterial shortfall in very flat folders, and the radial ring's share. Both are forks
  for the spec.

## Validating this when the machine is free

One fold at a time, after the change in a scratch copy:

```bash
bun scripts/stability.ts ~/.cache/citymap/repos/livediagram 0 4000
bun scripts/stability.ts ~/.cache/citymap/repos/react 0 15000
```

Compare, against the frozen and in-place runs: files without a lot (livediagram expected to fall from 44 towards 15),
moved-per-commit, reclass and recut events per commit (`plat/reclass` should co-occur with `plat/recut` on the same
key), and the gap between the fold's HEAD shares and a fresh lay's.

## Reproduction

Scratch files, not committed: `/tmp/cm-hier` (a clone at `ef7878c`, with road tagging in `town/context.ts`, `cut.ts`
and `partition.ts`, plus `head-lay.ts`); `/tmp/hier-research` (`sample.sh`, `rules.ts`, `shares.ts`, `towns.ts`,
`results.txt`, and the dumps `s-<repo>-<k>.json`).
