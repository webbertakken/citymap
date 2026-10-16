# Toggles: corridor, archipelago, quarters and tiers

Derived from [ground plan](../ground-plan.md) § Toggles, Archetypes, Structure, Presentation. The research prototype
(`docs/research/city-layout/variants/town.ts`, `archetype.ts`, branch `research/archetypes`) defined the forms in
floating point; this blueprint restates them in the fixed-point core, on the product's cuts, rights of way and plat.
Modules: `packages/ground-plan/src/archetype/`, `src/town/{corridor,archipelago,quarters,waterway}.ts`, `src/roads.ts`.

## Domain and naming

| Spec term   | Identifier                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------- |
| toggle      | `Toggle` = `"corridor" \| "archipelago" \| "quarters" \| "tiers"`; `TOGGLES` in that order      |
| defaults    | `DEFAULT_TOGGLES` = `["corridor", "tiers"]`                                                     |
| package     | `isPackage(node)`: `node.member && node.massMille > 0 && 2 × node.sourceMille ≥ node.massMille` |
| corridor    | district form `"corridor"`; `corridor()` in `town/corridor.ts`                                  |
| wayside     | the items a corridor gathers into its faubourg                                                  |
| gateway     | the `CutRecord` at the corridor folder's path, wayside left, destination right                  |
| archipelago | district form `"archipelago"`; `archipelago()` in `town/archipelago.ts`                         |
| island      | an island item: a package's folder item, or a `group` item keyed `${path}#island${g}`           |
| mainland    | the folder's other items, one `group` item keyed `${path}#mainland` when there are two or more  |
| canal       | a `CutRecord` with `canal: true`; its water in `Town.canals`                                    |
| quarter     | a `quarter` item keyed `${path}#q${q}`; district form `"quarters"`                              |
| tier        | `Tier` = `"hamlet" \| "village" \| "town" \| "city" \| "metropolis"`; `TIERS`; `TownPlat.tier`  |

## Options and setting

- `Options.toggles?: readonly Toggle[]`, `DEFAULT_TOGGLES` when absent. `toggleList(options)` is `TOGGLES` filtered to
  those named: one canonical order, duplicates gone.
- `settingKey(options)` = `${landKey}|split:${groups}|toggles:${toggleList.join(",")}`; the default ends in
  `|toggles:corridor,tiers`, all off in `|toggles:`.
- `LayoutOptions.toggles?: readonly Toggle[]`, resolved as `Options.toggles` is; `layoutTown` keeps the canonical list
  in `Ctx.toggles`, which tells a rule whether it applies.
- The CLIs (`--toggles=`), the bench, the stability script and the viewer build `Options` with it; the plat's `setting`
  carries it, so `readLock` sets aside a lock for other toggles (`lock/ignored reason=setting`) and folds afresh.
- A town's locality cache constants gain `|toggles:${list}|tier:${tier}`, so a change of tier re-lays the town's
  folders.

## Tree

- `TreeNode.member: boolean`: the folder, or any folder its chain collapsed into it, is a workspace member.
  `TreeNode.sourceMille`: the mass of its subtree's source files (1,000 each).
- `TreeOptions.members: readonly string[]`: `workspaceMembers(paths, snapshot.workspaces)`, the region's member folders.
  `treeOf` keeps a built tree only while the member list is the same array.
- A node's digest content gains `member` (`1` or `0`), after `demand`.

## Classify

`features(massMille, childMasses, lots, extra?)` gains, when its toggle is on (else 0):

- `packages`: child folders that are packages; `packageMille`: their mass, ‰ of the folder's (floor).
- `neffMille`: `floor(M² × 1000 / Σ m²)` over the child masses and the own mass `M − Σ children`, in BigInt (Rust
  `u128`); 0 when `M = 0`.

District rules, in priority order, each with its toggle (if any), margin (‰), stay and challenge:

