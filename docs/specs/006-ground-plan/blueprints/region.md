# Region: towns, highways and old towns

Derived from [ground plan](../ground-plan.md) § Structure (outline, growth), Edges and open land, Archetype switch.
Reference: `docs/research/city-layout/variants/region.ts`. Module: `packages/ground-plan/src/region/`.

## Towns

1. Parts: the main town (key = repository name, root `""`, excluding every workspace group), then one town per workspace
   group (key `${name}/${group}`), groups by `(folderFirstSeen, compareKeys)`.
2. Files held by a part's old towns are excluded from its tree.
3. Root form: classified over the whole part (old towns' files included) with `plat.rootForms[key]` as previous. A
   change that is not between two neighbourhood forms is an **archetype switch** (below).
4. Parts with zero demand are skipped.

## Outline and growth

- Growth: when `area2 = 0` or the demand exceeds `cap2`, `area2 = max(area2, demand × 2)`, `cap2 = demand × 2 × 1.35`
  (log `plat/grow` after the first).
- Radius: `isqrt(area × 113 / 355) × 108 / 100`.
- Outline: an irregular octagon, vertex k at angle step `k × 512 + 256`, radius jitter
  `(unitMille(key#rk) − 500) × 120 / 1000` ‰, scaled so its area2 equals the town's `area2` (`isqrt` of the ratio, in
  ‰).

## Placement

- `GAP` = 720 (11.25 u). A centre is clear when its distance to every placed town and old town is at least the sum of
  radii plus `GAP × 6 / 10`.
- A remembered centre stays; if not clear, it moves outward along its own direction in `GAP / 2` steps.
- A new main town starts at the origin; if not clear (old towns), outward along angle step
  `unitMille(key#new) × TURN / 1000`.
- A new group town i (1-based among n groups) starts at angle step
  `−TURN/4 + (i − 1) × TURN / n + unitMille(key) × TURN / 2513`, at the main town's radius + its own + `GAP`, then
  outward until clear.
- Distances compare squared, so no square roots.

## Highways

- Each group town joins the main town; each old town joins its successor.
- End candidates per town: road ends at least 80 % of the town's reach from its centroid (all ends when none). A town
  without roads first gains an approach street from its outline vertex nearest the other town to its centroid.
- Class: the highest class both towns offer at their candidates. Gates: the closest pair of candidates of that class
  (squared distance; ties by the earlier road).
- Highways are densified (step 80) and bent by the region warp (seed `fnv1a(name) ^ 0x51ed27`, octave `[240, 5600]`)
  with the bend faded by `sin`-free weight `4i(n − i) / n²` (‰), so both ends meet their roads exactly.

## Archetype switch and old towns

- On a switch, the part's last laid town (`plat.last[key]`, the warped geometry) is frozen as an old town where it
  stood: name `"${name} old town"` (then `old town 2`, …), `old: true`. Its member map holds, per lot key, the lot's
  share members (or the key itself).
- The part's `TownPlat` is reset to empty; its tree is rebuilt without the old towns' files.
- Each frame, an old town's lot is vacant unless one of its members is alive.
- `plat.last` is runtime state: it is not serialised. The lockfile stores old towns whole.

## Stats

`CityStats`: towns, lots, overflow, offLand, docs, lot coverage (‰ of land), road length share per class (‰), long
straight roads (roads whose straight run is at least 45 % of their town's diameter).
