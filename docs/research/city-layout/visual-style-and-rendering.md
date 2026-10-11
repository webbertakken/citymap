# Visual style, cartography and rendering for an isometric city schematic

Research angle: what makes city maps and isometric cities beautiful and legible, and how to render them on the web,
from a flat schematic to a later 3D walk-around, from one data model.

Status markers: **[verified]** = checked against the cited primary source or measured here; **[measured]** = benchmark
run for this report; **[unverified]** = informed judgement or secondary knowledge, not checked against a primary source.

## 1. Summary

- Legibility comes from **hierarchy and figure-ground**, not decoration: a calm ground, a clear road hierarchy, few
  strong landmarks, labels that never collide. Kevin Lynch's five elements (paths, edges, districts, nodes, landmarks)
  give a direct vocabulary for a repo city. [verified] <https://en.wikipedia.org/wiki/The_Image_of_the_City>
- **Projection**: render a real 3D scene with an **orthographic camera** and treat "isometric" as a camera preset.
  Elevation 30° gives the 2:1 game look; 35.264° gives true isometric; 90° gives the flat schematic. Same data, same
  renderer, no sprite pipeline. [verified maths, see section 3]
- **Style direction (recommended)**: "Paper atlas": warm paper ground, soft pastel district tints, white streets with
  thin casings, soft ambient occlusion, Townscaper-like softness with Swiss/Imhof restraint; a matched "Night atlas"
  dark theme. Alternatives: "Beck schematic" (flat, octilinear, Mini Motorways), "Nolli noir" (figure-ground, Toner).
- **Rendering stack (recommended)**: **Three.js** (MIT, r186) with `WebGPURenderer` (automatic WebGL2 fallback),
  `InstancedMesh`/`BatchedMesh` for parcels, SDF text via `troika-three-text`, `MapControls` for pan/zoom, an
  orthographic camera for the map and a perspective camera for the walk. Optionally React via react-three-fiber.
  In a local benchmark 100k parcels rendered at the 60 Hz cap with Three.js and PixiJS, while SVG and Canvas 2D fell
  to 22 ms and 37 ms median frames. [measured]

## 2. First principles of a legible city map

### 2.1 Lynch's five elements, mapped to a repository

Lynch found that people build mental maps from paths, edges, districts, nodes and landmarks. [verified]
<https://en.wikipedia.org/wiki/The_Image_of_the_City>

| Lynch element | City map rendering                   | Repo meaning (proposal, [unverified] as design) |
| ------------- | ------------------------------------ | ----------------------------------------------- |
| Districts     | Tinted ground areas with a name      | Top-level folders, packages, apps               |
| Paths         | Road hierarchy: avenue, street, lane | Folder tree edges (parent to child)             |
| Edges         | Water, rail, parks, ring roads       | Package boundaries, monorepo separators         |
| Nodes         | Plazas, roundabouts, bridges         | Folders with many children, entry points        |
| Landmarks     | Distinctive tall or coloured objects | `README`, `package.json`, `main.ts`, hotspots   |

Design consequence: **each element gets one visual channel and keeps it**. Districts own hue (subtle), paths own
width and white/grey value, edges own blue/green, landmarks own height and saturated accent. Mixing channels is what
makes many software cities look noisy.

### 2.2 Figure-ground and the Nolli insight

A figure-ground diagram shows built versus unbuilt space; Nolli's 1748 plan of Rome shaded built mass dark (poché)
but rendered public interiors (the Pantheon, colonnades) as open civic space. [verified]
<https://en.wikipedia.org/wiki/Figure-ground_diagram>, <https://en.wikipedia.org/wiki/Giambattista_Nolli>

For us: parcels (private, file space) are figure; streets and plazas (public, navigational space) are ground. Getting
this one contrast right does more for recognisability than any texture. Gibberd's reverse figure-ground (spaces dark)
is a useful alternative view for "where can I walk" questions. [verified] (same Wikipedia article)

### 2.3 Beck's schematisation

Beck's 1931/1933 Underground diagram used only straight lines and 45° angles and equalised station spacing, trading
geography for topology; it was immediately popular (700,000 copies, reprint after a month). [verified]
<https://en.wikipedia.org/wiki/Harry_Beck>. Nöllenburg and Wolff formalised octilinear metro layout as a
mixed-integer program with hard (octilinearity, topology) and soft (bends, length, relative position) constraints,
including labels. [verified] <https://doi.org/10.1109/tvcg.2010.81>