| Form        | Toggle      | Margin                                                        | Stay | Challenge |
| ----------- | ----------- | ------------------------------------------------------------- | ---- | --------- |
| corridor    | corridor    | `min(s1 − 900, 99 − f0)`                                      | 50   | 20        |
| archipelago | archipelago | `min(floorDiv((packages − 3) × 1000, 3), packageMille − 500)` | 150  | 100       |
| radial      |             | `s1 − 600`                                                    | 150  | 100       |
| twin        |             | `min(s2 − 300, s1 + s2 − 750)`                                | 150  | 100       |
| quarters    | quarters    | `min(floorDiv(neffMille − 7000, 7), 250 − s1)`                | 150  | 100       |

`districtForm(f, previous, toggles)` keeps the rules whose toggle is on (or have none):

1. No previous, or a flat one: the first rule with margin ≥ 0, else polycentric.
2. Else `i` is the incumbent's index (polycentric: the rule count). The first rule before `i` with margin ≥ its
   challenge wins; else the incumbent while its margin ≥ −stay (polycentric always); else the first rule after `i` with
   margin ≥ its challenge, else polycentric.

With every toggle off the rules are radial and twin, as before. `s1 ≥ 900` floors exactly at 90 %; `f0 ≤ 99` is under 10
%. `classifyNode(node, previous, toggles)` passes the toggles through; the region's root form is classified with the
same toggles.

## Tiers (`archetype/tier.ts`, `roads.ts`)

- `TIER_MASS_MILLE` = 30,000, 300,000, 3,000,000, 30,000,000. `FIRST_CLASS` and `OTHER_CLASS` gain a fifth entry, the
  metropolis's, equal to the city's (boulevard, avenue): `cutClass` and `reclass` lay exactly what they did.
- `coldTier(mass)`: thresholds at or below `mass`. `townTier(mass, previous)`: `previous ?? coldTier(mass)`, then up
  while `mass × 100 ≥ TIER_MASS_MILLE[t] × TIER_BAND_PCT` and down while
  `mass × TIER_BAND_PCT < TIER_MASS_MILLE[t − 1] × 100`.
- `layoutTown`, with tiers on: `tier = townTier(root.massMille, plat.tier)`, stored in `TownPlat.tier` as its name; a
  change logs `plat/tier key from to`. The rule handed down is `TierRule { tier, reach }`,
  `reach = coldTier(root mass × GROWTH_PCT / 100)` (the tier at the top of the town's band, never below `tier`).
- A cut is the town's first when it is a folder's first cut (`first`) and its key is the root's path.
- `classOf(mass, first, townFirst, rule?)`: without a rule `cutClass(mass, first)`; the town's first
  `FIRST_CLASS[rule.tier]`; any other `lesser(cutClass(mass, first), OTHER_CLASS[rule.tier])`.
- `reclassOf(cls, mass, first, townFirst, rule?)`: without a rule `reclass(…)`; the town's first
  `FIRST_CLASS[rule.tier]`; any other `lesser(reclass(cls, mass, first), OTHER_CLASS[rule.tier])`.
- `rightOfWayFor(mass, first, townFirst, rule?)`: without a rule, and for the town's first, `reserveFor(mass, first)`;
  any other `lesser(reserveFor(mass, first), OTHER_CLASS[rule.reach])`. Since `tier ≤ reach`, a fresh cut's class never
  exceeds its right of way.
- `lesser` is the smaller by `ROAD_CLASSES` order.
- Callers: `decide` (fresh class and right of way, reclass, recut right of way), the radial's ring (`first`, the town's
  first at the root) and spokes, the corridor's gateway (never first), and the street village's high street
  (`lesser("collector", OTHER_CLASS[rule.tier])`). `roadExcess` in the tree keeps the mass rule.

## Decide

`decide(ctx, items, poly, massMille, first, key, how = {})`, where `how` holds the optional `forced` normal, `assign`
(fixed sides), `share`, `fixed` (a fixed road class) and `water` (`"river"` or `"canal"`):

- Fresh: class `fixed ?? classOf(…)`; right of way the class itself for water or a fixed class, else `rightOfWayFor(…)`;
  `river: true` or `canal: true` by `water`.
