# Ground plan

The ground plan is the city without buildings: the land, its streets and the lots that files will later build on. It is
derived from a repository's folder tree and history, and nothing else.

Research behind it: [city layout synthesis](../../research/city-layout/synthesis.md) and its
[rendered variants](../../research/city-layout/variants/README.md).

## Vocabulary

Each concept has one name; the names in brackets are not used.

| Term            | Meaning                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------- |
| city            | The ground plan of one repository: one or more towns.                                              |
| town            | One cohesive settlement: the main town, or the town of a workspace group.                          |
| workspace group | A folder holding two or more workspace members whose land is mostly source (`apps/`, `packages/`). |
| node            | A folder or a file in the tree.                                                                    |
| district        | A folder with real weight; one coherent fabric (grain, orientation, block shape).                  |
| ward            | Land bounded by collectors or bigger roads; it takes one tint and the name of its heaviest folder. |
| neighbourhood   | A folder small enough to flatten: one block grid holding all its files.                            |
| cut             | A straight division of land between ordered folders; every cut is a street.                        |
| street          | A road; local streets run between blocks.                                                          |
| block           | Land between streets, holding lots back to back.                                                   |
| lot             | The land of one file (not "parcel").                                                               |
| lot class       | A lot's frontage in modules, 1 to 4.                                                               |
| module          | The lot frontage unit, 0.5 u.                                                                      |
| u               | One local street width; every dimension is a multiple of it.                                       |
| road class      | lane, street, collector, avenue or boulevard.                                                      |
| road graph      | Junctions and road edges; blocks are its faces.                                                    |
| package         | A child folder that is a workspace member and whose mass is at least half source.                  |
| island          | The land of one package (or of several, beyond a dozen) in an archipelago, ringed by canals.       |
| mainland        | An archipelago's land outside its islands: the folder's other items.                               |
| canal           | Water instead of a road between an archipelago's islands, crossed by bridges.                      |
| corridor        | A folder nearly all of whose mass lies in one child: it leads through to that child.               |
| destination     | The first folder down a corridor's chain that is no corridor: it takes most of the land.           |
| faubourg        | The edge quarter of a corridor holding the chain's other items, behind the gateway.                |
| gateway         | The short road that cuts a corridor's faubourg off from its destination.                           |
| quarter         | A planned group of small folders laid as one, cut square to its own frame by streets.              |
| tier            | A town's size class by decade of mass: hamlet, village, town, city, metropolis.                    |
| toggle          | An archetype setting: corridor, archipelago, quarters or tiers, each on or off.                    |
| vacant lot      | The lot of a deleted file, kept empty.                                                             |
| renewal         | Clearing a folder's vacant lots and re-laying its land.                                            |
| reserve plot    | A block with no lots yet: room for growth.                                                         |
| park            | Land of docs.                                                                                      |
| pinwheel        | Four pieces turning round a plaza, their roads ending in T-junctions: how a long cut jogs.         |
| plaza           | The open square at the heart of a pinwheel.                                                        |
| density         | The setting for land per lot, from suburban to dense core.                                         |
| old town        | A town kept whole where it stood when its archetype switches.                                      |
| land use        | The role of a file (source, tests, fixtures and so on), from path rules.                           |
| mass            | Land-use weighted file count of a node's subtree.                                                  |
| archetype       | A node's form and tier.                                                                            |
| plat            | The persistent state of a city: orders, sides, reserves, lot classes, vacant lots, archetypes.     |
| address         | A lot's stable identifier: street, side and index.                                                 |
| window          | A run of consecutive commits folded as one step: the tree as it stands at the run's last commit.   |
| stride          | The number of commits in a window; stride 1 lays every commit.                                     |
| fold schedule   | The windows a history of a given length folds in.                                                  |

## Input

- The input is a git repository: its first-parent history and its current tree.
- The plat is the fold of the layout over first-parent history, oldest commit first, on the fold schedule. The same
  repository at the same commit always yields the same plat and the same city.
