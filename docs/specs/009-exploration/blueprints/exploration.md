# Exploration blueprint

Derived from [exploration](../exploration.md) and the [viewer](../../004-interface-design/viewer.md); research in
[GTA-style models](../../../research/gta-style-models/README.md). Code: `packages/world` (pure: the walls),
`apps/web/src/explore` (pure: movers, session, camera, input, landing, vehicles, models, physics adapters),
`apps/web/src/components` (`ExploreView`, `ExploreCanvas`, the Walk button), `apps/web/scripts/models` (the model
build).

## Domain and naming

| Term      | Identifier                                                | Meaning                                                                            |
| --------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| walls     | `Walls` (`move`, `clearance`, `dispose`)                  | the port every physics engine answers: moves with sliding and steps, rays          |
| footprint | `Footprint`, `footprintsOf(buildings, table)`             | a building's corners in metres and its roof's height                               |
| bespoke   | `cityWalls(footprints)`, `bespokeWalls`                   | citymap's own walls: convex prisms in a 16 m grid                                  |
| Rapier    | `rapierWalls`                                             | the Rapier adapter: buildings as convex hulls, the flat ground held by the adapter |
| raising   | `RaiseWalls`, `WallOptions`                               | an engine's footprints-to-walls, reporting `engine` and `walls` steps, cancellable |
| landing   | `Landing`, `landingOf(city, selected, centre)`            | where the walk begins, its heading, why there, and the road beside it              |
| walker    | `Body`, `stepWalker`, `Intents`                           | the person: feet, rise, heading, footing; one step under intents                   |
| session   | `Session`, `advanceSession`, `startSession`               | walker, vehicles, ride, orbit, spare time; a frame of fixed 120 Hz steps           |
| shown     | `shownOf`, `shownVehicles`                                | where to draw, between the last two steps                                          |
| controls  | `Controls`, `newControls`, `intentsOf`, `stickAt`         | held keys, stick, jump, drag, use; and what they mean                              |
| camera    | `Orbit`, `Follow`, `cameraOf`, `reachOf`, `easeReach`     | the follow camera: orbit, distance, pulled in at walls                             |
| vehicle   | `Vehicle`, `VehicleKind`, `VEHICLES`, `stepVehicle`       | a parked or ridden vehicle; its spec; one step of arcade handling                  |
| parking   | `parkedBy(landing, walls)`                                | the bicycle and the car at the kerb ahead of the landing                           |
| prompt    | `Prompt`, `promptOf`, `promptWords`                       | what E does now, and its words                                                     |
| motion    | `Motion`, `CLIP_OF`, `motionOf`, `paceOf`                 | idle, walk, sprint, jump, fall, drive; their clips and paces                       |
| sight     | `cityHits`, `sightOf`, `windowRows`, `inspector`          | what the crosshair meets: a roof, a wall, a window and its file                    |
| rig       | `Rig`, `RIGS`, `PROCEDURAL_RIGS`, `poseVehicle`, `leanOf` | a model's moving parts and axes; a vehicle posed by them                           |
| model     | `ModelFile`, `GLTF_MODELS`, `loadModel`, `Loaded`         | a model file, its size and facing; a loaded model's copies, clips and original     |
| retarget  | `retargetClip`, `WOBBLE_FROM_UAL`, `QUATERNIUS_FROM_UAL`  | a clip carried onto another skeleton by turns from rest                            |

## The walls (`packages/world`)

- `Footprint`: `{ lot, corners: { x, z }[], top }`, metres, convex. `solid` when three or more corners enclose area and
  `top > 0`.
- `cityWalls`: each solid footprint a `Prism` (corners turned anticlockwise from above, outward edge normals, box, top)
  in a uniform grid of `CELL` = 16 m cells keyed `(cx + 2²⁰) · 2²¹ + (cz + 2²⁰)`.
- `move(feet, delta, radius = PERSON_RADIUS)`: the horizontal move cut into steps of at most `radius / 2` (at most
  `MAX_STEPS` = 256); after each, `PUSHES` = 4 rounds push the circle out of every prism whose top is above
  `y + STEP_UP` (the shortest way: out through the nearest edge from inside, away from the nearest outline point from
  outside); the feet rise onto any top within a step. Then vertically: on the floor (ground `GROUND` or a top within a
  step) when `y + delta.y` is at or below it, or when going down within `SNAP_DOWN` of it from within `SNAP_DOWN`;
  otherwise in the air.
- `clearance(from, to)`: the segment clipped by every prism in its box (in plan by half-planes, in height between 0 and
  the top), and by the ground going down; zero length is zero.

## Physics adapters (`apps/web/src/explore/physics`)

- `bespokeWalls(footprints, { onStep, signal })`: steps `walls 0/n`, a breath, the walls, `walls n/n`; logs
  `explore/walls engine=bespoke buildings skipped ms`.