- Remembered: a river, a canal or a fixed class keeps its class; others take `reclassOf(…)`. A recut sets the right of
  way the same way as a fresh cut.
- The twin passes `assign` and `water: "river"` (its bytes unchanged); pinwheels `forced` and `share`; `split` `share`.

## Items

`Item` gains two kinds: `group` (`key`, `demand`, `massMille`, `firstSeen`, `items`), laid by
`split(items, poly, massOf(items), false, key, district)` in age order; and `quarter` (the same fields), laid by
`quarter()`. A group's or quarter's `demand` and `massMille` are its items' sums, `firstSeen` their least. `wards` finds
the heaviest folder among a side's folders and the folders inside its groups and quarters.

## Corridor (`town/corridor.ts`)

`corridor(ctx, node, items, poly, district)`, tried first for a folder classified corridor; false declines to `split`:

1. Walk the chain from `items`: the heaviest folder item (ties to the earlier) is the next level; the level's other
   items join the wayside. When `classifyNode(next, plat.forms[next.path], toggles)` is corridor, the level joins the
   chain: a previous form other than corridor logs `plat/switch` and forgets `next.path`;
   `plat.forms[next.path] = "corridor"`; the walk continues with `itemsOf(next)`. Otherwise that heaviest item is the
   destination. A level without folders, or an empty wayside, declines.
2. The gateway at `key = node.path`: a remembered record whose right side is not exactly the destination, or whose line
   no longer crosses the land, logs `plat/corridor-destination key from to` and forgets `key`.
3. Fresh: `dl = demandOf(wayside)`, `dr = destination.demand`; start `floorDiv(unitMille(seed#gate) × GATE_STEP, 1000)`
   with `GATE_STEP = TURN / GATE_DIRECTIONS` (128); for k in 0..32, `n = dir(start + k × GATE_STEP)`,
   `c = offsetFor(poly, n, dl, dl + dr)`; the chord of least squared length wins, ties to the lower k. The record: class
   `classOf(mass, false, false)`, right of way `rightOfWayFor(mass, false, false)`, left the wayside's keys, right
   `[destination.key]`, caps `grow(dl)`, `grow(dr)`; logs `plat/gateway key destination wayside`.