For us: a repo has no geography, so we are free to schematise. Octilinear roads (0°, 45°, 90°) read as "designed"
and survive projection well; in an isometric view the 45° diagonals become horizontal or vertical on screen, which is
a happy accident for label placement. Caveat: MIP layout is far too slow for interactive use at thousands of
folders [unverified: no timing taken], so use octilinearity as a style constraint in the layout engine, not an
optimisation pass.

### 2.4 Swiss restraint

Eduard Imhof (ETH Zurich, 1925 to 1965) is known for relief shading and school atlases [verified]
<https://en.wikipedia.org/wiki/Eduard_Imhof>; his "Positioning names on maps" (The American Cartographer, 1975)
remains the reference for name placement [verified existence] <https://doi.org/10.1559/152304075784313304>.
The transferable lessons [unverified as direct quotes, standard cartographic practice]: names should be legible and
unambiguously associated with their feature; area names spread across the area, letter-spaced; line names follow the
line; never overprint important detail; type hierarchy mirrors feature hierarchy.

## 3. Projection

### 3.1 The options

| Projection           | Camera elevation (orthographic) | Ground tile ratio | Notes                                                                             |
| -------------------- | ------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| Top-down plan        | 90°                             | 1:1 (square)      | Most legible for labels and measurement; no heights                               |
| True isometric       | 35.264° (arcsin(1/√3)), yaw 45° | ≈1.732:1          | All three axes 120° apart [verified]                                              |
| 2:1 "pixel" dimetric | 30°, yaw 45°                    | 2:1               | Ground lines at ≈26.565° (arctan ½); axes 116.565°, 116.565°, 126.870° [verified] |
| Oblique (cabinet)    | n/a (shear, not a camera)       | plan stays square | Plan undistorted, heights sheared; e.g. Ultima Online [verified]                  |
| Trimetric            | arbitrary                       | arbitrary         | SimCity 4 [verified]                                                              |
| Perspective          | any                             | n/a               | Walk-around, "real" feel; scale varies with depth                                 |

Sources: <https://en.wikipedia.org/wiki/Isometric_projection>,
<https://en.wikipedia.org/wiki/Isometric_video_game_graphics> (SimCity 2000 listed among fixed isometric games,
SimCity 3000 described as pseudo-isometric dimetric). Ground ratio derivation: a ground square rotated 45° has
screen width √2 and height √2·sin(e), so ratio = 1/sin(e); sin 30° = ½ gives 2:1 and sin 35.264° = 0.577 gives
1.732:1, matching the Wikipedia captions. [verified]

### 3.2 Trade-offs for interaction and labelling

- **2:1 dimetric** exists because 30° lines alias badly in raster pixel art; with modern anti-aliasing the reason is
  gone. [verified, Wikipedia page above]. It remains the most familiar "city builder" look and keeps ground area
  slightly larger on screen than true isometric (less vertical squash), which helps parcel picking.
- **True isometric** looks more "architectural" and makes heights read as true; ground shrinks to 58% vertically.
- **Top-down** is best for statistics overlays, heat maps, dense labels and print. Heights can still be suggested
  with drop shadows.
- **Occlusion**: any tilted view lets tall buildings hide parcels behind them. Mitigations: cap building height at
  overview zoom, fade or x-ray occluders around the cursor, and allow 90° yaw steps (SimCity 2000 style rotation)
  [unverified for SC2000 rotation details].
- **Picking** in a tilted orthographic view is a simple unproject plus ray-plane intersection; with buildings use
  GPU id picking or a BVH (three-mesh-bvh, MIT). Orthographic keeps picking tolerance constant across the screen.
- **Labels**: keep almost all labels **screen-aligned** (billboarded, upright, horizontal) regardless of projection.
  Only street names follow the road, and in iso views roads run at ±26.6° or ±30°, which is readable. Avoid painting
  text onto the skewed ground plane except as decoration.

**Recommendation**: one 3D world in metre-like units, an orthographic camera with presets (Plan 90°, Iso 2:1 30°,
True iso 35.264°) and smooth tweening between them, plus a perspective camera for walk mode. This avoids baking a
projection into data, which is the main trap of sprite-based isometric engines.

## 4. Stylistic references and what to take from each

Claims about how the games look are my observation unless a source is given.