- A committed lockfile overrides the fold. A folder without git keeps its plat as local state.
- The fold reads commits and trees, and the contents of the repository's root workspace manifests only, at the commits
  that change them; it never needs any other file's contents.
- A file's identity follows exact renames: the fold carries it through every commit that moves a file unchanged (equal
  blob ids, no contents needed). A folder's identity is its path.

## Fold schedule

Long histories fold in windows: every commit is read and applied to the tree, but the layout runs only at the end of
each window. A batch of births lays well, where thousands of small steps wear the plat and take hours.

- Commits are counted from the root, which is commit 0. A history of N commits splits into three zones, their boundaries
  on multiples of 1,000:
  - the tail, from `floor((N - 1,000) / 1,000) * 1,000` (0 at the least) to the last commit, at stride 1;
  - before the tail, windows of stride 100;
  - when N is over 10,000, the commits before `floor((N - 10,000) / 1,000) * 1,000` in windows of stride 1,000.
- Windows are anchored to the root: window k of stride s covers commits `k * s` to `k * s + s - 1`. Zone boundaries are
  multiples of both strides, so every window lies in one zone.
- The tail holds the last 1,000 to 1,999 commits, and the last commit is always laid. A history of 1,999 commits or
  fewer folds every commit.
- A fresh fold of one more commit lays the same windows and one more commit, except when N reaches a multiple of 1,000
  from 2,000 on: then a zone boundary steps, and the commits that left the tail fold in windows from then on. A fresh
  fold therefore changes shape once per 1,000 commits.
- Inside a window:
  - a file keeps the commit it first appeared at, so siblings still order by first appearance;
  - identity follows exact renames commit by commit, so a file renamed several times in one window keeps its identity;
  - a file born and deleted in one window never takes a lot;
  - the files born in one window arrive at once, in the fold's usual order.
- A fold that resumes from a lockfile lays the lock's commit again, then the commits after it on the schedule of the
  whole history up to its target; it never folds a commit up to the lock's again. Its windows are those of the history
  as it stood when each part was folded, so it may differ from a fresh fold of the same target.
- A lock saved part way through a fold (the CLI saves one every 1,000 laid snapshots) resumes to exactly the fold it was
  cut from: the resumed fold ends with the same plat and city as the fold left uninterrupted, byte for byte.
- The schedule is not a setting: both CLIs always fold on it, and offer no flag to fold every commit. Folding every
  commit stays a library value, for tests, the bench and measurements.

## Land use and mass

- Land use follows Linguist-style path rules, earliest rule first: vendored, generated, fixtures, tests, examples, docs,
  CI and tools, assets, config, source. `.gitattributes` overrides (Linguist's vendored, generated and documentation
  marks) come later: the fold reads no contents but the root workspace manifests.
- Weights: source 1; config, assets, CI and tools, docs 0.5; tests and examples 0.3; fixtures, generated and vendored
  0.05.
- Mass is the weighted count of a subtree's files that take lots; docs and files without land add none. Mass drives the
  tier, the road class and the archetype, never the order.
- Land is a dimension: it names the land uses that take land. By default tests and fixtures take none; tests are then a
  dimension of the source they cover, shown later on that source's building. With tests as land, they take lots like any
  other file. Each land setting is its own plat, so switching it re-lays the city and never disturbs another setting's
  history.
- Docs are parks: each doc adds half a lot of park land to its folder.
- Every other file takes a share of a lot: files of one land use in one folder share lots, `round(1 / weight)` files per
  lot (one source file, two config files, twenty fixtures-like generated files).

## Dimensions

| Element          | Rule                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Road widths      | lane 0.625 u, street 1 u, collector 1.5 u, avenue 2.25 u, boulevard 3.25 u, highway 2.75 u                  |
| Block short side | 6 u short and 12 u long at the default density, plus streets between; long side 1 to 4 times the short side |
| Lot              | frontage one module times its lot class; depth half the block depth (1:2 to 1:6)                            |
| Neighbourhood    | 3 to 8 blocks across between collectors                                                                     |

