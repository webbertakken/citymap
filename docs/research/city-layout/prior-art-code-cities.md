# Prior art: software-as-city visualisations and their ground plans

Angle: how existing code-city tools lay out the ground plan (districts, blocks, parcels, streets), how stable that
layout is when the code changes, and what we should steal or avoid. Buildings (files) are out of scope except where
their footprint drives the plan.

## In short

- Almost every code city is one of four ground-plan families: **nested rectangle packing** (CodeCity, SoftVis3D
  "district", Getaviz, CodeMetropolis), **space-filling treemaps** (CodeCharta default, BabiaXR, most 2020s hobby
  projects), **street trees** (EvoStreets, SoftVis3D "evostreet", CodeCharta StreetMap, SEE) and **organic/graph**
  layouts (Gource, IslandViz, Software Cartography, repo-visualizer).
- Roads are, nearly everywhere, a by-product: the gap between platforms (packing, treemaps) or a single line per folder
  (street trees). No tool surveyed exposes a navigable road graph with junctions, or addressable parcels. That is our
  clearest opening.
- Stability is solved in the literature, and mostly ignored in shipped tools. Steinbrückner's EvoStreets dissertation
  (2013) measured it: street layouts with linear or grid packing and slice-and-dice treemaps are the most consistent;
  compactness-optimising rectangle packing (CodeCity's algorithm, used by SoftVis3D, Getaviz, CodeMetropolis) is the
  least consistent "for even very small changes".
- My own measurements, run on the shipped code, agree. SoftVis3D's "stable" evostreet layout moved 46 of 47 existing
  shapes when one folder sorting early ("auth") was added. Fixed-frame d3 treemaps made 50 to 81% of untouched files
  jump when one sibling folder was added or doubled.
- The best idea in the field is EvoStreets' growth rule: new children attach at the far end of the parent street, sides
  and order are frozen at first appearance, and removed things leave vacant lots. Only SEE (Uni Bremen) and the
  original EvoStreets research tool implement it. The rule depends on history, which conflicts with "same input, same
  map" unless the history is part of the input (git) or persisted.
- Visual style has barely moved since 2007: flat-shaded boxes on grey slabs. Recognisability comes from layout
  (Wettel's "consistent locality") and landmarks, not texture.

## Method

- Cloned and read layout code at these commits (all inspected on 2026-10-10):
  SoftVis3D `b1418e0`, its layout library codecity-visualizer `74954f7`, CodeCharta `ebb2bf2`, SEE `0448cdb`,
  Gource `70db547`, Getaviz `4df6211`, CodeMetropolis `26193b2`, IslandViz `fb8b371`, ExplorViz frontend `d8e3cc8`,
  BabiaXR components `221f4fe`, gocity `f2b5f40`, JSCity `1d54dc9`, repo-visualizer `a999615`, git-truck `c37b30e`,
  hyt0019/code-city `28914e7`, Manavarya09/code-city `978001a`.
- Read primary texts: Wettel's PhD thesis (2010), Steinbrückner's PhD thesis (2013), Kuhn et al. (2008), Khaloo et al.
  (2017), plus abstracts via OpenAlex/Crossref for papers behind paywalls.
- Ran two small bun experiments (code in the appendix) to measure stability rather than take claims on trust.
- Licence, stars and activity from the GitHub REST API on 2026-10-10.
- Anything not confirmed from a primary source or code is marked **(unverified)**.

## The four families at a glance

| Family                                               | Tools                                                                              | Roads                                                          | Stable under small change?                                                                           | Looks like a city?                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Nested rectangle packing (kd-tree "lightmap" packer) | CodeCity, SoftVis3D district, Getaviz, CodeMetropolis, gocity, JSCity              | Gaps between nested platforms                                  | No: inputs re-sorted by size each run                                                                | Dense downtown, no streets            |
| Space-filling treemap                                | CodeCharta (default), BabiaXR, git-truck, hyt0019/code-city, many 2026 hobby tools | Padding strips                                                 | No for squarified; better for slice-and-dice, pivot, Hilbert/Moore, local moves                      | Grid of slabs; "Manhattan from orbit" |
| Street tree (EvoStreets)                             | EvoStreets, SoftVis3D evostreet, CodeCharta StreetMap/TreeMapStreet, SEE           | One straight road per folder, alternating orientation by depth | Yes, if insertion order and sides are frozen (EvoStreets, SEE); no otherwise (SoftVis3D, CodeCharta) | Suburban fishbone, long and sparse    |
| Organic / graph / terrain                            | Gource, IslandViz, Software Cartography, repo-visualizer, ExplorViz spiral         | None, or dependency edges                                      | Varies; force simulations are not deterministic                                                      | Islands, galaxies, terrain            |

## Tool by tool

### CodeCity (Wettel and Lanza, 2007 to 2010)

- **Ground plan.** Packages are nested districts; classes are buildings. The layout is a rectangle packing derived from
  the blackpawn lightmap packer, using a 2D kd-tree (`ptree`) to partition space. Elements are sorted by size,
  descending; each is placed in an empty node that either "preserves" the covered rectangle (pick least waste) or
  "expands" it (pick the aspect ratio closest to 1). It runs recursively, post-order, leaves first
  ([Wettel thesis §3.3.3, pp. 33-37](https://wettel.github.io/download/Wettel10b-PhDThesis.pdf)).
- **Why packing, not a treemap.** Treemaps cannot honour pre-given building dimensions; packing can, at the cost of
  not knowing the final area up front (same source, p. 34). The Jeffery survey says CodeCity used a treemap; the thesis
  contradicts it ([Jeffery 2019](https://doi.org/10.24132/csrn.2019.2901.1.18)).
- **Stability.** Within one version, sorting by size means any size change can reorder the packing. For evolution,
  Wettel gives every element a "lifetime real estate": an empty space that "cannot be occupied by other artifacts" when
  the element does not exist yet or any more. He calls the result "consistent locality", and pays for it in extra space
  ([thesis §4.6 and §4.9 "Discussion"](https://wettel.github.io/download/Wettel10b-PhDThesis.pdf);
  [WCRE 2008](https://doi.org/10.1109/wcre.2008.55)). This is the retrospective "supergraph" approach: lay out the
  union of all versions once, then filter.
- **Roads.** None. Districts are stacked platforms whose elevation shows nesting depth.
- **Scale.** ArgoUML: 1,817 buildings on 88 districts (thesis, Fig. 3.8). Up to about 8,000 classes per the survey.
- **Style.** Flat-shaded boxes on grey platforms; screenshot: [codecity_screenshot.png](https://wettel.github.io/pics/codecity_screenshot.png).
- **Licence / activity.** Binary-only download, release 1.4.3, VisualWorks Smalltalk on Moose
  ([download page](https://wettel.github.io/codecity-download.html)). Licence not stated **(unverified)**. Dormant.

### SoftVis3D (Rinderle and Niedrich; SonarQube plugin)

SoftVis3D delegates layout to the MIT-licensed `codecity-visualizer` library
([npm 0.4.6](https://www.npmjs.com/package/codecity-visualizer),
[repo](https://github.com/yvo-niedrich/codecity-visualizer), last commit 2017-05-14). SoftVis3D supplies parameters
([LayoutProcessor.ts](https://github.com/stefanrinderle/softvis3d/blob/b1418e02d16b1eea238d4bed346fc46c005eeea9/softvis3d-frontend/src/services/layout/LayoutProcessor.ts)).

**District layout** ([District.ts](https://github.com/yvo-niedrich/codecity-visualizer/blob/74954f737516f54e58fd04908c2304eb1dac35d8/src/illustrator/District.ts),
[Districts.ts](https://github.com/yvo-niedrich/codecity-visualizer/blob/74954f737516f54e58fd04908c2304eb1dac35d8/src/illustrator/container/specific/Districts.ts),
[Lightmap.ts](https://github.com/yvo-niedrich/codecity-visualizer/blob/74954f737516f54e58fd04908c2304eb1dac35d8/src/illustrator/container/universal/Lightmap.ts)):

- A faithful port of Wettel's algorithm: `Lightmap` sorts shapes by base area descending, builds a binary split tree
  sized to the worst case (sum of lengths by sum of widths), prefers "preserver" candidates by least waste, else
  "expander" candidates by best aspect ratio.
- Each folder is a `PlatformContainer`; the folder's own files are packed as one more sub-district beside the
  sub-folders.
- SoftVis3D parameters: `layout.tower: false` (collapse single-child folder chains), `house.margin: 8`,
  `spacer.margin: 25`, `spacer.padding: 20`; library default platform height 10.
- Screenshot: [cityLayoutExampleGuava.jpg](https://raw.githubusercontent.com/stefanrinderle/softvis3d/master/docs/images/cityLayoutExampleGuava.jpg).

**Evostreet layout** ([Evostreet.ts](https://github.com/yvo-niedrich/codecity-visualizer/blob/74954f737516f54e58fd04908c2304eb1dac35d8/src/illustrator/Evostreet.ts),
[Streets.ts](https://github.com/yvo-niedrich/codecity-visualizer/blob/74954f737516f54e58fd04908c2304eb1dac35d8/src/illustrator/container/specific/Streets.ts)):

- The root folder is a `Highway`; every other folder is a `Street`; files are `House`s. Each `StreetContainer` places
  its road through the middle, then **branches (sub-folders) first**, segment by segment, then a "terra nullius"
  gap, then houses. Containers rotate by -90° per level, so orientation alternates.
- Parameters SoftVis3D sets: `layout.snail: false` (collapse single-child chains), `house.margin: 9`,
  `highway.length: 50`, `spacer.initial: 30`, `spacer.terranullius: 40`, `spacer.conclusive: 0`,
  `spacer.branches: 50`, `road.trim: true`, houses packed with `Lightmap`, `house.distribution: "left"` (all files on
  one side), house platforms 1 unit high in `0xd5d5d5`. Library default street length is 20.
- Branch distribution stays at the library default: `(i % 2) ? left : right`
  ([Streets.ts line 360](https://github.com/yvo-niedrich/codecity-visualizer/blob/74954f737516f54e58fd04908c2304eb1dac35d8/src/illustrator/container/specific/Streets.ts#L360)).
  Children arrive sorted by `name.localeCompare` with folders first
  ([TreeElement.ts](https://github.com/stefanrinderle/softvis3d/blob/b1418e02d16b1eea238d4bed346fc46c005eeea9/softvis3d-frontend/src/classes/TreeElement.ts)).
- Screenshot: [evostreetsExampleGuava.jpg](https://raw.githubusercontent.com/stefanrinderle/softvis3d/master/docs/images/evostreetsExampleGuava.jpg).

**Critique.**

- The UI calls evostreet "a stable layout for visualizing evolving software systems"
  ([Layouts.ts](https://github.com/stefanrinderle/softvis3d/blob/b1418e02d16b1eea238d4bed346fc46c005eeea9/softvis3d-frontend/src/constants/Layouts.ts)).
  It is not stable. SoftVis3D feeds a single version (`_versions = [this._version]` in
  [Softvis3dModel.ts](https://github.com/stefanrinderle/softvis3d/blob/b1418e02d16b1eea238d4bed346fc46c005eeea9/softvis3d-frontend/src/services/layout/Softvis3dModel.ts))
  and keeps no previous layout. Alphabetical order plus `i % 2` sides means inserting one folder flips the side of
  every later sibling. Measured: adding `src/auth` beside seven siblings changed the relative position of 46 of 47
  existing shapes; adding `src/zeta`, which sorts last, changed 1 of 47 (appendix, experiment A).
- `localeCompare` without a fixed locale makes ordering depend on the runtime's locale: a determinism risk across
  machines.
- Houses on one side only and branches 50 units apart produce long, sparse fishbones with large dead areas (visible in
  the Guava screenshot).
- The road is a slab, not a graph: no junction objects, no addresses.
- **Licence / activity.** LGPL-3.0; repository archived; last push 2023-09-18
  ([GitHub API](https://api.github.com/repos/stefanrinderle/softvis3d)). softvis3d.com did not respond on 2026-10-10.

### EvoStreets (Steinbrückner and Lewerentz, 2010 to 2013)

Primary source: Steinbrückner's dissertation "Consistent Software Cities" (BTU Cottbus, 2013)
([opus4](https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf),
[archived copy](http://web.archive.org/web/20200723205723id_/https://opus4.kobv.de/opus4-btu/frontdoor/deliver/index/docId/1681/file/Dissertation_Steinbrueckner_F.pdf)),
plus [SoftVis 2010](https://doi.org/10.1145/1879211.1879239) and
[Information Visualization 2012](https://doi.org/10.1177/1473871612438785).

- **Ground plan.** Inner tree nodes are straight lines (streets); leaves are rectangles attached to both sides.
  Orientation alternates by depth. EvoStreets is explicitly built on slice-and-dice treemap ideas (§4.4.2).
- **Growth rules** (§4.4, pp. 63-65), the most important text in this survey:
  - New nodes "are attached to the far end of their direct ancestor's line representation", extending the street;
    sets of new siblings are spread evenly over both sides.
  - Removed nodes are **not removed**; they stay, drawn in another colour or transparent.
  - When a node grows, later nodes on the same side shift along; shifts can cascade upwards.
  - Sides and initial sibling order are preserved forever.
  - Moves are treated as delete plus add.
  - Consequence: cities grow at the periphery, old structures concentrate in the centre.
- **History made visible.** Because growth is ordered, node age maps to elevation (older is higher), smoothed into a
  terrain with contour lines (§4.4.2, Figs. 4.13 to 4.16).
- **Compactness fix.** Long streets waste space, so leaves can be packed into blocks: linear, grid, "shortest
  distance", or CodeCity packing (Fig. 4.11).
- **Measured result** (ch. 5, 6 to 49 versions of Ant, Spring, ArgoUML, Hibernate and others): EvoStreets-Linear,
  EvoStreets-Grid and slice-and-dice are the most consistent by node displacement, neighbourhood and ordering. CodeCity
  packing "clearly falls behind... for even very small changes". Grid packing keeps consistency; compactness-driven
  packing destroys it. Verdict: **EvoStreets-Grid "fulfills all requirements best"** (§5.4, p. 119).
- The thesis also names the alternative: a retrospective supergraph of all versions gives "highly consistent"
  sequences but does not keep consistency between successive analyses (§4.1).
- **Licence / activity.** Research tool; no public code found **(unverified)**. Images:
  [Jeffery 2019, Fig. 4](https://doi.org/10.24132/csrn.2019.2901.1.18).

### SEE, Software Engineering Experience (University of Bremen, Koschke group)

- Unity/C#, MIT, actively maintained (last push 2026-10-09) ([repo](https://github.com/uni-bremen-agst/SEE)).
- Ships many node layouts: EvoStreets, rectangle packing (Wettel, "page 35" cited in code), treemap, circle packing,
  balloon (Jeong and Pang 1998), reflexion, and **IncrementalTreeMap**
  ([NodeLayouts](https://github.com/uni-bremen-agst/SEE/tree/0448cdbb4cf5f86b5fc573b9851aeab2e2f88e02/Assets/SEE/Layout/NodeLayouts)).
- **Incremental EvoStreets** ([EInner.cs](https://github.com/uni-bremen-agst/SEE/blob/0448cdbb4cf5f86b5fc573b9851aeab2e2f88e02/Assets/SEE/Layout/NodeLayouts/EvoStreets/EInner.cs)):
  given the previous layout, existing children keep their side and their order (sorted by previous world position),
  and new children are aligned after them at the end of the street. That is Steinbrückner's rule, in open code.
- Street width is 0.3 times the mean leaf footprint; building offset is 0.3 times the root street width
  ([EvoStreetsNodeLayout.cs](https://github.com/uni-bremen-agst/SEE/blob/0448cdbb4cf5f86b5fc573b9851aeab2e2f88e02/Assets/SEE/Layout/NodeLayouts/EvoStreetsNodeLayout.cs)).
- **IncrementalTreeMap** ([IncrementalTreeMapLayout.cs](https://github.com/uni-bremen-agst/SEE/blob/0448cdbb4cf5f86b5fc573b9851aeab2e2f88e02/Assets/SEE/Layout/NodeLayouts/IncrementalTreeMapLayout.cs)):
  first layout by Nagamochi and Abe dissection; later layouts by Sondag, Speckmann and Verbeek's local moves (flip and
  stretch), with sizes corrected by Eppstein et al.'s area-universal gradient method. A new node splits the node with
  the worst aspect ratio ([LocalMoves.cs](https://github.com/uni-bremen-agst/SEE/blob/0448cdbb4cf5f86b5fc573b9851aeab2e2f88e02/Assets/SEE/Layout/NodeLayouts/IncrementalTreeMap/LocalMoves.cs));
  a bounded search over local moves then improves quality. Design notes:
  [SEE project report 2023, §4.9](https://raw.githubusercontent.com/wiki/uni-bremen-agst/SEE/literature/SEE_Projektbericht_2023.pdf).
- **Caveat.** Both incremental layouts depend on `OldLayout`: the map is a function of the previous map, not of the
  snapshot alone.

### CodeCharta (MaibornWolff)

BSD-3-Clause, 547 stars, very active (last push 2026-10-10) ([repo](https://github.com/MaibornWolff/codecharta)).
Five layouts: Squarified TreeMap (default), StreetMap, TreeMapStreet, Sunburst, Radial TreeMap
([layout docs](https://github.com/MaibornWolff/codecharta/blob/ebb2bf2b1eb1f647a3f1e71f87ec63ab7a280f89/gh-pages/src/content/docs/docs/visualization/user-controls/layouts.md)).

- **Squarified treemap** ([treeMapGenerator.ts](https://github.com/MaibornWolff/codecharta/blob/ebb2bf2b1eb1f647a3f1e71f87ec63ab7a280f89/visualization/app/codeCharta/renderer/threeViewer/algorithm/treeMapLayout/treeMapGenerator.ts)):
  d3-hierarchy `treemap()` with the default tile (squarify, golden ratio,
  [d3 docs](https://github.com/d3/d3-hierarchy#treemapSquarify)), no `.sort()`, so input order. Padding scales with
  the mean child footprint (`MARGIN_TO_CHILD_SIZE_FRACTION = 0.0005`); floor labels reserve a strip on the right of
  the top three levels. Map size grows with `2·sqrt(nodeCount)` times margin.
- **Fixed folders.** `cc.json` may give direct children of the root a `fixedPosition {left, top, width, height}` in a
  0 to 100 frame, non-overlapping
  ([schema changelog 1.2](https://github.com/MaibornWolff/codecharta/blob/ebb2bf2b1eb1f647a3f1e71f87ec63ab7a280f89/CC_JSON_SCHEMA_CHANGELOG.md)).
  That is manual, top-level-only stability: a persisted layout hint.
- **StreetMap** ([streetLayoutGenerator.ts](https://github.com/MaibornWolff/codecharta/blob/ebb2bf2b1eb1f647a3f1e71f87ec63ab7a280f89/visualization/app/codeCharta/renderer/threeViewer/algorithm/streetLayout/streetLayoutGenerator.ts),
  [horizontalStreet.ts](https://github.com/MaibornWolff/codecharta/blob/ebb2bf2b1eb1f647a3f1e71f87ec63ab7a280f89/visualization/app/codeCharta/renderer/threeViewer/algorithm/streetLayout/horizontalStreet.ts),
  [street.ts](https://github.com/MaibornWolff/codecharta/blob/ebb2bf2b1eb1f647a3f1e71f87ec63ab7a280f89/visualization/app/codeCharta/renderer/threeViewer/algorithm/streetLayout/street.ts)):
  - Orientation alternates by depth. Children go to the top row until half the total length is used, the rest to the
    bottom row, reversed (a U-turn). Vertical streets put files before folders.
  - Houses are squares of side `sqrt(areaMetric)`.
  - Street thickness scales with file count: `8 + 0.001·files` at root level, `2 + 0.0005·files` below. A cheap road
    hierarchy.
  - `mergeDirectories` collapses single-child chains into `a/b` labels.
- **TreeMapStreet.** Folders with at most `maxTreeMapFiles` files (default 100, range 1 to 1000) become squarified
  blocks sorted by size descending; larger folders become streets. A street network with packed blocks, structurally
  close to EvoStreets-Grid.
- **Critique.** No history, no insertion memory. Half-length row splitting means one growing child can move its
  siblings to the opposite side. Treemap input order comes from the `cc.json` producer. Screenshots:
  [map.jpeg](https://raw.githubusercontent.com/MaibornWolff/codecharta/main/gh-pages/public/assets/images/docs/visualization/user-controls/map.jpeg),
  [layout picker](https://raw.githubusercontent.com/MaibornWolff/codecharta/main/gh-pages/public/assets/images/docs/visualization/user-controls/metrics-layout.jpeg).
  Style: deep-green blocks on charcoal slabs, folder names on the floor. Legible, not urban.

### CodeMetropolis (Balogh and Beszédes, 2013)

- Renders into Minecraft (1.8 officially). Pipeline: SourceMeter graph, then converter, mapping, **placing**,
  rendering ([README](https://github.com/codemetropolis/CodeMetropolis);
  [VISSOFT 2013](https://doi.org/10.1109/vissoft.2013.6650528)).
- Placing offers `PackLayout`: children sorted by size descending, then the blackpawn lightmap packer, starting at the
  largest child's size and growing the container by one block per failed attempt
  ([PackLayout.java](https://github.com/codemetropolis/CodeMetropolis/blob/26193b2ba295d4808c0611d4447f0a8ae11f6258/sources/toolchain/placing/src/main/java/codemetropolis/toolchain/placing/layout/pack/PackLayout.java)).
  `TetrisLayout` sorts by width descending. Everything is on an integer block grid, which comes free with Minecraft.
- **Critique.** Same instability as CodeCity packing. Minecraft gives walkability and texture for free; the plan is
  still a packing. No licence file at HEAD; last commit 2024-11-22.

### Code Park (Khaloo et al., 2017)

- Each class is a room on a grassy "park" ground; rooms are grouped by directory and labelled; first-person and bird's
  eye views; code is readable on the walls ([arXiv 1708.02174](https://arxiv.org/abs/1708.02174)).
- No placement algorithm is described beyond grouping by directory. In the study, participants arranged classes
  themselves, often one line or one cluster per directory, alphabetically within it (second user study, §V). A hint that users value predictable order over packing density.
- Code not found **(unverified)**.

### VR City (Vincur, Návrat and Polášek, 2017)

- A modified city metaphor in VR with "a new layouting algorithm that... position[s] the buildings according to the
  coupling between classes", method-level storeys, and trace and modification overlays
  ([abstract via OpenAlex for doi 10.1109/qrs-c.2017.88](https://api.openalex.org/works/https://doi.org/10.1109/qrs-c.2017.88)).
  Jeffery's survey describes it as organic, with contact area between buildings proportional to coupling: "somewhat
  jigsaw-like" ([Jeffery 2019](https://doi.org/10.24132/csrn.2019.2901.1.18)).
- Algorithm details and code not verified **(unverified)**. A coupling-driven layout moves whenever dependencies
  change: the opposite of what we need for the ground plan, though fine for an overlay.

### Software cities (Panas et al., 2003 and 2007) and Vizz3D

- Panas, Berrigan and Grundy proposed a 3D city for software production cost information
  ([IV 2003](https://doi.org/10.1109/iv.2003.1217996)). Panas et al. 2007 used Vizz3D for C++: member functions as
  buildings on a blue platform per class, "water towers" for header dependencies, gprof timing overlays
  ([ICECCS 2007](https://doi.org/10.1109/iceccs.2007.20); described in
  [Jeffery 2019](https://doi.org/10.24132/csrn.2019.2901.1.18)).
- Ground-plan algorithm not available to me **(unverified)**. Its lasting contribution is richer urban furniture
  (water towers, traffic), not layout.

### Getaviz, ExplorViz and BabiaXR (active research toolkits)

- **Getaviz** (Leipzig): Apache-2.0, last push 2023-04. City layout is a Java port of Wettel's kd-tree packing with
  size-descending sort
  ([CityLayout.java](https://github.com/softvis-research/Getaviz/blob/4df62116f1932e4dd6ce7f2b9cd693cda026c5d9/generator2/org.getaviz.generator/src/main/java/org/getaviz/generator/city/m2m/CityLayout.java)).
  Inherits its instability.
- **ExplorViz** (Kiel): web, Three.js; layout by ELK. City default `box`, districts default `rectpacking`
  ([default-settings.ts L619, L668](https://github.com/ExplorViz/frontend/blob/d8e3cc86f565ddf6188fa3ad9c6b81190d75bb25/src/utils/settings/default-settings.ts)).
  An optional **spiral building layout orders buildings by first appearance in the evolution, then by name**
  ([spiral-layouter.ts L53](https://github.com/ExplorViz/frontend/blob/d8e3cc86f565ddf6188fa3ad9c6b81190d75bb25/src/utils/layout/spiral-layouter.ts#L53)):
  age-ordered growth outward, the same idea as EvoStreets. Recent work: semantic zoom and mini-maps
  ([arXiv 2510.00003](https://arxiv.org/abs/2510.00003)) and the Linux kernel, 40M+ lines, as a city
  ([arXiv 2610.09910](https://arxiv.org/abs/2610.09910)). No licence file in the frontend repo at HEAD.
- **BabiaXR** (URJC): A-Frame, GPL-3.0, active on GitLab
  ([repo](https://gitlab.com/babiaxr/aframe-babia-components)). `babia-city` splits rectangles "naive" (strip) or
  "pivot" (ordered treemap), and accepts a `max_area` field: a lifetime footprint, as in Wettel
  ([babia-city.js](https://gitlab.com/babiaxr/aframe-babia-components/-/blob/221f4fe3ad359a685cd995ccae191f90d5ef4d27/components/visualizers/babia-city.js)).
  Studied on screen vs VR ([IST 2022](https://doi.org/10.1016/j.infsof.2022.107064)).

### IslandViz (DLR, 2018)

- OSGi bundles become islands; packages become coloured regions grown over a relaxed Voronoi tessellation (50 by 50
  seed points), largest package first; coastlines and height profiles shaped around them. Islands are placed by a
  force-directed simulation whose springs are dependency weights
  ([IslandStructureConstructor.cs](https://github.com/DLR-SC/island-viz/blob/fb8b3710ceddfe6aeb940cf6d874bce387d7e256/Assets/OsgiViz_Classes/Constructors/IslandStructureConstructor.cs),
  [Graph_Layout_Constructor.cs](https://github.com/DLR-SC/island-viz/blob/fb8b3710ceddfe6aeb940cf6d874bce387d7e256/Assets/OsgiViz_Classes/Constructors/Graph_Layout_Constructor.cs);
  [VISSOFT 2018](https://doi.org/10.1109/vissoft.2018.00020)). Apache-2.0, last push 2024-06.
- **Good:** a convincing polycentric archetype; organic boundaries from Voronoi cells; per-island seeding.
- **Bad:** the seed is `name.GetHashCode() + 200`. .NET does not guarantee string hash codes are stable across
  implementations, versions or processes ([Microsoft docs](https://learn.microsoft.com/en-us/dotnet/api/system.string.gethashcode)).
  Force layouts move when any dependency changes.

### Gource (Caudwell)

- Animated history, not a map. Directories are nodes in a physics simulation: repelled by siblings, pulled onto
  their parent's radius, pushed along the grandparent-to-parent direction; coincident nodes are separated with
  `rand()` ([dirnode.cpp L604-L720](https://github.com/acaudwell/Gource/blob/70db547c6b8b40745fb41a8db7e8d28897be1a9e/src/dirnode.cpp#L604-L720)).
  Files sit in concentric rings round their directory, ring _n_ holding about _n_·π files
  ([L842-L880](https://github.com/acaudwell/Gource/blob/70db547c6b8b40745fb41a8db7e8d28897be1a9e/src/dirnode.cpp#L842-L880)).
- GPL-3.0, 13.1k stars, last push 2026-03 ([repo](https://github.com/acaudwell/Gource), [site](https://gource.io)).
- **Steal:** ring packing for small leaf sets (a hamlet around a green); the sense of growth over time.
  **Avoid:** physics as the source of truth; it is path- and frame-rate-dependent.

### Software Cartography (Kuhn, Loretan and Nierstrasz, 2008)

- Positions come from vocabulary, not hierarchy: LSI over identifiers, then MDS to 2D, rendered as hill-shaded terrain
  with contour lines. The authors argue vocabulary is more stable than structure, so the layout stays consistent across
  versions ([arXiv 1209.5490](https://arxiv.org/abs/1209.5490); [WCRE 2008](https://doi.org/10.1109/WCRE.2008.45)).
- **Steal:** the cartographic rendering (contours, hill-shading) for terrain and water. **Avoid:** semantic
  positioning for the ground plan; folders would not be contiguous districts.

### SeeSoft (Eick, Steffen and Sumner, 1992)

- Each line of code is a thin coloured row, files are columns; up to 50,000 lines at once
  ([TSE 1992](https://doi.org/10.1109/32.177365)).
- Relevance: the ancestor of pixel-per-unit views. A SeeSoft column is a good model for a building facade or a parcel
  strip at close zoom, not for the plan.

### Contribution cities: GitHub Skyline, isometric contributions, GitHub City, Git City

- [gh-skyline](https://github.com/github/gh-skyline) (MIT): an STL of the 53-by-7 contribution calendar.
  [isometric-contributions](https://github.com/jasonlong/isometric-contributions) (MIT, 3.7k stars): isometric pixel-art
  calendar. [GithubCity](https://github.com/honzaap/GithubCity) (Apache-2.0, 1.3k stars): a Three.js city from the
  contribution graph. [Git City](https://github.com/srizzon/git-city) (AGPL-3.0, 5.8k stars): every GitHub user is one
  pixel-art building ([thegitcity.com](https://thegitcity.com)).
- None lays out a repository. They matter for **style and virality**: isometric pixel art and "my profile as a city"
  draw far more stars than any research tool. The ground plan is a calendar grid.

### Repository maps without the city metaphor: repo-visualizer, git-truck

- [repo-visualizer](https://github.com/githubocto/repo-visualizer) (GitHub Next, MIT, archived, 1.3k stars): d3
  `pack()` circle packing, then a force simulation to reflow circles horizontally
  ([Tree.tsx](https://github.com/githubocto/repo-visualizer/blob/a999615bdab757559bf94bda1fe6eef232765f85/src/Tree.tsx)).
- [git-truck](https://github.com/git-truck/git-truck) (MIT, active): circle packing or treemap with
  `treemapResquarify`, sorted by value descending
  ([Chart.tsx L622-L632](https://github.com/git-truck/git-truck/blob/c37b30eba4da091cc9f718c76442b238ab7e3119/src/components/Chart.tsx#L622-L632)).
  Resquarify "preserves the topology... of the previous layout" for value changes only, and only within a session
  ([d3 docs](https://github.com/d3/d3-hierarchy#treemapResquarify)).

### 2017 to 2026 hobby and newcomer code cities

| Project                                                                       | Layout                                                                                                                                                                                                                                                                             | Deterministic   | Stable                                                                    | Notes                                                                            |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [gocity](https://github.com/rodrigo-brito/gocity) (MIT, 1.8k stars, 2025-12)  | Children sorted by width descending, then column-wise shelf packing with `ceil(sqrt(n))` per column ([position.go](https://github.com/rodrigo-brito/gocity/blob/f2b5f40ced5929a8de100a87fec53bac0d296a06/pkg/model/position.go))                                                   | Yes             | No                                                                        | Go only                                                                          |
| [JSCity](https://github.com/aserg-ufmg/JSCity) (GPL-2.0, 1.4k stars, 2019)    | Row-major grid with `floor(sqrt(n))` columns in alphabetical order ([city.js L140-L190](https://github.com/aserg-ufmg/JSCity/blob/1d54dc991a768294be21b73ef8b0445b40f4fea5/js/city.js#L140-L190); [arXiv 1705.05476](https://arxiv.org/abs/1705.05476))                            | Yes             | No: insertions shift everything after them; column count jumps at squares | Browser                                                                          |
| [hyt0019/code-city](https://github.com/hyt0019/code-city) (MIT, 2026)         | Three levels (repo, top folder, file), d3 squarify sorted by value then key; log-weighted land `4 + log2(lines+1)`; side `max(168, ceil(sqrt(files)·23))` ([treemap.ts](https://github.com/hyt0019/code-city/blob/28914e7b55d4b3f4ba7692a79a3a46d4372fb248/src/layout/treemap.ts)) | Yes, explicitly | No (see experiment B)                                                     | Isometric SVG banners; nice style ([demo](https://hyt0019.github.io/code-city/)) |
| [Manavarya09/code-city](https://github.com/Manavarya09/code-city) (MIT, 2026) | Hand-rolled squarified treemap; filler buildings and colours from `Math.random()` ([city.js](https://github.com/Manavarya09/code-city/blob/978001a4d259b95c8e431a12fbb3ba115ce85936/app/city.js))                                                                                  | No              | No                                                                        | Typical of the 2026 wave                                                         |

GitHub topic search on 2026-10-10 shows many more 2026 "codebase as a 3D city" repositories with near-zero stars
([topic search](https://api.github.com/search/repositories?q=topic:code-visualization+city)). The ones I read all use a
fill-the-square treemap with no stability story.

## Experiments: how stable are the shipped algorithms?

Both scripts are in the appendix; run with `bun`.

**A. SoftVis3D settings on codecity-visualizer 0.4.6.** Seven sibling folders under `src/` with 3 to 7 equal-size
files each. Measured relative positions (anchored on one file) before and after adding one folder.

| Layout    | Add `auth` (sorts early) | Add `zeta` (sorts last) |
| --------- | ------------------------ | ----------------------- |
| evostreet | 46 / 47 shapes moved     | 1 / 47                  |
| district  | 41 / 47                  | 5 / 47                  |

Reading: stability depends entirely on where the new item lands in the sort order. Append-at-end is almost free;
insert-in-the-middle reshuffles the city. This is why EvoStreets freezes order by first appearance instead of by name.

**B. d3 treemaps in a fixed square frame.** 50 random trees of 8 folders with 5 to 24 files (heavy-tailed sizes).
Share of files _outside_ the changed folder whose centre moved more than half their own size:

| Tiling                                                   | Add a sibling folder | Double one folder |
| -------------------------------------------------------- | -------------------- | ----------------- |
| squarify, sorted by size (d3 advice; hyt0019, git-truck) | 72%                  | 81%               |
| squarify, input order (CodeCharta)                       | 79%                  | 81%               |
| binary, input order                                      | 67%                  | 75%               |
| slice-and-dice, input order                              | 50%                  | 56%               |

Reading: any layout that re-divides a fixed frame must move its neighbours when one part grows. Slice-and-dice is the
least bad, matching Steinbrückner's ranking, but still moves half the city. To move nothing, the city has to be allowed
to **grow outward** (extend a street, add a block at the edge) instead of re-dividing a fixed square. Tiny changes (one
file +20%) moved nothing visibly in any tiling; the trouble is structural change.

## Cross-cutting critique: where the field falls short

1. **Roads are leftovers.** In packing and treemaps a "street" is padding. In street trees it is one slab per folder
   with no junction semantics. Nobody models intersections, road classes, blocks bounded by roads, or a routable graph.
   That blocks our later uses: walking, Monopoly-style movement, addresses.
2. **No parcels.** Buildings are placed directly; there is no lot that persists when the building is demolished,
   except in Wettel's lifetime real estate, EvoStreets' grey removed nodes and BabiaXR's `max_area`.
3. **Sort-by-size is the main source of instability.** It is used by CodeCity, Getaviz, CodeMetropolis, gocity,
   IslandViz, CodeCharta's TreeMapStreet blocks and most treemaps. It gives density and destroys locality.
4. **Fixed-frame thinking.** Treemaps fill a given square, so growth anywhere is paid for everywhere (experiment B).
5. **Hidden non-determinism.** Locale-dependent sorting (SoftVis3D), runtime hash seeds (IslandViz), `Math.random`
   (2026 newcomers), physics with `rand()` (Gource), force simulations (repo-visualizer, IslandViz placement).
6. **Stability through memory makes maps path-dependent.** SEE's incremental layouts and d3 resquarify need the
   previous layout. Two people opening the same commit by different routes can then see different cities, unless the
   history is part of the input (git birth order) or the layout is persisted (CodeCharta `fixedPosition`).
7. **One archetype for every repo.** No tool switches archetype by repo shape. A 15-file repo and a 3,000-folder
   monorepo get the same slabs. IslandViz (islands per bundle) and ExplorViz (one city per application in a landscape)
   come closest to polycentric.
8. **Aesthetics are stuck in 2007.** Flat boxes on grey or black slabs, labels on the floor. The visually appealing
   projects (Git City, isometric-contributions, hyt0019) have no stable layout. Nobody has both.
9. **Thin-street pathologies.** Pure EvoStreets produce very long streets for wide folders (Steinbrückner Fig. 4.12a)
   and large dead zones (SoftVis3D's Guava screenshot). Hence grid packing of leaves into blocks.

## Ideas to steal

- **EvoStreets growth rule** (Steinbrückner §4.4): attach new children at the far end; freeze side and order at first
  appearance; old core, young periphery. Gives organic growth "in place", exactly the owner's requirement.
- **Vacant lots instead of deletion** (EvoStreets, Wettel lifetime real estate, BabiaXR `max_area`): deleted files and
  folders leave empty or ruined parcels for a while. Stability, plus a native way to show strangler-pattern demolition
  and construction sites.
- **Grid packing of leaves into blocks** (EvoStreets-Grid, CodeCharta TreeMapStreet): the measured best compromise
  between compactness and consistency.
- **Age as an ordering key** (EvoStreets elevation, ExplorViz spiral): first-commit time per path, from git, gives a
  history-aware order that is still a pure function of the repository.
- **Collapse single-child chains** (SoftVis3D `layout.snail/tower: false`, CodeCharta `mergeDirectories`): avoids
  "snail" streets for `src/main/java/com/acme/...`.
- **Road width from subtree weight** (CodeCharta street thickness): an automatic arterial/collector/local hierarchy.
- **Persisted layout hints** (CodeCharta `fixedPosition`): an optional, committed layout ledger as the escape hatch for
  stability across big refactors.
- **Islands for polycentric repos** (IslandViz, ExplorViz landscape): apps/ and packages/ as islands or towns joined by
  bridges or highways.
- **Ring packing for tiny folders** (Gource): a hamlet around a green for 15-file repos.
- **Cartographic rendering** (Kuhn; EvoStreets terrain): contour lines and hill-shading for age or terrain.
- **Stable treemap algorithms where a treemap is unavoidable**: Hilbert/Moore treemaps
  ([Tak and Cockburn 2013](https://doi.org/10.1109/tvcg.2012.108)), local moves
  ([Sondag et al. 2018](https://doi.org/10.1109/tvcg.2017.2745140)), EvoCells
  ([Scheibel et al. 2018](https://doi.org/10.5220/0006617102730280)); compare with
  [Vernier et al.'s benchmark of 14 algorithms](https://arxiv.org/abs/1906.06014).
- **Deterministic engineering habits** (hyt0019/code-city): sort by path with a byte-wise comparator, stable hashes,
  rounding to fixed decimals before output.

## Mistakes to avoid

- Sorting siblings by size, or by any metric that changes with edits, to decide position.
- Alternating sides by index (`i % 2`) or splitting rows at "half the total length": both flip siblings on insertion.
- Re-dividing a fixed square on every change.
- `localeCompare` without a pinned locale, runtime string hashes, `Math.random`, physics or force simulations in the
  ground-plan path.
- Claiming stability without measuring it (SoftVis3D). We should ship stability metrics in CI: average node
  displacement, neighbourhood preservation and order preservation, as Steinbrückner and Vernier et al. do.
- Treating roads as padding: we need a road graph from day one.
- Using coupling or vocabulary for the base plan (VR City, Software Cartography): useful overlays, unstable foundations.

## Ranked recommendation for citymap

1. **Backbone: an EvoStreets-Grid style street tree, rebuilt as a real road graph.** Folders own road segments;
   junctions are explicit nodes; blocks are the faces between roads; leaves pack into a fixed-module lot grid
   (quantised lot sizes, so a file growing within its size class moves nothing). Insertion order is first appearance,
   with sides frozen. This is the only family with measured, published consistency that also yields streets and
   addresses.
2. **Determinism by construction: order = f(snapshot, git history), never f(previous render).** Sibling order key:
   (first-commit time of the path, then byte-wise path). Without git, fall back to path order and accept reduced
   stability, or read an optional committed ledger (`citymap.layout.json`, CodeCharta precedent). Every layout
   function stays pure; no previous-layout state is required.
3. **Growth outward, not re-division.** Streets extend at the far end; blocks append rows; the city's extent grows.
   Deleted entities leave vacant lots until a "renewal" threshold (for example 20% vacancy in a block, a parameter to
   decide) triggers local re-plotting of that block only.
4. **Archetype selection by repo shape, top level only.** Hamlet or courtyard (ring or single-street) for tiny repos;
   a single street-tree town for one-root repos; islands joined by bridges for apps/ plus packages/ monorepos (IslandViz
   idea, deterministic placement). Archetype changes only when the top-level shape changes.
5. **Treemaps only inside blocks, if at all,** and then a stable variant (Hilbert/Moore or slice-and-dice with frozen
   order), never squarify-by-size.
6. **Style later, but plan for it:** contour terrain for age (EvoStreets), road hierarchy by subtree weight
   (CodeCharta), vacant lots and construction sites as first-class parcel states.

## Open questions for the owner

1. May git history (first-commit time per path) be an input to the layout? It is the cleanest way to get EvoStreets
   stability while keeping "same input, same map".
2. For non-git folders, is reduced stability acceptable, or should we persist a layout ledger beside the folder?
3. Should deleted files and folders leave vacant lots (stable, shows demolition) or be reclaimed immediately (compact)?
   If vacant, when may a block be re-plotted?
4. Should file size affect lot size (neighbours shift on growth) or only building height and lot class (quantised, no
   shift until a class boundary)?
5. Renames and moves: follow git rename detection to keep a parcel, or treat them as delete plus add, as EvoStreets
   does?
6. Which matters more when they conflict: compactness on screen, or never moving existing districts?

## Appendix: experiment scripts

Experiment A (codecity-visualizer 0.4.6 with SoftVis3D's parameters):

```ts
// bun add codecity-visualizer@0.4.6 && bun evo.ts
const CCV = require("codecity-visualizer");
const TreeNode = CCV.components.node,
  Version = CCV.components.version;
function build(folders: string[]) {
  const root = new TreeNode("root");
  for (const f of [...folders].sort((a, b) => a.localeCompare(b))) {
    const d = new TreeNode("src/" + f);
    root.add(d);
    for (let i = 0; i < 3 + (f.charCodeAt(0) % 5); i++) d.add(new TreeNode(`src/${f}/file${i}.ts`));
  }
  const v = new Version("v1", "v1", 0);
  return {
    _version: v,
    getTree: () => root,
    getGraph: () => [],
    getVersions: () => [v],
    exists: () => true,
    getAttributes: (n: unknown) => ({ name: String(n) }),
  };
}
function layout(kind: "evostreet" | "district", folders: string[]) {
  const model = build(folders);
  const opts =
    kind === "evostreet"
      ? {
          "layout.snail": false,
          "house.margin": 9,
          "highway.length": 50,
          "evostreet.options": {
            "spacer.initial": 30,
            "spacer.terranullius": 40,
            "spacer.conclusive": 0,
            "spacer.branches": 50,
            "road.trim": true,
            "house.container": (k: string, m: boolean) => new CCV.containers.lightmap(k, m),
            "house.distribution": "left",
          },
        }
      : { "layout.tower": false, "house.margin": 8, "spacer.margin": 25, "spacer.padding": 20 };
  const out = new CCV.illustrators[kind](model, opts).draw(model._version);
  return new Map(out.shapes.map((s: any) => [String(s.key), [s.position.x, s.position.y]]));
}
// Compare positions relative to "src/ui/file0.ts" for base vs base + "auth" and base + "zeta".
```

Experiment B (d3-hierarchy treemaps, 50 seeded trees):

```ts
// bun add d3-hierarchy && bun tm2.ts
import { hierarchy, treemap, treemapSquarify, treemapBinary, treemapSliceDice } from "d3-hierarchy";
// For each seed: tree of 8 folders x (5..24) files, value = 20 + rnd()^3 * 2000.
// Variant 1: insert folder "cache" (10 files x 300) at index 1. Variant 2: double every file in "core".
// Layout each with treemap().size([1000, 1000]).paddingInner(2) and the given tile, sorted or input order.
// A file outside "core" "jumps" if its centre moves more than half of its smaller side.
```

## Sources

Primary texts and papers:

- Wettel, R. Software Systems as Cities, PhD thesis, USI, 2010: https://wettel.github.io/download/Wettel10b-PhDThesis.pdf
- Wettel and Lanza, Visualizing Software Systems as Cities, VISSOFT 2007: https://doi.org/10.1109/vissof.2007.4290706
- Wettel and Lanza, Visual Exploration of Large-Scale System Evolution, WCRE 2008: https://doi.org/10.1109/wcre.2008.55
- Wettel, Lanza and Robbes, Software systems as cities: a controlled experiment, ICSE 2011: https://doi.org/10.1145/1985793.1985868
- CodeCity download page: https://wettel.github.io/codecity-download.html ; screenshot: https://wettel.github.io/pics/codecity_screenshot.png
- Steinbrückner, F. Consistent Software Cities, PhD thesis, BTU Cottbus, 2013: https://opus4.kobv.de/opus4-btu/files/1681/Dissertation_Steinbrueckner_F.pdf (archived: http://web.archive.org/web/20200723205723id_/https://opus4.kobv.de/opus4-btu/frontdoor/deliver/index/docId/1681/file/Dissertation_Steinbrueckner_F.pdf)
- Steinbrückner and Lewerentz, Representing development history in software cities, SoftVis 2010: https://doi.org/10.1145/1879211.1879239
- Steinbrückner and Lewerentz, Understanding software evolution with software cities, Information Visualization 2012: https://doi.org/10.1177/1473871612438785
- Balogh and Beszédes, CodeMetropolis, VISSOFT 2013: https://doi.org/10.1109/vissoft.2013.6650528
- Khaloo et al., Code Park, VISSOFT 2017: https://doi.org/10.1109/vissoft.2017.10 ; arXiv: https://arxiv.org/abs/1708.02174
- Vincur, Návrat and Polášek, VR City, QRS-C 2017: https://doi.org/10.1109/qrs-c.2017.88
- Panas, Berrigan and Grundy, A 3D metaphor for software production visualization, IV 2003: https://doi.org/10.1109/iv.2003.1217996
- Panas et al., Communicating Software Architecture using a Unified Single-View Visualization, ICECCS 2007: https://doi.org/10.1109/iceccs.2007.20
- Misiak et al., IslandViz, VISSOFT 2018: https://doi.org/10.1109/vissoft.2018.00020
- Kuhn, Loretan and Nierstrasz, Consistent Layout for Thematic Software Maps, WCRE 2008: https://doi.org/10.1109/WCRE.2008.45 ; https://arxiv.org/abs/1209.5490
- Eick, Steffen and Sumner, Seesoft, IEEE TSE 1992: https://doi.org/10.1109/32.177365
- Jeffery, The City Metaphor in Software Visualization, WSCG 2019: https://doi.org/10.24132/csrn.2019.2901.1.18
- Khan et al., Visualization and Evolution of Software Architectures, VLUDS 2011: https://doi.org/10.4230/oasics.vluds.2011.25
- Moreno-Lumbreras et al., CodeCity: a comparison of on-screen and virtual reality, IST 2022: https://doi.org/10.1016/j.infsof.2022.107064
- Viana, Hora and Valente, CodeCity for (and by) JavaScript (JSCity), 2017: https://arxiv.org/abs/1705.05476
- ExplorViz, Semantic Zoom and Mini-Maps for Software Cities, 2025: https://arxiv.org/abs/2510.00003
- ExplorViz, Linux kernel evolution as a city, 2026: https://arxiv.org/abs/2610.09910
- Tak and Cockburn, Enhanced Spatial Stability with Hilbert and Moore Treemaps, TVCG 2013: https://doi.org/10.1109/tvcg.2012.108
- Sondag, Speckmann and Verbeek, Stable Treemaps via Local Moves, TVCG 2018: https://doi.org/10.1109/tvcg.2017.2745140
- Scheibel, Weyand and Döllner, EvoCells, IVAPP 2018: https://doi.org/10.5220/0006617102730280
- Vernier et al., Quantitative Comparison of Time-Dependent Treemaps, 2019: https://arxiv.org/abs/1906.06014
- SEE project report 2023 (incremental layout, §4.9): https://raw.githubusercontent.com/wiki/uni-bremen-agst/SEE/literature/SEE_Projektbericht_2023.pdf
- d3-hierarchy documentation (squarify, resquarify): https://github.com/d3/d3-hierarchy
- Microsoft, String.GetHashCode stability remarks: https://learn.microsoft.com/en-us/dotnet/api/system.string.gethashcode

Code repositories (commit read in brackets):

- SoftVis3D (`b1418e0`): https://github.com/stefanrinderle/softvis3d ; screenshots: https://raw.githubusercontent.com/stefanrinderle/softvis3d/master/docs/images/evostreetsExampleGuava.jpg , https://raw.githubusercontent.com/stefanrinderle/softvis3d/master/docs/images/cityLayoutExampleGuava.jpg
- codecity-visualizer (`74954f7`): https://github.com/yvo-niedrich/codecity-visualizer ; npm: https://www.npmjs.com/package/codecity-visualizer
- CodeCharta (`ebb2bf2`): https://github.com/MaibornWolff/codecharta ; site: https://codecharta.com ; screenshot: https://raw.githubusercontent.com/MaibornWolff/codecharta/main/gh-pages/public/assets/images/docs/visualization/user-controls/map.jpeg
- SEE (`0448cdb`): https://github.com/uni-bremen-agst/SEE
- CodeMetropolis (`26193b2`): https://github.com/codemetropolis/CodeMetropolis ; site: https://codemetropolis.github.io/CodeMetropolis/
- Getaviz (`4df6211`): https://github.com/softvis-research/Getaviz
- ExplorViz frontend (`d8e3cc8`): https://github.com/ExplorViz/frontend ; site: https://explorviz.dev
- BabiaXR components (`221f4fe`): https://gitlab.com/babiaxr/aframe-babia-components
- IslandViz (`fb8b371`): https://github.com/DLR-SC/island-viz
- Gource (`70db547`): https://github.com/acaudwell/Gource ; site: https://gource.io
- gocity (`f2b5f40`): https://github.com/rodrigo-brito/gocity
- JSCity (`1d54dc9`): https://github.com/aserg-ufmg/JSCity
- repo-visualizer (`a999615`): https://github.com/githubocto/repo-visualizer
- git-truck (`c37b30e`): https://github.com/git-truck/git-truck
- hyt0019/code-city (`28914e7`): https://github.com/hyt0019/code-city ; demo: https://hyt0019.github.io/code-city/
- Manavarya09/code-city (`978001a`): https://github.com/Manavarya09/code-city
- gh-skyline: https://github.com/github/gh-skyline
- isometric-contributions: https://github.com/jasonlong/isometric-contributions
- GithubCity: https://github.com/honzaap/GithubCity ; https://honzaap.github.io/GithubCity/
- Git City: https://github.com/srizzon/git-city ; https://thegitcity.com
- GitHub REST API metadata (stars, licence, archived, last push) on 2026-10-10: https://api.github.com/repos/{owner}/{repo}