- `rapierWalls`: `engine` step while `@dimforge/rapier3d-compat` loads and initialises (once per page); walls in slices
  of `SLICE` = 2,000 with a breath between (each slice a `walls done/of` step); convex hulls from ground to top; no
  ground collider. Movers are sensor capsules per radius (`capsuleHalf(r) = max(0, PERSON_HEIGHT / 2 − r)`), moved by a
  character controller (offset `SKIN` = 0.02 m, autostep `STEP_UP`, snap `SNAP_DOWN`), with `EXCLUDE_SENSORS`. A move
  Rapier finds grounded above `GROUND` stands there; otherwise `onGround` holds the feet to the ground. Rays exclude
  sensors and stop at the ground. Logs `explore/walls engine=rapier buildings skipped engineMs ms`.

## The walk (`apps/web/src/explore`)

- `landingOf`: the selected lot's centroid (scene units), else `centre`; the nearest point of any road or highway
  segment to it; before a building, `KERB_GAP` = 1 m inside the road's edge towards it, facing it; else on the road,
  facing along it; `road: { at, along, width }`. Null without roads.
- `stepWalker(body, intents, look, dt, walls)`: intents relative to `look`, normalised past 1; `WALK_SPEED` 1.6 or
  `RUN_SPEED` 4.5 m/s; heading turns towards the move at most `TURN_RATE` = 10 rad/s; standing presses `−g·dt`; a jump
  leaves at `JUMP_SPEED` 3.5 m/s; gravity `GRAVITY` 9.81.
- `advanceSession`: the drag turns the orbit (`LOOK_SPEED` 0.005 rad/px, pitch `PITCH_MIN` −0.25 to `PITCH_MAX` 1.25); E
  (`use`) gets on the reachable vehicle (grounded only) or off below `LEAVE_SPEED` 1.5 m/s at `alightFrom`; then
  `STEP` = 1/120 s steps of the time due, a frame at most `LONGEST_FRAME` 0.1 s. Riding steps the vehicle and clears it
  of the others (`BUMP` keeps 0.2 of its speed); on foot the walker is cleared of every vehicle. Riding faster than
  `CHASE_FROM` 1 m/s with no drag, the orbit's yaw eases behind the vehicle over `CHASE` 0.25 s.
- `shownOf`: the walker between `previous` and `body` by `spare / STEP`, the heading the short way round, and `walked`
  less the unspent part of the last step.
- `reachOf` and `easeReach`: the camera's full `Follow.distance` unless the ray from the target is cut short by more
  than `ROUNDING` 10⁻⁶ m, then the cut less `WALL_GAP` 0.25 m, at least `NEAREST` 0.4 m; in at once, out over
  `REACH_EASE` 0.3 s.
- Vehicles: `VEHICLES.bicycle` (1.75 × 0.6 m, radius 0.35, wheelbase 1.05, top 10 m/s, accelerate 4.5, brake 7, coast
  0.4, turn radius 3 m, turn rate 2.2 rad/s, response 10) and `VEHICLES.car` (4.2 × 1.8, 0.95, 2.6, 32 m/s, 9, 14, 1.2,
  5.5 m, 1.5, 7). Power tapers `accelerate · (1 − (v/top)²)`; the aimed turn is
  `−right · min(|v| / radius, rate) · sign(v)`, reached at `response` per second; the wheel angle
  `atan(turn · wheelbase / v)` held to `MAX_STEER` 0.6.
- Parking: `PARKING.bicycle` 4 m ahead, 0.8 m in from the kerb; `PARKING.car` 10 m and 1.4 m; moved out from the road's
  middle by the walls.

## Models

- `scripts/models/build-models.ts` builds `public/models` (sources cached in `~/.cache/citymap/models`; itch.io three
  tries five seconds apart; a zip read through its directory, or its local headers when the directory is damaged):
  - `people/man.glb`, `people/woman.glb`: Wobble Blocks' FBX converted by FBX2glTF, split, and the clips `CLIPS` from
    the Universal Animation Library retargeted (`WOBBLE_FROM_UAL`, rest `A_TPose`, hip `Hips`, 30 fps) and baked.
  - `vehicles/bicycle.glb`, `sedan.glb`, `pickup.glb`: heyheythere's glb with its atlas embedded, filters NEAREST.
  - `CREDITS.md`: one line per source, as their licences ask.
- `retargetClip(target, source, clip, rest, names, { hip, fps = 30 })`: names sanitised as three.js does; in each
  model's own frame, each mapped bone's turn `source(t) · source_rest⁻¹ · target_rest`, unmapped bones at rest, the hip
  moved by the source hip's move times `targetHip.y / sourceHip.y`; sampled at `fps` to the clip's end (played once,
  held). Throws `explore/retarget-no-hip` when either lacks the hip.
- `loadModel`: the file sized to `metres` by `measure`, turned by `yaw` to face +x, on y = 0, centred; measured
  precisely as posed by its skeleton. `original` is the file's own scene, to retarget against.
- `Animator`: one action per clip; a motion's clip by `CLIP_OF`, cross-faded over `BLEND` 0.15 s; a missing clip logs
  `explore/clip-missing motion` once and keeps the last.