| Reference                   | What to take                                                                                                                | What to avoid                                                   | Source                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SimCity 2000 / 3000         | Fixed dimetric tilt, rotation in 90° steps, zoning colours, terrain and water edges                                         | Pixel art pipeline, dense clutter                               | <https://en.wikipedia.org/wiki/Isometric_video_game_graphics>, <https://en.wikipedia.org/wiki/SimCity_3000>                                              |
| Townscaper (Oskar Stålberg) | Distorted (irregular) grid for organic feel, soft pastel palette, endless calm water, rule-based decoration from neighbours | Unbounded randomness (we need determinism)                      | <https://en.wikipedia.org/wiki/Townscaper>, talk <https://www.youtube.com/watch?v=1hqt8JkYRdI>                                                           |
| Mini Motorways / Mini Metro | Minimalist flat colour, roads as the hero, colour-coded districts, gentle growth animation                                  | Too abstract for parcel-level detail                            | <https://en.wikipedia.org/wiki/Mini_Motorways>                                                                                                           |
| Islanders                   | Low-poly cityscape, strong sun, long soft shadows, islands in water                                                         | Few, large objects only                                         | <https://en.wikipedia.org/wiki/Islanders_(video_game)>                                                                                                   |
| Monument Valley             | Escher-like clarity, flat-shaded faces with 3 tones per hue, generous negative space                                        | Impossible geometry                                             | <https://en.wikipedia.org/wiki/Monument_Valley_(video_game)>                                                                                             |
| Pocket City                 | Mobile-legible tilt and touch interaction                                                                                   | [unverified, no primary source fetched]                         | <https://en.wikipedia.org/wiki/Pocket_City>                                                                                                              |
| The Battle of Polytopia     | Bold low-poly tribes as categorical colour                                                                                  | Reviewers found late maps hard to parse when crowded            | <https://en.wikipedia.org/wiki/The_Battle_of_Polytopia>                                                                                                  |
| Stamen Toner                | High-contrast black/white, figure-ground clarity, Lite/Dark/Blacklite variants                                              | Harshness at full density                                       | <https://docs.stadiamaps.com/map-styles/stamen-toner/>                                                                                                   |
| Stamen Watercolor           | Hand-made texture, organic edges                                                                                            | Hard to make deterministic and WCAG-safe; texture fights labels | <https://docs.stadiamaps.com/map-styles/stamen-watercolor/>                                                                                              |
| MapLibre / Protomaps styles | Zoom-dependent styling, casing + fill roads, symbol collision, light/dark flavours; Protomaps visual design is CC0          | Geographic assumptions                                          | <https://github.com/protomaps/basemaps>, <https://maplibre.org/maplibre-style-spec/>                                                                     |
| Snazzy Maps                 | Proof that one road/water/park schema supports wildly different moods by palette alone                                      | Untested contrast                                               | <https://snazzymaps.com/>                                                                                                                                |
| Nolli map                   | Figure-ground, public space as one continuous void                                                                          | Monochrome loses districts                                      | see 2.2                                                                                                                                                  |
| Beck tube map               | Octilinear schematisation, equal spacing, colour per line                                                                   | Loses area semantics                                            | see 2.3                                                                                                                                                  |
| Swiss / Imhof               | Restraint, type hierarchy, soft relief and colour by elevation                                                              | Effort-heavy hand craft                                         | see 2.4                                                                                                                                                  |
| Kevin Lynch                 | Five elements as the information architecture                                                                               | n/a                                                             | see 2.1                                                                                                                                                  |
| CodeCity / SoftVis3D        | Districts as nested platforms, buildings as classes                                                                         | Bare boxes, nesting as stacked plinths, no streets              | <https://doi.org/10.1109/vissof.2007.4290706>, <https://github.com/stefanrinderle/softvis3d> (LGPL-3.0, Three.js 0.127, last push 2023-09-18) [verified] |

The gap SoftVis3D leaves (its frontend pins Three.js `^0.127.0` [verified, package.json]) is exactly the cartographic
layer: streets with hierarchy, water and parks as edges, labelled districts, soft lighting.

## 5. Moodboards

### 5.1 A. "Paper atlas" (recommended)

Townscaper softness, Swiss restraint, Mini Motorways road clarity.

- Ground: warm paper. Districts: very light tints of a categorical palette (OKLCH lightness ≈ 0.92 to 0.95,
  chroma ≤ 0.04), so labels stay dark-on-light everywhere.
- Roads: white fill, 1 px darker casing at overview; at street zoom a kerb (low extruded strip), at close zoom
  dashed centre markings only on avenues.
- Water: desaturated blue with 2 to 3 offset "waterlines" along the shore (an old atlas device), very slow shimmer
  if motion is allowed (respect `prefers-reduced-motion`).
- Parks: sage green, instanced lollipop trees at close zoom only. Plazas: pale stone with a faint paving grid.
- Light: one warm key light at ≈ 45° yaw, 50° elevation; soft shadows; screen-space AO for contact darkening.
- References: Townscaper <https://en.wikipedia.org/wiki/Townscaper>, Islanders
  <https://en.wikipedia.org/wiki/Islanders_(video_game)>, Imhof <https://en.wikipedia.org/wiki/Eduard_Imhof>.
