# Ground plan

The ground plan is the city without buildings: the land, its streets and the lots that files will later build on. It
is derived from a repository's folder tree and history, and nothing else.

Research behind it: [city layout synthesis](../../research/city-layout/synthesis.md) and its
[rendered variants](../../research/city-layout/variants/README.md).

## Vocabulary

Each concept has one name; the names in brackets are not used.

| Term | Meaning |
| --- | --- |
| city | The ground plan of one repository: one or more towns. |
| town | One cohesive settlement: the main town, or the town of a workspace group. |
| workspace group | A folder holding two or more workspace members whose land is mostly source (`apps/`, `packages/`). |
| node | A folder or a file in the tree. |
| district | A folder with real weight; one coherent fabric (grain, orientation, block shape). |
| ward | Land bounded by collectors or bigger roads; it takes one tint and the name of its heaviest folder. |
| neighbourhood | A folder small enough to flatten: one block grid holding all its files. |
| cut | A straight division of land between ordered folders; every cut is a street. |
| street | A road; local streets run between blocks. |
| block | Land between streets, holding lots back to back. |
| lot | The land of one file (not "parcel"). |
| lot class | A lot's frontage in modules, 1 to 4. |
| module | The lot frontage unit, 0.4 u. |
| u | One local street width; every dimension is a multiple of it. |
| road class | lane, street, collector, avenue or boulevard. |
| road graph | Junctions and road edges; blocks are its faces. |
| island | The land of one workspace member, surrounded by water. |
| mainland | The land of everything outside workspace members. |
| vacant lot | The lot of a deleted file, kept empty. |
| renewal | Clearing a folder's vacant lots and re-laying its land. |
| reserve plot | A block with no lots yet: room for growth. |
| park | Land of docs. |
| density | The setting for land per lot, from suburban to dense core. |
| old town | A city kept whole, as an island, when its archetype switches. |
| land use | The role of a file (source, tests, fixtures and so on), from path rules. |
| mass | Land-use weighted file count of a node's subtree. |
| archetype | A node's form and tier. |
| plat | The persistent state of a city: orders, sides, reserves, lot classes, vacant lots, archetypes. |
| address | A lot's stable identifier: street, side and index. |

## Input

- The input is a git repository: its first-parent history and its current tree.
- The plat is the fold of the layout over first-parent history, oldest commit first. The same repository at the same
  commit always yields the same plat and the same city.
- A committed lockfile overrides the fold. A folder without git keeps its plat as local state.
- The fold reads commits and trees only; it never needs file contents.
- A node's identity is its path.

## Land use and mass

- Land use follows Linguist-style path rules, earliest rule first: vendored, generated, fixtures, tests, examples, docs,
  CI and tools, assets, config, source. `.gitattributes` overrides apply.
- Weights: source 1; config, assets, CI and tools, docs 0.5; tests and examples 0.3; fixtures, generated and vendored
  0.05.
- Mass is the weighted file count of a subtree. Mass drives the tier, the road class and the archetype, never the order.
- Tests and fixtures are not files of the ground plan: they take no land.
- Docs are parks: each doc adds half a lot of park land to its folder.
- Every other file takes a share of a lot: files of one land use in one folder share lots, `round(1 / weight)` files
  per lot (one source file, two config files, twenty fixtures-like generated files).

## Dimensions

| Element | Rule |
| --- | --- |
| Road widths | lane 0.5 u, street 1 u, collector 1.6 u, avenue 2.5 u, boulevard 4 u |
| Length shares | local 65 to 75%, collector 10 to 15%, arterial and above 10 to 20% |
| Block short side | 3 to 9 u (5 to 7 default; 3 to 4 in dense cores); long side 1 to 4 times the short side |
| Lot | frontage one module times its lot class; depth half the block depth (1:2 to 1:6) |
| Neighbourhood | 3 to 8 blocks across between collectors |

- A lot is one module of frontage; lots widen to fill their block, up to lot class 4; spare frontage stays garden and
  spare blocks stay reserve plots.
- Density is a setting (a slider), 50% by default: a folder's land is its lot area over density, plus a road margin.
  Low density gives suburban plots, high density narrow plots in a dense core.

## Order

Siblings are ordered by first appearance in history, then by byte-wise path, and arranged centre-out: the oldest in
the middle, the next alternately either side. Order never depends on size, locale, randomness or runtime hashing. Age
is therefore readable as distance from the core, and newcomers join the edges.

## Structure

- A town's outline is an irregular octagon of the town's land.
- The outline is cut recursively between a folder's ordered children (child folders, its own lots, its park): each
  cut splits the list where the land is halved, across the longer extent of the land, with a small path-seeded tilt.
- Every cut is a street. Its class follows the tier of the land it separates: city land gets a boulevard on its
  first cut and avenues after; town land an avenue then collectors; village land a collector then streets. A town
  therefore has at most one boulevard, and local streets carry most of the length.
- A folder with under nine blocks of land, or without child folders, flattens into a neighbourhood: its files in order
  (own files first, then child folders by first appearance), on one block grid aligned with its longest frontage.
- Blocks fill in serpentine order; lots run out along one side and back along the other, so a folder stays one
  contiguous run.
- Chains of folders without land of their own and with a single child collapse into one.
- Land between collectors or bigger roads is a ward.

## Archetypes

- Each folder has a form (hamlet, street village, archipelago, radial, twin, gridiron, polycentric) and a tier by
  decade of mass (hamlet under 30, village under 300, town under 3,000, city under 30,000, metropolis above).
- Features are continuous; the choice uses a Schmitt trigger: a challenger enters at margin 0 or more, the incumbent
  stays down to -0.15, and a switch needs +0.1. Tiers move up at the threshold times 1.25 and down at the threshold
  divided by 1.25.
- The archetype places the top one or two levels (islands on a hex spiral, radial sectors, grid cells); streets inside
  districts follow the structure rules above.

## Edges and open land

Edges carry meaning:

- A repository is one cohesive town. Each workspace group becomes its own town, sized by its land, its members as
  districts, joined to the main town by a highway across open country.
- **Parks** hold docs.
- **Reserve plots** hold room for growth inside neighbourhoods.

## Deletion

- A deleted file leaves a vacant lot; nothing moves.
- A folder whose vacant share passes the renewal threshold is renewed: its own vacant lots and wholly vacant child
  streets clear, and its street is re-laid. Renewal is local; it never cascades into child folders.

## Archetype switch

When a folder's archetype switches, the city it had is kept whole as the old town, an island of the new city; the new
form grows beside it.

## Road graph and addresses

- Roads form a graph: junctions as nodes, edges with class, width and length; blocks are its faces; loop connectors
  join nearby street ends.
- Every lot has an address. An address never changes once issued; when a lot splits, the new lots take suffixes.
- Dependencies never shape roads; they are overlays.

## Organic layer

A deterministic, topology-preserving layer bends the plan after layout: path-seeded jitter on splits, a smooth domain
warp, Voronoi coastlines and district outlines. It never feeds back into the plat.

## Presentation

- One 3D model; styles are data over it.
- The lead style is Paper atlas: warm paper ground, light district tints of equal OKLCH lightness, white streets with
  casings, desaturated water with waterlines, sage parks. Its dark twin is Night atlas.
- The default camera is 2:1 dimetric (30° elevation, 45° yaw); plan view (90°) is one switch away.

## Invariants

- Determinism: the same repository and commit give the same plat and city, bit for bit, in every implementation.
- Integer core: the plat uses integer arithmetic and sorted iteration only.
- Locality: a commit changes the city only in the folders it touches and their reserves.