- Road length shares follow the town's tier, as in real settlements of the matching size (one lot stands for a plot of
  about 2.3 people). They are an outcome the corpus is checked against, never an input to the layout:

  | Tier       | Local   | Collector | Arterial and up |
  | ---------- | ------- | --------- | --------------- |
  | hamlet     | 85-100% | 0-15%     | 0%              |
  | village    | 55-80%  | 20-45%    | 0%              |
  | town       | 65-80%  | 20-35%    | 0-10%           |
  | city       | 65-80%  | 10-25%    | 5-15%           |
  | metropolis | 60-75%  | 10-20%    | 10-20%          |

- A neighbourhood sets its lot class once, at its first lay: its lots widen to fill the blocks they need, up to lot
  class 4. Frontage left in the last block stays garden and spare blocks stay reserve plots; both are room to grow.
- When a neighbourhood's lots outgrow its slots at that class, the class narrows until they fit and the neighbourhood
  re-lays its lots in order; the move stays inside the neighbourhood.
- When its grid cannot seat its lots even at class 1, because the cuts around it moved its land, and a fresh grid on the
  same land can, the neighbourhood lays its grid afresh; no file is left without a lot that its land could hold.
- Density is a setting (a slider), 50% by default: a folder's land is its lot area over density, plus a road margin. Low
  density gives suburban plots, high density narrow plots in a dense core. A folder whose own roads are wider than a
  street (the class its first cut can reach) asks for their land too, so wider roads never take it from lots.

## Order

Siblings are ordered by first appearance in history, then by byte-wise path, and arranged centre-out: the oldest in the
middle, the next alternately either side. Order never depends on size, locale, randomness or runtime hashing. Age is
therefore readable as distance from the core, and newcomers join the edges.

## Structure

- A town's outline is an irregular octagon of the town's land.
- The outline is cut recursively between a folder's ordered children (child folders, its own lots, its park): each cut
  splits the list where the land is halved, across the longer extent of the land, with a small path-seeded tilt.
- Every cut is a street (or, in an archipelago, a canal). Its class follows the tier of the land it separates, under the
  town's tier when tiers are on (Toggles): city land gets a boulevard on its first cut and avenues after; town land an
  avenue then collectors; village land a collector then streets. A town therefore has at most one boulevard, and local
  streets carry most of the length.
- A folder with under nine blocks of land, or without child folders, flattens into a neighbourhood: its files in order
  (own files first, then child folders by first appearance), on one block grid aligned with its longest frontage.
- Blocks fill in serpentine order; lots run out along one side and back along the other, so a folder stays one
  contiguous run.
- Chains of folders without land of their own and with a single child collapse into one.
- Land between collectors or bigger roads is a ward.
- Long top-level cuts jog. A cut between a town's top-level folders, at least 30% of the town's diameter long, with two
  or more items on each side, becomes a pinwheel: each side splits again square to it, and where those cross cuts fall
  at least 2 u apart, the long cut steps sideways by 3 u between them. The four roads end in T-junctions round a plaza,
  and each of the four pieces is the land within two half-planes.
- The plat remembers every cut: its line, its class, the items on each side, and each side's band (1.35 times its demand
  at the last cut). A newcomer joins the side with more spare band. A side left empty lends its land to the other side,
  which extends over it; the cut stays remembered and nothing already laid moves. A cut moves, to the split of today's
  demand, only when a side outgrows its band, or when the land around it changed shape so far that one side's land falls
  below its share of the demand by more than the band, measured against its sibling and against its folder's land as a
  whole (so small shortfalls at every level of a folder of many children cannot add up). This holds at every level, the
  top two folder levels included.
