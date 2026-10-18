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
| vehicle   | `Vehicle`, `VehicleKind`, `VEHICLES`, `stepVehicle`       | a parked or ridden vehicle; its spec; one step of its handling                     |
| arcade    | `Handling`, `CAR`                                         | the car's arcade handling: power, brakes, coasting, turning                        |
| cycle     | `Cycle`, `rideCycle`, `resting`, `shift`, `thrown`        | the bicycle's own state and one step of it: lean, steer, drivetrain, pitch, falls  |
| whipple   | `Lean`, `whipple`, `stiffness`                            | the benchmark bicycle's lean and steer equations, one step                         |
| rider     | `aimedLean`, `riderTorque`                                | the simulated rider's balance: a lean aimed at, the steering torque to reach it    |
| HUD       | `Hud`, `hudOf`                                            | speed, gear and cadence, as the HUD shows them                                     |
| parking   | `parkedBy(landing, walls)`, `parkedIn(city, landing, …)`  | the pair at the kerb ahead of the landing; the city's own parked vehicles          |
| pool      | `nearestOf`, `assignPool`                                 | which vehicles the canvas draws, and in which of its models                        |
| pad       | `Pad`, `padOf`, `PadPresses`                              | a gamepad's state as intents, look and presses                                     |
| pedalling | `pedalsOf`, `reachFor`                                    | where the pedals are; a leg bent to put its foot on one                            |
| bell      | `ringBell`                                                | the bicycle's bell, rung by Web Audio                                              |
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
- Vehicles: `VEHICLES.bicycle` (1.75 × 0.6 m, radius 0.35) and `VEHICLES.car` (4.2 × 1.8, 0.95); each its words, its
  keys and its follow camera. `Vehicle` is a union on `kind`: a car, or a bicycle carrying its `cycle`. `stepVehicle`
  steps a car by `CAR` and a bicycle by `rideCycle`, then moves it by the walls; a move that gets less than half its way
  is a hit, which `bumped` turns into a fall for a bicycle at `HARD_HIT` or more, and else keeps `BUMP` of the speed.
  `parkedNow(vehicle)`: stopped, the bicycle `resting` with its gear and crank kept.
- The car (`CAR`, arcade): wheelbase 2.6 m, top 32 m/s, reverse 6, accelerate 9, brake 14, coast 1.2, turn radius 5.5 m,
  turn rate 1.5 rad/s, response 7. Power tapers `accelerate · (1 − (v/top)²)`; the aimed turn is
  `−right · min(|v| / radius, rate) · sign(v)`, reached at `response` per second; the wheel angle
  `atan(turn · wheelbase / v)` held to `MAX_STEER` 0.6.
- The landing's pair: `PARKING.bicycle` 4 m ahead, 0.8 m in from the kerb; `PARKING.car` 10 m and 1.4 m; moved out from
  the road's middle by the walls; ids `bicycle` and `car`.
- Gears in a frame: riding a bicycle (not flying), `Controls.gears` shifts it, once per frame, before the steps.

## Parked vehicles (`explore/parking.ts`)

- `parkedIn(city, landing, walls)`: every town road of class street, collector, avenue or boulevard, in metres; kerb
  places every `PLACE_GAP` 24 m along its polyline at `(k + ½) · PLACE_GAP`, on the right kerb for even `k` and the left
  for odd, facing along the road on the right and against it on the left. A place is skipped within `JUNCTION_GAP` 8 m
  of any road's end (its own included, found in a 16 m grid) and within `LANDING_CLEAR` 12 m of the landing.
  `placeHash(road, k)` (32-bit integer mix to [0, 1)) below `BICYCLE_SHARE` 0.3 parks a bicycle, below
  `BICYCLE_SHARE + CAR_SHARE` (0.6) a car; inset as `PARKING`, moved out from the road's middle by the walls. A
  bicycle's crank starts at `placeHash · 2π`. Ids `parked-{road}-{k}`. Kept: the `PARKED_MOST` 200 nearest the landing,
  nearest first, ties by id. Logs `explore/parked bicycles cars places`.