- Paces: walk at `speed / WALK_CLIP_SPEED` (1 m/s, measured 0.98), sprint at `speed / SPRINT_CLIP_SPEED` (2.56 m/s,
  measured), each within `SLOWEST` 0.4 and `FASTEST` 2.

## The crosshair

- `cityHits(footprints).hit(from, to)`: the first prism the segment enters; a roof when its height limits the entry last
  going down, else a wall named in the footprint's own corner order (`edge`, `along` from its first corner, `length`),
  as the building shader names it.
- `sightOf(hit, look, files)`: on a wall, floor `floor((y − BASE) / FLOOR)` (`BASE` 0.3 m, `FLOOR` 2.5 m), columns
  `max(1, floor(length / PITCH))` (`PITCH` 2.5 m); a window within 30 % to 80 % of its floor and the middle half of its
  column, below the top floor; lit by the shader's rule over `row · columns + column`, unknown when the lit share is
  negative; its file `floor(row · files / floors)`. Anything else is the building.
- The view casts from the camera's eye through its target, `SIGHT_REACH` 150 m, every frame, and shows the card only
  when what is in sight changes. `inspector` picks the building's card at its footprint's middle (null when another
  thing is there) and its files from its measures, else the card's one file.
- The camera's target is `SHOULDER_SIDE` 0.6 m to the right of the walker's head, short of a wall there by `WALL_GAP`.

## Signs

- `roadSegments(city)`: every road and highway as straight pieces in metres; `roadGrid` puts them in `ROAD_CELL` 32 m
  cells and finds the nearest point ring by ring, stopping once nothing further can be nearer.
- `nearestLots(footprints, at)`: the `SIGN_POOL` 24 nearest buildings whose middle is within `SIGN_REACH` 80 m.
- `wallFacing(footprint, street)`: the wall whose outward normal points most squarely at the street's nearest point to
  the building's middle; worked out once per building.
- `signName(files)`: the first file's name, and `+n` for the files that share the building.
- `SignBoard` (in the canvas) owns 24 planes, each with a 1,024 by 96 px canvas texture lettered in the page's face,
  light on a dark plaque; every `SIGN_EVERY` 0.25 s it keeps signs whose buildings stay near and letters freed ones for
  newcomers. A sign is 0.68 m tall (0.42 m lettering), at most 90 % of its wall, 4 cm out from it, centred in the band
  between the first floor's windows and the second's (1.05 floors up), or at 0.9 of a one-floor building. The walk's
  element carries `data-signs`, the number shown.

## Presentation and UX

- Walk: an icon button "Walk", `aria-pressed` while walking; on a coarse pointer at the bottom centre, hidden while the
  drawer is open or walking.
- The walk's card (bottom centre; top on touch): its title ("On foot", "On the bicycle", "In the car"), "Physics
  prototype: {engine}" while two engines are compared, the keys of the ride, and "Back to the map".
- The prompt: top centre (above the stick on touch), `E` in a key cap and its words; disabled while "Slow down to …".
- Touch: a 144 px stick (reach `STICK_REACH` 48 px) and a 72 px Jump button.

## Errors and edge cases

| Case                                | Handling                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| No roads                            | "This city has no roads to walk on."; `explore/no-roads`                      |
| Engine fails to load                | "Walking could not start: the physics engine did not load."; `explore/failed` |
| Walk cancelled                      | Nothing said; the map stays                                                   |
| Model fails to load                 | The procedural stand-in with its rig; `explore/model-failed url reason`       |
| Clip missing                        | The last motion keeps playing; `explore/clip-missing motion` once             |
| Footprint without area or height    | No wall; counted in `skipped`                                                 |
| A frame longer than 0.1 s           | Counted as 0.1 s                                                              |
| Key released while the page is away | Every key let go on `blur`                                                    |
| Another city or town shown          | The walk ends and its walls are freed                                         |

## Observability

`explore/walls`, `explore/enter landing buildings`, `explore/leave x z`, `explore/failed reason`,
`explore/no-roads name`, `explore/model-normalised url x y z scale`, `explore/model-failed url reason`,
`explore/clip-missing motion`, and the loading card's `viewer/load-phase source=explore`.

## Performance and limits

- Measured on a desktop (Bun): bespoke walls for 75,000 buildings in 132 ms and 82 MB; a move 0.5 µs, a ray 0.4 µs.
  Rapier: 996 ms and 312 MB at 75,000 buildings, 75 MB at 250; 1.6 MB gzipped, loaded only on Walk.
- Models: people 370 to 381 KB, vehicles 159 to 224 KB each.

## Testing

Unit tests beside each module (`*.test.ts`), 100 % covered: the walls (including a property test that no walk among nine
buildings ends inside one), both adapters against real Rapier, landing, walker, session (riding, prompts, shown poses at
uneven frame times), camera, input, vehicles, models, retargeting (rest frames, turned models, hip scale), rigs, motions
and the Animator. End to end (`e2e/explore.spec.ts`): walking by keys and by touch, the loading log, getting on the
bicycle and off, the Rapier prototype, Wobble Blocks loaded, axe light and dark.