- Dark twin "Night atlas": slate ground, district tints at OKLCH L ≈ 0.22 to 0.26, roads mid-grey, warm window
  lights on buildings later.

### 5.2 B. "Beck schematic"

Mini Motorways meets the tube map; flat, top-down or very low tilt.

- No lighting, no AO; flat fills; roads strictly octilinear with rounded joins; folders as stations/nodes at
  junctions; districts as large flat colour fields with a thin white gap (the "street") between them.
- Best for statistics, diffing old versus new, print and embedding in docs (exports cleanly to SVG).
- References: <https://en.wikipedia.org/wiki/Harry_Beck>, <https://en.wikipedia.org/wiki/Mini_Motorways>,
  <https://doi.org/10.1109/tvcg.2010.81>.

### 5.3 C. "Nolli noir"

Figure-ground, Stamen Toner contrast.

- Parcels black (light mode) or near-white (dark mode); streets and plazas the paper colour; districts shown only by
  labels and thin boundary lines; one accent colour for selection and change (construction sites, strangler areas).
- Strongest recognisability of street pattern; weakest for categorical information.
- References: <https://en.wikipedia.org/wiki/Figure-ground_diagram>,
  <https://docs.stadiamaps.com/map-styles/stamen-toner/>.

All three can be **themes over one scene graph** if the style is defined as data (a style spec in the spirit of the
MapLibre style spec: per-layer paint properties with zoom stops). That is a strong reason to separate geometry from
style from the start.

## 6. Colour and contrast

### 6.1 Rules that apply

- WCAG 2.2 AA text: 4.5:1, large text 3:1 (1.4.3). [verified] <https://www.w3.org/TR/WCAG22/>
- Non-text contrast 3:1 applies to UI components and "parts of graphics required to understand the content" (1.4.11).
  [verified] <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>
- Use of colour (1.4.1): never encode by hue alone; pair hue with label, pattern or shape. [verified, SC list in spec]
- Target size minimum 24 × 24 CSS px (2.5.8, AA) for interactive controls; map features at overview zoom are smaller,
  so selection must also be reachable via search and keyboard lists. [verified]
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- Focus appearance (2.4.13) is AAA, but 2.4.7 focus visible and 2.4.11 focus not obscured are required.
  [verified] <https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html>

Implication: road versus block fills may be gentle (1.5:1 to 2:1) as long as structure is also conveyed by labels,
casings and the 3:1 boundary or selection strokes. Everything that carries meaning on its own (district boundary,
selection, "changed" outline, construction hatching) needs ≥ 3:1 against its neighbours.

### 6.2 Proposed starter palettes with measured contrast

Ratios computed with the WCAG relative luminance formula in a Bun script for this report. [measured]

| Theme | Pair                                            | Ratio         | Passes                                                 |
| ----- | ----------------------------------------------- | ------------- | ------------------------------------------------------ |
| Light | label `#1E1E24` on ground `#F2EEE6`             | 14.33         | AA text                                                |
| Light | label `#1E1E24` on parcel `#E4DED2`             | 12.38         | AA text                                                |
| Light | secondary label `#4A4A55` on ground             | 7.56          | AAA text                                               |
| Light | water label `#1F4E6B` on water `#A9CCE3`        | 5.27          | AA text                                                |
| Light | park label `#2F5A22` on park `#C8DDB0`          | 5.53          | AA text                                                |
| Light | accent `#B4472E` on ground                      | 4.68          | AA text                                                |
| Light | link/selection `#1D4ED8` on ground              | 5.79          | AA (`#2563EB` fails at 4.47)                           |
| Light | road casing `#C9C2B4` on ground                 | 1.53          | decorative only                                        |
| Light | boundary `#8A8172` on ground / on parcel        | 3.32 / 2.87   | ground yes, parcel no: darken where it crosses parcels |
| Dark  | label `#E8E6E1` on ground `#14161B`             | 14.51         | AA text                                                |
| Dark  | label on parcel `#1E222A` / road `#2C313B`      | 12.78 / 10.46 | AA text                                                |
| Dark  | secondary `#A7ABB5` on ground                   | 7.87          | AAA text                                               |
| Dark  | water label `#8FC3E6` on `#0F2A3A`              | 7.87          | AA text                                                |
| Dark  | park label `#9CCB8A` on `#1B2B1F`               | 8.02          | AA text                                                |
| Dark  | accent `#F08A5D`, selection `#7AA7FF` on ground | 7.32, 7.58    | AA text                                                |
| Dark  | boundary `#666D7C` on ground                    | 3.48          | 3:1 (`#5B6270` fails at 2.95)                          |
| Dark  | road `#2C313B` on ground                        | 1.39          | decorative only                                        |