- The plat remembers every neighbourhood: its grid origin, angle and pitch, its lot class, its park line, and the slot
  of every lot; a park line that no longer crosses its land is laid afresh, and so is one whose park grew over the land
  the lots need, when they no longer fit and a fresh line seats them. Lots keep their slots; a newcomer takes the first
  free slot after its folder's last lot. Cells come and go only with the neighbourhood's land; a lot whose slot is gone
  takes a free one.
- Shared lots remember their members: a new file joins a lot with room, and a lot keeps its place while any member
  lives.
- A town keeps its outline until its land outgrows 1.35 times its land at the last growth, then grows outward about the
  same centre; cuts and grids are absolute, so nothing inside moves.
- A flat folder stays flat up to 1.5 times the flatten limit, and a cut folder stays cut down to its inverse. A folder
  switching between the two is an archetype switch.

## Archetypes

- Each folder has a form (hamlet, street village, neighbourhood, radial, twin, polycentric, and, when their toggles are
  on, corridor, archipelago and quarters) and a tier by decade of mass (hamlet under 30, village under 300, town under
  3,000, city under 30,000, metropolis above).
- Features are continuous; the choice uses a Schmitt trigger: a challenger enters at margin 0 or more, the incumbent
  stays down to -0.15, and a switch needs +0.1. Roads follow their land's tier as it grows and shrinks: a laid road
  moves up a class at the tier's threshold times 1.25 and down below the threshold divided by 1.25. A road's class and
  its land are separate: each cut reserves, when it is laid, the width of the class its land reaches at the top of its
  band (its right of way), so a reclass widens the road within it and takes no lots; a class beyond the right of way
  keeps its width until the cut is laid again.
- A twin is a folder with two dominant cores (lib and test, src and docs): two town halves facing each other across a
  river.
- A flattened folder takes a neighbourhood form: a hamlet (mass under 25) gathers round a green, the full block nearest
  its heart, when its lots can spare it; a street village (40 lots or more, 60% or more in its own files) runs along a
  high street, a collector through its middle rows, and fills outward from it; any other is a plain neighbourhood. Each
  threshold has a ±25% band round the incumbent.
- A larger folder takes a district form, which arranges its children:
  - **radial**: the dominant child at the core, the others in ring sectors in age order, a ring road round the core and
    spokes between the sectors. The core is the polygon through the spokes' inner ends, so every sector is convex. It
    needs three or more ring items and sectors under 171°, and otherwise falls back to polycentric. Sectors are
    remembered; a newcomer or an item outgrowing its band re-sectors the ring, which re-lays the ring's items afresh.
  - **twin**: the two heaviest children on either bank of a river 2.5 u wide, the rest joining the lighter bank in age
    order; one bridge, or two on a river longer than 12 u.
  - **polycentric**: recursive cuts, as in Structure. Many similar children (integrations, examples) take this form too,
    unless quarters are on: there is no gridiron, as rows of single folders read as stripes of long straight roads.
- A district form is chosen in priority order: corridor, archipelago, radial, twin, quarters, polycentric; a form whose
  toggle is off takes no part. Each has its margin and band; the toggles' forms are below.

## Toggles

Four archetypes are toggles: corridor, archipelago, quarters and tiers. Corridor and tiers are on by default,
archipelago and quarters off.

- Each combination of toggles has its own plat, as the land dimension does: a lockfile folded under other toggles is set
  aside and the history folded afresh, never continued. A change of defaults therefore re-lays existing cities.
- With every toggle off, the city is exactly the one the other forms alone lay.
- Each toggle keeps its decisions in the plat (a gateway's cut, an archipelago's islands, a folder's quarters, a town's
  tier): a newcomer joins what is remembered, and nothing moves unless a band is outgrown. Over nine reference windows
  the defaults move as few lots as every toggle off, or fewer (rust: 1.9 to 1.4 % of lots per step). Archipelago and
  quarters, off by default, move more in some: a deleted package leaves its island smaller (react's deleting steps, 6.1
  to 7.0 %), and quarters grow at their last quarter (home-assistant, 0.3 to 0.7 % per step).
