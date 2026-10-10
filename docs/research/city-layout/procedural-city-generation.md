# Procedural city and floorplan generation: techniques for a folder-tree city

Research angle: how games and research generate believable cities and floorplans, judged by one question:
can a **hierarchical input** (a folder tree) drive it **deterministically** and **stably**, while the result
still looks like a real, organic city with a road graph and addressable parcels?

Scope is the ground plan only (districts, blocks, parcels, streets, plazas, water, parks). Buildings come later.

Verification legend: **[verified]** read in the primary source or source code during this research;
**[secondary]** taken from a reputable secondary source that cites the primary; **[unverified]** from
memory or inference, not confirmed in a primary source here.

---

## 1. Summary

- Almost every celebrated city generator is **growth-driven or field-driven** (L-systems, agents, tensor
  streamlines, Voronoi relaxation). They are deterministic given a seed, but **not stable**: one changed input
  perturbs a single global random stream or a global optimisation, and the whole map shifts.
- The methods that **are** naturally stable and tree-controllable are **recursive subdivision** methods:
  Parish and Müller's lot splitting, Vanegas et al.'s OBB parcels, squarified or ordered treemaps, Marson and
  Musse's treemap floorplans. Vanegas et al. state outright that recursive OBB subdivision "is very stable in
  the sense that localized changes in the block geometry will typically only affect the parcels nearby", and
  that they compute child seeds before recursing to preserve this ([Vanegas et al. 2012](https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf)) **[verified]**.
- A folder tree **is** a recursive subdivision. So the backbone should be a **name-ordered, path-seeded,
  slack-padded recursive partition**, whose **cut lines become roads** (ranked by tree depth) and whose
  **leaves become blocks and parcels**.
- "Organic" should be a **separate, smooth, deterministic geometry layer** on top of a stable topology:
  a domain warp / tensor-orientation field, Townscaper-style irregular-grid relaxation, curved street
  smoothing and noise-jittered split ratios seeded per node. A smooth function of position moves things a
  little when inputs change a little; a growth simulation does not.
- Macro archetypes (hamlet, street village, radial old town, gridiron, polycentric islands) are best chosen
  from **tree-shape metrics with hysteresis**, and each archetype only changes the **first one or two levels**
  of the partition; everything below uses the same block and parcel machinery.
- Use WFC, zoning grids and Voronoi wards as **dressing and macro options**, not as the backbone.

A small experiment (section 5) on 40 sibling folders shows the stability/aspect trade-off concretely:
size-sorted squarified layout moved 13 of 40 parcels when one folder tripled in size; a name-ordered binary
split moved 1.

---

## 2. The evaluation lens

For each technique:

| Criterion | What we need |
|---|---|
| Determinism | Same input bytes produce identical geometry, across runs, machines and (ideally) TS and Rust |
| Stability | Adding, removing or growing a few files or folders changes only the local neighbourhood |
| Tree control | The folder hierarchy maps onto the method's own structure, not bolted on |
| Output | A road graph (nodes, edges, hierarchy) and addressable parcels (polygons with an id and street frontage) |
| Complexity | Implementation and runtime cost at 10 to 100 000 leaves |
| Implementations | Open source code, licence, maturity |

Two determinism facts apply to everything below:

