# City layout research: synthesis

Six independent angles, one ground plan. Where they agree, the agreement is the finding; where they diverge, the
divergence is a decision for the owner.

## Where all six reports converge

1. **Topology from the tree, geometry from smooth fields, charm from local noise.** The folder tree fixes streets,
   blocks and parcels; an organic, deterministic deformation layer bends them; nothing cosmetic feeds back into
   topology. ([procedural](./procedural-city-generation.md) §6, [stable layout](./stable-layout-algorithms.md) §7)
2. **Grow outward; never re-divide a fixed frame.** Every fixed-frame treemap moved 50-81% of untouched files when one
   sibling was added or doubled. Streets extend at their far end; blocks append rows; the city's extent grows.
   ([prior art](./prior-art-code-cities.md), experiment B)
3. **EvoStreets-Grid is the backbone.** Folders own streets; files pack into ordered grids of integer lots inside
   blocks; sides and order are frozen at first appearance; deletions leave vacant lots (ghosts). It had the fewest
   cascades (5 of 480 steps vs 41 for squarified) and about 20× less local drift.
   ([stable layout](./stable-layout-algorithms.md) §6)
4. **Never order by size.** Sort-by-size is the main source of instability in shipped tools. Order by first
   appearance (git birth time), then byte-wise path. No `localeCompare`, `Math.random`, physics or runtime hashes.
5. **Roads are a first-class graph,** not padding: junction nodes, edges with class, width and length; blocks as faces;
   parcels addressed by path, with suffixes on split so an address never changes once issued.
6. **A city is a mosaic of coherent districts.** Each district has one fabric (grain, orientation, block shape); the
   whole is irregular. Midtown Manhattan's orientation order is 0.99, all of Manhattan 0.67.
   ([urban morphology](./urban-morphology.md) §5.2)
7. **Archetype per node, two axes, with a Schmitt trigger.** Form (hamlet, street village, archipelago, radial, twin,
   gridiron, polycentric) × tier (hamlet to metropolis by decade of weighted mass). Enter at margin ≥ 0, stay down to
   -0.15, challenge at +0.1; features must be continuous. Flips under 2% edits fell from 1.18% to 0.03%; replaying
   history, React and Vite switch to archipelago exactly when they became monorepos.
   ([tree shape](./tree-shape-to-archetype.md) §4)
8. **Determinism with hysteresis needs history as input.** Fold over first-parent git history (also yields node age
   for old town vs new suburbs); a committed lockfile overrides; local state for non-git folders.
9. **Integer core.** Lot grid, `+ − × ÷ √` only, sorted iteration, per-node seeds from a path hash, so TypeScript and a
   later Rust port agree bit for bit.
10. **One 3D model, many cameras.** Three.js with an orthographic camera (plan 90°, 2:1 dimetric 30°, true iso
    35.264°) plus a perspective walk camera; styles as data; SVG export from the same model.
    ([visual style](./visual-style-and-rendering.md) §9-10)

## Real-world dimensions, scaled (u = one local street width)

| Element | Rule |
| --- | --- |
| Road widths | lane 0.5 u, street 1 u, collector 1.6 u, avenue 2.5 u, boulevard 4 u |
| Length shares | local 65-75%, collector 10-15%, arterial and above 10-20% |
| Block short side | 3-9 u (5-7 default; 3-4 in dense cores); long side 1-4× short side |
| Parcel frontage | module 0.35-0.5 u × k (k ∈ 1..4); depth half the block depth (1:2 to 1:6) |
| Neighbourhood unit | 3-8 blocks across between collectors |
| Edges | water (strongest, bridges only), rail or highway, fringe belt park (default, growth reserve) |

The generator computes these morphometrics (orientation entropy, node degree, dead-end share, block shape factor) on
its own output and asserts them per archetype: our test oracle for "looks like a real city".

## Lynch's five elements as the vocabulary

| Lynch | Repo |
| --- | --- |
| Districts | folders, packages, workspace members (islands) |
| Paths | tree edges as roads, class by depth and mass |
| Edges | water between workspace members, fringe belts between districts |
| Nodes | root square (town hall: README, manifests), entry points as stations, plazas at major junctions |
| Landmarks | README, entry points, hotspots |

Land use from Linguist-style rules: source residential, tests workshops or industrial edge, fixtures warehouses,
docs civic quarter, assets parks, CI and scripts utilities, vendored free port, generated factories. Dependencies
are overlays (bridges, tram lines), never roads.

## Pipeline

1. **Normalise**: stable path ids, land use, weighted mass, corridor collapse of single-child chains.
2. **Classify**: form × tier per node, hysteresis state from git history.
3. **Frame**: top one or two levels placed by the archetype (islands on a hex spiral, radial sectors, grid cells).
4. **Streets**: EvoStreets rules inside each district polygon.
5. **Blocks and lots**: ordered integer lot grids, slack once per block (never compounding per level), ghosts.
6. **Road graph and addresses**: junctions, classes, loop connectors, parcel ids.
7. **Organic layer**: path-seeded split jitter, smooth domain warp, Voronoi coastlines and district outlines.
8. **Dressing**: plazas, parks from slack and non-code land use, water edges.
9. **Render**: Three.js scene from model plus style spec; SVG export.

## Decisions for the owner

The reports raise overlapping questions; the essential forks:

1. **Input**: may git history be part of the input (pure and stable), with a lockfile or local state as fallback?
2. **Sibling order**: first-seen (age readable as distance from the core), alphabetical, or hash?
3. **Mass**: file count, lines of code or bytes; raw or land-use weighted (tests and fixtures discounted)?
4. **Lot size**: quantised lot classes from size, or one lot per file with size shown only by buildings?
5. **Deletion**: vacant lots with a renewal threshold, or immediate compaction?
6. **Archetype switch**: full relayout, or keep the old town as one island of the new city?
7. **Style lead**: Paper atlas, Beck schematic or Nolli noir; default camera 2:1 dimetric or plan?
8. **Edges with meaning**: water between workspaces, parks for docs, or purely aesthetic?