- `Viewer` adds them after the landing's pair and hands them to the walk (`ExploreView.parked`).

## The bicycle (`explore/bicycle.ts`)

Lean `φ` and steer `δ` positive to the left, turns anticlockwise; metres, seconds, newtons.

- `Cycle`: `lean`, `leanRate`, `steer`, `steerRate`, `aim` (the lean aimed at, slewed), `crank` (radians, forwards),
  `cadence` (crank rad/s, 0 freewheeling), `gear` (index), `pitch` and `pitchRate` (the back wheel lifted, about the
  front contact), `footDown`, `fallen` (seconds since thrown, or null), `side` (1 left, −1 right: where it fell),
  `wobble` (seconds, the searching phase). `resting(gear = START_GEAR, crank = 0)`: upright, still, a foot down.
- `whipple(lean, v, leanTorque, steerTorque, dt)`: `M q̈ + v C1 q̇ + (g K0 + v² K2) q = T`, the benchmark's matrices
  (Meijaard et al. 2007, Table 2): `M` [[80.81722, 2.31941332208709], [2.31941332208709, 0.29784188199686]], `C1`
  [[0, 33.86641391492494], [−0.85035641456978, 1.68540397397560]], `K0` [[−80.95, −2.59951685249872],
  [−2.59951685249872, −0.80329488458618]], `K2` [[0, 76.59734589573222], [0, 2.65431523794604]]; semi-implicit Euler;
  the bars stop at `STEER_STOP` 1 rad (the rate zeroed there). `stiffness(v)` = `g K0 + v² K2`.
- Heading: `turn = (v δ + TRAIL δ̇) cos(TILT) / WHEELBASE` (`TRAIL` 0.08 m, `TILT` π/10, `WHEELBASE` 1.02 m).
- `aimedLean(right, v)`: `−clamp(atan(v² · right / (TURN_RADIUS · g)), ±MAX_LEAN)`, `TURN_RADIUS` 3 m, `MAX_LEAN` 0.6
  rad (a ≈ 0.68 g, under `GRIP` 0.9). The aim moves towards it at `LEAN_SLEW` 1.5 rad/s.
- `riderTorque(cycle, v)`: held steer `δs = clamp(−K₀₀ · aim / K₀₁, ±STEER_STOP)` and torque `Ts = K₁₀ · aim + K₁₁ · δs`
  (`K = stiffness(v)`);
  `T = clamp(Ts + LEAN_GAIN (φ − aim) + LEAN_RATE_GAIN φ̇ + STEER_GAIN (δs − δ) − STEER_DAMPING δ̇, ±STEER_TORQUE_MOST)`:
  30, 10, 5, 1, 25 N·m.
- Assist: a lean torque `−fade · (ASSIST_LEAN (φ − aim) + ASSIST_DAMPING φ̇)`, `fade = max(0, 1 − v / ASSIST_UNTIL)`:
  1,500 N·m/rad, 300 N·m·s/rad, 4 m/s. Wobble: steering torque
  `WOBBLE_TORQUE · max(0, 1 − v / WOBBLE_FROM)² · sin(2π WOBBLE_HZ · wobble)`: 6 N·m, 3 m/s, 1.2 Hz.