Practice:

- Always draw labels with a **halo** in the local ground colour (MapLibre `text-halo-*`
  <https://maplibre.org/maplibre-style-spec/layers/>); the halo guarantees contrast over any tint or texture.
- Generate district tints in **OKLCH/Oklab** (perceptually uniform lightness) so every district has the same
  lightness and only hue varies; this keeps label contrast uniform. [verified concept]
  <https://bottosson.github.io/posts/oklab/>. Library: `culori` 4.0.2, MIT. [verified npm]
- Hue assignment must be **deterministic and stable**: hash the district's stable id to a hue slot, not its index,
  so adding a folder does not repaint the city. Check categorical sets against colour-vision deficiency; ColorBrewer
  qualitative schemes are a vetted starting point. <https://doi.org/10.4324/9781351191234-18>
- APCA is not part of WCAG 2.2; test with WCAG 2 ratios for compliance. [verified: WCAG 2.2 uses ratio formula]

## 7. Labels and semantic zoom

### 7.1 Zoom bands (proposal)

| Band    | Screen scale (approx.)          | Shown                                                                                  | Hidden                            |
| ------- | ------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| City    | whole repo fits                 | District names (uppercase, letter-spaced, large), water/park names, landmarks as icons | Streets, parcels                  |
| Borough | one top-level folder fills view | Sub-district names, avenue names along roads                                           | Parcel outlines merge into blocks |
| Street  | ~20 to 100 parcels visible      | All street names, block outlines, kerbs, plazas                                        | File names                        |
| Parcel  | individual parcels ≥ ~48 px     | File names (horizontal, inside or beside parcel), road markings, trees, details        | Distant district names fade       |
| Walk    | perspective camera              | Signposts at junctions, billboards on buildings, HTML overlay on hover                 | Map-style labels                  |

District labels should persist one band longer than their content (they act as "you are here").

### 7.2 Placement algorithm

- Use a **greedy, priority-ordered collision pass** each time the view settles: sort candidates by priority (feature
  rank, then stable id), try 4 to 8 anchor positions, accept if the bounding box does not collide (grid or R-tree
  index). This is how MapLibre symbol placement behaves (`symbol-sort-key`, `text-variable-anchor`,
  `text-allow-overlap`). [verified properties exist in the style spec]
  <https://github.com/maplibre/maplibre-style-spec>
- Christensen, Marks and Shieber showed simulated annealing beats greedy and gradient methods on point-label quality,
  at higher cost. [verified paper] <https://doi.org/10.1145/212332.212334>. Use it offline for the city-scale
  district labels (few dozen labels, computed once per layout and cached), greedy for the many dynamic labels.
- **Stability**: deterministic priorities and tie-breaking by stable id; **hysteresis** (a placed label keeps its
  anchor while it still fits) so labels do not flicker during pan/zoom; fade in/out over ~150 ms.
- deck.gl offers GPU-side `CollisionFilterExtension` for real-time hiding of overlapping features. [verified]
  <https://github.com/visgl/deck.gl/blob/master/docs/api-reference/extensions/collision-filter-extension.md>
- Text rendering: SDF/MSDF glyphs for crisp text at any zoom. `troika-three-text` generates SDF atlases on the fly in
  a web worker, with kerning, ligatures and bidi. [verified] <https://github.com/protectwise/troika>. For the handful
  of focused or hovered labels, an HTML overlay gives real DOM text for screen readers and selection.

## 8. Rendering details

- **Roads**: casing + fill, the standard web-map technique (draw all casings first, then all fills, so junctions
  merge cleanly). Width by hierarchy, e.g. avenue 2×, street 1×, lane 0.6× [proposal]. In 3D, road surfaces are a
  few centimetres below kerb strips; kerbs are thin extruded polygons from the block outline offset inward. Markings
  (centre dashes, zebra crossings at plazas) only at parcel zoom. Round joins and caps.
- **Blocks and parcels**: block is the inset polygon between streets (offset by half road width plus pavement);
  parcels subdivide blocks with a 1 to 2 px gap (or a thin darker line) so the grain reads at all zooms.
- **Water**: flat fill plus 2 to 3 inward-offset shoreline lines (Imhof-like waterlines), lighter shallows band;
  bridges as the only crossings, which doubles as Lynch "edges" and "nodes". Optional subtle normal-map shimmer in 3D.
- **Parks**: slightly lifted turf, soft noise texture at close zoom, instanced trees (one `InstancedMesh` per tree
  type) placed by a seeded blue-noise sampler (deterministic per park id).
- **Plazas**: paved stone colour, faint grid pattern, a central landmark slot.
- **Ambient occlusion**: screen-space AO gives contact darkening where buildings meet the ground and in road gutters.
  Options: three.js `GTAONode`/`SSAONode`/`AONode` (built in) [verified docs exist]
  <https://github.com/mrdoob/three.js/tree/dev/docs/pages>, or N8AO (ISC, v2.0.1) whose `aoRadius` should be one to
  two orders of magnitude below scene scale and which recommends SMAA because hardware MSAA does not work with
  its AO. [verified] <https://github.com/N8python/n8ao>. For the flat schematic, fake AO cheaply with a blurred
  inner shadow texture along block edges.
- **Shadows**: one directional light with an orthographic shadow camera fitted to the view; at city zoom, swap
  real shadows for baked blob/contact shadows to save cost [unverified performance claim; measure].
- **Outlines**: thin dark outlines on parcels and buildings help the "illustrated" look and selection. Options:
  three.js `OutlineNode`/`OutlinePass` (selection) [verified docs exist], or post-process edge detection on depth and
  normals for a whole-scene ink line [unverified which is cheaper at 100k].
- **Construction sites / old versus new**: hatch pattern (diagonal stripes) plus accent colour, satisfying 1.4.1 by
  not relying on colour alone.

## 9. Rendering technology

### 9.1 Benchmark (this report)

Setup: Chrome (headless) via Playwright, ANGLE on Vulkan, NVIDIA RTX 4090, 1280 × 800, 60 Hz frame cap, flat
coloured rectangles in a deterministic grid, 120 frames of pan + zoom. "16.7 ms" means "held 60 fps". High-end GPU:
treat as an upper bound; low-end laptops and phones will be several times slower. [measured]

| Renderer                               | 10k build | 10k median / p95 frame | 100k build | 100k median / p95 frame | 1M build | 1M frame    |
| -------------------------------------- | --------- | ---------------------- | ---------- | ----------------------- | -------- | ----------- |
| SVG (DOM rects, `<g>` transform)       | 59 ms     | 16.7 / 16.8            | 565 ms     | 22.1 / 46.7             | not run  | not run     |
| Canvas 2D (`fillRect` per parcel)      | 9 ms      | 16.7 / 16.8            | 66 ms      | 36.9 / 59.0             | not run  | not run     |
| PixiJS 8.22 `Graphics` (WebGL)         | 216 ms    | 16.7 / 16.8            | 228 ms     | 16.7 / 16.8             | 2019 ms  | 16.7 / 16.9 |
| Three.js 0.186 `InstancedMesh` (WebGL) | 52 ms     | 16.7 / 16.8            | 60 ms      | 16.7 / 16.8             | 298 ms   | 16.7 / 16.8 |

Takeaways: SVG and Canvas 2D are fine up to ~10k parcels and fail interactivity at 100k even on a top GPU; both GPU
paths have large headroom; instancing builds an order of magnitude faster than tessellating `Graphics`.
deck.gl's own guidance: ~1M items at 60 fps, 10 to 20 fps near 10M. [verified]
<https://github.com/visgl/deck.gl/blob/master/docs/developer-guide/performance.md>. PixiJS reports 100k static
sprites at ~0.12 ms CPU in v8. [verified] <https://pixijs.com/blog/pixi-v8-launches>

### 9.2 Comparison

| Option            | Version / licence          | Flat schematic                                           | Tilted iso                                       | 3D walk                                   | 100k parcels                                                                               | Labels                                                 | Notes                                                                                                                                                           |
| ----------------- | -------------------------- | -------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SVG               | platform                   | Excellent, crisp, accessible DOM, CSS theming            | Via transform, no depth                          | No                                        | Poor (measured)                                                                            | Native text                                            | Keep as **export** format (docs, PR images, print)                                                                                                              |
| Canvas 2D         | platform                   | Good                                                     | Manual painter's sort                            | No                                        | Poor (measured)                                                                            | `fillText`                                             | Simple; CPU bound                                                                                                                                               |
| PixiJS            | 8.22.0, MIT                | Excellent                                                | Sprites/depth sort by hand                       | No 3D                                     | Good (measured)                                                                            | Bitmap/SDF text                                        | WebGPU + WebGL; 2D only, so walk mode needs a second engine                                                                                                     |
| Three.js          | 0.186.1, MIT               | Good (ortho camera)                                      | Native (ortho camera)                            | Native                                    | Good (measured)                                                                            | troika SDF, HTML overlay                               | `WebGPURenderer` falls back to WebGL2 automatically [verified source]; `BatchedMesh` for many distinct geometries [verified docs]; `MapControls` [verified]     |
| react-three-fiber | 9.8.1, MIT (+ drei 10.7.9) | as Three                                                 | as Three                                         | as Three                                  | as Three if instanced                                                                      | as Three                                               | Declarative scene; avoid one React component per parcel                                                                                                         |
| Babylon.js        | 9.30.0, Apache-2.0         | Good                                                     | Native                                           | Native, strong (physics, collisions, GUI) | Good: thin instances avoid per-instance JS objects, support picking and shadows [verified] | GUI/textures                                           | Heavier bundle [unverified size]; good WebGPU support                                                                                                           |
| deck.gl           | 9.4.0, MIT                 | Excellent for data layers                                | `OrbitView` with `orthographic: true` [verified] | Weak (no walk controls, no game lighting) | Excellent (~1M at 60 fps per docs)                                                         | `TextLayer` SDF atlas, GPU collision filter [verified] | Cartesian coordinates are default in non-geo views [verified]; great for statistics overlays                                                                    |
| MapLibre GL JS    | 6.13.0, BSD-3              | Excellent style spec, symbol placement, `fill-extrusion` | Pitch (perspective only)                         | No                                        | Excellent (vector tiles)                                                                   | Best-in-class collision                                | **No pixel/Cartesian CRS**: open request #3890 [verified]; must fake lng/lat near the equator; projection rework in progress (#8286 merged Sep 2026) [verified] |
| Raw WebGPU        | platform                   | Anything                                                 | Anything                                         | Anything                                  | Best                                                                                       | Build yourself                                         | ~86% global support (Chrome 113+, iOS Safari 26+, Firefox partial) [verified caniuse data]; too much engine work for now                                        |

### 9.3 Same data, flat and 3D

The decisive requirement is "flat schematic AND later 3D walk-around from the same data". Only Three.js and Babylon
satisfy both natively. PixiJS and MapLibre would force a second renderer later; deck.gl is excellent for analytic
overlays but not for walking.

Proposed architecture [design proposal]:

1. **Layout core** (pure TypeScript, no rendering deps, portable to Rust later): emits a versioned, deterministic
   **city model**: road graph (nodes, edges with class and width), polygons for districts, blocks, parcels, water,
   parks, plazas, each with a stable id derived from the path.
2. **Style spec** (data): per-layer paint properties with zoom stops for light/dark and for each moodboard.
3. **Scene builder**: turns model + style into instanced/batched meshes, one draw call per layer class; triangulation
   via earcut-style polygon triangulation [unverified library choice].
4. **Renderers**: Three.js for the interactive app (ortho presets plus perspective walk); an **SVG exporter** from
   the same model for static output; deck.gl layers optional later for statistics.
5. **Labels**: separate placement module working on the model plus camera, rendering via troika text, with an HTML
   overlay for focused items and accessibility.

## 10. Ranked recommendation

1. **Three.js (WebGPURenderer with WebGL2 fallback) + orthographic camera presets + troika SDF labels + MapControls**;
   one city model, styles as data. Covers flat, isometric and walk; MIT; largest ecosystem; measured 100k at 60 fps
   with plain `InstancedMesh`.
2. **Style: "Paper atlas" light with "Night atlas" dark**, OKLCH-uniform district tints, haloed labels, casing+fill
   roads, waterlines, soft AO; palettes in section 6.2 as a starting point (all text pairs ≥ 4.5:1, meaningful
   strokes ≥ 3:1).
3. **Default camera: 2:1 dimetric (30° elevation, 45° yaw)** with one-click switch to plan view (90°) for statistics
   and dense labels; 90° yaw rotation steps.
4. **SVG exporter** for the "Beck schematic" moodboard (docs, PR images, print); cheap because the model is vector.
5. **Labels**: greedy priority collision with hysteresis for dynamic labels; simulated annealing once per layout for
   district names; five zoom bands (section 7.1).
6. Keep **deck.gl** in reserve for analytics overlays; avoid MapLibre until it supports a Cartesian CRS; avoid PixiJS
   only because it blocks the 3D walk (it is otherwise excellent for 2D).
7. Consider **react-three-fiber** only if the surrounding app is React; keep the hot path imperative and instanced.

## 11. Open questions for the owner

1. Which moodboard leads: Paper atlas (A), Beck schematic (B) or Nolli noir (C)? Should all three ship as themes?
2. Default projection: 2:1 dimetric, true isometric, or plan view?
3. Is the surrounding app React (favouring react-three-fiber) or framework-free?
4. Minimum target hardware: does "hosted openly on the web" include phones? This sets the AO/shadow budget.
5. Are motion effects (water shimmer, growth animation) welcome, with `prefers-reduced-motion` respected?
6. Should static SVG/PNG export (README badges, PR images) be a first-class output from day one?
7. Must text be selectable/readable by screen readers on the map itself, or is an accessible side list (tree view,
   search) acceptable as the primary accessible path?

## 12. Sources

- Isometric projection: <https://en.wikipedia.org/wiki/Isometric_projection>
- Isometric video game graphics: <https://en.wikipedia.org/wiki/Isometric_video_game_graphics>
- SimCity 3000: <https://en.wikipedia.org/wiki/SimCity_3000>
- Kevin Lynch, The Image of the City: <https://en.wikipedia.org/wiki/The_Image_of_the_City>
- Figure-ground diagram: <https://en.wikipedia.org/wiki/Figure-ground_diagram>
- Giambattista Nolli: <https://en.wikipedia.org/wiki/Giambattista_Nolli>
- Harry Beck: <https://en.wikipedia.org/wiki/Harry_Beck>
- Nöllenburg and Wolff 2011, metro maps by MIP: <https://doi.org/10.1109/tvcg.2010.81>
- Eduard Imhof: <https://en.wikipedia.org/wiki/Eduard_Imhof>
- Imhof 1975, Positioning names on maps: <https://doi.org/10.1559/152304075784313304>
- Christensen, Marks, Shieber 1995, point-feature label placement: <https://doi.org/10.1145/212332.212334>
- Wettel and Lanza 2007, Visualizing software systems as cities: <https://doi.org/10.1109/vissof.2007.4290706>
- Wettel and Lanza 2007, Program comprehension through software habitability: <https://doi.org/10.1109/icpc.2007.30>
- SoftVis3D: <https://github.com/stefanrinderle/softvis3d>
- Townscaper: <https://en.wikipedia.org/wiki/Townscaper>; Stålberg talk: <https://www.youtube.com/watch?v=1hqt8JkYRdI>
- Mini Motorways: <https://en.wikipedia.org/wiki/Mini_Motorways>
- Islanders: <https://en.wikipedia.org/wiki/Islanders_(video_game)>
- Monument Valley: <https://en.wikipedia.org/wiki/Monument_Valley_(video_game)>
- Pocket City: <https://en.wikipedia.org/wiki/Pocket_City>
- The Battle of Polytopia: <https://en.wikipedia.org/wiki/The_Battle_of_Polytopia>
- Stamen Toner (Stadia): <https://docs.stadiamaps.com/map-styles/stamen-toner/>
- Stamen Watercolor (Stadia): <https://docs.stadiamaps.com/map-styles/stamen-watercolor/>
- Protomaps basemaps (CC0 style design, BSD-3 code): <https://github.com/protomaps/basemaps>
- MapLibre style spec: <https://github.com/maplibre/maplibre-style-spec>, <https://maplibre.org/maplibre-style-spec/>
- MapLibre pixel CRS request: <https://github.com/maplibre/maplibre-gl-js/issues/3890>; projections PR:
  <https://github.com/maplibre/maplibre-gl-js/pull/8286>
- Snazzy Maps: <https://snazzymaps.com/>
- ColorBrewer (Harrower and Brewer): <https://doi.org/10.4324/9781351191234-18>
- Oklab: <https://bottosson.github.io/posts/oklab/>
- WCAG 2.2: <https://www.w3.org/TR/WCAG22/>; Understanding non-text contrast:
  <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>; target size:
  <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>; focus appearance:
  <https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html>
- Three.js source and docs (BatchedMesh, InstancedMesh, WebGPURenderer fallback, GTAONode, OutlineNode,
  MapControls): <https://github.com/mrdoob/three.js>
- troika-three-text: <https://github.com/protectwise/troika>
- N8AO: <https://github.com/N8python/n8ao>
- PixiJS v8 launch and benchmarks: <https://pixijs.com/blog/pixi-v8-launches>
- Babylon.js thin instances:
  <https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/copies/thinInstances.md>
- deck.gl docs (OrthographicView, OrbitView, coordinate systems, performance, TextLayer, CollisionFilterExtension):
  <https://github.com/visgl/deck.gl/tree/master/docs>
- WebGPU support data (caniuse): <https://github.com/Fyrd/caniuse/blob/main/features-json/webgpu.json>
- Package versions and licences: npm registry (`npm view <pkg> version license`), queried October 2026.
- Benchmark harness: ad hoc, in `/tmp/citybench` (not committed); method in section 9.1.