- The forms combine; a folder takes at most one form.

### Corridor

- A folder is a corridor when its heaviest child folder holds at least 90 % of its mass and its own files under 10 %.
  Its band is narrower than the other forms': the incumbent stays down to -0.05 and a challenger needs +0.02.
- The heaviest child is the next level of the chain while it is a corridor too; the first heaviest child that is not is
  the destination. Every other item of every level of the chain (the wayside) gathers into one faubourg.
- The faubourg lies on the edge of the corridor's land, cut off by the gateway: of 32 directions, the one whose cut
  leaves the faubourg its share of the land with the shortest road, so the gateway never crosses town. The gateway takes
  the class of a folder's later cuts (an avenue on city land).
- The faubourg is cut between its items as any folder's land, in age order, centre-out; the destination takes the rest
  of the land and is laid as any folder.
- Each level of the chain is a district over the whole corridor's land.
- The plat remembers the gateway as a cut: the wayside on the faubourg's side, the destination on the other. Newcomers
  join the faubourg; the gateway moves as any cut does (a side outgrowing its band, or starved of its share); a new
  destination lays the corridor afresh.

### Archipelago

- A folder with three or more packages that hold at least half its mass is an archipelago, with the standard band.
- Each package is an island; the folder's other items together are the mainland. Islands and mainland are cut as any
  folder's items, in age order, centre-out, but every cut between them is a canal: the first 2.5 u wide, the others 1.5
  u, each crossed by one bridge, or two on a canal longer than 12 u. Inside an island or the mainland, roads as usual.
- More than a dozen packages share islands: in age order, an island closes once its packages hold a twelfth of all the
  packages' mass; roads, not canals, run between the packages of one island.
- The plat remembers the islands. A newcomer joins the last island while it holds under a twelfth, else founds the next;
  a package that leaves drops out, and its island keeps its place.
- Every island takes its own tint. Canals are drawn a deeper, more saturated blue than a twin's river, so no district
  tint matches them.
- Canal land is not asked for in the folder's demand: an archipelago may leave a few more files without a lot.

### Quarters

- A folder whose effective number of children (one over the sum of the squared mass shares of its child folders and its
  own files) is at least 7, and none of whose children holds over a quarter of its mass, takes quarters, with the
  standard band.
- Its children small enough to flatten (a neighbourhood form, and land of at most 24 blocks) and its own lots join
  quarters in age order: a quarter closes once its members need 24 blocks of land, and at the first lay a last quarter
  under 40 % of that joins the one before it.
- Quarters and the larger children are cut as usual, so collectors run between quarters. Inside a quarter every cut is a
  street, square to the quarter's own frame (its longest edge), across the land's longer extent: tidy rectangular
  blocks, and the grid never runs the width of the town.
- A quarter is a ward, named after its heaviest folder.
- The plat remembers each quarter's members. A newcomer joins the last quarter while it needs under 24 blocks, else
  opens the next; a member that leaves (deleted, or grown past flattening) drops out, and its quarter keeps its place.

### Tiers

- A town's tier follows the decade of its mass (30, 300, 3,000, 30,000), moving up at a threshold times 1.25 and down
  below a threshold divided by 1.25; the plat remembers it.
- The tier sets the class of the town's first cut, the first cut of its root folder's land (its ring road when the root
  is radial): a street for a hamlet, a collector for a village, an avenue for a town, a boulevard for a city or a
  metropolis.
- Every other road the town lays (nested folders' cuts, spokes, gateways and a street village's high street included) is
  at least one class below; under that cap, a road's class follows its land's mass as before. A town therefore has one
  road of its top class, and a hamlet's roads are all streets.
- A cut's right of way is the class the rule gives with the town and the cut's land each at the top of its band. The
  land a folder asks for its own roads follows the mass rule, which the tier only narrows, so it always suffices.