- Mass: `MASS` 94 kg, its middle `MASS_AHEAD` 0.342 m ahead of the back contact and `MASS_HEIGHT` 0.861 m up (the
  benchmark's bodies). Loads with acceleration `a` (forwards positive): back `m (g (w − b) + a h) / w`, front
  `m (g b − a h) / w`, each at least 0; with the back wheel lifted, all on the front.
- Drivetrain: `GEARS` [1.2, 1.5, 1.8, 2.2, 2.6, 3.1, 3.6] wheel turns per crank turn, `START_GEAR` 2, `WHEEL_RADIUS`
  0.337 m. Pedalling (`forward > 0`): crank speed `max(0, v) / (G r)`, torque
  `forward · TORQUE_MOST · max(0, 1 − crank speed / CADENCE_MOST)` (120 N·m, 14.66 rad/s = 140 rpm), drive
  `torque / (G r)`, held to `GRIP · back load`; the crank turns at the crank speed and `cadence` is it. Not pedalling,
  the crank holds and `cadence` is 0 (freewheel).
- Resistance against the motion: `ROLLING` 0.006 `m g` and `½ AIR_DENSITY DRAG_AREA v²` (1.2 kg/m³, 0.5 m²).
- Brakes: S (`forward < 0`) asks `−forward · REAR_BRAKE` (600 N), Space (`jump`) `FRONT_BRAKE` (850 N); each held to
  `GRIP` times its wheel's load at the acceleration first found (one refinement). Brakes and resistance stop the
  bicycle, never reverse it. A foot down, stopped and `forward < 0`, it walks back towards `−WALK_BACK` 0.8 m/s at
  `WALK_BACK_RATE` 2 m/s²; backwards otherwise, it stops at the same rate.
- Pitch (a stoppie): about the front contact, `(L² + h²) θ̈ = d · (L sin θ + h cos θ) − g · (L cos θ − h sin θ)`, `d` the
  deceleration, `L = WHEELBASE − MASS_AHEAD`; held at 0 while it would go below; the rider holds it at `STOPPIE_MOST`
  0.3 rad (the rate zeroed there).
- A foot: down below `FOOT_DOWN` 0.6 m/s, up above `FOOT_UP` 1.2 m/s. Down, the lean eases to `FOOT_LEAN` 0.12 rad (to
  the left, onto the foot) at `FOOT_EASE` 1 rad/s and the bars to `−right · FOOT_STEER` (0.6 rad) at `BAR_EASE` 4 rad/s;
  the aim follows the lean.
- Falls (`thrown(cycle)`): the lateral and longitudinal accelerations together past `GRIP · g`, `|φ|` past `FALL_LEAN`
  0.9 rad, or a hit at `HARD_HIT` 3 m/s. Thrown, it falls to the side it leans (left when upright), slides to a stop at
  `SLIDE · g` (0.5), lies at `LYING` 1.35 rad, reached over `FALLING` 0.4 s and left over the last `RISING` 0.6 s of
  `DOWN` 2.5 s; then `resting` with its gear. Intents count for nothing meanwhile.
- `shift(cycle, steps)`: the gear moved by `steps`, within the gears. `hudOf(cycle, v)`: `speed` km/h, `gear` (from 1),
  `gears`, `cadence` rpm, each rounded. `rideCycle(cycle, v, intents, dt)` does one step: falling, else longitudinal
  (drive, brakes, resistance, pitch, crank), the foot, the lean (foot down, or rider, assist, wobble and `whipple`), the
  turn, then grip and lean checks; it returns `{ cycle, speed, turn }`.

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
- `poseVehicle(model, rig, { rolled, steer, lean, pitch, crank })`: wheels by `rolled / radius`, the crank by `crank`
  (the bicycle's own, so it freewheels), fork and front wheels by `steer`; the model leans about its length and pitches
  nose down by `pitch` about its front contact (`rig.front`, metres ahead of its middle), its position moved so that
  contact stays put. `Rig.pedals`: `arm` and `out` (the right pedal hangs down at rest): PSX 0.133 and 0.165 m, front
  0.507 m; procedural 0.17 and 0.13 m, front 0.55 m.
- `pedalsOf(crank, rig)`: from the crank's pivot in the model's frame (+x ahead, +z right), the right pedal at
  `(-arm sin c, -arm cos c, out)` and the left at `(arm sin c, arm cos c, -out)`.
- The rider (`models/pedalling.ts`): sat on the bicycle at `SADDLE` 0.38 m up in its model's frame, so it leans and
  pitches with it; after the clip plays, `reachFor(thigh, shin, foot, target, bend)` turns `UpperLeg` and `LowerLeg`
  (each side) so the foot is on its pedal, the knee bent towards `bend` (ahead and up), in world space with no
  assumption about the bones' own axes; out of reach, the leg points straight at the target. A foot down puts the left
  foot on the ground `FOOT_OUT` 0.25 m left of the crank. Thrown, the rider lies beside the bicycle, turned as it lies,
  `THROWN` 0.9 m ahead and 0.4 m to its side, back in the saddle once it is up.
- The pool (`nearestOf(vehicles, at, most, keep)`): every `POOL_EVERY` 0.25 s the canvas takes the `VEHICLE_POOL` 8
  nearest of each kind to the walker (the ridden one always), and `assignPool(slots, wanted)` keeps a model on a vehicle
  while it stays wanted and gives freed ones to newcomers; a model without a vehicle is hidden.

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

## Cameras

- `view/view.ts`: `Turn` `{ yaw, tilt }`; `turned(view, dyaw, dtilt)` clamps tilt to `TILT_MIN` 15° to `TILT_MAX` 85°;
  `zoomAt(view, viewport, pointer, factor, mode)` keeps the ground under the pointer where it is; `onKey` turns by
  `KEY_TURN` 15° on Q and E and tilts by `KEY_TILT` 10° on Page Up and Page Down, in the Buildings view only; `fit`
  keeps the view's turn. `flyTo` keeps the fitted turn.
- `view/gesture.ts`: two pointers' `ratio` (pinch zoom), `twist` (turn, radians), `lift` (tilt, from the mean vertical
  move) and `middle` (where a pinch zooms). `MapView`: a right-drag or a Shift-drag turns by `DRAG_TURN` 0.005 rad a
  pixel; plan view pans with any button; the context menu is held back over the map.
- Roof names: `roofLabels(roofs, view, viewport, mode)` names none in plan view or below `ROOF_ZOOM` 60 px a street
  width; else the roofs within the screen's diagonal of the centre, nearest first, each kept only when its box (11 px
  letters) is on screen and clear of every one kept, at most `ROOF_MOST` 60. `Viewer` gives each built lot its
  `signName`, its middle and its roof's height.