4. Remembered: wayside keys not on either side are appended to `left`, then
   `decide(ctx, [...wayside, destination], poly, mass, false, key, { share })` reclasses and recuts it as any cut
   (`share` is the corridor's land, doubled, and its demand).
5. Draw the gateway (`carriageway`), wards when it is a collector or more, then clip at its right of way: the faubourg
   `clip(poly, n, c, w)`, the destination's land `clip(poly, −n, −c, w)`.
6. Each chain level records a district over the whole `poly`: its path, name, depth, mass, form corridor, not a ward.
7. The faubourg: `split(order(wayside by (firstSeen, key)), faubourg, massOf(wayside), false, key>L, d)`, with
   `d = seedKey(key>L)` for a major gateway, else `district`; the destination: `place(land, destination, d')` with
   `key>R`.

## Archipelago (`town/archipelago.ts`)

`archipelago(ctx, node, items, poly, district)`:

1. `packages`: the folder items whose node `isPackage`; fewer than 2 declines.
2. Islands: the packages, or with more than `ISLAND_CAP` (12), `islandGroups()`. The mainland: the other items, as one
   `group` (`${path}#mainland`) when two or more.
3. `canals(order(islands + mainland by (firstSeen, key)), poly, mass, first = true, node.path, district)`.

`canals(items, poly, mass, first, key, district, fair?)` mirrors `split`: its share as `split`'s;
`decide(…, { share, water: "canal" })`; one item is placed with `district`; a side left empty lends its land as in
`split`; else `waterway(poly, rec, first ? RIVER : CANAL, canals)` and each side recurses as `key>L`, `key>R`, clipped
at the water's width, with its own district seed `seedKey(sub)`. No pinwheels, no wards.

`islandGroups(ctx, node, packages)`: an island closes when `weight × ISLAND_CAP ≥ Σ packages' mass`. Fresh: in item
order, close and start anew; a remainder is the last island; logs `plat/islands key islands`. Remembered
(`plat.islands[path]`): gone keys drop, an island keeps its index; each newcomer joins the last island unless it has
closed, else founds the next (`plat/island-founded key island`). Islands of one package are that package's item, of two
or more a `group` keyed `${path}#island${g}`, empty ones none.

`waterway(ctx, poly, rec, width, into)` (`town/waterway.ts`, the twin's river moved out): the band
`c ± width / 2 × DIRECTION` pushed to `into`; one bridge, a street `width + 4 × PAVEMENT` long across the middle of the
chord, or two at a third and two thirds when the chord is longer than 12 u. The twin calls it with `RIVER` into `water`.

## Quarters (`town/quarters.ts`)

`quarters(ctx, node, items, poly, district)`:

1. Eligible, in item order: the own `lots` item, and folder items with `demand ≤ QUARTER_LAND` whose
   `classifyNode(node, plat.forms[path], toggles)` is flat. Fewer than 2 declines.
2. Fresh (`plat.quarters[path]` absent): a quarter closes once its members' demand reaches `QUARTER_LAND`; a remainder
   whose demand × 1000 is under `QUARTER_TAIL_MILLE` × `QUARTER_LAND` joins the last quarter when there is one, else is
   the last quarter; logs `plat/quarters key quarters`. Remembered: gone or ineligible keys drop, a quarter keeps its
   index; each newcomer joins the last quarter while its demand is under `QUARTER_LAND`, else opens the next
   (`plat/quarter-opened key quarter`).
3. Quarter items for the non-empty quarters;
   `split(order(quarters + other items by (firstSeen, key)), poly, mass, true, node.path, district)`.

`quarter(ctx, poly, item, district)`: the heaviest folder among its items names a ward district (`path` the quarter's
key, its depth, the quarter's mass, form quarters, `ward: true`); `frame = longestEdge(poly.p)`; then
`frameSplit(items, poly, key, district, frame)`: its share as `split`'s; normal `frame` when the land's extent along it
is at least that across, else `perp(frame)`; `decide(…, { forced, fixed: "street", share })`; one item is placed; an
empty side lends its land; else a street along the chord and both sides recurse, clipped at a street's width.

## Plat and city

- `CutRecord.canal?: true`. `TownPlat.tier?: Tier`, `TownPlat.islands?` and `TownPlat.quarters?`
  (`Record<path, string[][]>`): present only while they hold something; `forget(path)` drops their owned keys and an
  emptied map.
- `Town.canals?: Pt[][]`, present only when the town has canals; warped like water (step 64), translated with the town,
  kept by old towns.
- `DistrictForm` gains corridor, archipelago and quarters (`FORMS` order: hamlet, street village, neighbourhood, radial,
  twin, polycentric, corridor, archipelago, quarters).
- Older plats parse unchanged (every new field is optional); their setting differs, so a lockfile laid before toggles is
  set aside and folded afresh.

## Presentation

- Each theme gains `canal` and `canalline`: Paper atlas `oklch(0.66 0.1 235)` and `oklch(0.52 0.1 235)`; Night atlas
  `oklch(0.38 0.1 240)` and `oklch(0.5 0.11 240)`; Beck `oklch(0.52 0.14 245)` and `oklch(0.4 0.12 245)`; Nolli noir
  `oklch(0.68 0.04 235)` and `oklch(0.55 0.05 235)`; Dracula `mix(background, #8BE9FD, 0.5)` and `0.8`.
- Form colours: corridor hue 95 (Dracula `#F1FA8C`), archipelago 200 (`#6272A4`), quarters 300 (`#BD93F9`).
- The SVG draws canals after water, `fill canal`, `stroke canalline`, the water's stroke width; the scene draws them in
  the water layer in the canal colour.

## Constants

| Name                   | Value                                     | Name                 | Value                  |
| ---------------------- | ----------------------------------------- | -------------------- | ---------------------- |
| `CORRIDOR_SHARE`       | 900 ‰                                     | `CORRIDOR_OWN`       | 100 ‰                  |
| `CORRIDOR_STAY`        | 50 ‰                                      | `CORRIDOR_CHALLENGE` | 20 ‰                   |
| `GATE_DIRECTIONS`      | 32                                        | `ISLAND_CAP`         | 12                     |
| `ARCHIPELAGO_PACKAGES` | 3                                         | `ARCHIPELAGO_COVER`  | 500 ‰                  |
| `CANAL`                | 96 (1.5 u)                                | `RIVER`              | 160                    |
| `QUARTERS_NEFF`        | 7,000 ‰                                   | `QUARTERS_MAX_SHARE` | 250 ‰                  |
| `QUARTER_BLOCKS`       | 24                                        | `QUARTER_TAIL_MILLE` | 400                    |
| `QUARTER_LAND`         | 24 × (BLOCK_SHORT + U) × (BLOCK_LONG + U) | `TIER_MASS_MILLE`    | 30 k, 300 k, 3 M, 30 M |

## Observability

| Event                       | When                                                                   |
| --------------------------- | ---------------------------------------------------------------------- |
| `plat/tier`                 | a town's tier changes (key, from, to)                                  |
| `plat/gateway`              | a corridor lays its gateway afresh (key, destination, wayside)         |
| `plat/corridor-destination` | a corridor's destination changes; the corridor re-lays (key, from, to) |
| `plat/islands`              | an archipelago groups its packages (key, islands)                      |
| `plat/island-founded`       | a newcomer founds an island (key, island)                              |
| `plat/quarters`             | a folder groups its quarters (key, quarters)                           |
| `plat/quarter-opened`       | a newcomer opens a quarter (key, quarter)                              |

## Errors and edge cases

- A form can reach a tree that no longer bears it: the region classifies a town's root over its old towns' files too.
  Then a corridor whose chain meets a level without folders, or has nothing beside the destination, declines to cuts; so
  does an archipelago with fewer than two packages, and quarters with fewer than two eligible items.
- A gateway's line always crosses its land: both sides ask a share of it, so `offsetFor` leaves each side some.
- An emptied island or quarter keeps its index and lays nothing.
- Every new plat field is validated by `parsePlat` (`plat/bad-shape`); unknown toggle names are rejected by the CLIs
  (`cli/usage`) and never reach the engine.

## Performance and limits

- A fresh gateway is 32 `offsetFor` bisections (about 40 clips each): once per corridor, then remembered.
- `neffMille` is one BigInt sum per classified folder with quarters on; the locality cache spares unchanged folders.
- Tiers add a tier test per cut; with all toggles off nothing new runs.

## Testing

- Classify: each toggle's margin at, above and below its threshold; each band (stay, challenge) for corridor,
  archipelago and quarters; every rule absent with its toggle off; `neffMille` exact against a brute force.
- Tiers: `townTier` cold, up and down at the band edges, metropolis; `classOf`, `reclassOf`, `rightOfWayFor` for the
  town's first and other cuts with and without a rule; a town with one top-class road; a street village's high street.
- Corridor: a chain of two, a destination change re-lays, newcomers join the faubourg, a recut when the destination
  outgrows its band, declines.
- Archipelago: islands with canals and bridges, mainland group, more than a dozen packages grouped and remembered, an
  island founded, an emptied island, declines; `isPackage` through a collapsed chain.
- Quarters: grouping with the tail rule, remembered membership, a newcomer opens a quarter, frame-square streets, the
  ward, declines.
- Setting: the key per toggle list, a lock for other toggles set aside; all toggles off lays the bytes of the engine
  before toggles (golden towns and the parity fixture unchanged with `toggles: []`).
- Rust: every test above ported; `bun run parity` with the defaults and with each toggle alone.