- A **single global PRNG stream** couples every decision to every earlier decision. Insert one element and
  every later draw changes. Watabou's generator uses one global Park-Miller LCG (`seed = seed * 48271 % 2147483647`)
  ([Random.hx](https://github.com/watabou/TownGeneratorOS/blob/master/Source/com/watabou/utils/Random.hx)) **[verified]**;
  ProbableTrain's MapGenerator calls `Math.random()` in 12 places, so it is not even seedable
  ([source](https://github.com/ProbableTrain/MapGenerator/tree/master/src/ts/impl)) **[verified]**.
  The remedy is **per-node seeds derived from a stable key** (the folder path), computed before recursion.
- ECMAScript specifies `Math.sin`, `Math.cos`, `Math.acos` and friends as **"implementation-approximated"**
  ([ECMA-262, Math object](https://tc39.es/ecma262/multipage/numbers-and-dates.html)) **[verified]**, so
  bit-identical output across browsers and a future Rust port needs either our own trig/noise routines or
  quantisation of outputs (for example to 1/1024 world unit) before anything depends on them.

---

## 3. Techniques

### 3.1 Parish and Müller, "Procedural modeling of cities" (SIGGRAPH 2001), CityEngine lineage

**How it works** **[verified]** ([paper PDF](https://cgl.ethz.ch/Downloads/Publications/Papers/2001/p_Par01.pdf), [DOI](https://doi.org/10.1145/383259.383292)):

- Inputs are image maps (water, elevation, population density, zoning) plus scalars (block size, max bridge length).
- An **extended, self-sensitive L-system** grows roads. Two external functions steer it:
  `globalGoals` proposes parameters (highways seek population peaks by casting rays and sampling density;
  streets follow a superimposed pattern), `localConstraints` adjusts or rejects proposals
  (intersect, snap to a nearby crossing, extend to meet a road, avoid water, become a bridge if short enough).
- Named pattern rules: **basic** (follow density, "natural growth"), **New York** (checkers grid with max block
  length and width), **Paris** (radial around a centre), **San Francisco** (follow least elevation).
  They note radial patterns dominate monocentric cities and rasters polycentric ones.
- Blocks are found from the road graph and **recursively split along the longest approximately parallel edges
  until under a threshold area**; lots that are too small or lack street access are discarded.
- Demonstration city: about 26 000 buildings.

**Assessment**

- Determinism: yes with a seeded RNG. Stability: **poor**. Growth is order-dependent and greedy; a segment
  rejected or accepted early changes every later collision. Tree control: none natively; a tree could only
  influence density maps. Output: excellent road graph plus blocks and lots. Complexity: moderate, needs a
  spatial index for constraint checks.
- The **lot subdivision** part is the reusable gem: recursive, local, tree-shaped.
- Implementations: CityEngine is commercial (Esri). Open re-implementations below (3.2).

### 3.2 Priority-queue road growth (Citygen, t-mw/citygen, Martin Evans)

**How it works** **[verified]**: a priority queue of candidate segments seeded with one segment; pop, run local
constraints (may modify or reject), accept, then push follow-ups from global goals with a delay
([Martin Evans, "Road Generation"](https://martindevans.me/game-development/2015/12/11/Procedural-Generation-For-Dummies-Roads/)).
t-mw's TypeScript demo uses concrete parameters: segment length 300 (highway 400), branch probability 0.4
(highway 0.05), road snap distance 50, minimum intersection deviation 30 degrees, 2000-segment limit,
and seeds the global `Math.random` via `seedrandom(String(seed), { global: true })`
([config.ts](https://github.com/t-mw/citygen/blob/master/src/config.ts), [generate.ts](https://github.com/t-mw/citygen/blob/master/src/city-gen/generate.ts)) **[verified]**.
Kelly and McCabe's Citygen lets users draw primary roads and grows secondary roads with a snap radius
([phiresky survey](https://github.com/phiresky/procedural-cities/blob/master/paper.md)) **[secondary]**.

- Determinism: yes (seeded). Stability: **poor**, same reasons as 3.1. Tree control: weak.
- Output: road graph; blocks need a face-finding pass.
- Licence: t-mw/citygen MIT ([LICENSE](https://github.com/t-mw/citygen/blob/master/LICENSE)); live demo
  [tmwhere.com](http://tmwhere.com/city_generation.html). phiresky's survey and demo are AGPL
  ([LICENSE.md](https://github.com/phiresky/procedural-cities/blob/master/LICENSE.md)).
- Verdict: good reference for **local constraint rules** (snapping, min angle) when we connect districts
  with highways; not a backbone.

### 3.3 Chen et al., "Interactive procedural street modeling" (SIGGRAPH 2008): tensor fields

**How it works** **[verified]** ([PDF](https://www.sci.utah.edu/~chengu/street_sig08/street_sig08.pdf), [DOI](https://doi.org/10.1145/1360612.1360702)):

- A 2D symmetric tensor field; major and minor eigenvector fields are perpendicular, matching the
  observation that street networks have two dominant directions.
- Design elements (grid with angle, radial centre, boundary-aligned fields from water and parks, brush
  strokes, rotation and noise fields) are blended: `T(p) = sum_i exp(-d * |p - p_i|^2) * T_i(p)`, with `d` a
  decay constant. Laplacian smoothing reduces degenerate points.
- Streets are **hyperstreamlines** traced with an adapted Jobard and Lefer evenly-spaced streamline method
  ([Jobard and Lefer 1997](https://doi.org/10.1007/978-3-7091-6876-9_5)), major roads first, then minor roads
  per region. A city takes about five minutes of user design.

**Open implementation** **[verified]**: ProbableTrain/MapGenerator, TypeScript, LGPL-3.0, about 1 460 stars,
last pushed 2024 ([repo](https://github.com/ProbableTrain/MapGenerator), [docs](https://maps.probabletrain.com)).
Basis fields `Grid(centre, size, decay, theta)` and `Radial(centre, size, decay)`; streamline defaults
`dsep 20`, `dtest 15`, `dstep 1`, `dlookahead 40`, `seedTries 300`; polygon-finder for blocks and
recursive lot division with `minArea` 50 to 80 ([main_gui.ts](https://github.com/ProbableTrain/MapGenerator/blob/master/src/ts/ui/main_gui.ts), [basis_field.ts](https://github.com/ProbableTrain/MapGenerator/blob/master/src/ts/impl/basis_field.ts)).
It uses unseeded `Math.random()`, so it is not deterministic as shipped.

**Assessment**

- Determinism: achievable if seeded. Stability: **medium-poor**. The field itself is a smooth sum of local
  kernels, so moving one design element changes the field mostly nearby (good). But streamline **placement**
  is greedy and order-dependent: one new streamline shifts the seed queue and every later line.
- Tree control: a tree can place basis fields (one per district, orientation from a path hash), which is
  a natural fit for **orientation**, not for **topology**.
- Output: road graph (streamline intersections), blocks via face finding, lots via subdivision.
- Verdict: **use the field, not the tracer.** A tensor/orientation field derived from the district tree is
  an excellent way to give each neighbourhood its own grain (grid angle, radial centre) and to bend
  straight partition cuts into plausible curves. Licence note: LGPL code can be studied; we would write our own.

### 3.4 Vanegas et al., "Procedural generation of parcels in urban modeling" (Eurographics 2012)

**How it works** **[verified]** ([PDF](https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf), [DOI](https://doi.org/10.1111/j.1467-8659.2012.03047.x)):

- Two parcel styles found in real cities:
  - **Straight-skeleton subdivision**: compute the straight skeleton of the block, recover alpha-strips
    (one per street edge), fix corner triangles into beta-strips, then slice strips with rays cast from the
    street. Every parcel has street access; an optional inner offset contour yields a perimeter block with a
    central courtyard. Suits residential blocks.
  - **OBB subdivision**: fit a minimum oriented bounding box, split along its minor axis, recurse until
    shape attributes hold. Suits large or inner regions.
- Attributes per block: parcel area bounds `Amin, Amax`, width bounds `Wmin, Wmax`, split irregularity
  `omega in [0,1]` (deviation of a split from the midpoint), street-access requirement.
- Stability design, quoted: random seeds "for the child parcels of a given parcel are computed before the
  recursive call", splits snap to block contour vertices within a threshold, and "recursive OBB subdivision
  is very stable in the sense that localized changes in the block geometry will typically only affect the
  parcels nearby".
- **Parcel consistency under editing**: parcels before and after an edit are matched using generalised
  barycentric coordinates of their position within the block (after [Meyer et al. 2002](https://doi.org/10.1080/10867651.2002.10487551)),
  so customisations survive edits.

**Assessment**

- Determinism: yes. Stability: **good by design**, and the paper names the exact tricks we need.
- Tree control: the recursion is a binary tree; we can make it **our** tree (each split separates sibling folders).
- Output: parcels with street frontage, the very thing addressable plots need.
- Complexity: straight skeletons are fiddly; an MIT TS/WASM implementation exists
  ([StrandedKitty/straight-skeleton](https://github.com/StrandedKitty/straight-skeleton), npm `straight-skeleton` 3.0.0, MIT) **[verified metadata, untested]**.
  Martin Evans implemented OBB parcelling and describes brute-force OBB fitting over each edge, O(edges^2)
  ([Lot Subdivision](https://martindevans.me/game-development/2015/12/27/Procedural-Generation-For-Dummies-Lots/)) **[verified]**.
- Verdict: **adopt both styles** for the block-to-parcel level; adopt the **parcel matching** idea for
  "old vs new" and construction-site overlays across commits.

### 3.5 Watabou: Medieval Fantasy City Generator (MFCG) and Village Generator

**MFCG, open-source version** **[verified]** ([TownGeneratorOS](https://github.com/watabou/TownGeneratorOS), GPL-3.0, Haxe/OpenFL; the README says it lacks newer features such as water bodies):

- Seeds `nPatches * 8` points on a **spiral**: angle `a = sa + sqrt(i) * 5`, radius `r = 10 + i * (2 + rand)`;
  builds a Voronoi diagram; Lloyd-relaxes the central few cells; sorts patches by distance to centre. The
  first patch may be the plaza, patch `nPatches` may be the citadel; the first `nPatches` are inside the walls
  ([Model.hx](https://github.com/watabou/TownGeneratorOS/blob/master/Source/com/watabou/towngenerator/building/Model.hx)).
- Walls along the inner patches' circumference with gates; **streets are shortest paths on the Voronoi edge
  graph** from each gate to the plaza, then smoothed; outer roads continue beyond the gates.
- Ward types (Market, Cathedral, Castle, Patriciate, Merchant, Craftsmen, Slum, Park, Farm, Gate, Military,
  Administration) are assigned by per-type `rateLocation` scoring.
- Each ward polygon is subdivided by `createAlleys`: **cut the longest edge** at a ratio jittered by
  `gridChaos`, recurse until `minSq`, randomly leave some empty (`emptyProb` 0.04); outskirts are thinned by
  distance to roads ([Ward.hx](https://github.com/watabou/TownGeneratorOS/blob/master/Source/com/watabou/towngenerator/wards/Ward.hx)).
- Failure handling: `build()` is retried in a loop until it does not throw (for example "Bad citadel shape"
  when compactness < 0.75). Deterministic for a seed, but a retry silently consumes the stream.

**Current MFCG and Village Generator**: closed source, actively developed (MFCG 0.11.x with district view,
alleys view, forests in 2024; Village Generator 1.6.x with numbered houses and crossroads), outputs free to
use including commercially, exports JSON and a 3D City Viewer
([MFCG itch.io](https://watabou.itch.io/medieval-fantasy-city-generator), [Village itch.io](https://watabou.itch.io/village-generator)) **[verified]**.
The Village Generator's algorithm is **not publicly documented** in anything found here **[unverified]**.

**Assessment**

- Determinism: yes per seed. Stability: **poor globally** (single stream, retries, relaxation), **but two
  ideas are stable by construction**:
  - The **spiral index**: point `i` depends only on `i` (and its own jitter), so **appending** cells at the
    end never moves earlier cells. An outward-growing city with a fixed core is exactly "neighbourhoods grow in place".
  - **Voronoi locality**: inserting a site only changes cells of its Delaunay neighbours (the cavity property
    behind [Bowyer-Watson insertion](https://en.wikipedia.org/wiki/Bowyer%E2%80%93Watson_algorithm)). Lloyd
    relaxation breaks that locality, so relaxation must be bounded (few iterations, local only).
- Tree control: sites can be tree nodes (one site or a cluster per district); ward-type scoring maps well to
  folder "kinds" (tests, docs, config, generated, vendor).
- Output: road graph (Voronoi edges), blocks, building lots. Very recognisable "old town" look.
- Verdict: **the best visual reference for a radial/organic archetype.** Borrow spiral seeding, edges-as-streets,
  gate-to-centre shortest-path arteries and longest-edge alley cutting; do not borrow the global RNG or retries.

### 3.6 Red Blob Games (Amit Patel): grids, Voronoi and map structure

**[verified]**

- [Polygon map generation](http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/):
  random points, Lloyd relaxation, Voronoi/Delaunay dual graph; the graph (centres, corners, edges) is the map's
  data model. Patel later replaced Voronoi corners with **Delaunay triangle centroids**, which are always
  inside their triangles and look rounder and more cellular, at the cost of less consistent sizes and
  non-guaranteed convexity ([Alternatives to Voronoi diagrams](https://www.redblobgames.com/x/1721-voronoi-alternative/)).
- [Grid parts and relationships](https://www.redblobgames.com/grids/parts/): coordinate systems for faces,
  edges and vertices on square, hex and triangle grids. This is the right mental model for **addressable
  parcels, street edges and junctions** as first-class ids.
- [Hexagonal grids](https://www.redblobgames.com/grids/hexagons/): cube and axial coordinates, rings and
  spirals; a hex spiral gives an integer, append-stable placement order for districts.
- [mapgen4](https://github.com/redblobgames/mapgen4) (Apache-2.0, about 925 stars): a production example of
  dual-mesh map generation in the browser.

Verdict: adopt the **dual-mesh / half-edge data model** and stable integer ids; consider centroid cells for
an organic macro look.

### 3.7 Oskar Stålberg, Townscaper: irregular quad grid

**How it works** **[verified]**, in Stålberg's own words: "create a regular triangular grid, randomly join
triangles into quads, subdivide everything into quads, and then relax!" followed by "Fairly even irregular
quads grid in a hex" ([tweet 1](https://twitter.com/OskSta/status/1147778221058023424), [tweet 2](https://twitter.com/OskSta/status/1147881669350891521), July 2019).
Talks: [Organic towns from square tiles, IndieCade Europe 2019](https://www.youtube.com/watch?v=1hqt8JkYRdI),
[Beyond Townscapers, SGC 2021](https://www.youtube.com/watch?v=Uxeo9c-PX-w),
[WFC in Bad North, EPC 2018](https://www.youtube.com/watch?v=0bcZb-SsnrA).
An independent write-up uses Poisson-disc points, Delaunay, merging triangles into convex quads (angles
0.2 pi to 0.9 pi), subdividing, then per-quad "squaring forces" with a closed-form best-fit square
([andersource](https://andersource.dev/2020/11/06/organic-grid.html)) **[verified]**.

**Assessment**

- Determinism: yes with seeded merges. Stability: **good locally** if the grid is generated per chunk with
  chunk-seeded merges and relaxation pinned at chunk borders (hex chunks tile). Relaxation is iterative
  but local (each vertex moves towards neighbours), so effects decay with distance **[inference]**.
- Tree control: none intrinsic; it is a **substrate**. A district can claim a contiguous set of cells
  (cells are addressable), which yields organic but grid-snapped parcels.
- Output: a quad mesh; every quad is a parcel candidate, every edge a potential street.
- Verdict: **excellent for the micro scale and for 3D walking** (tiles map to quads with marching-squares-style
  modules, as Townscaper does). Good option for small archetypes (hamlet, courtyard) where hand-made charm matters.

### 3.8 Wave Function Collapse (WFC) and model synthesis

**[verified]** ([mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse), MIT, about 25 000 stars):

- Overlapping model (NxN patterns from a sample) and simple tiled model (adjacency rules). Lowest-entropy
  heuristic picks the next cell. It can hit contradictions; the README notes deciding satisfiability is NP-hard,
  though contradictions are rare in practice. `Model.Run(seed, limit)` is seeded.
- Karth and Smith frame WFC as greedy, non-backtracking constraint solving
  ([FDG 2017](https://escholarship.org/uc/item/1f29235t)). Merrell's **model synthesis** predates it and
  includes **modifying the model in parts** to reduce failures ([Merrell and Manocha 2011](https://doi.org/10.1109/tvcg.2010.112)).
- DeBroglie (C#, MIT) adds non-local constraints such as path connectivity ([repo](https://github.com/BorisTheBrave/DeBroglie));
  [WFC explained](https://boristhebrave.com/2020/04/13/wave-function-collapse-explained/).

**Assessment**

- Determinism: yes per seed. Stability: **poor globally** (propagation is global; one changed cell can flip
  distant choices); **acceptable** when solved per small chunk with frozen borders (model-synthesis style).
- Tree control: only via pre-constrained cells. Output: tiles, not a road graph.
- Verdict: **decoration only**: park interiors, waterfront edges, plaza paving, street furniture, within
  regions whose shape and topology are already fixed by the layout.

### 3.9 Agent-based and simulation-based growth

- Lechner, Watson, Wilensky et al. (2003): developer agents grow roads and land use over time
  ([summary in phiresky survey](https://github.com/phiresky/procedural-cities/blob/master/paper.md)) **[secondary; primary PDF not located]**.
  A 2006 land-use follow-up exists ([DOI](https://doi.org/10.1145/1179622.1179778)).
- Weber, Müller, Wonka and Gross, "Interactive geometric simulation of 4D cities" (2009): fully geometric
  simulation (exact parcels, arbitrary street orientation, building envelopes) at about 1 second per time step
  ([DOI](https://doi.org/10.1111/j.1467-8659.2009.01387.x)) **[verified abstract]**.
- Groenewegen et al. (2009) generate layout from urban land-use models
  ([PDF](https://publications.tno.nl/publication/21506495/6b7med/groenewegen-2009-procedural.pdf)) **[verified exists]**.

Assessment: deterministic if seeded; **stability poor** (chaotic, order-dependent); tree control weak.
But the **time** axis is philosophically attractive: if we **replay git history** as growth events, a city
that grew with the repo would be stable by definition (history does not change). That is exactly
Steinbrückner and Lewerentz's approach for software cities (3.12). Cost: requires history, and two repos
with identical trees but different histories give different cities, which conflicts with "same input,
same map" unless history is declared part of the input. See open questions.

### 3.10 SimCity / Cities: Skylines zoning grids

- Cities: Skylines attaches **zone blocks to road segments**, aligned to the road angle; cells are 8 m;
  vanilla blocks are 4 cells deep and up to 8 cells long; the zone grid is bucketed in 64 m cells
  (visible in a MIT mod's detour of `ZoneBlock`: [ZoneBlockDetour.cs](https://github.com/boformer/GrowableOverhaul/blob/master/GrowableOverhaul/ZoneBlockDetour.cs)) **[verified via mod code]**.
- SimCity (2013, GlassBox) also used road-attached zoning **[unverified]**.

Assessment: deterministic, **stable** (zones are a pure function of the road they hang off), output is
road-frontage parcels. Verdict: **the right model for file parcels along a street**: once a street exists,
parcels are a quantised strip of fixed depth along each side, filled in name order. This is also what
SoftVis3D's evostreet layout does in spirit (3.12).

### 3.11 Mini Motorways and Islanders: simplification as style

- Mini Motorways: the player draws roads on a tile grid while the city grows and changes
  ([Steam](https://store.steampowered.com/app/1127500/Mini_Motorways/)); Islanders: "minimalist" city building
  on colourful islands ([Steam](https://store.steampowered.com/app/1046030/ISLANDERS/)) **[verified descriptions]**.
- Design lessons **[inference]**: few colours per land use, a single road class with clear junctions, islands
  as natural district boundaries, generous negative space. Islanders shows that water between islands makes
  polycentric structure legible without explicit labels, a strong fit for monorepos (apps and packages as
  islands, bridges as dependencies).

### 3.12 Floorplans and treemaps: a city is a floorplan at a larger scale

- **Squarified treemaps** (Bruls, Huizing, van Wijk 2000) optimise aspect ratio by greedily laying rows
  of size-sorted items ([DOI](https://doi.org/10.1007/978-3-7091-6783-0_4), [PDF](https://www.win.tue.nl/~vanwijk/stm.pdf)) **[verified exists]**.
  Excellent shapes, **unstable** because of the size sort.
- **Ordered treemaps** (Shneiderman and Wattenberg 2001) keep input order to trade aspect for stability
  ([DOI](https://doi.org/10.1109/INFVIS.2001.963283)) **[verified exists]**.
- **Stable treemaps via local moves** (Sondag, Speckmann, Verbeek 2018): instead of recomputing, the layout
  is updated with local modifications, giving direct control over stability and provably better quality than
  previous stable methods ([DOI](https://doi.org/10.1109/tvcg.2017.2745140), [PDF](https://pure.tue.nl/ws/files/90606317/StableTreemapCorrected.pdf)) **[verified abstract]**.
  Note: local-move methods are **path-dependent** (they need the previous layout), which conflicts with pure
  "same input, same map" unless the previous layout is an input.
- **Voronoi treemaps** (Balzer and Deussen 2005) subdivide arbitrary polygons, giving organic district
  shapes ([DOI](https://doi.org/10.1109/INFVIS.2005.1532128)) **[verified abstract]**; iterative weighted
  centroidal relaxation makes them **globally coupled and unstable** unless warm-started **[inference]**.
- **Marson and Musse 2010**, "Automatic real-time generation of floor plans based on squarified treemaps
  algorithm": adapts squarified treemaps to house floorplans with semantic room information; claims robustness,
  flexibility, simplicity and real time; open access CC BY 3.0 ([DOI](https://doi.org/10.1155/2010/624817)) **[verified abstract]**.
  From memory: rooms are grouped hierarchically into social, service and private zones, laid out by treemap,
  then a **corridor** is inserted to connect rooms lacking access, and doors are placed **[unverified; full text blocked]**.
  The corridor step is the floorplan analogue of **inserting streets between parcels**: exactly our problem.
- **Software cities**: CodeCity uses districts per package ([Wettel and Lanza 2007](https://doi.org/10.1109/vissof.2007.4290706));
  Steinbrückner and Lewerentz's **EvoStreets** lay a package as a street with sub-packages as side streets and
  files as plots, and grow it from development history so layouts "incrementally evolve in a very smooth and
  stable way" ([DOI](https://doi.org/10.1145/1879211.1879239)) **[verified abstract]**.
  SoftVis3D delegates to `codecity-visualizer` (MIT): districts use a lightmap bin-packer **sorted by base size
  descending**, and evostreets distribute branches left/right by sorted size
  ([npm](https://www.npmjs.com/package/codecity-visualizer), [SoftVis3D LayoutProcessor](https://github.com/stefanrinderle/softvis3d/blob/master/softvis3d-frontend/src/services/layout/LayoutProcessor.ts)) **[verified in package source]**.
  Size sorting is a direct cause of reshuffling when a file grows.

---

## 4. Comparison matrix

| Technique | Deterministic | Stable under small change | Tree-driven | Road graph | Parcels | Complexity | Open code (licence) |
|---|---|---|---|---|---|---|---|
| L-system growth (Parish, Müller) | seeded | poor | no | yes | yes (lots) | medium | CityEngine commercial |
| Queue road growth (Citygen) | seeded | poor | weak | yes | via faces | low-medium | t-mw/citygen (MIT) |
| Tensor field + streamlines (Chen) | seedable | field good, tracing poor | orientation only | yes | via faces | medium-high | MapGenerator (LGPL-3.0) |
| Recursive OBB parcels (Vanegas) | yes | **good** | **yes** | via cut edges | **yes** | medium | none official; ideas in Martin Evans' blog |
| Straight-skeleton parcels (Vanegas) | yes | good | per block | frontage | **yes** | high | straight-skeleton (MIT) |
| Voronoi wards (Watabou) | seeded | local if unrelaxed | via sites | yes (edges) | yes | medium | TownGeneratorOS (GPL-3.0) |
| Irregular quad grid (Townscaper) | seeded | good per chunk | substrate | edges | quads | medium | write-ups only |
| WFC / model synthesis | seeded | poor (chunked: fair) | no | no | no | medium | WFC (MIT), DeBroglie (MIT) |
| Agent / simulation | seeded | poor | weak | yes | yes | high | research only |
| Road-attached zoning (C:S) | yes | **good** | per street | uses existing | **yes** | low | game; mod code MIT |
| Squarified treemap | yes | poor (size sort) | **yes** | no | rectangles | low | d3-hierarchy (ISC) |
| Ordered / slice treemap | yes | **good** | **yes** | cut edges | rectangles | low | d3-hierarchy (ISC) |
| Stable local-move treemap | needs prior layout | **very good** | yes | no | rectangles | medium | research code |
| EvoStreets | yes | good (history) | **yes** | **yes** (tree) | yes | low | codecity-visualizer (MIT) |

---

## 5. Experiment: stability of size-sorted versus name-ordered partition

Bun script, 40 sibling folders with heavy-tailed sizes (seeded mulberry32), unit square 1000 x 1000,
a parcel counts as "moved" if its centre shifts more than 25 units. Squarified per Bruls et al.; ordered is a
recursive binary split of the **name-sorted** list at the weight midpoint, cut across the longer side.
(Script kept at `/tmp/pcg-research/exp/stability.ts`, not in the repo.)

| Scenario | Squarified: parcels moved / mean shift | Name-ordered split: moved / mean shift |
|---|---|---|
| Add one small folder | 14 / 31.5 | 6 / 10.4 |
| Grow one folder x3 | 13 / 29.9 | 1 / 3.3 |
| Remove one folder | 8 / 14.3 | 0 / 1.4 |
| Mean aspect (max side / min side) | 1.31 | 2.68 |

Reading: ordering by a stable key cuts movement by an order of magnitude; the price is elongated parcels.
Elongated parcels are not a defect in a city: they are **street-frontage strips** (3.4, 3.10). The fix for
aspect is to **split into strips along streets** rather than to sort by size.

Additional mitigations, not yet measured:

- **Slack (growth reserve)**: allocate area from a quantised size (for example `ceil(log_{1.25}(weight))`),
  so a folder only claims more ground when it crosses a bucket boundary; leave reserve parcels as empty lots,
  parks or construction sites. Hysteresis (grow at bucket `k+1`, shrink only below `k-1`) stops flicker.
- **Anchored order**: the first split decision at each level is fixed by the sorted names, so a new folder
  inserts **between** neighbours and only perturbs the split it lands in.

---

## 6. Synthesis: a pipeline for a folder-tree city

The philosophy in one line: **topology from the tree, geometry from smooth fields, charm from local noise.**
Like a river delta, the channels (topology) are set by the land; the meanders (geometry) are set by soft
forces; the sediment (noise) is local.

### 6.1 Layers

1. **Normalise the tree.** Stable keys = normalised paths. Weight = a quantised size bucket (files, lines or
   bytes, owner's choice). Classify node kinds (source, tests, docs, config, generated, vendor, assets)
   for land use. Collapse single-child chains (`src/main/java/com/acme`) into one "long avenue" so Java-style
   depth does not create empty districts.
2. **Archetype selection** from tree-shape metrics, with hysteresis (section 6.3). The archetype only decides
   **levels 0 to 1** of the partition (macro form).
3. **Macro form** (per archetype):
   - *Polycentric islands*: one island per top-level group (`apps/*`, `packages/*`), placed on an
     append-stable **hex spiral** in name order (3.6), separated by water; bridges and highways connect
     islands along dependency edges using shortest paths on the island adjacency graph with Citygen-style
     snapping rules (3.2).
   - *Radial old town*: Watabou-style spiral sites (3.5), one or more per top-level folder in name order,
     unrelaxed or 1 to 2 local Lloyd iterations; arteries as gate-to-centre shortest paths on Voronoi edges.
   - *Gridiron*: name-ordered recursive split with a dominant grid angle per district from a path hash.
   - *Street village / hamlet*: one EvoStreet spine (3.12) with road-attached parcels (3.10).
4. **Meso partition** (all archetypes): each district polygon is recursively split **between sibling folders
   in name order** (Vanegas OBB style with snapping, 3.4). **Every cut is a street**; its rank is the tree
   depth of the split (depth 0 avenue, 1 street, 2 lane, deeper alleys). This yields a planar road graph with
   a natural hierarchy for free, stored as a half-edge structure
   ([Martin Evans, half-edge geometry](https://martindevans.me/game-development/2016/03/30/Procedural-Generation-For-Dummies-Half-Edge-Geometry/)).
5. **Micro parcels**: leaf blocks become parcels by **straight-skeleton strips** (frontage on every street,
   optional courtyard) for residential-feel folders and **OBB** for large inner areas, filled in name order
   (3.4, 3.10). Parcel id = `(folder path, frontage street id, ordinal)`.
6. **Organic geometry layer** (pure function of position plus per-node seeds):
   - Split ratios jittered within `omega` (Vanegas) by a hash of the node path, never by a shared stream.
   - A smooth **domain warp** (low-frequency simplex or a Chen-style tensor/rotation field built from district
     centres and orientations) bends straight cuts into gentle curves; streets are then smoothed as Watabou does.
   - Optional Townscaper relaxation for small archetypes and for the 3D walking mode (3.7).
7. **Dressing**: plazas at district centroids or junctions of high rank; parks and water from reserve slack
   and from non-code folders; WFC or rule tiles inside fixed regions only (3.8).
8. **Diff and overlays**: Vanegas-style parcel matching (barycentric position within block) between two
   commits drives "old versus new", strangler and construction-site views (3.4).

### 6.2 Determinism and stability rules

- Per-node seed = `hash(path)`, e.g. a 64-bit FNV-1a or xxHash of the normalised path, computed **before**
  recursion (Vanegas). No global RNG; one PRNG instance per node, consumed in a fixed order.
- Order siblings by name (locale-independent, code-point order), never by size.
- Sizes affect only area, through quantised buckets with hysteresis.
- No retry loops that consume randomness (Watabou); failures fall back deterministically (for example reduce
  `omega` to 0, then switch from skeleton to OBB).
- Quantise coordinates and avoid engine `Math.sin`/`Math.cos` in anything that feeds topology (2.).
- Golden tests: snapshot the road graph and parcel ids for fixture repos; property tests that a single add,
  remove or grow moves at most `k` parcels outside the affected subtree.

### 6.3 Archetype choice from first principles (hypothesis to validate)

| Tree shape signal | Archetype | Rationale |
|---|---|---|
| Fewer than about 20 files, depth at most 2 | Hamlet / courtyard | A single street or square suffices |
| One dominant chain, siblings off a spine | Street village (EvoStreet) | Linear growth along one road |
| One dominant root with many balanced children | Radial old town | Monocentric cities trend radial (Parish and Müller) |
| Many similar-sized siblings, shallow | Gridiron | Planned, polycentric density trends raster (Parish and Müller) |
| Two or more heavy top-level groups (`apps/`, `packages/`, workspaces) | Polycentric islands | Separate centres, joined by bridges |

Signals: Gini coefficient of top-level weights, entropy of child counts, depth, presence of workspace
manifests (`package.json` workspaces, `Cargo.toml` workspace, `pnpm-workspace.yaml`). Hysteresis bands
prevent flipping when a metric hovers at a threshold.

---

## 7. Ranked recommendation

1. **Backbone: name-ordered, path-seeded, slack-padded recursive partition (Vanegas OBB + Parish/Müller lot
   splitting + ordered treemap), with cuts as ranked streets.** Only family that is tree-shaped, deterministic,
   locally stable and yields both road graph and parcels. Low to medium complexity; no licence risk.
2. **Parcels: straight-skeleton strips and road-attached zoning (Vanegas skeleton + Cities: Skylines zone
   strips + EvoStreets plots).** Gives every file a frontage address, natural for games and walking.
3. **Organic layer: smooth deterministic warp or tensor/orientation field (Chen field, not tracer) plus
   Watabou-style street smoothing and jittered split ratios.** This is what makes it look like a city.
4. **Macro archetypes: hex-spiral islands for monorepos; Watabou spiral-Voronoi for radial old towns;
   EvoStreet spine for hamlets.** All three are append-stable when seeded per node.
5. **Townscaper irregular quad grid** for small archetypes and the 3D walk mode; chunked, border-pinned.
6. **WFC / rule tiles** for parks, water edges and plazas inside fixed regions only.
7. **Not as backbone**: L-system or queue road growth, streamline tracing, agent simulation, size-sorted
   squarified or iterated Voronoi treemaps. They are deterministic yet reshuffle under small change.
   History-replay growth (EvoStreets with history) is the one exception worth keeping as a future mode.

Building blocks in TypeScript: `d3-delaunay` 6.0.4 (ISC) and `delaunator` 5.1.0 (ISC) for Voronoi/Delaunay;
`straight-skeleton` 3.0.0 (MIT); `polygon-clipping` 0.15.7 (MIT) or `clipper2-js` 1.2.4 (Boost) for polygon
booleans and offsets; `simplex-noise` 4.0.3 (MIT) for warps (versions read from the npm registry; latest at
time of research, untested here). Rust equivalents exist for a later port (`delaunator`, `clipper2`)
**[unverified versions]**.

---

## 8. Open questions for the owner

1. **What is "the input"?** Only the current tree (pure function), or tree plus the previous layout or git
   history (enables stable local-move treemaps and history-grown EvoStreets, but two identical trees could differ)?
2. **Weight metric**: files, lines of code, bytes, or a blend? It sets district areas and how often bucket
   boundaries are crossed.
3. **Stability budget**: what counts as acceptable? For example "a single add, remove or 2x growth moves no
   parcel outside its parent folder's district, and at most 10 % inside it".
4. **Ordering key**: alphabetical is stable but semantically arbitrary; would a pinned manual order or
   dependency-aware order (core near centre) be preferred, accepting extra rules?
5. **Archetype switching**: when the repo crosses a threshold (say `src/` becomes `apps/` + `packages/`), is a
   full re-layout acceptable, or should the old town be preserved as one island of the new polycentric city?
6. **Visual target**: medieval organic (Watabou), modern gridiron (MapGenerator), toy minimalism
   (Islanders / Mini Motorways), or Townscaper tiles? This picks the default archetype palette and the warp strength.
7. **Cross-platform determinism**: must TS and a future Rust build produce bit-identical maps, or is
   "identical topology and ids, near-identical geometry" enough?
8. **Non-code folders** (docs, assets, vendor, generated): parks, water, industrial zones, or excluded?

---

## 9. Sources

Papers

- Parish, Müller, Procedural modeling of cities, SIGGRAPH 2001: https://cgl.ethz.ch/Downloads/Publications/Papers/2001/p_Par01.pdf , https://doi.org/10.1145/383259.383292
- Chen, Esch, Wonka, Müller, Zhang, Interactive procedural street modeling, SIGGRAPH 2008: https://www.sci.utah.edu/~chengu/street_sig08/street_sig08.pdf , https://doi.org/10.1145/1360612.1360702
- Jobard, Lefer, Creating evenly-spaced streamlines of arbitrary density, 1997: https://doi.org/10.1007/978-3-7091-6876-9_5
- Vanegas, Kelly, Weber, Halatsch, Aliaga, Müller, Procedural generation of parcels in urban modeling, Eurographics 2012: https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf , https://doi.org/10.1111/j.1467-8659.2012.03047.x
- Weber, Müller, Wonka, Gross, Interactive geometric simulation of 4D cities, 2009: https://doi.org/10.1111/j.1467-8659.2009.01387.x
- Lechner et al., Procedural modeling of urban land use, 2006: https://doi.org/10.1145/1179622.1179778
- Groenewegen et al., Procedural city layout generation based on urban land use models, 2009: https://publications.tno.nl/publication/21506495/6b7med/groenewegen-2009-procedural.pdf
- Merrell, Manocha, Model synthesis: a general procedural modeling algorithm, 2011: https://doi.org/10.1109/tvcg.2010.112
- Karth, Smith, WaveFunctionCollapse is constraint solving in the wild, FDG 2017: https://escholarship.org/uc/item/1f29235t
- Bruls, Huizing, van Wijk, Squarified treemaps, 2000: https://doi.org/10.1007/978-3-7091-6783-0_4 , https://www.win.tue.nl/~vanwijk/stm.pdf
- Shneiderman, Wattenberg, Ordered treemap layouts, 2001: https://doi.org/10.1109/INFVIS.2001.963283
- Sondag, Speckmann, Verbeek, Stable treemaps via local moves, 2018: https://doi.org/10.1109/tvcg.2017.2745140 , https://pure.tue.nl/ws/files/90606317/StableTreemapCorrected.pdf
- Balzer, Deussen, Voronoi treemaps, 2005: https://doi.org/10.1109/INFVIS.2005.1532128
- Marson, Musse, Automatic real-time generation of floor plans based on squarified treemaps algorithm, 2010: https://doi.org/10.1155/2010/624817
- Wettel, Lanza, Visualizing software systems as cities, 2007: https://doi.org/10.1109/vissof.2007.4290706
- Steinbrückner, Lewerentz, Representing development history in software cities, 2010: https://doi.org/10.1145/1879211.1879239
- phiresky, Procedural city generation survey (AGPL): https://github.com/phiresky/procedural-cities/blob/master/paper.md

Code and tools

- Watabou TownGeneratorOS (GPL-3.0): https://github.com/watabou/TownGeneratorOS
- Watabou MFCG: https://watabou.itch.io/medieval-fantasy-city-generator ; Village Generator: https://watabou.itch.io/village-generator
- ProbableTrain MapGenerator (LGPL-3.0): https://github.com/ProbableTrain/MapGenerator , https://maps.probabletrain.com
- t-mw citygen (MIT): https://github.com/t-mw/citygen , http://tmwhere.com/city_generation.html
- mxgmn WaveFunctionCollapse (MIT): https://github.com/mxgmn/WaveFunctionCollapse
- DeBroglie (MIT): https://github.com/BorisTheBrave/DeBroglie
- Red Blob mapgen4 (Apache-2.0): https://github.com/redblobgames/mapgen4
- SoftVis3D (LGPL-3.0): https://github.com/stefanrinderle/softvis3d ; codecity-visualizer (MIT): https://www.npmjs.com/package/codecity-visualizer
- GrowableOverhaul mod, Cities: Skylines zone blocks (MIT): https://github.com/boformer/GrowableOverhaul/blob/master/GrowableOverhaul/ZoneBlockDetour.cs
- straight-skeleton (MIT): https://github.com/StrandedKitty/straight-skeleton
- d3-delaunay: https://github.com/d3/d3-delaunay ; delaunator: https://github.com/mapbox/delaunator ; polygon-clipping: https://github.com/mfogel/polygon-clipping ; clipper2-js: https://github.com/IRobot1/clipper2-ts ; simplex-noise: https://github.com/jwagner/simplex-noise.js

Articles, talks, specs

- Martin Evans, Procedural generation for dummies (overview, roads, lots, half-edge, footprints): https://martindevans.me/game-development/2015/12/11/Procedural-Generation-For-Dummies/ , https://martindevans.me/game-development/2015/12/11/Procedural-Generation-For-Dummies-Roads/ , https://martindevans.me/game-development/2015/12/27/Procedural-Generation-For-Dummies-Lots/ , https://martindevans.me/game-development/2016/03/30/Procedural-Generation-For-Dummies-Half-Edge-Geometry/ , https://martindevans.me/game-development/2016/05/07/Procedural-Generation-For-Dummies-Footprints/
- Amit Patel: http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/ , https://www.redblobgames.com/x/1721-voronoi-alternative/ , https://www.redblobgames.com/grids/parts/ , https://www.redblobgames.com/grids/hexagons/
- Oskar Stålberg: https://twitter.com/OskSta/status/1147778221058023424 , https://twitter.com/OskSta/status/1147881669350891521 , https://www.youtube.com/watch?v=1hqt8JkYRdI , https://www.youtube.com/watch?v=Uxeo9c-PX-w , https://www.youtube.com/watch?v=0bcZb-SsnrA
- andersource, Generating an organic grid: https://andersource.dev/2020/11/06/organic-grid.html
- Boris the Brave, WFC explained: https://boristhebrave.com/2020/04/13/wave-function-collapse-explained/
- Bowyer-Watson algorithm: https://en.wikipedia.org/wiki/Bowyer%E2%80%93Watson_algorithm
- ECMA-262 Math object (implementation-approximated functions): https://tc39.es/ecma262/multipage/numbers-and-dates.html
- Mini Motorways: https://store.steampowered.com/app/1127500/Mini_Motorways/ ; ISLANDERS: https://store.steampowered.com/app/1046030/ISLANDERS/