- Free camera, `explore/flyer.ts`: `Flyer` `{ at, speed }`; `stepFlyer(flyer, flight, orbit, dt)` moves forward along
  `lookAlong(orbit)`, right on the level and up straight; `geared(flyer, steps)` multiplies by `GEAR` 1.25 a wheel step
  within `SLOWEST_FLIGHT` 2 to `FASTEST_FLIGHT` 300 m/s from `FLY_SPEED` 20; `flyingCamera` looks from `at` along the
  look. `Session.flyer` is null on the walker; `Controls.fly` toggles it (lifting from the follow camera's eye), `gears`
  and `sink` drive it, and while it flies the walker's and the ride's intents are idle and `promptOf` is null.

## Presentation and UX

- Walk: an icon button "Walk", `aria-pressed` while walking; on a coarse pointer at the bottom centre, hidden while the
  drawer is open or walking.
- The walk's card (bottom centre; top on touch): its title ("On foot", "On the bicycle", "In the car"), "Physics
  prototype: {engine}" while two engines are compared, the keys of the ride, and "Back to the map".
- The prompt: top centre (above the stick on touch), `E` in a key cap and its words; disabled while "Slow down to …".
- Touch: a 144 px stick (reach `STICK_REACH` 48 px) and a 72 px Jump button. On the bicycle the Jump button reads
  "Brake" (the front brake), and Ring, Gear down and Gear up (48 px) stand above it.
- HUD (`explore-hud`, on the bicycle only): a list named "Bicycle" of Speed ("18 km/h"), Gear ("3 of 7") and Cadence
  ("72 rpm"), shown when they change, at most every `HUD_EVERY` 0.1 s; `data-foot` "down" or "up", `data-fallen` while
  thrown. Not live: a screen reader reads it on demand.
- The card's keys on the bicycle: "W pedals · S back brake · Space front brake · A D steer · Q R gears · B rings · E
  gets off · click to look · Esc leaves".
- The bell (`explore/bell.ts`): `ringBell(context)` strikes twice, `BELL_GAP` 0.12 s apart, each two sine partials
  (`BELL_PARTIALS` 2,350 and 3,520 Hz, the second at half the level) decaying over `BELL_RING` 0.9 s at `BELL_LEVEL`
  0.2; the context is made on the first ring (a user gesture), and none where Web Audio is missing.

## Devices (`explore/input.ts`)

- Keys: `WALK_KEYS` as before; Q and R add −1 and +1 to `Controls.gears` (as a wheel step), B rings (on the bicycle).
- `padOf(pad, before)` reads the first connected standard gamepad each frame: `stick` from the left stick, its y plus
  the right trigger less the left (clamped to −1 to 1), each axis zero within `DEAD_ZONE` 0.15; `jump` while A is held;
  `look` the right stick times `PAD_LOOK` 900 px a second; presses (`use` Y, `ring` X, `gears` RB less LB, `fly` View)
  on the frame a button goes down. `Controls.pad` holds the stick and jump; `intentsOf` takes the touch stick, else the
  pad's, and jumps on either.

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
| A city without streets to park on   | Only the landing's pair; `explore/parked bicycles=0 cars=0`                   |
| No Web Audio                        | The bell is silent; `explore/bell-silent` once                                |
| No gamepad, or not standard mapping | Nothing read; a pad without the standard mapping is ignored                   |
| Bars at their stop                  | The steer rate zeroed there                                                   |
| Held steer near 0.58 m/s            | Its stiffness passes zero: the held steer is clamped to the bars' stop        |

## Observability

`explore/walls`, `explore/enter landing buildings`, `explore/leave x z`, `explore/failed reason`,
`explore/no-roads name`, `explore/model-normalised url x y z scale`, `explore/model-failed url reason`,
`explore/clip-missing motion`, `explore/parked bicycles cars places`, `explore/thrown cause speed` (cause `hit`, `grip`
or `lean`), `explore/up`, `explore/bell`, `explore/bell-silent`, `explore/gamepad id` (once, when first read), and the
loading card's `viewer/load-phase source=explore`.

## Performance and limits

- Measured on a desktop (Bun): bespoke walls for 75,000 buildings in 132 ms and 82 MB; a move 0.5 µs, a ray 0.4 µs.
  Rapier: 996 ms and 312 MB at 75,000 buildings, 75 MB at 250; 1.6 MB gzipped, loaded only on Walk.
- Models: people 370 to 381 KB, vehicles 159 to 224 KB each.

## Testing

Unit tests beside each module (`*.test.ts`), 100 % covered: the walls (including a property test that no walk among nine
buildings ends inside one), both adapters against real Rapier, landing, walker, session (riding, prompts, shown poses at
uneven frame times), camera, input, vehicles, models, retargeting (rest frames, turned models, hip scale), rigs, motions
and the Animator; the bicycle: hands-free self-stability within 4.3 to 6 m/s and falling below, turning by leaning,
countersteering, tracking the aim at every speed, the low-speed wobble, weight transfer and the back wheel lifting, the
grip limit, cadence and freewheel, gears, resistance, foot down, falls and getting back up; parking from the plan; the
pool; the pad; the leg reaching its pedal; the bell with a stand-in context. End to end (`e2e/explore.spec.ts`): walking
by keys and by touch, the loading log, getting on the bicycle and off, riding it (pedal, shift, brake, stop with a foot
down, the HUD), the Rapier prototype, Wobble Blocks loaded, axe light and dark.