## Edges and open land

Edges carry meaning:

- Workspace members come from the repository's root workspace manifests: `package.json` workspaces,
  `pnpm-workspace.yaml`, `lerna.json`, Cargo's `[workspace]` members, `go.work`, uv's `[tool.uv.workspace]` and
  `deno.json` workspaces, their globs matched against the tree. Without such a manifest (or when no version of it since
  it was added can be read), a member is a folder, other than the root, that directly holds a package manifest, read
  from paths alone.
- A workspace group is a folder holding two or more members whose land is mostly source.
- A repository is one cohesive city. Each workspace group becomes its own town, sized by its land, its members as
  districts, joined to the main town by a highway across open country.
- Split groups give each member its own town instead, each joined to the main town by its own highway. `apps/` is split
  by default; any other group (`packages/` and the like) may be split as a setting, off by default. Each setting has its
  own plat, as the land dimension does.
- A highway continues a road: it joins, in both towns, the end of a road of the highest class both offer at their edges,
  takes that class, and is drawn exactly like it. A town without roads gets an approach street from its nearest edge to
  its centre.
- **Parks** hold docs.
- **Reserve plots** hold room for growth inside neighbourhoods.

## Deletion

- A deleted file leaves a vacant lot; nothing moves.
- A neighbourhood whose remembered lots (those whose slot its grid still holds) are more than half vacant, or a folder
  whose direct children are, is renewed: its own vacant lots and wholly vacant child land clears, and its land is
  re-laid. Renewal is local; it never cascades into child folders.

## Archetype switch

- A town's root form is classified over the whole repository, old towns included, so a young new town keeps it.
- When a town's root switches form, other than between the neighbourhood forms, the town as it stood is kept whole as an
  old town where it stood. Its lots stay lit while any of their files lives; the files it holds live there for good.
- A new town in the new form grows beside it from every other file, joined to it by a highway.
- A switch between the neighbourhood forms, or of a folder inside a town, re-lays that folder in place.

## Road graph and addresses

- Roads form a graph: junctions as nodes, edges with class, width and length; blocks are its faces; loop connectors join
  nearby street ends.
- Every lot has an address, issued at its first placement and never changed. Lots never split: a shared lot only loses
  members, and a newcomer that finds no room founds a lot of its own.
- Dependencies never shape roads; they are overlays.

## Organic layer

A deterministic, topology-preserving layer bends the plan after layout: path-seeded jitter on splits and a smooth domain
warp. It never feeds back into the plat.

- Voronoi regions are a setting, off by default: each top-level folder of a town is drawn over the land nearer its lots
  than any other folder's, filled beneath the blocks and outlined over them. Old towns keep their plain ground.

## Presentation

- One 3D model; styles are data over it.
- The lead style is Paper atlas: warm paper ground, light district tints of equal OKLCH lightness, white streets with
  casings, desaturated water with waterlines, sage parks. Its dark twin is Night atlas.
- Every theme draws canals in a deeper, more saturated blue than its rivers, with a darker canal line.
- Themes ship beside it: Beck schematic, Nolli noir and Dracula (the Dracula palette: background ground, current-line
  streets, its seven accents as district tints).
- Phones are a target: the same city with lighter effects.
- The default camera is plan view (straight down); the 2:1 dimetric view (30° elevation, 45° yaw) is one switch away.

## Invariants

- Determinism: the same repository and commit give the same plat and city, bit for bit, in every implementation.
- Integer core: the plat uses integer arithmetic and sorted iteration only; no rule reads the plat's records in the
  order they were made, which a lockfile does not keep.
- Settled lays: laying a commit again on the plat its lay produced decides nothing and draws the same city; a lay leaves
  no decision pending for the next.
- Resumption: a fold resumed from a lock it saved part way equals the uninterrupted fold, byte for byte, in every
  implementation.
- Locality: a laid commit or window changes the city only in the folders its commits touch and their reserves.
