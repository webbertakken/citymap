# Deterministic, stable hierarchical layout algorithms for a code city ground plan

Angle: the algorithmic core. How to turn a weighted folder tree into nested regions (districts, blocks, parcels) with a
real road graph, deterministically, and so that small changes do not reshuffle the city.

Status legend used below: **verified** = read in the primary source or code; **measured** = my own experiment (appendix);
**unverified** = plausible but not confirmed in a primary source.

## TL;DR

- Every published comparison agrees on one shape of the trade-off: algorithms that re-optimise aspect ratio from
  scratch (squarified, approximation) are the least stable; algorithms that keep order and structure (slice-and-dice)
  or that start from the previous layout (Local Moves, GIT, EvoCells, EvoStreets) are much more stable, at the cost of
  aspect ratio or compactness. No algorithm wins both
  ([Vernier et al. 2020](https://arxiv.org/abs/1906.06014)).
- "Deterministic" and "stable" pull in different directions. The genuinely stable methods are **history dependent**:
  the output is a function of the input _and the previous layout_. A pure function of the current tree can only be
  stable by being rigid (order-preserving, quantised); it still suffers rare "cascade" events where a high-level change
  reflows everything (**measured**: up to 97-99% of files moved in a single step for a stateless quantised split).
- The software-city literature already has the right skeleton: **EvoStreets** (Steinbrückner): each folder is a
  street, children sit on both sides in a preserved order, new children are appended at the street's far end,
  removed ones stay as ghosts, sizes shift neighbours only along the same street
  ([Steinbrückner thesis, pp. 63-65](https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf)).
  It yields a road graph for free. Its known weakness is compactness, which Steinbrückner fixes with grid-packed
  blocks.
- Recommendation: a **"plat" hybrid**: archetype skeleton (with hysteresis) → EvoStreets-style street tree for folders
  → grid-packed, ordered blocks of integer lots for files → slack and ghosts to absorb growth → persisted plat (lock)
  so the next run starts from the previous one → purely cosmetic, deterministic organic deformation on top.
  Treat Voronoi/Gosper shapes as styling or coastline generators, not as the layout engine.

## 1. Framing: what we are optimising

### 1.1 Quality criteria (with how the literature measures them)

| Criterion                                   | Metric used in literature                                                                                                                                          | Source                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Visual quality                              | Aspect ratio; Vernier et al. use ρ = min(w,h)/max(w,h) in [0,1]; ρ = 0.25 is "perceptually much worse" than 0.5; Kong et al.'s "extreme aspect ratio" is about 4.5 | [Vernier 2020](https://arxiv.org/abs/1906.06014)                                                                                  |
| Optimal aspect ratio                        | Minimising aspect ratio for rectangular treemaps is strongly NP-complete (de Berg et al.)                                                                          | cited in [Vernier 2020](https://arxiv.org/abs/1906.06014)                                                                         |
| Target aspect ratio                         | d3 defaults to the golden ratio per Kong et al.                                                                                                                    | [d3 treemap docs](https://github.com/d3/d3/blob/main/docs/d3-hierarchy/treemap.md)                                                |
| Absolute stability                          | Layout distance change (Shneiderman and Wattenberg), location drift (Tak and Cockburn), corner travel (Vernier)                                                    | [Vernier 2020](https://arxiv.org/abs/1906.06014), [Tak and Cockburn 2013](https://doi.org/10.1109/tvcg.2012.108)                  |
| Relative stability                          | Relative position change (Sondag), relative direction change (Hahn et al. 2017)                                                                                    | [Sondag 2018](https://pure.tue.nl/ws/files/90606317/StableTreemapCorrected.pdf), [Vernier 2020](https://arxiv.org/abs/1906.06014) |
| Data-aware stability                        | Compare layout change against a "baseline" treemap T* that is as stable as possible given the data change                                                          | [Vernier 2020](https://arxiv.org/abs/1906.06014)                                                                                  |
| Order preservation, continuity, compactness | Steinbrückner argues layouts for cities must be compact, avoid variable aspect ratios, avoid discontinuities and preserve input order                              | [Steinbrückner thesis §4.3](https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf)                         |

For a city we add three criteria the treemap literature does not score:

- **Road-ability**: does the partition leave continuous gaps that read as a connected street network with sensible
  junctions, and can road width encode hierarchy level?
- **Addressability**: can a parcel be named stably (street, side, index) for games and statistics?
- **Local drift** (neighbourhood integrity): does a file keep its place _relative to its own block_, even if the whole
  block slides? A rigid translation of a neighbourhood is far less disorienting than an internal reshuffle. I measure
  this separately (appendix).

### 1.2 The hidden fork: what "deterministic" means

The owner requires "same input → same map" and "small change → no reshuffle". Three readings, with consequences:

| Reading                                            | Input                              | Stability ceiling                                                        | Notes                                                                                           |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| A. Pure function of the current tree               | tree                               | Bounded: order-preserving and quantised rules only; cascades still occur | Simplest; reproducible anywhere; web-friendly                                                   |
| B. Function of tree and persisted plat (lock file) | tree + previous plat               | High: Local Moves, EvoCells, EvoStreets class                            | Same (tree, plat) → same map; plat must be stored (in repo or service)                          |
| C. Function of the repository history              | all commits (or fixed checkpoints) | High, and still a pure function of the repo                              | Replays history like EvoStreets did with real version histories; cost grows with history length |

All history-aware algorithms below are reading B by construction: Local Moves "uses the previous treemap to generate the
next one" ([Sondag 2018 §5](https://pure.tue.nl/ws/files/90606317/StableTreemapCorrected.pdf)); EvoCells applies
changes "in sequence" and notes "the order influences the resulting layout"
([Scheibel et al. 2018](https://doi.org/10.5220/0006617102730280)); d3's resquarify only preserves topology "of the
previous layout computed by d3.treemapResquarify"
([d3 docs](https://github.com/d3/d3/blob/main/docs/d3-hierarchy/treemap.md)). This is the single most important design
decision for the owner (see open questions).

## 2. Survey of layout families

### 2.1 Summary table

Stability column: qualitative, from the cited source. "Ordered" = preserves a given sibling order.

| Family                                     | Ordered                        | Aspect ratio                                                          | Stability                                                                 | Complexity                                                     | Road graph fitness                                                       | Source                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slice-and-dice (SND)                       | Yes                            | Very poor (long slivers)                                              | Best stateless; layout depends only on hierarchy if weights fixed         | O(n)                                                           | Excellent: every cut is a straight road, T-junctions                     | [Shneiderman 1992](https://doi.org/10.1145/102377.115768), [Vernier 2020](https://arxiv.org/abs/1906.06014)                                                                                                                                                                                                                |
| Squarified (SQR)                           | No (sorts by size, decreasing) | Near optimal in practice                                              | Among the least stable; sensitive to equal-ish weights                    | O(n log n)                                                     | Good locally (rows), but rows reshuffle                                  | [Bruls et al. 2000](https://www.win.tue.nl/~vanwijk/stm.pdf)                                                                                                                                                                                                                                                               |
| Approximation (APP)                        | No                             | Provable bound                                                        | Unstable (like SQR)                                                       | Polynomial                                                     | As SQR                                                                   | [Nagamochi and Abe 2007](https://doi.org/10.1016/j.dam.2006.08.005)                                                                                                                                                                                                                                                        |
| Pivot (PBM, PBZ, PBS), Strip, Split        | Yes                            | Medium                                                                | Medium                                                                    | Not checked                                                    | Good: sliceable                                                          | [Shneiderman and Wattenberg 2001](https://doi.org/10.1109/infvis.2001.963283), [Bederson et al.](https://drum.lib.umd.edu/bitstreams/566ad3d9-db62-4524-9d1f-376a74277843/download)                                                                                                                                        |
| Spiral                                     | Yes                            | Medium; newer variants better                                         | Medium                                                                    | Quasilinear (newer variants)                                   | Fair: spiral growth suggests ring roads                                  | [Tu and Shen 2007](https://eduardovernier.github.io/dynamic-treemap-resources-eurovis/docs/treemaps/algorithms/), [arXiv 2308.16855](https://arxiv.org/abs/2308.16855)                                                                                                                                                     |
| Hilbert / Moore treemaps                   | Yes (along curve)              | Medium                                                                | Good across all stability metrics (authors' claim)                        | Not checked                                                    | Good: quadrant recursion gives a grid of roads                           | [Tak and Cockburn 2013](https://doi.org/10.1109/tvcg.2012.108)                                                                                                                                                                                                                                                             |
| Local Moves (LM0, LM4)                     | Uses previous layout           | High (non-sliceable layouts allowed)                                  | Top stability in every data class                                         | Slow: about 15 s for 200 rectangles in authors' implementation | Good: maximal segments are roads; non-sliceable gives windmill junctions | [Sondag et al. 2018](https://pure.tue.nl/ws/files/90606317/StableTreemapCorrected.pdf)                                                                                                                                                                                                                                     |
| GIT (greedy insertion)                     | Uses previous layout           | Fluctuates widely by data class                                       | Top band                                                                  | "Fast" (authors)                                               | Good: sliceable                                                          | [Vernier et al. 2018](https://doi.org/10.1109/sibgrapi.2018.00027), [Vernier 2020](https://arxiv.org/abs/1906.06014)                                                                                                                                                                                                       |
| EvoCells                                   | Uses previous layout           | Good; leaves white space                                              | Most stable aspect ratios (3% change) on its test                         | O(n log n)                                                     | Fair: packing leaves gaps, not a planned network                         | [Scheibel et al. 2018](https://doi.org/10.5220/0006617102730280)                                                                                                                                                                                                                                                           |
| d3 resquarify                              | Uses previous layout           | Degrades over time ("only the first layout uses the Bruls algorithm") | High (topology frozen)                                                    | O(n)                                                           | As SQR                                                                   | [d3 docs](https://github.com/d3/d3/blob/main/docs/d3-hierarchy/treemap.md)                                                                                                                                                                                                                                                 |
| Orthoconvex treemaps (L and S shapes)      | n/a                            | Constant aspect ratio for any tree                                    | Not studied                                                               | Not checked                                                    | Interesting: L-shaped blocks are city-like                               | [de Berg et al.](https://arxiv.org/abs/1012.1749)                                                                                                                                                                                                                                                                          |
| Voronoi treemaps                           | Via seed order                 | Good, organic polygons                                                | Non-deterministic by default; stable with deterministic seeds             | O(n log n) per Lloyd iteration (power diagrams); iterative     | Organic roads along cell edges, Y-junctions; widths need offsetting      | [Balzer et al. 2005](https://doi.org/10.1145/1056018.1056041), [Nocaj and Brandes 2012](https://doi.org/10.1111/j.1467-8659.2012.03078.x), [Hahn et al. 2014](https://doi.org/10.5220/0004686200500058), [van Hees and Hage 2017](https://dspace.library.uu.nl/bitstream/handle/1874/355256/10.pdf?sequence=1&isAllowed=y) |
| Circular / bubble treemaps, circle packing | Order-dependent front chain    | n/a (circles); wastes space                                           | Low under insertion (unverified, see §2.6)                                | Not checked                                                    | Poor: no shared edges, roads must be routed in gaps                      | [Wang et al. 2006](https://doi.org/10.1145/1124772.1124851), [Görtler et al. 2018](https://doi.org/10.1109/tvcg.2017.2743959)                                                                                                                                                                                              |
| GosperMap                                  | Yes (DFS order on curve)       | Organic, map-like, fractal borders                                    | Between sunburst and squarified; prefix growth shifts everything after it | Linear with hex cells (paper)                                  | Organic coastline-like borders; good for islands, not streets            | [Auber et al. 2013](https://hal.science/hal-00959383/document)                                                                                                                                                                                                                                                             |
| Rectangle packing (CodeCity kd-tree)       | No (sorted by size)            | Buildings keep their own shape                                        | Unstable (sort plus greedy fit)                                           | About O(n²) (my reading of the code)                           | Gaps are leftovers, not roads                                            | [Wettel and Lanza 2007](https://doi.org/10.1109/vissof.2007.4290706), [codecity-visualizer](https://www.npmjs.com/package/codecity-visualizer)                                                                                                                                                                             |
| EvoStreets                                 | Yes, plus history              | Leaves keep their own shape; blocks can be long                       | Very stable by design (order and side preserved)                          | O(n) per version                                               | Native: folders are streets, road width by depth                         | [Steinbrückner and Lewerentz 2010](https://doi.org/10.1145/1879211.1879239), [thesis](https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf)                                                                                                                                                        |
| Similarity layouts (MDS of vocabulary)     | No                             | n/a                                                                   | Stable when vocabulary is stable                                          | O(n²) MDS                                                      | None by itself                                                           | [Kuhn et al. 2010](https://doi.org/10.1002/smr.414)                                                                                                                                                                                                                                                                        |

### 2.2 Classic treemaps (stateless)

- **Squarified** processes rectangles in decreasing size order: "We found that a decreasing order usually gives the
  best results" and "With squarification, the relative ordering of siblings is lost"
  ([Bruls et al. 2000](https://www.win.tue.nl/~vanwijk/stm.pdf)). Because the order is by size, two siblings of
  similar weight swap rows when their weights cross. Vernier et al. confirm: "Unordered treemaps ... are particularly
  sensitive to changes in such data" (low weight variance)
  ([Vernier 2020 §5.1](https://arxiv.org/abs/1906.06014)).
- **Slice-and-dice** is "very stable" because with a fixed hierarchy "SND has a fixed layout", but it "consistently scores
  the poorest on visual quality" ([Vernier 2020](https://arxiv.org/abs/1906.06014)). Steinbrückner nevertheless picks it
  as the basis for cities because of "maximum continuity, preservation of the input order, and the lowest empirical
  susceptibility to change", then repairs aspect ratio by turning the strips into rectangle packings
  ([thesis pp. 60-62](https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf)). This is the
  conceptual birth of EvoStreets.
- **Ordered** (pivot, strip, split, spiral) and **space-filling-curve** treemaps (Hilbert, Moore) keep sibling order,
  which typically improves stability and worsens aspect ratio ([Vernier 2020 §2](https://arxiv.org/abs/1906.06014)).
  Tak and Cockburn introduce the location drift metric and report that Hilbert and Moore treemaps "perform well across
  all stability metrics" ([Tak and Cockburn 2013](https://doi.org/10.1109/tvcg.2012.108)). The reference
  implementation splits items into exactly four quadrants whose weights are greedily brought close to one quarter, then
  recurses (**verified**, [TreemapComparison HilbertMooreTreeMap.java](https://github.com/tue-alga/TreemapComparison)).

### 2.3 Stateful (layout-from-previous-layout) treemaps

**Local Moves** ([Sondag, Speckmann and Verbeek 2018](https://pure.tue.nl/ws/files/90606317/StableTreemapCorrected.pdf)),
**verified** details:

- Initial layout by Nagamochi and Abe's approximation algorithm.
- Weight changes: move maximal segments by gradient steps solving Jx = A' − A (Eppstein et al.'s area-universal
  layouts), which keeps the layout "order-equivalent".
- Then try up to d local moves (d = 4), beam width k = 4, only moves touching segments changed by the previous move.
- Only accept a new layout if the sum of aspect ratios improves by at least c, with c = 4·√(height of level), so higher
  levels change less readily: a built-in **hysteresis**.
- Insertion: split an existing rectangle chosen to minimise aspect ratios. Deletion: make the rectangle "grounded" via
  stretch moves, then stretch neighbours over it.
- Proven: stretch and flip moves reach every layout; at most O(n²) moves between any two.
- Cost: "about 15 seconds" for 200 rectangles in their implementation.

SEE (University of Bremen, MIT licence) ports this to C# as `IncrementalTreeMapLayout`. Its insertion is simpler:
"node with rectangle with highest aspect ratio" is halved, and local-moves search picks the result minimising
`visualQuality * 10 + movesList.Count` (**verified**,
[SEE LocalMoves.cs](https://github.com/uni-bremen-agst/SEE/tree/master/Assets/SEE/Layout/NodeLayouts/IncrementalTreeMap)).

**EvoCells** ([Scheibel, Weyand and Döllner 2018](https://doi.org/10.5220/0006617102730280)), **verified**:

- Packing rather than splitting; changes become layout operations: resize leaf, add leaf (a square, placed on whichever
  parent side minimises stretching and white space), remove leaf, move leaf, add parent (lay out the new subtree and
  insert it).
- Constant area per weight across all states (`a_i = w_i · initAreaSum / initWeightSum`): the canvas grows instead of
  rescaling. This is exactly what a city needs.
- Removed nodes become **ghosts** that can be cleared later; "Contract treemap layout" is an explicit user action to
  reclaim space. City translation: vacant lots and a deliberate urban-renewal event.
- On ElasticSearch it had the most stable aspect ratios (3% average change vs 12% for slice-and-dice).

**GIT** (greedy insertion treemap) supports insertions and deletions by local updates and sits in the top stability band
with state-aware peers, while its visual quality "fluctuates widely depending on the data class"
([Vernier 2020](https://arxiv.org/abs/1906.06014)).

### 2.4 The quantitative comparison (Vernier, Sondag, Comba, Speckmann, Telea, Verbeek 2020)

[arXiv 1906.06014](https://arxiv.org/abs/1906.06014), **verified**:

- 14 algorithms, 2405 datasets, four data features: weight variance, speed of weight change, tree depth, insertion and
  deletion pattern.
- "For nearly all datasets, regardless of the specific data class", the three state-aware algorithms (LM0, LM4, GIT)
  plus SND "are much more stable than any of the others".
- More levels make all algorithms more stable, and state-aware visual quality _increases_ with levels.
- "Among the 18 classes of treemaps with 4 or more levels we found a significant number of datasets only for two
  classes, which both are essentially populated by datasets stemming from software repositories": deep hierarchies in
  this benchmark are code bases, which is our domain.
- "There is no algorithm that performs best on both" visual quality and stability "in any of the data classes".
- Runtime was deliberately not compared.
- Code and data: [tue-alga/TreemapComparison](https://github.com/tue-alga/TreemapComparison) (Java). I found no licence
  file in the repository root, so treat it as all rights reserved (read for ideas, do not copy).

### 2.5 Voronoi treemaps

- Balzer, Deussen and Lewerentz introduced them for software metrics: arbitrary polygons, better aspect ratios, clearer
  hierarchy boundaries, computed by iterative relaxation ([2005](https://doi.org/10.1145/1056018.1056041)).
- Nocaj and Brandes: Lloyd's method plus power diagrams, O(n log n) per iteration instead of Ω(n²)
  ([2012](https://doi.org/10.1111/j.1467-8659.2012.03078.x)); Java code is GPL-3.0
  ([power-voronoi-diagram](https://github.com/ArlindNocaj/power-voronoi-diagram)).
- Hahn et al.: "existing Voronoi treemap algorithms do not provide deterministic layouts"; they use "a deterministic
  initial-distribution approach that reduces the variation in node positioning" for varying software hierarchies
  ([IVAPP 2014](https://doi.org/10.5220/0004686200500058)).
- van Hees and Hage: place initial sites along a scaled Hilbert curve aligned to the polygon's oriented bounding box, in
  a strict user-chosen order; result is "stable and predictable" and needs fewer iterations
  ([IST 2017](https://dspace.library.uu.nl/bitstream/handle/1874/355256/10.pdf?sequence=1&isAllowed=y)).
- Neighbourhood-preserving variant: Kuhn-Munkres matching of items to centroidal Voronoi cells, greedy swaps, then area
  adjustment preserving neighbourhoods ([arXiv 2508.03445](https://arxiv.org/abs/2508.03445)).
- Practical JS: [d3-voronoi-treemap](https://github.com/Kcnarf/d3-voronoi-treemap) (BSD-3-Clause). Defaults:
  `convergenceRatio` 0.01, `maxIterationCount` 50, `minWeightRatio` 0.01, `prng` = `Math.random`; deterministic only
  with a seeded PRNG (**verified** in README).
- City fit: beautiful organic districts, but iterative optimisation means a small weight change can move many sites
  (stability depends on warm-starting from previous sites, which is again reading B). Road widths require polygon
  offsetting. I would use Voronoi for _styling_ (irregular district outlines, parks, water) seeded from the stable
  layout's centroids, not as the source of truth.

### 2.6 Circular layouts

- d3's pack uses Wang et al.'s front-chain algorithm and advises calling `root.sort` first
  ([d3 pack docs](https://github.com/d3/d3/blob/main/docs/d3-hierarchy/pack.md)), i.e. placement is order dependent.
  Inference (unverified by experiment): inserting a circle early in the order re-places every later circle.
- Bubble treemaps intentionally allocate extra space around nodes for uncertainty glyphs using a force-based packing
  ([Görtler et al. 2018](https://doi.org/10.1109/tvcg.2017.2743959)). The "deliberate extra space" idea transfers to
  slack; the circles do not transfer to streets.
- Verdict: plazas and roundabouts, not the main layout.

### 2.7 GosperMap and space-filling curves

GosperMap ([Auber et al. 2013](https://hal.science/hal-00959383/document)), **verified**:

- Leaves ordered by depth-first search are placed on consecutive points of the Gosper flowsnake; each point owns a
  hexagon; a node's area is several consecutive points; parents are unions of children.
- Gosper is chosen for locality (worst-case locality constant c = √6.35) and obtuse 120°/240° boundary angles that look
  cartographic.
- Under 1 s for over 6,000 nodes.
- Stability: "changing the size of an element at the beginning of the Gosper curve can shift all of the other nodes",
  so its stability is between sunburst and squarified.

The general lesson for any 1D-curve layout (Hilbert, Gosper, strip): positions are prefix sums, so growth early in the
order pushes everything after it. Remedy: give each subtree a **fixed, quantised range of the curve with slack** (a
reserved hex budget), so prefix sums change only when a range overflows. This is the curve equivalent of reserved lots.

### 2.8 Existing code-city implementations I audited

| Tool                                                                                         | Layouts                                                                             | Stability mechanism | Finding                                                                                                                                                                                                                                                                                                      | Licence                                                                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| SoftVis3D via [codecity-visualizer 0.4.6](https://www.npmjs.com/package/codecity-visualizer) | District, Evostreet                                                                 | None                | District = kd-tree "Lightmap" packing sorted by footprint descending (`b.base - a.base`), so any size change can reorder. Evostreet default distribution puts child _i_ left or right by `i % 2`: inserting one child flips the side of every later sibling (**verified** in `Lightmap.js` and `Streets.js`) | MIT (visualizer), [LGPL-3.0 (SoftVis3D)](https://github.com/stefanrinderle/softvis3d) |
| [SEE](https://github.com/uni-bremen-agst/SEE) (Bremen)                                       | EvoStreets, IncrementalTreeMap, treemap, rectangle packing, circle packing, balloon | Previous layout     | EvoStreets keeps existing children on their previous side and in previous world-space order, appending new children at the street end; street width is a fraction of depth (**verified** in `EInner.cs`)                                                                                                     | MIT                                                                                   |
| [CodeCharta](https://github.com/MaibornWolff/codecharta)                                     | Squarified treemap, StreetMap, TreeMapStreet, sunburst, radial                      | None found          | Treemap = d3 `treemap()` with proportional `paddingInner/Outer` (padding as roads); StreetMap merges single-child directory chains and alternates street orientation by level; TreeMapStreet switches to a treemap below `maxTreeMapFiles`                                                                   | BSD-3-Clause                                                                          |

So SoftVis3D's evostreet is the stateless EvoStreets shape _without_ Steinbrückner's stability rules, which explains
why it reshuffles. SEE shows the rules are cheap to implement.

## 3. EvoStreets in detail (the closest prior art)

From [Steinbrückner's thesis §4.4](https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf),
**verified** quotes paraphrased into rules:

1. New tree nodes "are attached to the far end of their direct ancestor's line representation"; sets of new siblings
   are "evenly distributed to both sides".
2. Removed nodes stay in the layout, drawn in another colour or transparent.
3. Size changes shift "all following node representations down the same side" (recursively).
4. Side and initial spatial order of siblings "is also always preserved".
5. Relocations are treated as removal plus addition.
6. Consequence: "the overall layout tends to grow at its periphery with older structures concentrating in the centre";
   the alternative (attach at the near end) puts new structures in the centre. Age can be mapped to elevation and a
   terrain (hills of old code), with a chosen growth direction.
7. Compactness problem: long streets for folders with many children. Fix: pack leaves into districts with several rows
   per side ("grid based"), or nearest-to-origin packing.

This is already most of what the owner asked for: deterministic given history, neighbourhoods grow in place, history is
visible (old centre, new periphery, construction at the street ends), and a road graph exists by construction.
What it lacks: compactness, loops in the road network (a street tree is a tree; real cities have cycles), archetypes,
and a story for a first render without history.

## 4. Roads: which partitions produce a real road graph

- **Sliceable layouts** (slice-and-dice, strip, pivot, Hilbert/Moore, binary split, GIT): every guillotine cut is a
  straight road segment; junctions are T-junctions; the cut's depth in the split tree gives road class (highway,
  arterial, collector, lane) and width. Road width is just padding: d3 already models it with `paddingInner` and
  `paddingOuter` ([d3 docs](https://github.com/d3/d3/blob/main/docs/d3-hierarchy/treemap.md)), as CodeCharta does.
- **Non-sliceable rectangular layouts** (Local Moves): the maximal segments (which Local Moves already tracks) are the
  roads; non-sliceable "windmill" configurations give staggered junctions, which look more organic.
- **EvoStreets**: the street tree is the road graph; parcels are addressable as (street, side, index). Missing cycles
  can be added by connecting street ends that lie within a distance threshold (my proposal, unverified in literature).
- **Voronoi / Gosper**: roads along cell boundaries, with 120° Y-junctions in hexagonal bases (pleasant, organic) but
  no natural hierarchy of widths; needs polygon offsetting.
- **Circles and kd-tree packing**: gaps are leftovers, not a network; routing must be invented afterwards.

First-principles reading: in real cities, roads come _first_ (the plat), parcels second. Layout families in which roads
are the primary object (EvoStreets, sliceable cuts) give the most believable cities and the cleanest graph.

## 5. Absorbing growth without reshuffling

| Technique                                                 | What it buys                                                               | Cost                                                 | Evidence                                                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constant area per weight (grow the canvas, never rescale) | No global rescale when the repo grows                                      | City size varies                                     | EvoCells' `a_i` definition ([2018](https://doi.org/10.5220/0006617102730280)); my experiment shows refitting to a container causes cascades (§6)    |
| Stable sibling order (name, first-seen, or hash)          | Insertions only push later siblings                                        | Order may not optimise aspect ratio                  | Ordered treemaps and EvoStreets ([Vernier 2020](https://arxiv.org/abs/1906.06014), thesis)                                                          |
| Append-at-end for new children                            | Existing siblings never move for an insertion                              | New things at the periphery (or centre, by choice)   | EvoStreets rule 1                                                                                                                                   |
| Side preservation                                         | No left/right flips                                                        | Sides can become unbalanced                          | EvoStreets rule 4; codecity-visualizer `i % 2` shows the failure                                                                                    |
| Quantised sizes (lots, buckets)                           | Small weight changes do not change geometry                                | Area no longer exactly proportional                  | Quantum treemaps ([Bederson et al.](https://drum.lib.umd.edu/bitstreams/566ad3d9-db62-4524-9d1f-376a74277843/download)); bucket-crossing odds below |
| Slack / reserved vacant lots                              | Growth absorbed locally; propagation stops at the first ancestor with room | Lower compactness; slack must not compound per level | Bubble treemaps' deliberate space; my experiment (§6)                                                                                               |
| Ghosts (vacant lots after deletion)                       | Deletions do not pull neighbours inwards                                   | Space use; needs a reclaim policy                    | EvoStreets rule 2; EvoCells ghosts                                                                                                                  |
| Hysteresis thresholds                                     | Prevents flip-flopping of capacities, moves, archetypes                    | Needs memory of the previous state                   | Local Moves' c = 4·√height acceptance threshold                                                                                                     |
| Layout from previous layout                               | Strongest stability                                                        | History dependence (reading B)                       | LM, GIT, EvoCells, SEE, d3 resquarify                                                                                                               |
| Anchoring by curve or hash                                | Deterministic initial positions independent of siblings                    | Hash order looks random; curve prefix shifts         | Hahn 2014, van Hees and Hage 2017, GosperMap                                                                                                        |
| Deliberate "urban renewal"                                | Restores compactness and aspect ratio occasionally                         | A visible, rare reflow                               | EvoCells "contract treemap layout"                                                                                                                  |

### 5.1 Quantisation numbers (computed)

With sizes quantised to logarithmic buckets of base b, and a weight's position inside its bucket uniformly distributed
in log space, the chance that a relative growth x crosses a bucket boundary is ln(1+x)/ln(b) (**measured**, appendix):

| Growth | Base √2 | Base 2 |
| ------ | ------- | ------ |
| +1%    | 2.9%    | 1.4%   |
| +5%    | 14.1%   | 7.0%   |
| +10%   | 27.5%   | 13.8%  |

Without memory, a weight oscillating around a boundary flips every time. With memory (grow when full, shrink only when
below 1/b³ of capacity, as in my experiment), oscillation cannot flip it.

### 5.2 Hash anchoring and lot assignment

- Ordering siblings by a hash of the path gives an order that is independent of other siblings, like name order, but
  scatters related names (looks organic, loses alphabetical findability). It does not by itself add stability over
  name order: any fixed total order has the same insertion behaviour.
- For assigning items to a _fixed_ set of lots, rendezvous (highest-random-weight) hashing
  ([Thaler and Ravishankar 1998](https://doi.org/10.1109/90.663936)) and consistent hashing
  ([Karger et al. 1997](https://doi.org/10.1145/258533.258660)) move only about 1/n of assignments when one item
  arrives. This is a useful tool for placing files into a block's grid of lots without a lock file (inference from the
  hashing properties; not tested for layouts).

### 5.3 Archetype switching with hysteresis

Use a Schmitt-trigger style rule: compute a shape score per archetype from tree features, switch only when the
challenger beats the incumbent by a margin (for example 0.15) and, if a plat exists, has done so for k consecutive
renders. Stateless (reading A) can only use guard bands, so a repo sitting exactly on a boundary can still flip.
Thresholds below are initial guesses to be calibrated on a corpus (**unverified**).

### 5.4 Numeric determinism (TypeScript now, Rust later)

ECMAScript defines `Math.sin` and most transcendental functions as "implementation-approximated", while `Math.sqrt`
returns the correctly rounded square root ([ECMA-262 §21.3.2](https://tc39.es/ecma262/)). Bit-identical output across
browsers and a future Rust port therefore needs: integer lot grid for topology, only `+ − × ÷ √` in the core, fixed
iteration order (sorted keys, never object or hash-map iteration order), and an explicit seeded PRNG such as mulberry32
for anything random. Cosmetic curves can use transcendental functions because they never feed back into topology.

## 6. Experiment: stateless vs stateful layouts on an evolving tree (measured)

Setup (script in the appendix, bun, no dependencies): synthetic repo-like tree (depth 5, 268 to 905 files, lognormal
file weights), 80 evolution steps (each step: 3 files change weight by lognormal σ = 0.15; 50% chance of a new file;
10% chance of a new folder; 20% chance of a deletion), 6 seeds. Layouts:

- `sqr` squarified (size-sorted); `osq` squarified in name order; `snd` slice-and-dice in name order;
- `qbs` stateless: log-√2 quantised capacities, 15% slack per folder, name-ordered balanced binary split (sliceable);
- `qbh` as `qbs` plus memory (grow when full, shrink only below 1/b³: hysteresis);
- `evo` stateful EvoStreets with slack: first-seen order, append at end, side preserved, ghosts kept, lots quantised,
  street length and depth reserved with 25% slack, road width by depth.

Metrics: global drift = mean centroid displacement of surviving files per step, divided by √(total file area) so
sparse layouts are not flattered; local drift = displacement relative to the parent block's frame; cascade = a step in
which more than 25% of files move by more than 1% of the city diagonal.

| Layout | Global drift (median of 6 seeds) | Local drift (median) | Cascade steps (sum of 6×80) | Worst single step | Mean file AR      | Mean block AR | File area / city bbox |
| ------ | -------------------------------- | -------------------- | --------------------------- | ----------------- | ----------------- | ------------- | --------------------- |
| sqr    | 0.61%                            | 0.96%                | 41                          | 100%              | 1.6 to 1.8        | 1.4 to 1.6    | 100%                  |
| osq    | 0.85%                            | 2.04%                | 41                          | 97%               | 3.7 to 5.4        | 2.0 to 3.7    | 100%                  |
| snd    | 0.16%                            | 0.04%                | 10                          | 76%               | 75 to 135         | 4.4 to 10     | 100%                  |
| qbs    | 0.98%                            | 0.86%                | 23                          | 99%               | 2.8 to 3.9        | 1.5 to 2.4    | 18 to 26%             |
| qbh    | 0.94%                            | 0.67%                | 16                          | 99%               | 2.9 to 3.9        | 1.5 to 2.4    | 19 to 27%             |
| evo    | 0.32%                            | 0.04%                | 5                           | 64%               | 1.0 (square lots) | 1.3 to 1.4    | 1.4 to 2.8%           |

What it shows (and does not):

- Stateless quantisation plus slack (`qbs`) does **not** beat squarified on global drift: whenever a high-level bucket
  flips, the whole split reflows (worst steps 97-99%). Memory (`qbh`) helps a little; structure helps more.
- Local drift, the neighbourhood-integrity measure, separates the families: `snd` and `evo` are about 20× better than
  squarified. In `evo`, when things move, whole neighbourhoods slide rigidly.
- `evo` has square files and blocks, the fewest cascades, but terrible compactness in this toy (wide roads relative to
  small lots, one row per side, 25% slack compounding per level, empty bounding-box corners). Steinbrückner reports the
  same issue and fixes it with grid-packed blocks.
- Compounding slack is a trap: 15% slack times √2 rounding at five levels left `qbs` with only 18-26% of the city used
  by files. Slack must be added once per block, in lots, not multiplied through ancestors.
- Caveats: synthetic data, one weight model, no renames, no real git histories; metrics are simple centroid
  displacements, not Vernier's baseline-aware metric. Treat as directional.

## 7. Recommended approach: the "plat" hybrid

Named after the surveyor's plat that fixes streets and lots before houses are built.

### 7.1 Structure

1. **Identity and weights**: node identity = normalised path (later: git rename map). Demand in integer lots per file,
   quantised (1, 2, 3, 4, 6, 9, 12, 16, ...), from a chosen weight (LOC, bytes or constant).
2. **Archetype** (stateless score, hysteresis when a plat exists): hamlet, courtyard, radial core, gridiron,
   polycentric archipelago. Decides the skeleton for the top one or two levels only.
3. **Skeleton**: top-level districts placed by the archetype (ring sectors for radial, cells of a coarse grid for
   gridiron, islands on a hex or Gosper range with bridges for polycentric). Districts get reserved extents with slack.
4. **Street tree inside districts**: EvoStreets rules (stable order, append at far end, side preserved, ghosts,
   same-side shifting), with chains of single-child folders merged into one street (as CodeCharta's
   `mergeDirectories` does).
5. **Blocks**: a folder's files are packed into one or more rectangular blocks fronting its street: an ordered grid of
   integer lots, R rows deep (R from 1 to 4 by file count), filled in stable order, with vacant lots as slack.
6. **Growth**: new lot → vacant lot in the same block; full block → extend along the street (shifts later siblings on
   the same side rigidly) by a quantised step; full street → consume the parent's reserved length; stop at the first
   ancestor with room. Deletion → ghost lot. Reclaim ghosts only for siblings in the same block, or in a deliberate
   renewal when vacancy exceeds a threshold.
7. **Road graph**: nodes at street ends and junctions; edges carry class (depth), width and length; add loop
   connectors between nearby street ends; parcels addressed as `(streetId, side, index)`.
8. **Plat persistence**: the plat (orders, sides, reservations, lot capacities, ghosts, archetype) is serialised so the
   next render starts from it. Without a plat, the cold start is the same algorithm with everything treated as new in
   name order, so reading A falls out for free.
9. **Cosmetic layer**: deterministic, topology-preserving deformation (gentle curves, irregular district outlines from a
   Voronoi of block centroids, coastlines, parks in large vacant areas). Never fed back into the plat.

### 7.2 Pseudocode

```ts
type Path = string;
type Lots = number; // integer lot units

interface Plat {
  archetype: Archetype;
  archetypeStreak: number; // renders in a row the challenger has won
  streets: Map<Path, StreetLock>; // folders
  lots: Map<Path, Lots>; // file lot capacity (quantised, hysteretic)
}
interface StreetLock {
  order: Path[]; // first-seen order, append-only
  side: Map<Path, 1 | -1>;
  extent: Map<Path, [Lots, Lots]>; // along-street length, depth; ghosts keep last extent
  ghosts: Set<Path>;
  reservedLength: Lots;
  reservedDepth: [Lots, Lots]; // left, right
  blockRows: number;
}

function layout(tree: Tree, previous?: Plat): { plat: Plat; city: City } {
  const plat = previous ? clonePlat(previous) : emptyPlat();
  plat.archetype = chooseArchetype(features(tree), plat); // §7.3
  const sizes = new Map<Path, Size>();
  sizeBottomUp(tree.root, plat, sizes); // post-order, sorted keys
  const skeleton = placeDistricts(tree.root, plat, sizes); // per archetype
  const city = placeTopDown(tree.root, skeleton, plat, sizes); // absolute integer coordinates
  city.roads = extractRoadGraph(city); // nodes, edges, classes, loops
  city.parcels = addressParcels(city); // (streetId, side, index)
  return { plat, city };
}

function sizeBottomUp(node: Folder, plat: Plat, sizes: Map<Path, Size>): Size {
  for (const child of sortedByName(node.children)) {
    if (isFolder(child)) sizeBottomUp(child, plat, sizes);
    else sizes.set(child.path, lotSize(plat, child)); // hysteretic quantisation
  }
  const lock = plat.streets.get(node.path) ?? newLock(node, plat);
  for (const p of sortedByName(childPaths(node))) {
    if (!lock.order.includes(p)) {
      // newcomer: far end, shorter side
      lock.order.push(p);
      lock.side.set(p, shorterSide(lock));
    }
  }
  for (const p of lock.order) {
    if (exists(node, p)) {
      lock.extent.set(p, footprint(sizes.get(p)!));
      lock.ghosts.delete(p);
    } else lock.ghosts.add(p); // vacant lot, keeps its extent
  }
  packFilesIntoBlocks(node, lock); // ordered grid, R rows, vacant lots as slack
  const need = requiredLengthAndDepth(lock); // sums along each side, max depths
  lock.reservedLength = reserve(lock.reservedLength, need.length); // grow when full, shrink with hysteresis
  lock.reservedDepth = [reserve(lock.reservedDepth[0], need.left), reserve(lock.reservedDepth[1], need.right)];
  plat.streets.set(node.path, lock);
  const size = { length: lock.reservedLength, left: lock.reservedDepth[0], right: lock.reservedDepth[1] };
  sizes.set(node.path, size);
  return size;
}

function reserve(current: Lots, need: Lots): Lots {
  const SLACK = 0.2,
    SHRINK_BELOW = 0.4,
    MIN_SLACK: Lots = 1;
  if (current === 0 || need > current) return quantiseUp(need + Math.max(MIN_SLACK, Math.ceil(need * SLACK)));
  if (need < current * SHRINK_BELOW) return quantiseUp(need + Math.max(MIN_SLACK, Math.ceil(need * SLACK)));
  return current; // absorb: no geometry change
}
// Note: `need` already contains the children's *reserved* sizes, so a percentage slack compounds with depth
// (see §6, compounding trap). Calibrate SLACK per level (for example 20% on blocks, 1 lot on streets above)
// or compute it from this street's direct files only.

function placeTopDown(node: Folder, frame: Frame, plat: Plat, sizes: Map<Path, Size>): City {
  const lock = plat.streets.get(node.path)!;
  const city = new City();
  city.addStreet(node.path, frame, lock.reservedLength, roadWidth(depth(node)));
  const offset = { [1]: GAP, [-1]: GAP };
  for (const p of lock.order) {
    // order is the only source of position
    const s = lock.side.get(p)!;
    const [along] = lock.extent.get(p)!;
    const at = offset[s];
    offset[s] += along + GAP;
    if (lock.ghosts.has(p)) {
      city.addVacantLot(p, frame, s, at, along);
      continue;
    }
    const child = childAt(node, p);
    if (isFolder(child)) city.merge(placeTopDown(child, perpendicularFrame(frame, s, at, sizes.get(p)!), plat, sizes));
    else city.addParcel(p, blockCellFor(lock, p, frame, s, at));
  }
  return city;
}
```

Complexity: cold start O(n log n) (sorting siblings), incremental update O(Σ siblings along the changed path) for
sizing plus O(n) placement; integer arithmetic throughout the plat.

### 7.3 Archetype selection sketch

```ts
interface Features {
  files: number;
  folders: number;
  maxDepth: number;
  packageRoots: number; // folders with a manifest (package.json, Cargo.toml, go.mod, ...)
  topShareLargest: number; // weight share of the largest top-level folder
  topGini: number; // inequality of top-level weights
}

function scores(f: Features): Record<Archetype, number> {
  return {
    hamlet: f.files <= 60 && f.folders <= 4 ? 1 : 0,
    courtyard: f.folders <= 12 && f.maxDepth <= 2 ? 0.8 : 0,
    radialCore: f.topShareLargest, // one dominant src/ becomes downtown
    gridiron: 1 - f.topGini, // many comparable siblings
    archipelago: Math.min(1, f.packageRoots / 4), // apps/ + packages/ monorepo
  };
}

function chooseArchetype(f: Features, plat: Plat): Archetype {
  const s = scores(f);
  const best = argmaxStable(s); // ties broken by fixed archetype order
  if (!plat.archetype) return best;
  const margin = s[best] - s[plat.archetype];
  if (best !== plat.archetype && margin > 0.15) {
    plat.archetypeStreak += 1;
    if (plat.archetypeStreak >= 3) {
      plat.archetypeStreak = 0;
      return best;
    }
  } else plat.archetypeStreak = 0;
  return plat.archetype;
}
```

All thresholds are placeholders (**unverified**); calibrate on a corpus of real repositories and their histories.

## 8. Ranked recommendation for citymap

1. **Plat hybrid (§7)**: EvoStreets-style street tree with grid-packed blocks of integer lots, slack, ghosts, append-at-
   end growth, side and order preservation, hysteretic capacities, a persisted plat, and archetype skeletons on top.
   Best match for "neighbourhoods grow in place", gives the road graph and parcel addresses natively, cheap, and fully
   integer so TS and Rust can agree bit for bit. Prior art: Steinbrückner (thesis), SEE (MIT) for implementation hints.
2. **Ordered sliceable treemap with quantised lots** (binary split or Hilbert/Moore in stable order) as the in-district
   alternative when a compact, "downtown grid" look is wanted. Cuts become streets. Use it inside the plat (reserved
   extents) to avoid the cascades measured in §6.
3. **Local Moves** (Sondag et al.) for districts only, if compact rectangular districts with top stability are needed
   later. Expensive (15 s for 200 rectangles in the original implementation), so restrict to tens of top-level
   rectangles.
4. **Voronoi / Gosper as styling**: irregular district outlines, coastlines and islands for the archipelago archetype,
   seeded deterministically from the plat's centroids (Hilbert-ordered seeds per van Hees and Hage). Not the source of
   truth.
5. **Avoid as primary**: size-sorted squarified and kd-tree packing (CodeCity "district"), unseeded Voronoi, circle
   packing, and any EvoStreets variant without side and order preservation (SoftVis3D's `i % 2`).

## 9. Open questions for the owner

1. **Determinism reading**: pure function of the current tree (A), of tree plus a persisted plat (B), or of the git
   history replayed at fixed checkpoints (C)? Where would a plat live for the hosted web version?
2. **Growth direction**: old code at the centre and new at the periphery (EvoStreets default), or new code at the
   centre?
3. **Sibling order**: alphabetical (findable), first-seen (age readable as distance), or hash (organic look)?
4. **Weight**: lines of code, bytes, file count, or a mix? It decides lot demand and how often buckets flip.
5. **Ghosts**: how long should demolished files stay as vacant lots, and is a visible, rare "urban renewal" reflow
   acceptable when vacancy grows large?
6. **Rigid shifts**: is a neighbourhood sliding along its street as a unit acceptable, or must every existing parcel
   keep absolute coordinates (costs more slack and compactness)?
7. **Renames and moves**: treat as demolition plus new build (Steinbrückner), or follow git rename detection?
8. **Archetype taxonomy**: approve hamlet, courtyard, radial core, gridiron and archipelago as the first set, and the
   rule that archetypes only switch with margin plus persistence?

## 10. Sources

Papers and theses:

- Vernier, Sondag, Comba, Speckmann, Telea, Verbeek. Quantitative Comparison of Time-Dependent Treemaps. EuroVis 2020.
  https://arxiv.org/abs/1906.06014 ; resources https://eduardovernier.github.io/dynamic-treemap-resources-eurovis/
- Sondag, Speckmann, Verbeek. Stable Treemaps via Local Moves. IEEE TVCG 24(1), 2018. https://doi.org/10.1109/tvcg.2017.2745140 ;
  PDF https://pure.tue.nl/ws/files/90606317/StableTreemapCorrected.pdf
- Vernier, Comba, Telea. A Stable Greedy Insertion Treemap Algorithm for Software Evolution Visualization. SIBGRAPI 2018.
  https://doi.org/10.1109/sibgrapi.2018.00027
- Scheibel, Weyand, Döllner. EvoCells: A Treemap Layout Algorithm for Evolving Tree Data. IVAPP 2018.
  https://doi.org/10.5220/0006617102730280 ; PDF https://www.scitepress.org/Papers/2018/66171/66171.pdf
- Scheibel, Limberger, Döllner. Survey of treemap layout algorithms. VINCI 2020. https://doi.org/10.1145/3430036.3430041
- Steinbrückner, Lewerentz. Representing development history in software cities. SOFTVIS 2010.
  https://doi.org/10.1145/1879211.1879239
- Steinbrückner. Consistent Software Cities: supporting comprehension of evolving software systems. PhD thesis, BTU
  Cottbus, 2012/2013. https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf
- Wettel, Lanza. Visualizing Software Systems as Cities. VISSOFT 2007. https://doi.org/10.1109/vissof.2007.4290706
- Bruls, Huizing, van Wijk. Squarified Treemaps. 2000. https://doi.org/10.1007/978-3-7091-6783-0_4 ; PDF https://www.win.tue.nl/~vanwijk/stm.pdf
- Shneiderman. Tree visualization with tree-maps. ACM TOG 1992. https://doi.org/10.1145/102377.115768
- Shneiderman, Wattenberg. Ordered treemap layouts. InfoVis 2001. https://doi.org/10.1109/infvis.2001.963283
- Bederson, Shneiderman, Wattenberg. Ordered and quantum treemaps. https://drum.lib.umd.edu/bitstreams/566ad3d9-db62-4524-9d1f-376a74277843/download
- Nagamochi, Abe. An approximation algorithm for dissecting a rectangle into rectangles with specified areas. 2007.
  https://doi.org/10.1016/j.dam.2006.08.005
- Eppstein, Mumford, Speckmann, Verbeek. Area-universal rectangular layouts. SoCG 2009. https://doi.org/10.1145/1542362.1542411
- Tak, Cockburn. Enhanced Spatial Stability with Hilbert and Moore Treemaps. IEEE TVCG 2013. https://doi.org/10.1109/tvcg.2012.108
- de Berg, Speckmann, van der Weele. Treemaps with Bounded Aspect Ratio. https://arxiv.org/abs/1012.1749
- Space Partitioning Schemes and Algorithms for Generating Regular and Spiral Treemaps. https://arxiv.org/abs/2308.16855
- Balzer, Deussen, Lewerentz. Voronoi treemaps for the visualization of software metrics. SOFTVIS 2005.
  https://doi.org/10.1145/1056018.1056041
- Nocaj, Brandes. Computing Voronoi Treemaps: Faster, Simpler, and Resolution-independent. CGF 2012.
  https://doi.org/10.1111/j.1467-8659.2012.03078.x
- Hahn, Trümper, Moritz, Döllner. Visualization of Varying Hierarchies by Stable Layout of Voronoi Treemaps. IVAPP 2014.
  https://doi.org/10.5220/0004686200500058
- van Hees, Hage. Stable and predictable Voronoi treemaps for software quality monitoring. IST 87, 2017.
  https://doi.org/10.1016/j.infsof.2016.10.003 ; PDF https://dspace.library.uu.nl/bitstream/handle/1874/355256/10.pdf?sequence=1&isAllowed=y
- Neighborhood-Preserving Voronoi Treemaps. https://arxiv.org/abs/2508.03445
- Auber, Huet, Lambert, Renoust, Sallaberry, Saulnier. GosperMap. IEEE TVCG 2013. https://doi.org/10.1109/tvcg.2013.91 ;
  PDF https://hal.science/hal-00959383/document
- Wang, Wang, Dai, Wang. Visualization of large hierarchical data by circle packing. CHI 2006. https://doi.org/10.1145/1124772.1124851
- Görtler, Schulz, Weiskopf, Deussen. Bubble Treemaps for Uncertainty Visualization. IEEE TVCG 2018. https://doi.org/10.1109/tvcg.2017.2743959
- Kuhn, Erni, Loretan, Nierstrasz. Software Cartography: thematic software visualization with consistent layout. 2010.
  https://doi.org/10.1002/smr.414
- Karger et al. Consistent hashing and random trees. STOC 1997. https://doi.org/10.1145/258533.258660
- Thaler, Ravishankar. Using name-based mappings to increase hit rates. IEEE/ACM ToN 1998. https://doi.org/10.1109/90.663936
- Parish, Müller. Procedural modeling of cities. SIGGRAPH 2001. https://doi.org/10.1145/383259.383292 (context for road-first generation)

Code and documentation:

- SoftVis3D: https://github.com/stefanrinderle/softvis3d (LGPL-3.0); codecity-visualizer 0.4.6 (MIT): https://www.npmjs.com/package/codecity-visualizer
- SEE: https://github.com/uni-bremen-agst/SEE (MIT), `Assets/SEE/Layout/NodeLayouts/`
- CodeCharta: https://github.com/MaibornWolff/codecharta (BSD-3-Clause), `visualization/app/codeCharta/renderer/threeViewer/algorithm/`
- TreemapComparison: https://github.com/tue-alga/TreemapComparison (no licence file found)
- d3-hierarchy (ISC): https://github.com/d3/d3-hierarchy ; treemap docs https://github.com/d3/d3/blob/main/docs/d3-hierarchy/treemap.md ;
  pack docs https://github.com/d3/d3/blob/main/docs/d3-hierarchy/pack.md
- d3-voronoi-treemap (BSD-3-Clause): https://github.com/Kcnarf/d3-voronoi-treemap
- power-voronoi-diagram (GPL-3.0): https://github.com/ArlindNocaj/power-voronoi-diagram
- ECMAScript specification, Math functions: https://tc39.es/ecma262/

## Appendix: experiment script

Run with `SEED=<n> bun exp.ts` (bun 1.4, no dependencies). Deterministic per seed (mulberry32).

```ts
// Synthetic stability experiment: stateless layouts on an evolving folder tree.
type Node = { name: string; w: number; children?: Node[] };
type Rect = { x: number; y: number; w: number; h: number };

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(Number(process.env.SEED ?? 42));
const lognormal = (mu: number, s: number) => {
  const u = 1 - rnd(),
    v = rnd();
  return Math.exp(mu + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
};
let uid = 0;
const fname = () => `f${(uid++).toString(36).padStart(5, "0")}${Math.floor(rnd() * 1e6).toString(36)}`;

function genTree(depth: number): Node {
  const kids: Node[] = [];
  const nf = 2 + Math.floor(rnd() * 10);
  for (let i = 0; i < nf; i++) kids.push({ name: fname(), w: Math.max(5, lognormal(4.5, 1.1)) });
  if (depth > 0) {
    const nd = (depth >= 3 ? 2 : 0) + Math.floor(rnd() * 3);
    for (let i = 0; i < nd; i++) kids.push(genTree(depth - 1));
  }
  return { name: fname(), w: 0, children: kids };
}
const clone = (n: Node): Node => ({ name: n.name, w: n.w, children: n.children?.map(clone) });
const folders = (n: Node, acc: Node[] = []) => {
  if (n.children) {
    acc.push(n);
    n.children.forEach((c) => folders(c, acc));
  }
  return acc;
};
const leaves = (n: Node, p = "", acc: [string, Node][] = []) => {
  const path = p + "/" + n.name;
  if (!n.children) acc.push([path, n]);
  else n.children.forEach((c) => leaves(c, path, acc));
  return acc;
};
function sum(n: Node): number {
  return n.children ? n.children.reduce((s, c) => s + sum(c), 0) : n.w;
}

function evolve(t: Node): Node {
  const n = clone(t);
  const fs = folders(n),
    ls = leaves(n);
  for (let i = 0; i < 3; i++) {
    const l = ls[Math.floor(rnd() * ls.length)][1];
    l.w *= lognormal(0, 0.15);
  }
  if (rnd() < 0.5) {
    const f = fs[Math.floor(rnd() * fs.length)];
    f.children!.push({ name: fname(), w: Math.max(5, lognormal(4.5, 1.1)) });
  }
  if (rnd() < 0.1) {
    const f = fs[Math.floor(rnd() * fs.length)];
    f.children!.push(genTree(0));
  }
  if (rnd() < 0.2) {
    const f = fs[Math.floor(rnd() * fs.length)];
    const idx = f.children!.findIndex((c) => !c.children);
    if (idx >= 0 && f.children!.filter((c) => !c.children).length > 1) f.children!.splice(idx, 1);
  }
  return n;
}

// ---------- layouts ----------
type Out = Map<string, Rect>;
const worst = (row: number[], side: number) => {
  const s = row.reduce((a, b) => a + b, 0);
  const mx = Math.max(...row),
    mn = Math.min(...row);
  return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
};
function squarify(items: { k: string; a: number }[], r: Rect, out: Map<string, Rect>) {
  let { x, y, w, h } = r;
  let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h);
    const row = [items[i]];
    i++;
    while (
      i < items.length &&
      worst(
        [...row, items[i]].map((t) => t.a),
        side,
      ) <=
        worst(
          row.map((t) => t.a),
          side,
        )
    ) {
      row.push(items[i]);
      i++;
    }
    const s = row.reduce((a, t) => a + t.a, 0);
    if (w >= h) {
      const rw = s / h;
      let yy = y;
      for (const t of row) {
        const th = t.a / rw;
        out.set(t.k, { x, y: yy, w: rw, h: th });
        yy += th;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let xx = x;
      for (const t of row) {
        const tw = t.a / rh;
        out.set(t.k, { x: xx, y, w: tw, h: rh });
        xx += tw;
      }
      y += rh;
      h -= rh;
    }
  }
}
function treemap(n: Node, r: Rect, path: string, out: Out, mode: "sqr" | "osq" | "snd", depth = 0, wfn = sum) {
  const full = path + "/" + n.name;
  out.set(full, r);
  if (!n.children) return;
  let kids = n.children.map((c) => ({ c, a: wfn(c) }));
  const tot = kids.reduce((s, k) => s + k.a, 0);
  const scale = (r.w * r.h) / tot;
  if (mode === "sqr") kids.sort((p, q) => q.a - p.a);
  else kids.sort((p, q) => (p.c.name < q.c.name ? -1 : 1));
  const tmp = new Map<string, Rect>();
  if (mode === "snd") {
    let off = 0;
    for (const k of kids) {
      const fr = k.a / tot;
      const rr =
        depth % 2 === 0
          ? { x: r.x + off * r.w, y: r.y, w: fr * r.w, h: r.h }
          : { x: r.x, y: r.y + off * r.h, w: r.w, h: fr * r.h };
      tmp.set(k.c.name, rr);
      off += fr;
    }
  } else
    squarify(
      kids.map((k) => ({ k: k.c.name, a: k.a * scale })),
      r,
      tmp,
    );
  for (const k of kids) treemap(k.c, tmp.get(k.c.name)!, full, out, mode, depth + 1, wfn);
}
// proposed stateless: quantised weights + slack, ordered binary split by name (sliceable)
const B = Math.SQRT2;
const quant = (w: number) => Math.pow(B, Math.ceil(Math.log(Math.max(w, 1)) / Math.log(B)));
let LOCK: Map<string, number> | null = null;
let CUR = "";
function capOf(key: string, need: number): number {
  if (!LOCK) return quant(need);
  const old = LOCK.get(key);
  let cap = old ?? quant(need);
  if (need > cap)
    cap = quant(need); // grow only when full
  else if (need < cap / (B * B * B)) cap = quant(need); // shrink only when far too big (hysteresis)
  LOCK.set(key, cap);
  return cap;
}
function qsum(n: Node, path = CUR): number {
  const k = path + "/" + n.name;
  return n.children ? capOf(k, n.children.reduce((s, c) => s + qsum(c, k), 0) * 1.15) : capOf(k, n.w);
}
function binsplit(n: Node, r: Rect, path: string, out: Out) {
  const full = path + "/" + n.name;
  out.set(full, r);
  if (!n.children) return;
  const kids = [...n.children]
    .sort((p, q) => (p.name < q.name ? -1 : 1))
    .map((c) => ({ c, a: LOCK ? LOCK.get(full + "/" + c.name)! : qsum(c, full) }));
  const slack = (LOCK ? LOCK.get(full)! : qsum(n, path)) - kids.reduce((s, k) => s + k.a, 0);
  const items = [...kids, { c: null as Node | null, a: slack }]; // vacant lot at the end
  const rec = (its: typeof items, rr: Rect) => {
    if (its.length === 1) {
      if (its[0].c) binsplit(its[0].c, rr, full, out);
      return;
    }
    const tot = its.reduce((s, k) => s + k.a, 0);
    let acc = 0,
      cut = 1,
      best = Infinity;
    for (let i = 1; i < its.length; i++) {
      acc += its[i - 1].a;
      const d = Math.abs(acc - tot / 2);
      if (d < best) {
        best = d;
        cut = i;
      }
    }
    const left = its.slice(0, cut),
      right = its.slice(cut);
    const fr = left.reduce((s, k) => s + k.a, 0) / tot;
    if (rr.w >= rr.h) {
      rec(left, { ...rr, w: rr.w * fr });
      rec(right, { x: rr.x + rr.w * fr, y: rr.y, w: rr.w * (1 - fr), h: rr.h });
    } else {
      rec(left, { ...rr, h: rr.h * fr });
      rec(right, { x: rr.x, y: rr.y + rr.h * fr, w: rr.w, h: rr.h * (1 - fr) });
    }
  };
  rec(items, r);
}

// ---------- EvoStreets with slack, ghosts and lot quantisation (stateful plat) ----------
type V = [number, number];
type FolderLock = {
  order: string[];
  side: Record<string, 1 | -1>;
  ext: Record<string, [number, number]>;
  len: number;
  lres: number;
  rres: number;
};
const PLAT = new Map<string, FolderLock>();
const LOTS = new Map<string, number>();
const GAP = 1;
const roadW = (depth: number) => Math.max(2, 8 - 2 * depth);
function lotSide(key: string, w: number) {
  const need = Math.sqrt(w);
  const old = LOTS.get(key);
  let cap = old ?? quant(need * need) ** 0.5;
  if (need > cap) cap = quant(need * need) ** 0.5;
  else if (need < cap / 2) cap = quant(need * need) ** 0.5;
  LOTS.set(key, cap);
  return cap;
}
// returns [alongLen, leftRes, rightRes] of the node, filling its lock
function sizeOf(n: Node, key: string, depth: number): { len: number; l: number; r: number; leaf?: boolean } {
  if (!n.children) {
    const sd = lotSide(key, n.w);
    return { len: sd, l: sd, r: 0, leaf: true };
  }
  let lk = PLAT.get(key);
  const names = [...n.children].sort((p, q) => (p.name < q.name ? -1 : 1)).map((c) => c.name);
  const fresh = !lk;
  if (!lk) {
    lk = { order: [], side: {}, ext: {}, len: 0, lres: 0, rres: 0 };
    PLAT.set(key, lk);
  }
  const byName = new Map(n.children.map((c) => [c.name, c]));
  const sizes = new Map<string, { len: number; l: number; r: number; leaf?: boolean }>();
  for (const c of n.children) sizes.set(c.name, sizeOf(c, key + "/" + c.name, depth + 1));
  // along-parent extent of a child and its depth away from the street
  const extOf = (nm: string): [number, number] => {
    const z = sizes.get(nm)!;
    return z.leaf ? [z.len, z.len] : [z.l + roadW(depth + 1) + z.r, z.len];
  };
  const used = { 1: 0, [-1]: 0 } as Record<string, number>;
  for (const nm of lk.order) used[lk.side[nm]] += lk.ext[nm][0] + GAP;
  for (const nm of names)
    if (!lk.order.includes(nm)) {
      // new child: append at end, on the shorter side
      const sd: 1 | -1 = used[1] <= used[-1] ? 1 : -1;
      lk.order.push(nm);
      lk.side[nm] = sd;
      lk.ext[nm] = extOf(nm);
      used[sd] += lk.ext[nm][0] + GAP;
    }
  for (const nm of lk.order) if (byName.has(nm)) lk.ext[nm] = extOf(nm); // live children update; ghosts keep last extent
  let needLen = 0,
    needL = 0,
    needR = 0;
  const acc = { 1: GAP, [-1]: GAP } as Record<string, number>;
  for (const nm of lk.order) {
    const [e, d] = lk.ext[nm];
    acc[lk.side[nm]] += e + GAP;
    if (lk.side[nm] === 1) needL = Math.max(needL, d);
    else needR = Math.max(needR, d);
  }
  needLen = Math.max(acc[1], acc[-1]);
  const grow = (res: number, need: number) => (fresh || need > res || need < res / 2.5 ? need * 1.25 : res);
  lk.len = grow(lk.len, needLen);
  lk.lres = grow(lk.lres, needL);
  lk.rres = grow(lk.rres, needR);
  return { len: lk.len, l: lk.lres, r: lk.rres };
}
function placeEvo(n: Node, key: string, depth: number, O: V, u: V, v: V, out: Out) {
  const at = (a: number, b: number): V => [O[0] + u[0] * a + v[0] * b, O[1] + u[1] * a + v[1] * b];
  const box = (p: V, q: V): Rect => ({
    x: Math.min(p[0], q[0]),
    y: Math.min(p[1], q[1]),
    w: Math.abs(p[0] - q[0]),
    h: Math.abs(p[1] - q[1]),
  });
  const lk = PLAT.get(key)!;
  const W = roadW(depth);
  out.set(key, box(at(0, -W / 2 - lk.rres), at(lk.len, W / 2 + lk.lres)));
  const byName = new Map(n.children!.map((c) => [c.name, c]));
  const acc = { 1: GAP, [-1]: GAP } as Record<string, number>;
  for (const nm of lk.order) {
    const sd = lk.side[nm];
    const [e] = lk.ext[nm];
    const o = acc[sd];
    acc[sd] += e + GAP;
    const c = byName.get(nm);
    if (!c) continue; // ghost: vacant lot
    const ck = key + "/" + nm;
    if (!c.children) {
      const s2 = LOTS.get(ck)!;
      out.set(ck, box(at(o, (sd * W) / 2), at(o + s2, sd * (W / 2 + s2))));
      continue;
    }
    const cl = PLAT.get(ck)!;
    const cW = roadW(depth + 1);
    const centre = o + cl.lres + cW / 2;
    const cu: V = [v[0] * sd, v[1] * sd];
    const cv: V = [-u[0], -u[1]];
    placeEvo(c, ck, depth + 1, at(centre, (sd * W) / 2), cu, cv, out);
  }
}
function runEvo(t: Node): Out {
  const out: Out = new Map();
  sizeOf(t, "/" + t.name, 0);
  placeEvo(t, "/" + t.name, 0, [0, 0], [1, 0], [0, 1], out);
  return out;
}

function run(mode: string, t: Node): Out {
  if (mode === "evo") return runEvo(t);
  const out: Out = new Map();
  if (mode === "qbh") {
    if (!LOCK) LOCK = new Map();
    const s = Math.sqrt(qsum(t, ""));
    binsplit(t, { x: 0, y: 0, w: s, h: s }, "", out);
  } else if (mode === "qbs") {
    const s = Math.sqrt(qsum(t));
    binsplit(t, { x: 0, y: 0, w: s, h: s }, "", out);
  } else {
    const s = Math.sqrt(sum(t) * 1.15);
    treemap(t, { x: 0, y: 0, w: s, h: s }, "", out, mode as any);
  }
  return out;
}

const trees = [genTree(5)];
for (let i = 0; i < 80; i++) trees.push(evolve(trees[i]));
console.log(
  "leaves start/end:",
  leaves(trees[0]).length,
  leaves(trees[80]).length,
  "folders:",
  folders(trees[0]).length,
);
for (const mode of ["sqr", "osq", "snd", "qbs", "qbh", "evo"]) {
  let dA = 0,
    ld = 0,
    cascades = 0,
    disp = 0,
    cnt = 0,
    moved = 0,
    ar = 0,
    arn = 0,
    arBad = 0,
    worstStep = 0;
  let prev = run(mode, trees[0]);
  for (let i = 1; i < trees.length; i++) {
    const cur = run(mode, trees[i]);
    let stepMoved = 0,
      stepCnt = 0;
    const leafKeys = new Set(leaves(trees[i]).map(([p]) => p));
    const root = cur.get("/" + trees[i].name)!;
    const diag = Math.hypot(root.w, root.h);
    const leafSide = Math.sqrt(
      [...leafKeys].reduce((s3, k) => {
        const r = cur.get(k)!;
        return s3 + r.w * r.h;
      }, 0),
    );
    for (const k of leafKeys) {
      const a = prev.get(k),
        b = cur.get(k);
      const r = b!;
      const q = Math.max(r.w / r.h, r.h / r.w);
      ar += q;
      arn++;
      if (q > 4) arBad++;
      if (!a) continue;
      const d = Math.hypot(a.x + a.w / 2 - (b!.x + b!.w / 2), a.y + a.h / 2 - (b!.y + b!.h / 2)) / diag;
      const pk = k.slice(0, k.lastIndexOf("/"));
      const pa = prev.get(pk),
        pb = cur.get(pk);
      if (pa && pb)
        ld +=
          Math.hypot(
            (a.x + a.w / 2 - pa.x) / pa.w - (b!.x + b!.w / 2 - pb.x) / pb.w,
            (a.y + a.h / 2 - pa.y) / pa.h - (b!.y + b!.h / 2 - pb.y) / pb.h,
          ) / Math.SQRT2;
      dA += (d * diag) / leafSide;
      disp += d;
      cnt++;
      stepCnt++;
      if (d > 0.01) {
        moved++;
        stepMoved++;
      }
    }
    if (stepMoved / Math.max(1, stepCnt) > 0.25) cascades++;
    worstStep = Math.max(worstStep, stepMoved / Math.max(1, stepCnt));
    for (const f of folders(trees[i])) {
      /* folder AR measured below */
    }
    prev = cur;
  }
  {
    const t = trees[trees.length - 1];
    const cur = prev;
    let far = 0,
      fn = 0;
    const walk = (n: Node, p: string) => {
      const k = p + "/" + n.name;
      if (n.children) {
        const r = cur.get(k);
        if (r && r.w > 0 && r.h > 0) {
          far += Math.max(r.w / r.h, r.h / r.w);
          fn++;
        }
        n.children.forEach((c) => walk(c, k));
      }
    };
    walk(t, "");
    const root = cur.get("/" + t.name)!;
    const la = leaves(t).reduce((s2, [k]) => {
      const r = cur.get(k)!;
      return s2 + r.w * r.h;
    }, 0);
    console.log(
      "   " +
        mode +
        " final: mean folder-block AR " +
        (far / fn).toFixed(2) +
        " | leaf area / city bbox " +
        ((100 * la) / (root.w * root.h)).toFixed(1) +
        "%",
    );
  }
  console.log(
    `${mode}: mean centroid drift ${((100 * disp) / cnt).toFixed(3)}% of diag | leaves moved >1% diag per step ${((100 * moved) / cnt).toFixed(2)}% | mean AR ${(ar / arn).toFixed(2)} | AR>4 ${((100 * arBad) / arn).toFixed(1)}% | drift/sqrt(leafArea) ${((100 * dA) / cnt).toFixed(3)}% | local drift ${((100 * ld) / cnt).toFixed(2)}% | cascade steps(>25% moved) ${cascades}/80 | worst step moved ${(100 * worstStep).toFixed(1)}%`,
  );
}
// Probability that a +x% change crosses a log-bucket boundary (base B), uniform log-position assumption
for (const x of [0.01, 0.05, 0.1])
  console.log(
    `P(cross bucket | +${x * 100}%) base sqrt2 = ${((Math.log(1 + x) / Math.log(B)) * 100).toFixed(1)}%, base 2 = ${((Math.log(1 + x) / Math.log(2)) * 100).toFixed(1)}%`,
  );
```
