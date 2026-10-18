# Exploration blueprint

Derived from [exploration](../exploration.md) and the [viewer](../../004-interface-design/viewer.md); research in
[GTA-style models](../../../research/gta-style-models/README.md). Code: `packages/world` (pure: the walls),
`apps/web/src/explore` (pure: movers, session, camera, input, landing, vehicles, models, HUD; and the physics adapters,
the cars' garage and the descent), `apps/web/src/components` (`ExploreView`, `ExploreCanvas`, the Walk button),
`apps/web/scripts/models` (the model build).

## Domain and naming

| Term      | Identifier                                                | Meaning                                                                            |
| --------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| walls     | `Walls` (`move`, `clearance`, `dispose`)                  | the port every physics engine answers: moves with sliding and steps, rays          |
| footprint | `Footprint`, `footprintsOf(buildings, table)`             | a building's corners in metres and its roof's height                               |
| bespoke   | `cityWalls(footprints)`, `bespokeWalls`                   | citymap's own walls: convex prisms in a 16 m grid                                  |
| Rapier    | `rapierWalls`, `loadRapier`                               | the Rapier adapter: buildings as convex hulls, the flat ground held by the adapter |
| descent   | `descent`, `GoDown`, `Descent`, `ArcadeWhy`               | going down: engine, models, walls, streets; the cars' garage or why arcade         |
| streets   | `StreetGrid`, `streetGrid`, `planStreets`, `rebased`      | the nearby streets: which buildings to raise round the player, which to lower      |
| garage    | `Garage`, `openGarage` (`follow`, `drive`, `keepingUp`)   | the cars on Rapier in the nearby streets, in a frame round the player              |
| pedals    | `Pedals`, `pedalsOf`, `steerReach`                        | a car's engine, brakes and gear this step; how far its wheels steer at a speed     |
| engine    | `Engine`, `Gearbox`, `torqueAt`, `automatic`, `driveOf`   | torque by a curve, gears that change themselves, the push at the driven wheel      |
| core      | `Single`, `Machine`, `Build`, `matricesOf`, `ridden`      | the single-track core: a build's Whipple matrices, balance, loads, lifts, falls    |
| motorbike | `Moto`, `CHOPPER`, `MOTORBIKE`, `rideMotorbike`           | the motorbike's own state and one step of it: engine, brakes, wheelie, the core    |
| flight    | `Heli`, `flyHeli`, `touched`, `groundEffect`, `heliHud`   | the helicopter's own state, one step of its flight, what the walls took of it      |
| helipad   | `helipadBy(landing, walls, parked)`                       | where the city's helicopter stands: open ground along the landing's road           |
| room      | `roomToLand`, `belowOf`, `perched`                        | whether the rotor fits where it would land; what lies below; a rotor on a top      |
| rooftop   | `Rooftop`, `Rooftops`, `rooftops(footprints, walls)`      | a roof with room for the rotor, marked "H"; the nearest few round a point          |
| assist    | `pad`, `PAD_PULL`, `PAD_CENTRED`                          | the landing assist: set down on a marked roof's middle when sinking near it        |
| raising   | `RaiseWalls`, `WallOptions`                               | an engine's footprints-to-walls, reporting `engine` and `walls` steps, cancellable |
| landing   | `Landing`, `landingOf(city, selected, centre)`            | where the walk begins, its heading, why there, and the road beside it              |
| walker    | `Body`, `stepWalker`, `Intents`                           | the person: feet, rise, heading, footing; one step under intents                   |
| session   | `Session`, `advanceSession`, `startSession`               | walker, vehicles, ride, orbit, spare time; a frame of fixed 120 Hz steps           |
| shown     | `shownOf`, `shownVehicles`                                | where to draw, between the last two steps                                          |
| controls  | `Controls`, `newControls`, `intentsOf`, `stickAt`         | held keys, stick, jump, drag, use; and what they mean                              |
| camera    | `Orbit`, `Follow`, `cameraOf`, `reachOf`, `easeReach`     | the follow camera: orbit, distance, pulled in at walls                             |
| vehicle   | `Vehicle`, `VehicleKind`, `VEHICLES`, `stepVehicle`       | a parked or ridden vehicle; its spec; one step of its handling                     |
| car       | `Car` (`body`, `attitude`, `gear`, `rpm`), `arcadeOf`     | a saloon or a pickup, its whole turn in the world, its gear and engine             |
| model     | `ModelKind`, `MODEL_KINDS`, `modelOf`                     | what a vehicle is drawn as: a car's body, else its kind                            |
| arcade    | `Handling`, `CAR`                                         | the car's arcade handling: power, brakes, coasting, turning                        |
| cycle     | `Cycle`, `rideCycle`, `resting`, `shift`, `thrown`        | the bicycle's own state and one step of it: lean, steer, drivetrain, pitch, falls  |
| whipple   | `Lean`, `whipple`, `stiffness`                            | the benchmark bicycle's lean and steer equations, one step                         |
| rider     | `aimedLean`, `riderTorque`                                | the simulated rider's balance: a lean aimed at, the steering torque to reach it    |
| HUD       | `Hud`, `hudOf`, `RideHud`, `hudOfRide`, `motoHud`         | each ride's numbers as the HUD shows them, a foot and a fall                       |
| parking   | `parkedBy(landing, walls)`, `parkedIn(city, landing, …)`  | the landing's three at its kerbs (`KerbKind`); the city's own parked vehicles      |
| pool      | `nearestOf`, `assignPool`                                 | which vehicles the canvas draws, and in which of its models                        |
| pad       | `Pad`, `padOf`, `PadPresses`                              | a gamepad's state as intents, look and presses                                     |
| pedalling | `reachFor`, `tiltToReach`, `turnInWorld`                  | a limb bent to put its end on a target; how far the body leans to reach the bars   |
| contacts  | `hubOf`, `axleOf`, `endsOf`, `topOf`, `seatOf`, `partsOf` | where a rider meets a model, and a wheel's hub and axle, measured from its meshes  |
| seat      | `Figure`, `figureOf`, `seat`, `release`, `placeVehicle`   | a rider measured once, seated by a model's contacts; a pool model posed            |
| kickstand | `Kickstand`, `kickstandOf`, `standAfter`, `leanOnStand`   | a two-wheeler's stand: how far down, the lean it holds the machine at              |
| bell      | `ringBell`                                                | the bicycle's bell, rung by Web Audio                                              |
| prompt    | `Prompt`, `promptOf`, `promptWords`                       | what E does now, and its words                                                     |
| motion    | `Motion`, `CLIP_OF`, `motionOf`, `paceOf`                 | idle, walk, sprint, jump, fall, drive; their clips and paces                       |
| sight     | `cityHits`, `sightOf`, `windowRows`, `inspector`          | what the crosshair meets: a roof, a wall, a window and its file                    |
| rig       | `Rig`, `Rider`, `RIGS`, `PROCEDURAL_RIGS`, `poseVehicle`  | a model's moving parts, axes, rider's contacts and stand; a vehicle posed by them  |
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
- `characterWalls(rapier, world, into = identity, meets?)`: a sensor capsule per radius (meeting nothing itself), one
  character controller (`SKIN` 0.02 m, autostep `STEP_UP` over `PERSON_RADIUS`, snap `SNAP_DOWN`, no impulses); `move`
  places the capsule at `into(feet)` and asks the controller for the move against colliders in `meets`, sensors
  excluded; grounded on a roof or kerb by Rapier, else held by `onGround`; `clearance` casts a ray the same way, the
  ground stopping a line going down; `dispose` frees the capsules and the controller, never the world.
- `rapierWalls`: `engine` step while `@dimforge/rapier3d-compat` loads and initialises (once per page); walls in slices
  of `SLICE` = 2,000 with a breath between (each slice a `walls done/of` step); convex hulls from ground to top; no
  ground collider. Movers are sensor capsules per radius (`capsuleHalf(r) = max(0, PERSON_HEIGHT / 2 − r)`), moved by a
  character controller (offset `SKIN` = 0.02 m, autostep `STEP_UP`, snap `SNAP_DOWN`), with `EXCLUDE_SENSORS`. A move
  Rapier finds grounded above `GROUND` stands there; otherwise `onGround` holds the feet to the ground. Rays exclude
  sensors and stop at the ground. Logs `explore/walls engine=rapier buildings skipped engineMs ms`.
- `loadRapier`: `@dimforge/rapier3d-compat` imported (its own chunk) and initialised once a page; a failed load is
  forgotten, so the next walk tries afresh.

## Going down (`explore/descent.ts`)

- `descent({ loadEngine, loadModels, raise, openGarage, traffic })` gives `GoDown(footprints, at, { onStep, signal })`:
  `engine` (`loadRapier`; a failure logs `explore/arcade reason=engine detail` and goes on), `models` (every model,
  `done/of` as each settles; a model that fails is its stand-in), `walls` (the walls' engine, bespoke or Rapier), then
  `openGarage` at the landing (`streets done/of`; a failure other than a cancel logs `explore/arcade reason=engine`). It
  resolves `{ walls, garage, arcade }`: `arcade` null, or `"engine"` with no garage. A cancel between phases throws
  `AbortError`, freeing the walls already raised. The loading card's phases: `engine` 0.35, `models` 0.15, `walls` 0.3,
  `streets` 0.2; words "Loading the physics engine", "Loading the people and vehicles", "Raising the city's walls",
  "Raising the nearby streets".
- `page.tsx` reads `?physics=rapier` (Rapier walls) and `?traffic=n` (a measuring aid). The canvas module's
  `loadModels(onCount)` starts every model once a page: the person, the saloon, the pickup, the motorbike, the bicycle.
- `ARCADE_WORDS`: `engine` "Cars drive simply here: the physics engine did not load."; `slow` "Cars drive simply here:
  this device could not keep up." The walk's card says it in an `output` (a status) for the rest of the walk.

## The nearby streets (`physics/streets.ts`, `physics/garage.ts`)

- `streetGrid(footprints)`: every solid footprint as a `Standing` (lot, middle as the mean of its corners, radius to its
  furthest corner) in `STREETS_CELL` 64 m cells keyed as the walls' grid. `nearbyLots(grid, at, reach)`: every building
  whose circle comes within `reach` (gap = distance less radius, at least 0), nearest first, ties by lot.
- `aheadOf(at, velocity)`: `at + velocity · LOOK_AHEAD` (1.5 s). `planStreets(grid, raised, at)`: `raise` every lot
  within `STREETS_REACH` 150 m of that point not yet raised, nearest first; `lower` every raised lot past `STREETS_KEEP`
  200 m (or unknown). Planned afresh when the point has moved `RECHOOSE` 8 m.
- `rebased(origin, at)`: past `REBASE` 256 m from the frame's origin, a new origin at the player, to the metre.
- `openGarage(footprints, { at, onStep, signal, traffic, now })`: a Rapier world, gravity −9.81, timestep 1/120 s; a
  ground slab `GROUND_HALF` 1,000 m each way, its top at `GROUND`, friction 1 (in its own group, which the walker's
  moves never meet); then every building round the landing, `STREETS_SLICE` 200 a step with a breath between
  (`streets done/of`); logs `explore/streets buildings ms`.
- A building is a convex hull of its corners about its own middle, from 0 to its top, friction 0.3, in the `BUILDINGS`
  group (meeting everyone), placed by translation `middle − origin` (64-bit in JavaScript); a hull Rapier cannot make is
  raised as nothing, once (`explore/no-hull lot`). Re-centring sets every building's translation afresh and moves every
  body by `old − new`.
- `follow(at, velocity, vehicles, budget)`, once a frame (`RAISE_BUDGET` 2 ms from the view): re-centres if due; brings
  into the world every vehicle within `STREETS_KEEP` of the player and lets go of those beyond; lowers what the plan
  lowers; raises from its list, nearest first, while the clock is short of `budget`; returns
  `{ standing, waiting, nearest }` (the gap of the nearest building still waiting from the player, infinite when none).
  Never awaited.
- `walls`: the walker's, `characterWalls(rapier, world, local, groups(WALKER, BUILDINGS))`: the buildings alone, in the
  frame round the player, the flat ground held as the city's walls hold it; its `dispose` does nothing (the garage's
  frees the world). Rapier's queries see a building raised or moved by re-centring from its next step: the session moves
  the walker, then steps the garage, so a building raised ahead is seen a step later; a walker pressing on a wall
  through a re-centring stays out of it (tested).
- Vehicles in the world: a car is a dynamic body asleep where it stands (by `feet` and `attitude`) on four wheels; a
  parked two-wheeler a dynamic block asleep (`TWO_WHEELER_MASS` bicycle 15 kg, motorbike 200 kg; its length,
  `TWO_WHEELER_BASE` 0.4 of its width, `TWO_WHEELER_HEIGHT` 1.1 m tall, origin at its feet; friction 0.6, damping
  `TWO_WHEELER_DAMPING` 0.5), turned by `tiltedBy(heading, lean, pitch)`; awake, it is read back by `tiltOf` (Euler YXZ,
  as its model is posed: heading, then `−lean` about x, then `−pitch` about z) into its feet, heading, lean and pitch,
  still. A ridden two-wheeler (a driver that is no car) is a kinematic block moved where its own physics stands it. The
  walker's body, a kinematic capsule (`WALKER_HALF` 0.6 m, `PERSON_RADIUS`, middle `WALKER_MIDDLE` 0.9 m up), is moved
  to the walker's feet each step and out of the world in a car or flying; collision groups let it meet only the
  two-wheelers, never a car. A car changed outside the garage (the walker got out) is placed afresh, still; a parked
  two-wheeler changed outside it, likewise. A helicopter is a kinematic block its outline's length and width,
  `HELICOPTER_HEIGHT` 2.6 m tall, about its outline's middle, turned by `tiltedOf`, moved where its own flight puts it
  whenever it changes; it meets the cars and the two-wheelers (they stop at it, or are shoved), never the walker, whom
  the walls' `clearOfVehicles` keeps out (with the garage, `inTheWay` is the cars and the helicopter). The garage never
  changes it.

## The car on Rapier

- Build: chassis cuboid `length/2 × 0.32 × width/2 − 0.02` at 0.72 m up, friction 0.3, mass `CAR_MASS` 1,300 kg with its
  middle `CAR_MIDDLE_UP` 0.55 m up and principal inertia (534, 2,255, 2,088) kg m²; a massless cabin cuboid 1.1 × 0.28 ×
  (width/2 − 0.12) at (−0.2, 1.3, 0), so it rolls onto its roof. The body's origin is its feet: the ground under its
  middle.
- Rapier's ray-cast vehicle controller (up y, forward x): four wheels at (±`AXLE_AHEAD` 1.3, ±`TRACK_HALF` 0.78) m, hard
  points `WHEEL_RADIUS + SPRING_REST − SAG` up (0.31 + 0.3 − 0.07 m), suspension down, axle +z, radius 0.31 m; springs
  `SPRING_STIFFNESS` 35 (per kilogram of car, so `SAG` = g / (4 · 35)), travel 0.2 m, compression damping 3.5,
  relaxation 5, at most 40,000 N; tyres' friction slip `TYRE_GRIP` 2 (a quarter turn from 50 km/h in 1.2 s, about 8 m
  round, upright; from 100 km/h in 2.1 s; measured by `garage.test.ts`).
- `pedalsOf(gear, speed, intents)`: W with the car rolling back past `CREEP` 0.5 m/s brakes by `BRAKE` 30 (Rapier's
  impulse a step: about 8 m/s²); S rolling on past it brakes by `BRAKE · −forward`; S below it backs up in reverse (gear
  −1) through `CAR_GEARBOX.reverse`, the throttle shut past `REVERSE_TOP` 8 m/s; otherwise the gearbox (`automatic`)
  picks the forward gear and `driveOf` the push, split between the back wheels (rear-wheel drive).
- Steering: `−right · steerReach(|v|)`, `steerReach(v) = CAR_STEER / (1 + (v / STEER_FALL)²)` (0.6 rad, 22 m/s), slewed
  at `STEER_RATE` 4 rad/s, on the front wheels.
- The handbrake (Space): the back wheels brake by `HANDBRAKE` 60, their drive off (a wheel with power ignores its
  brake), their sideways stiffness `HANDBRAKE_SIDE` 0.4 of their own: the back steps out.
- Every awake car each step: forces reset, then the air and the road against its motion, `CAR_ROLLING` 0.015 m g + ½ ρ
  `CAR_DRAG_AREA` 0.75 v²; `updateVehicle(dt)`; a car not driven holds `PARKED_BRAKE` 10, no power, wheels straight; a
  sleeping one is not updated. Then `world.step()`.
- Read back: `feet` = translation + origin, `attitude` its rotation, `heading` its nose seen from above (`headingOf`,
  the last kept pointing straight up), `speed` its velocity along the heading, `turn` its yaw rate, `steer` the front
  wheels', `gear` and `rpm` the pedals'. A car unchanged (asleep, not driven) is returned as the same object.
- Crash: a driven car losing more than `CRASH` 4 m/s in a step logs `explore/crash car lost`.
- Righting: a car whose roof points further than `TIPPED` (up below 0.5) and moves under 1 m/s and 1 rad/s for
  `RIGHTING_AFTER` 2 s is set upright on its heading 0.5 m above the ground, still; `explore/righted car`.
- Keeping up: each `drive` times its steps (`now`); over the last `SLOW_WINDOW` 2 s of driving (240 steps), `load()` is
  their time over the time they cover, and `keepingUp()` is false once that passes `SLOW_SHARE` 0.5. The view then logs
  `explore/arcade reason=slow load`, stops using the garage (freed with the walk), turns every car to `arcadeOf` (level
  on its heading, engine unread) and says `ARCADE_WORDS.slow`.
- `?traffic=n`: the first time the garage sees the vehicles, the `n` cars nearest the player after the first drive
  themselves at throttle 0.35, steering ±0.4 by turns (slow circles), while the player drives; `explore/traffic cars`.
- `CAR_ENGINE`: idle 900, red line 6,500 rpm, torque (900, 190), (2,000, 260), (4,000, 300), (5,500, 280), (6,500, 220)
  N·m, drag off the throttle 40 N·m, clutch slipping at 2,200 rpm. `CAR_GEARBOX`: (3.2, 2.1, 1.45, 1.1, 0.87) × 3.9,
  reverse 3.4 × 3.9, up at 6,000 and down at 2,500 rpm. Measured on Rapier: 0 to 100 km/h in 4.4 s; 100 to 0 at 8.3
  m/s².

## The walk (`apps/web/src/explore`)

- `landingOf`: the selected lot's centroid (scene units), else `centre`; the nearest point of any road or highway
  segment to it; before a building, `KERB_GAP` = 1 m inside the road's edge towards it, facing it; else on the road,
  facing along it; `road: { at, along, width }`. Null without roads.
- `stepWalker(body, intents, look, dt, walls)`: intents relative to `look`, normalised past 1; `WALK_SPEED` 1.6 or
  `RUN_SPEED` 4.5 m/s; heading turns towards the move at most `TURN_RATE` = 10 rad/s; standing presses `−g·dt`; a jump
  leaves at `JUMP_SPEED` 3.5 m/s; gravity `GRAVITY` 9.81.
- `advanceSession(session, controls, seconds, walls, garage = null)`: the drag turns the orbit (`LOOK_SPEED` 0.005
  rad/px, pitch `PITCH_MIN` −0.25 to `PITCH_MAX` 1.25); E (`use`) gets on the reachable vehicle (grounded only) or off
  below `LEAVE_SPEED` 1.5 m/s at `alightFrom` (the vehicle `parkedNow`); then `STEP` = 1/120 s steps of the time due, a
  frame at most `LONGEST_FRAME` 0.1 s. A car with a garage is stepped by `garage.drive` (Rapier keeps it out of
  buildings and vehicles); any other ride steps by `stepVehicle` and is cleared of the others (`BUMP` keeps 0.2 of its
  speed); on foot the walker is cleared of every vehicle. With a garage, the walker steps on `garage.walls` (else on the
  city's), and it and a ridden two-wheeler are cleared of the cars only, and `garage.drive` steps every step (the ridden
  two-wheeler as a driver, the walker's feet, null flying), shoving the parked two-wheelers; getting on one stands it up
  (`parkedNow`, on the walker's ground). `sinceLook` counts the seconds since the last drag. Riding faster than
  `CHASE_FROM` 1 m/s, `LOOK_HOLD` 1.5 s after the last drag, the orbit's yaw eases, by a share squared-ramped in over
  `LOOK_EASE` 1 s, over the ride's `follow.chase` (else `CHASE` 0.25 s) behind the way it moved over its last step while
  rolling forwards (a car sliding shows its slide), else behind its heading.
- `followOf`: on foot `ON_FOOT`; riding, the ride's `follow`, its distance `distance + stretch · |v|`, at most
  `farthest`.
- `shownVehicles`: a car's `attitude` between its last two by normalised linear interpolation the short way
  (`turnBetweenQuats`); a two-wheeler's lean and pitch, a bicycle's crank; a helicopter's pitch and roll, its blades and
  tail the short way round; a vehicle whose kind changed as it is. A helicopter ridden is chased behind its heading at
  any speed (it turns on the spot), never its way of travel.
- `shownOf`: the walker between `previous` and `body` by `spare / STEP`, the heading the short way round, and `walked`
  less the unspent part of the last step.
- `reachOf` and `easeReach`: the camera's full `Follow.distance` unless the ray from the target is cut short by more
  than `ROUNDING` 10⁻⁶ m, then the cut less `WALL_GAP` 0.25 m, at least `NEAREST` 0.4 m; in at once, out over
  `REACH_EASE` 0.3 s.
- Vehicles: `VEHICLES.bicycle` (1.75 × 0.6 m, radius 0.35), `VEHICLES.motorbike` (2.3 × 0.8, 0.45; follow 5.5 m back, 2
  m up) and `VEHICLES.car` (4.2 × 1.8, 0.95; follow 6.5 m back, 2.2 m up, `stretch` 0.08 s, `farthest` 9.5 m, `chase`
  0.35 s); each its words, its keys and its follow camera. `Vehicle` is a union on `kind`: a car (its `body` saloon or
  pickup, `attitude`, `gear`, `rpm`), a bicycle carrying its `cycle`, a motorbike its `moto`. `standing` is typed by its
  kind. `stepVehicle` steps an arcade car by `CAR` (level on its heading), a bicycle by `rideCycle`, a motorbike by
  `rideMotorbike`, then moves it by the walls; a move that gets less than half its way is a hit, which `bumped` turns
  into a fall for a two-wheeler at `HARD_HIT` or more, and else keeps `BUMP` of the speed. `parkedNow(vehicle)`:
  stopped, the bicycle `resting` with its gear and crank kept, the motorbike `parkedMoto`, a car as it lies with its
  engine off.
- The car (`CAR`, arcade): wheelbase 2.6 m, top 32 m/s, reverse 6, accelerate 9, brake 14, coast 1.2, turn radius 5.5 m,
  turn rate 1.5 rad/s, response 7. Power tapers `accelerate · (1 − (v/top)²)`; the aimed turn is
  `−right · min(|v| / radius, rate) · sign(v)`, reached at `response` per second; the wheel angle
  `atan(turn · wheelbase / v)` held to `MAX_STEER` 0.6.
- The landing's three: `PARKING.bicycle` 4 m ahead, 0.8 m in from the kerb on the right, facing along the road;
  `PARKING.car` 10 m ahead and 1.4 m in from the far kerb (`side` −1), facing back (`faces` −1), so the bicycle's line
  along its kerb is clear; `PARKING.motorbike` 6 m behind, 0.9 m in from the near kerb, facing back, out of both lines;
  moved out from the road's middle by the walls; ids `bicycle`, `car` and `motorbike`.
- Gears in a frame: riding a bicycle (not flying), `Controls.gears` shifts it, once per frame, before the steps.

## Parked vehicles (`explore/parking.ts`)

- `parkedIn(city, landing, walls)`: every town road of class street, collector, avenue or boulevard, in metres; kerb
  places every `PLACE_GAP` 24 m along its polyline at `(k + ½) · PLACE_GAP`, on the right kerb for even `k` and the left
  for odd, facing along the road on the right and against it on the left. A place is skipped within `JUNCTION_GAP` 8 m
  of any road's end (its own included, found in a 16 m grid) and within `LANDING_CLEAR` 16 m of the landing (clear of
  its three). `kindAt(placeHash(road, k))` (a 32-bit integer mix to [0, 1)): below `BICYCLE_SHARE` 0.3 a bicycle, below
  0.6 (`+ CAR_SHARE`) a car, below 0.66 (`+ MOTORBIKE_SHARE`) a motorbike, else nothing; inset as `PARKING`, moved out
  from the road's middle by the walls. A second hash `placeHash(road, −1 − k)` turns a bicycle's crank (· 2π) and makes
  a car a pickup below `PICKUP_SHARE` 0.35, else a saloon. Ids `parked-{road}-{k}`. Kept: the `PARKED_MOST` 200 nearest
  the landing, nearest first, ties by id.
- `Viewer` adds them after the landing's pair, logs `explore/parked bicycles cars`, and hands them to the walk
  (`ExploreView.parked`).
- `helipadBy(landing, walls, parked)`: from the landing's road point, along the road, from `HELIPAD_FROM` 24 m to
  `HELIPAD_REACH` 400 m every `HELIPAD_STEP` 2 m, the first spot where a circle of `ROTOR_RADIUS + HELIPAD_MARGIN` (0.5)
  on the street is moved nowhere by the walls, the body (nose to tail in circles its width) clears every parked vehicle,
  and a line 1 m up from the landing reaches it; facing on along the road; then the same behind, facing away; else null.
  Id `helicopter`, appended after the kerbs' vehicles; `explore/helipad x z` or `explore/no-helipad`.

## The single-track core (`explore/singletrack.ts`)

The bicycle and the motorbike are one physics with two builds. Lean `φ` and steer `δ` positive to the left.

- `Build`: the paper's parameters (Meijaard et al. 2007, table 1): wheelbase `w`, trail `c`, steering tilt `λ`; the back
  and front wheels (radius, mass, `Ixx`, `Iyy`); the back frame with its rider and the front frame (middle `x`, `z`
  down, mass, `Ixx`, `Iyy`, `Izz`, `Ixz`). `massOf` the whole's mass and middle; `matricesOf(build, g)` the matrices
  `M`, `C1`, `K0`, `K2` by appendix A, term by term (the benchmark's parameters give its published matrices to 10
  decimals).
- `Machine`: its matrices, geometry, mass and middle (`machineOf(build, g, rest)`, or set by hand), its tyres' `grip`
  and `leaned`, the most each wheel lifts (`stoppieMost` the back, `wheelieMost` the front, 0 for none), `fallLean`, and
  its `Rider`: lean asked (`turnRadius`, `maxLean`, `leanSlew`), steering gains and most, body assist, searching wobble,
  and foot (`down`, `up`, `lean`, `ease`, `steer`, `barEase`).
- `Single`: lean, steer and their rates, `aim`, `pitch` (positive the back wheel lifted, about the front contact;
  negative the front, about the back), `pitchRate`, `footDown`, `fall`, `wobble`.
- `whippleOf`, `turnOn`, `leanAsked`, `balanceOn`, `loadsOn`, `thrownOn`, `fallingOn` as the bicycle's below, on any
  machine. `settled(net, g, rounds)` finds the acceleration that gives itself by halving between ±3 g.
  `pitchedOn(machine, state, a, dt)`: lifting the back under a deceleration as below; lifting the front about the back
  contact, `(b² + h²) θ̈ = a (b sin θ + h cos θ) − g (b cos θ − h sin θ)` (`b` the middle ahead of the back contact),
  held at `wheelieMost`; a wheel back on the road is a pitch of exactly 0.
- `ridden(machine, state, v, right, slid, dt)`: the foot, the balance (with the front wheel up, nothing asked and no
  turn), the turn, then grip and lean falls.

## The motorbike (`explore/motorbike.ts`)

- `CHOPPER`: wheelbase 1.6 m, trail 0.12 m, tilt 0.5 rad; wheels 0.33 m, 14 kg, `Ixx` 0.45, `Iyy` 0.9; back frame and
  rider 270 kg at (0.6, −0.75), (26, 50, 26, 3) kg m²; fork 14 kg at (1.4, −0.85), (1, 0.8, 0.4, −0.2). In all 312 kg,
  its middle 0.654 m ahead and 0.717 m up. Its eigenvalues: weave stable from about 7 m/s, a slow capsize above 12 m/s
  (0.1 s⁻¹), the caster mode at −78 s⁻¹ at 45 m/s, inside the 120 Hz step.
- `MOTORBIKE`: steer stop 0.7 rad, grip 1.1, leaned 2 m/s², stoppie 0.25, wheelie `wheelieMost` 0.6 rad, fall past 1
  rad; rider: 8 m turns, 0.75 rad, 1.5 rad/s; gains 120, 40, 20, 4, at most 120 N·m; assist 5,000 and 1,000, gone by 4
  m/s; no wobble; foot down below 0.8 and up above 1.6 m/s, 0.1 rad, eased at 1 rad/s, bars 0.5 rad at 3 rad/s.
- `MOTO_ENGINE`: idle 1,000, red line 5,800 rpm, torque (1,000, 80), (2,500, 100), (3,500, 105), (5,000, 90),
  (5,800, 70) N·m, drag 20 N·m, slipping at 2,500 rpm. `MOTO_GEARBOX`: overall (12.5, 8.6, 6.6, 5.4, 4.6), no reverse,
  up at 5,300 and down at 2,200 rpm; held in its gear while the front wheel is up.
- `Moto`: `Single` with `gear`, `rpm`, `throttle`. `rideMotorbike(moto, v, intents, dt)`: a fall plays out (up again in
  first, idling); else the throttle eases to `max(0, forward)` at `THROTTLE_RATE` 4 a second, the gear changes,
  `driveOf` gives the push held to the back tyre (engine drag too), S asks `MOTO_REAR_BRAKE` 1,800 N and Space
  `MOTO_FRONT_BRAKE` 4,000 N, each held by its tyre's friction circle; rolling `MOTO_ROLLING` 0.015 m g and air ½ ρ
  `MOTO_DRAG_AREA` 0.6 v²; a lifted wheel carries nothing; stopped on a foot, S paddles back to `PADDLE_BACK` 0.6 m/s at
  1.5 m/s². Then `ridden`. Measured: 0 to 100 km/h in 3.7 s, its front up in first to 58 km/h, top 157 km/h; from 20 m/s
  the front brake stops at 10.8 m/s² and the back at 5.4, the back wheel never lifting (the front tyre slides first, as
  grip 1.1 is under its 1.32 needed).
- `motoHud`: speed km/h, gear from 1 of 5, rpm to the hundred (`RPM_SHOWN`).

## The helicopter (`explore/helicopter.ts`, `vehicles.ts`)

Pitch positive nose down, roll positive the right side down, yaw rate anticlockwise from above (as headings grow).

- Build (the AS350 B2): `HELI_MASS` 2,250 kg, `ROTOR_RADIUS` 5.35 m, `MAST` 3.06 m (the hub above the skids, from the
  mesh), `BODY_RADIUS` 1.4 m (the cabin against anything lower than the disc), `THRUST_MOST` 1.5 of its weight out of
  ground effect. `VEHICLES.helicopter`: 11 × 2.6 m, its outline's middle `HUB_AHEAD` 1.99 m behind its feet (under the
  mast); follow 15 m back, 4 m up, `stretch` 0.1 s, `farthest` 22 m, `chase` 0.6 s.
- `Heli`: `velocity` (world), `pitch`, `roll` and their rates, `yawRate`, `rotor` (share of flying speed), `engine`,
  `collective` (share of `THRUST_MOST`), `grounded`, `hold` (the height held, null climbing, sinking or grounded),
  `blades` and `tail` (angles, mod 2π), `hits` and `hit` (the last hard hit's speed lost). `parkedHeli()`: on its skids,
  engine off, rotor still. `started`: the engine on. `stopped`: off, still, collective 0.
- Rotor: `rotor` rises `SPIN_UP` 0.2 a second with the engine on, falls `SPIN_DOWN` 0.08 a second off; its power is
  `rotor²` (taken from the step's start). Blades turn `BLADE_SPIN` 20 rad/s · rotor, the tail `TAIL_SPIN` 36.
- `groundEffect(below)` = `1 / (1 − (R / 4z)²)`, `z = below + MAST` (Cheeseman and Bennett); 1 for an infinite `below`.
  `hoverShare(below) = √(m g / (THRUST_MOST · groundEffect))`: 0.734 on the ground, so it lifts 3.7 s after starting.
- `thrustDirection(heading, pitch, roll)` = `ahead · sin p cos r + right · sin r + up · cos p cos r`; `tiltedOf` the
  quaternion `yaw(heading) · zTurn(−pitch) · xTurn(roll)`, whose up is that axis.
- `flyHeli(heli, { y, heading }, flight, below, dt)`, `flight.up` from Space less Shift, C or Control (or Up and Down,
  or a pad's A and B):
  - The collective for a climb `c`: `m (g + CLIMB_GAIN (c − v_y) + HEAVE v_y) / max(0.5, axis_y)`, over
    `THRUST_MOST · rotor²`, within 0 to 1 (`CLIMB_GAIN` 2, `HEAVE` 0.3 s⁻¹, the rotor's own damping of a climb). Ground
    effect is not known to it, so near the ground it rises a little: the cushion.
  - The climb asked: Up `up · CLIMB_MOST` (8 m/s); Down
    `up · min(SINK_MOST 6, max(LAND_SINK 1.5, below / FLARE 1.5 s))`; else back to `hold` at `HOLD_GAIN` 1 a second,
    within ±8; never past `(CEILING 500 − y) · HOLD_GAIN`.
  - On its skids: level and still but a slide stopped at `SKID_GRIP` 6 m/s²; Up sets the collective for a full climb,
    and it rises once `collective · lift · groundEffect(0)` passes its weight.
  - Aloft, the tail rotor: an aimed yaw rate `−right · min(YAW_MOST 1.2, g tan ROLL_MOST / |v_ahead|)`; torque `TORQUE`
    1.5 · collective · rotor² cancelled, the push `YAW_GAIN` 5 · (aim − rate), all within `TAIL_MOST` 4 · rotor² rad/s².
  - The cyclic: pitch aimed `forward · PITCH_MOST` (0.3), else `clamp(−HOVER_GAIN 0.04 · v_ahead, ±HOVER_TILT 0.2)`;
    roll aimed `atan(v_ahead · −yawAim / g) − HOVER_GAIN · v_side`, within `ROLL_MOST` 0.6 while turning, else
    `HOVER_TILT`. Each a critically damped spring of `TILT_RATE` 5 rad/s, its acceleration times rotor².
  - The landing assist (`pad`, where a marked roof's middle lies from the feet): sinking (`up < 0`) with neither forward
    nor right asked, within `PAD_PULL` 10 m of it, the pitch and roll aimed are
    `clamp((PAD_GAIN 2 · offset − PAD_DAMPING 2.8 · velocity) / g, ±HOVER_TILT)` along the nose and to its right (a
    critically damped position hold, ω √2 rad/s); farther than `PAD_CENTRED` 0.4 m from it, the climb asked is held to
    no faster a sink than `LAND_SINK`, so it centres, then sinks.
  - Forces: thrust along the axis with ground effect; drag `½ ρ A |v| v` ahead (`DRAG_AHEAD` 3.5 m²) and to the side
    (`DRAG_SIDE` 12 m²), ρ 1.2; gravity; `HEAVE` on the climb. Top speed about 200 km/h.
- `stepVehicle` for a helicopter (`flyThrough`): `belowOf(feet, walls)` (the clearance straight down, infinite past
  `BELOW_REACH` 4 R); the across move first by the disc (`walls.move` at `y + MAST`, radius R), then by the cabin
  (radius `BODY_RADIUS`) to where the disc came; the up or down move by the skids (radius `BODY_RADIUS`) and by the disc
  (radius R); `held` when the disc stopped short of the move and above where the skids came to: the feet at the disc's
  less `MAST`. Then `touched`, and a held rotor `perched`: the disc probed `PERCH_PROBE` 0.6 m lower, and pushed out
  from what it overlaps at `PERCH_SLIDE` 4 m/s². `speed` is the velocity along the heading, `turn` the yaw rate.
- `touched(heli, moved, dt, grounded, heading)`: across, a move short of the wanted one sets the velocity to the move's
  (slid); up or down, likewise; grounded sets `v_y` 0, the tilt and its rates 0, `hold` null. `lost` is the speed taken
  (a fall onto the ground counted down only). From `HARD_HIT` 5 m/s:
  `rotor · (1 − min(STRIKE_MOST 0.5, STRIKE 0.04 · lost))`, the disc jolted `KICK` 1.5 rad/s away from the hit,
  `hits` + 1.
- `roomToLand(feet, under, walls, margin = 0)`: the disc at `under + MAST − PERCH_PROBE`, radius `R + margin`, moved
  nowhere by the walls.
- `rooftops(footprints, walls)` (`explore/rooftops.ts`): the buildings in the nearby streets' grid (`streetGrid`); a
  roof is marked when `roomToLand` at its middle (the mean of its corners, at its top) with `ROOFTOP_MARGIN` 0.5 m,
  worked out once per building as it first comes near; `near(at, reach)` the marked roofs whose middle is within `reach`
  (`nearbyLots`), nearest first, ties by lot, at most `ROOFTOP_MOST` 6. The walk asks every HUD refresh while in the
  helicopter, `ROOFTOP_REACH` 300 m round it, hands the nearest to the session as the `pad`
  (`advanceSession(…, garage, pad)` → `stepVehicle(…, pad)`) and all of them to the canvas (`ExploreFrame.rooftops`).
- Getting in starts the engine; `canLeave` once below `LEAVE_SPEED` and `grounded`; getting out `parkedNow` (`stopped`);
  a helicopter not ridden with its rotor turning is stepped by `idleHeli` (spinning down). `bumped` keeps `BUMP` of its
  velocity across. `reachable` and `clearOfVehicles` skip a vehicle more than `LEVEL` 2 m above or below.
- `alightFrom`: the left, unless it is walled short or has no floor at the vehicle's level; then the side with a floor,
  between equals the one that reaches further.
- `heliHud(heli, altitude)`: metres, the climb to the tenth (−0 shown 0), km/h, rotor per cent.

## Engines and gearboxes (`explore/engine.ts`)

- `torqueAt(engine, rpm)`: linear along the curve, its first value below it, its last above it, 0 past the red line.
- `rpmOf(v, r, ratio)` = `|v| / r · ratio · 60 / 2π`. `automatic(box, gear, rpm)`: up past `up` short of top, down under
  `down` above first, else the same.
- `driveOf(engine, ratio, r, v, throttle)`: engine speed `max(wheel's, idle, idle + (launch − idle) · throttle)` (the
  clutch slipping), push `throttle · torqueAt · ratio / r`; off the throttle above idle, `−braking · ratio / r`.

## The bicycle (`explore/bicycle.ts`)

Lean `φ` and steer `δ` positive to the left, turns anticlockwise; metres, seconds, newtons. It rides the core as
`BICYCLE` (`BENCHMARK`'s matrices, the paper's rounded middle, no wheelie).

- `Cycle`: `lean`, `leanRate`, `steer`, `steerRate`, `aim` (the lean aimed at, slewed), `crank` (radians, forwards),
  `cadence` (crank rad/s, 0 freewheeling), `gear` (index), `pitch` and `pitchRate` (the back wheel lifted, about the
  front contact), `footDown`, `fall` (null, or `Fall`: `time` since thrown, `side` 1 left or −1 right, `cause` `hit`,
  `grip` or `lean`, and the `speed` it was thrown at), `wobble` (seconds, the searching phase).
  `resting(gear = START_GEAR, crank = 0)`: upright, still, a foot down.
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
  `forward · TORQUE_MOST · max(0, 1 − crank speed / CADENCE_MOST)` (150 N·m, 14.66 rad/s = 140 rpm), drive
  `torque / (G r)`, held to what the back tyre holds; the crank turns at the crank speed and `cadence` is it. Not
  pedalling, the crank holds and `cadence` is 0 (freewheel).
- Resistance against the motion: `ROLLING` 0.006 `m g` and `½ AIR_DENSITY DRAG_AREA v²` (1.2 kg/m³, 0.5 m²).
- Brakes: S (`forward < 0`) asks `−forward · REAR_BRAKE` (600 N), Space (`jump`) `FRONT_BRAKE` (850 N). A tyre holds
  `sqrt(GRIP² − (s / g)²)` of its load along its way, `s` the sideways acceleration (its friction circle); loads move
  with the acceleration they allow, found by halving `LOAD_ROUNDS` 26 times between ±3 g (net(a) − a falls as a rises),
  then the net force at that acceleration. Brakes and resistance stop the bicycle, never reverse it. A foot down,
  stopped and `forward < 0`, it walks back towards `−WALK_BACK` 0.8 m/s at `WALK_BACK_RATE` 2 m/s²; backwards otherwise,
  it stops at the same rate.
- Pitch (a stoppie): about the front contact, `(L² + h²) θ̈ = d · (L sin θ + h cos θ) − g · (L cos θ − h sin θ)`, `d` the
  deceleration, `L = WHEELBASE − MASS_AHEAD`; held at 0 while it would go below; the rider holds it at `STOPPIE_MOST`
  0.3 rad (the rate zeroed there).
- A foot: down below `FOOT_DOWN` 0.6 m/s, up above `FOOT_UP` 1.2 m/s. Down, the lean eases to
  `FOOT_LEAN · max(0, 1 − v / FOOT_UP)` (0.12 rad to the left, onto the foot, at a stop; upright by the time it lifts,
  so it leaves on its line) at `FOOT_EASE` 1 rad/s and the bars to `−right · FOOT_STEER` (0.6 rad) at `BAR_EASE` 4
  rad/s; the aim follows the lean.
- Falls (`thrown(cycle, cause, speed)`): `lean` when `|φ|` passes `FALL_LEAN` 0.9 rad; `grip` when a brake asks more
  than its tyre holds while turning harder than `LEANED` 2 m/s², or the turn alone asks more than `GRIP · g`; `hit` at
  `HARD_HIT` 3 m/s (`bumped`). Sideways is what the lean balances, `g tan φ`, above `FOOT_UP` (below it a lean is a
  fall, not a turn); the path's own `v · turn` spikes as the rider countersteers while the tyres' load follows the lean.
  Thrown, it falls to the side it leans (left when upright), slides to a stop at `SLIDE · g` (0.5), lies at `LYING` 1.35
  rad, reached over `FALLING` 0.4 s and left over the last `RISING` 0.6 s of `DOWN` 2.5 s; then `resting` with its gear.
  Intents count for nothing meanwhile.
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
  - The bicycle rigged (`rigBicycle`): the pack leans it 8.0° onto its kickstand, so it is turned upright about its
    origin (its contact line) by `turnBetween(axle, +x)`, the axle its back wheel's (`hubOf`, across x); every node's
    place and every mesh turned (`turnWhole`: its nodes unturned, no mesh shared, else `models/turned-node` or
    `models/shared-mesh`). Its kickstand, the frame's part reaching lowest (`partsOf`), is split off (`splitOff`: the
    frame's one primitive's triangles parted, each compacted) as `bicycle_red_kickstand` on the frame, pivoted at its
    hinge (`topOf` within `BICYCLE_CONTACTS.stand` 2 cm), extras `folded` (`turnBetween` from hinge-to-foot to the
    chainstay, crank to back hub) and `lean` (the measured lean in radians, positive to its left, +x in the file).
    Contacts as empty nodes: `bicycle_red_grip_left`/`_right` on the fork (`endsOf` across x, `grip` 10 cm; high is
    left), `bicycle_red_saddle` on the frame (`topOf`, `saddle` 2 cm), `bicycle_red_pedal_left`/`_right` on the crank
    (`endsOf` across x, `pedal` 6 cm). `prune({ keepLeaves: true })`, so the empty nodes stay. Logged:
    `[models] bicycle stood up from a lean of 8.0°; kickstand of 12 triangles, hinge …`.
  - `vehicles/motorbike.glb`: Duhgless' `Bike3.glb` (CC0, itch.io, 2,231 KB): each part's turn and scale baked into its
    mesh; the fork hung from `motorbike_head`, at the fork's place, turned about z by its rake (34.9°, from the head to
    the front axle), the front wheel on the fork; parts named `motorbike_frame`, `_fork`, `_wheel_front`, `_wheel_back`;
    its rider's contacts (`rigMotorbikeRider`, `MOTORBIKE_CONTACTS` in file units of 0.474 m): `motorbike_grip_left`/
    `_right` on the fork (`endsOf` across z, `grip` 0.21; low is left), `motorbike_seat` on the frame (`seatOf` along
    z = 0 from the back hub to the head every `step` 0.05, else `models/no-seat`), `motorbike_peg_left`/`_right` on the
    frame (`endsOf` across z of its points below `below` 0.45, `peg` 0.1); no kickstand (no part reaches the ground);
    textures 256 px WebP (`EXT_texture_webp`, by sharp), NEAREST, `prune({ keepLeaves: true })`: 256 KB.
  - `vehicles/helicopter.glb`: ArcheoteryxFr's AS350 B2 (CC BY 4.0) through Sketchfab's download API (`sketchfab(uid)`,
    a token from `SKETCHFAB_TOKEN` or `~/.secrets/sketchfab-api-token`, never printed; the glb cached as the others).
    Its centimetre scale dropped and flattened, every part's place baked into its mesh; `helicopter_rotor` hung from the
    hub's middle in plan at the blades' height, `helicopter_tail_rotor` from its own middle; the body named
    `helicopter_body`; normal, metallic, occlusion and emissive maps dropped, the albedo 512 px WebP (quality 85);
    welded and meshopt-compressed (`EXT_meshopt_compression`, `meshoptimizer`): 107 KB, 5,740 triangles. Without a token
    and with nothing cached, the committed file is kept as it is (said in the build's output).
  - `CREDITS.md`: one line per source, as their licences ask (the motorbike's: Duhgless, CC0 1.0, its page; the
    helicopter's: ArcheoteryxFr, CC BY 4.0, its page, and that it was cut down).
- `uploadsIn(page)` reads an itch.io download page's uploads (id and file name) whichever order it writes the name's
  `title` and `class`.
- `retargetClip(target, source, clip, rest, names, { hip, fps = 30 })`: names sanitised as three.js does; in each
  model's own frame, each mapped bone's turn `source(t) · source_rest⁻¹ · target_rest`, unmapped bones at rest, the hip
  moved by the source hip's move times `targetHip.y / sourceHip.y`; sampled at `fps` to the clip's end (played once,
  held). Throws `explore/retarget-no-hip` when either lacks the hip.
- `GLTF_MODELS.helicopter`: 11.01 m long, built facing −z (yaw −π/2); `readGltfWithThree` decodes meshopt by three's
  `MeshoptDecoder`. `RIGS.helicopter`: `rotors` (main `helicopter_rotor` about its y, tail `helicopter_tail_rotor` about
  its x, `hub` 1.99 m ahead of the middle); `PROCEDURAL_RIGS.helicopter` the stand-in's `rotor-main` and `rotor-tail`
  (about z, hub −0.1 m). `poseHelicopter(model, rig, { blades, tail })` turns the main rotor by `−blades` (clockwise
  from above) and the tail by `tail`, the model moved by `−hub` so the mast stands over the group's origin; the group
  takes `tiltedOf`. In the helicopter the walker is hidden.
- `GLTF_MODELS` adds `motorbike` (2.36 m long, built facing +x, yaw 0) and `pickup` (drawn 4.6 m of its 5.2, so its
  wheels are the car's 0.32 m). `loadModel`: the file sized to `metres` by `measure`, turned by `yaw` to face +x, on y =
  0, centred; measured once per file (`framingOf`, on a copy, precisely as posed by its skeleton), every copy `framed`
  alike and posed. `original` is the file's own scene, to retarget against.
- `Animator`: one action per clip; a motion's clip by `CLIP_OF`, cross-faded over `BLEND` 0.15 s; a missing clip logs
  `explore/clip-missing motion` once and keeps the last.
- Paces: walk at `speed / WALK_CLIP_SPEED` (1 m/s, measured 0.98) within `SLOWEST` 0.4 and `FASTEST` 2; sprint at the
  gait's `cadence / SPRINT_CLIP_CADENCE` (3 steps a second, two in its 0.667 s): its own steps are short (2.56 m/s), so
  it once ran at 1.76 times its pace, about 316 steps a minute.
- The gait (`models/gait.ts`, pure): `gaitAt(v)`: `cadence` `STEP_RATE_AT_REST` 2.45 + `STEP_RATE_PER_SPEED` 0.1 · v
  steps a second (Weyand et al. 2000; Cavanagh & Kram 1989), `step` v / cadence, `contact` min(`CONTACT_LENGTH` 0.72 /
  v, 1 / cadence), `flight` 1 / cadence − contact, `swing` min(`SWING_MOST` 0.5, `SWING_PER_SPEED` 0.1 · v): at 4.5 m/s
  2.9 steps a second (174 a minute), 1.55 m, 0.16 s down, 0.185 s in flight, the heel 0.45 m up. A stride is two steps,
  its phase 0 to 1 from the left foot landing, the right half a stride on. `footAt(gait, phase, side)`, from the ground
  under the hip: planted for `contact · cadence / 2` of the stride, the ankle from `LANDING_AHEAD` 0.38 of the contact
  length ahead back at v, the heel rising `HEEL_RISE` 0.06 m · max(0, 2u − 1)² over the stance's second half; swung,
  forward the contact length by (1 − cos πu) / 2 less a trail of `TRAIL` 0.3 m · sin(π · min(1, u / `TRAIL_SHARE` 0.4))
  (the foot trailing on behind after toe-off, as Muybridge's runner's does), up the larger of the pushed-off heel easing
  out and `swing · sin(π u^HEEL_EARLY)` (0.45: highest early, behind the hip). `bounceAt`: `−BOUNCE` 0.03 · cos(4π(phase
  − mid-stance)). `armAt(phase, side)`: `−ARM_BACK` 0.2 − `ARM_SWING` 0.45 · cos(2π · the side's phase) radians from
  hanging. `phaseAfter(phase, ground, gait)` on by ground / (2 step). `runAfter(running, how, v, walked, dt)`: the gait
  at max(`SLOWEST_GAIT` 1, v), the phase on by the ground walked (never back), the weight towards 1 running and 0 on the
  ground over `RUN_BLEND` 0.2 s, 0 at once in the air.
- `poseRun(walker, figure, gait, phase, weight)` (`models/run.ts`), after the clip: the hip joints at the ankle's
  standing height + `RUN_HEIGHT` 0.94 of the leg + the bounce (the walker lifted, the ground kept where its y = 0 was);
  the trunk (hips to head) turned about the spine to `LEAN` 0.12 rad forward in three passes, the head back as far; each
  ankle put by `reachFor` at `footAt` from its hip, `FEET_IN` 0.5 of the hip's width out, knees ahead; the foot turned
  so, planted, the ball stays on the ground as the heel rises, swung, the toes point `TOE_DOWN` 0.6 rad down at the top;
  each upper arm swung by `armAt`, `ARM_OUT` 0.15 out, the forearm `ELBOW` 90° up from it, `HAND_IN` 0.25 in, the hand
  closed `FIST` 0.6 of a grip (`grip`, shared with the rider) times the weight; then every bone slerped from the clip by
  `weight`. The canvas keeps the walker's `Running` (from `NOT_RUNNING`) and poses it each frame on foot (released
  first, so a walker's hands open). Figures gain `ankle` (the Foot bone's standing height) and `toe` (ankle to ball).
- `poseVehicle(model, rig, { rolled, steer, lean, pitch, crank, stand })`: wheels by `rolled / radius`, the crank by
  `crank` (the bicycle's own, so it freewheels), fork and front wheels by `steer`; a kickstand (`Rig.kickstand`) turned
  from down towards its `folded` turn by `1 − stand` (slerp); the model leans about its length by
  `leanOnStand(lean, stand, standLean)` and pitches nose down by `pitch` about its front contact (`rig.front`, metres
  ahead of its middle), its position moved so that contact stays put. A stand's extras are read once a part
  (`kickstandOf`: `folded` four numbers, `lean` a number); unreadable, it is no stand (logged once,
  `explore/kickstand-unreadable name`).
- `Rig.back`: where the back wheel meets the ground behind the middle (a wheelie pivots there; else `front`).
  `Rig.rider` (`Rider`): the names of the nodes marking the `saddle`, the `grips` and the `feet` (pedals or pegs), each
  `{ left, right }`. `RIGS.bicycle`: `bicycle_red_saddle`, `_grip_*`, `_pedal_*`, kickstand `bicycle_red_kickstand`,
  front 0.507 m. `RIGS.pickup` (`pickup_red` wheels, 0.318 m, front 1.37 m); `RIGS.motorbike` (wheels rolling about −z,
  0.38 m; the fork `motorbike_fork`; axles 0.786 m ahead and 0.816 m behind, measured from its mesh at 0.474 m a unit;
  `motorbike_seat`, `_grip_*`, `_peg_*`; no kickstand). The stand-ins mark theirs (`saddle`, `grip-left`/`-right` on
  `steering`, `pedal-left`/`-right` on `crank` or `peg-left`/`-right`): bicycle saddle (−0.22, 1.03, 0), grips (0.02,
  0.3, ∓0.25), pedals (0, ±0.17, ∓0.13); motorbike seat (−0.35, 0.94, 0), grips (−0.06, 0.1, ∓0.33), pegs (0, 0.3,
  ∓0.2). `poseVehicle` pitches nose up about the back contact for a negative pitch.
- `models/contacts.ts` (pure, file units): `axleOf(points, across)` the normal of the plane they lie nearest (inverse
  iteration on their covariance from the axis, `SETTLE` 40 rounds, shifted 1e-9 of its trace), along +across;
  `hubOf(points, across)` from the box's middle and the axis, `RING_ROUNDS` 3 rounds of: the ring within `RING` 3 % of
  the farthest from the axle, its axle (`axleOf`), its middle (Kasa's circle fit across the axle, halfway between its
  ends along it); radius the ring's mean distance. `endsOf(points, along, span)` the middles of the points within `span`
  of each extreme; `topOf(points, depth)` the middle of those within `depth` of the highest, at that height;
  `surfaceTopAt(positions, indices, x, z)` the highest triangle over a point (barycentric, edge-on skipped) or null;
  `seatOf(positions, indices, { from, to, step })` the lowest of those tops along z = 0, or null;
  `partsOf(positions, indices)` triangles joined by shared vertices or places (to 0.1 mm), in first-triangle order;
  `turnBetween`, `rotated`, `meanOf`.
- The rider (`models/seat.ts`). `figureOf(person)`, as made (before any clip): its `Hips`, `Spine`, `Head`, each side's
  arm and leg (`armsOf`, `legsOf`), `Middle1` (knuckles), `ToeBase` (the foot's ball), the `Thumb`, `Index` and `Middle`
  joints 1 to 3 and their rest turns (no clip moves them); `seat` the hips above the lower hip joint plus a tenth of the
  thigh, `sole` the ball's height, `standing` the hips' (metres, its own frame); logged
  `explore/rider-measured seat sole standing`; a figure lacking any, null (`explore/rider-unrigged reason`).
- `seat(walker, figure, slot, group, vehicle)`: a rig without `rider` leaves the walker as it is; a contact missing from
  the model leaves it too (`explore/no-contact name`, once a model and name). Thrown, the fingers released, the rider
  lies `THROWN` 0.9 m ahead and 0.4 m to the side it fell, rolled onto it, sinking from the saddle less
  `standing − seat` (a stand-in: its `leg-left`'s height). Else turned as the machine, its feet `standing − seat` below
  the saddle; a rigged figure is then, in the machine's frame: moved so its hips are `seat` above the saddle (`sitOn`);
  its spine turned about the upright by the bars' line, `atan2(bar.x, bar.z)` (`faceBars`); leant about the machine's +z
  by the mean of each side's `tiltToReach(spine, shoulder, grip, REACH · arm)` (0.9 of shoulder to elbow to wrist to
  palm), held within `TILT_FORWARD` 1 rad forward and `TILT_BACK` 0.4 back, the head turned back `HEAD_LEVEL` 0.7 of it
  (`leanToBars`); moved forward by as far as the farther arm still falls short, at most `SLIDE_MOST` 0.12 m
  (`slideToBars`); each hand's palm (`PALM` 0.6 from the wrist to the knuckles) put on its grip by `reachFor` `PASSES` 8
  times, aimed at the grip less where the palm landed from the wrist, elbows `ELBOW_OUT`, the fingers released then each
  joint turned `CURL` 0.9 rad (the thumb's `THUMB_CURL` 0.5) about the bar's line (`holdBars`); each foot's ball put
  `sole` above its pedal or peg the same way, knees `KNEE_AHEAD`; at a stop the left on the ground (the group's y = 0,
  whatever the lean) `FOOT_AHEAD` 0.15 m ahead of the saddle and `FOOT_OUT` 0.25 m to its left (`restFeet`). On foot,
  the figure's fingers are `release`d.
- `tiltToReach(pivot, shoulder, grip, reach)` (`models/pedalling.ts`): in the machine's upright plane, the across
  distance kept, the shoulder turned about the pivot to the angle where it is `reach` from the grip, above the line from
  the pivot to the grip (law of cosines, clamped: out of reach it leans straight at the grip), the nearest way round.
  `reachFor(root, middle, end, target, bend)` bends a limb in world space with no assumption about the bones' axes; out
  of reach, it points straight at the target. `turnInWorld(bone, turn)` turns a bone by a world turn.
- The kickstand (`models/kickstand.ts`): `standAfter(down, parked, seconds, still)` moves towards 1 parked and 0 ridden
  by `seconds / STAND_SWING` (0.3 s), at once when `still`; `leanOnStand(lean, down, standLean)` is
  `lean + standLean · down · max(0, 1 − |lean| / |standLean|)`, so a machine knocked over lies as it lies. The canvas
  keeps each vehicle's `down` by id (a vehicle first drawn starts down if parked, folded if ridden), `still` from
  `prefers-reduced-motion`, and logs `explore/kickstand id to still` as a stand begins to swing.
- The pool (`nearestOf(vehicles, at, most, keep)`): every `POOL_EVERY` 0.25 s the canvas takes the `VEHICLE_POOL`
  nearest drawn as each model (`MODEL_KINDS`: 5 saloons, 3 pickups, 3 motorbikes, 5 bicycles, 1 helicopter, 17 in all)
  to the walker (the ridden one always), and `assignPool(slots, wanted)` keeps a model on a vehicle while it stays
  wanted and gives freed ones to newcomers; a model without a vehicle is hidden. A car's group takes its `attitude`; a
  two-wheeler's its heading, the model leaning and pitching by its `lean` and `pitch`.
- The rider on a two-wheeler: `seat`, above. In a car the walker is hidden.

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
- The walk's card (bottom centre; top on touch): its title ("On foot", "On the bicycle", "On the motorbike", "In the
  car", "In the helicopter", "Flying") with its icon (lucide's Footprints, Bike, Motorbike, Car, Helicopter, Video),
  "Physics prototype: {physics}" while two engines are compared (the walls' engine; in the car "Rapier car" on the
  garage, else "arcade car"), the keys of the ride, and "Back to the map".
- The prompt: top centre (above the stick on touch), `E` in a key cap and its words; disabled while "Slow down to …" or
  "Land to get out of the helicopter" (`VehicleSpec.until`).
- Touch: a 144 px stick (reach `STICK_REACH` 48 px) and the ride's main button (`PRIMARY`): Jump on foot, Brake (the
  front brake) on the bicycle and the motorbike, Handbrake in the car, Up while flying and in the helicopter; Ring, Gear
  up and Gear down (48 px) on the bicycle only; Down while flying and in the helicopter; Fly always. Laid out by the
  dock below.
- HUD (`explore-hud`, `hudOfRide(vehicle, engine)`, in the walk's card under its keys, while riding): on the bicycle a
  region "Speed, gear and cadence" (Speed "18 km/h", Gear "3 of 7", Cadence "72 rpm"); on the motorbike "Speed, gear and
  engine" (Gear "2 of 5", Engine "3,500 rpm" to the hundred); in a car on Rapier "Speed, gear and engine" (Gear "3" or
  "R"); in an arcade car "Speed" alone; in the helicopter "Altitude, climb, speed and rotor" (Altitude "42 m" above the
  street, Climb "+3.0 m/s" with a true minus, Speed "36 km/h", Rotor "87 %", Below "Street" or "Roof", with ", no room"
  where `roomToLand` says no), and `data-over`, `data-landed`, `data-heading` (whole degrees), `data-room` and
  `data-landing` (the nearest marked roof: whole metres off and degrees off the nose, positive to the left;
  `RideHud.flight.landing`, from `hudOfRide(vehicle, engine, below: Below = OPEN)`).
- Marked roofs (the canvas): a pool of `ROOFTOP_MOST` flat discs `HELIPAD_SIZE` 7 m across, `HELIPAD_ABOVE` 8 cm over
  the roof, a 256 px canvas texture: an amber (#f2b630) "H" in a ring on a dark disc; hidden when not marked. What lies
  under it is the first top straight down (`walls.clearance` to below the street). Shown when they change, at most every
  `HUD_EVERY` 0.1 s; `data-foot` "down" or "up" on a two-wheeler, `data-fallen` while thrown. Not live: a screen reader
  reads it on demand.
- The card's keys in the helicopter: "W S tilt · A D turn · Space climbs · Shift or C sinks · E gets out · click to look
  · Esc leaves".
- The card's keys on the bicycle: "W pedals · S back brake · Space front brake · A D steer · Q R gears · B rings · E
  gets off · click to look · Esc leaves"; on the motorbike "W throttle · S back brake · Space front brake · A D steer ·
  E gets off · click to look · Esc leaves"; in the car "W accelerates · S brakes, then reverses · A D steer · Space
  handbrake · E gets out · click to look · Esc leaves". Cars falling back to arcade: `ARCADE_WORDS` in an `output`.
- Touch (`explore-dock`, `data-pad` foot, bicycle, motorbike, car, helicopter (laid out as flying) or flying;
  `display: contents` without a coarse pointer): one flow along the bottom, the panel in sight (at most 28 % of the
  height), then a grid of the prompt (one line, `nowrap`) over the 144 px stick and the pad; on its side the prompt sits
  between them and the panel in sight at the right under the top row. The pad's areas: `fly` over `primary` (Jump,
  Brake, Handbrake at 12 px, Up: 72 px); the bicycle's `ring fly / up primary / down primary` (48 px buttons); flying
  `. fly / sink primary`. On its side the card sits at the left under the title card (94 px tall), its way back on the
  title's row, at most 440 px wide, its HUD in 15 px so the helicopter's five readings keep one line and the card ends
  above the stick. The HUD's rows wrap where they must. The dock's empty space takes no pointer, so a drag there still
  looks round. Measured with no two boxes overlapping at 412 × 915 and 915 × 412, each ride.
- While a finished load holds its card, the map under it dims, the walk never (`.map:not(.explore)`).
- The bell (`explore/bell.ts`): `ringBell(context)` strikes twice, `BELL_GAP` 0.12 s apart, each two sine partials
  (`BELL_PARTIALS` 2,350 and 3,520 Hz, the second at half the level) decaying over `BELL_RING` 0.9 s at `BELL_LEVEL`
  0.2; the context is made on the first ring (a user gesture), and none where Web Audio is missing.

## Devices (`explore/input.ts`)

- Keys: `WALK_KEYS` as before, and the sinking keys C, Control and Shift; Q and R add −1 and +1 to `Controls.gears` (as
  a wheel step), B rings (on the bicycle). `Intents.sink` is held by those keys, the Down button (`Controls.sink`) or a
  pad's B; flying (the helicopter or the free camera), up is `jump − sink`.
- `padOf(pad, before)` reads the first connected standard gamepad each frame: `stick` from the left stick, its y plus
  the right trigger less the left (clamped to −1 to 1), each axis zero within `DEAD_ZONE` 0.15; `jump` while A is held,
  `sink` while B is; `look` the right stick times `PAD_LOOK` 900 px a second; presses (`use` Y, `ring` X, `gears` RB
  less LB, `fly` View) on the frame a button goes down. `Controls.pad` holds the stick and jump; `intentsOf` takes the
  touch stick, else the pad's, and jumps on either.

## Errors and edge cases

| Case                                | Handling                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| No roads                            | "This city has no roads to walk on."; `explore/no-roads`                      |
| Walls fail to rise, canvas to load  | "Walking could not start: the city’s walls did not rise."; `explore/failed`   |
| Rapier fails to load (no WASM)      | Walk goes down; arcade cars; `explore/arcade reason=engine`; said once        |
| Garage fails to open                | As Rapier failing; a cancel still cancels                                     |
| Rapier cannot keep up               | Arcade cars from then; `explore/arcade reason=slow load`; said once           |
| No hull for a building              | Raised as nothing, never tried again; `explore/no-hull lot`                   |
| Building not yet raised             | Never waited on: raised a frame or two later, nearest first                   |
| Car on its side or roof             | Righted after 2 s nearly still; `explore/righted`                             |
| Getting out of a moving car         | As any ride: only below 1.5 m/s; the car left as it lies                      |
| Front wheel up                      | No turn, the gearbox holds its gear; the limiter at the red line lets it down |
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
| No open ground for the helicopter   | No helicopter in the walk; `explore/no-helipad`                               |
| Getting out of a flying helicopter  | The prompt "Land to get out of the helicopter", disabled; E does nothing      |
| Rotor over a taller building        | Held up by it and eased off its edge; HUD says "no room" before it gets there |
| Hard hit in the helicopter          | Rotor speed lost, the disc jolted; `explore/heli-hit lost`                    |
| Rotor still on boarding             | Cannot lift until the rotor turns at `hoverShare`                             |
| Above the ceiling                   | The climb asked is held to come back to 500 m                                 |
| Stepping out on a roof's edge       | The side with a floor at the vehicle's level                                  |
| No Sketchfab token for the build    | The committed helicopter is kept; said in the build's output                  |
| A model without a rider's contact   | The rider left as it was; `explore/no-contact name` once a model and name     |
| A kickstand's extras unreadable     | No stand: the machine leans by its own lean; `explore/kickstand-unreadable`   |
| A figure without the bones to ride  | Seated by its legs' tops, unbent; `explore/rider-unrigged reason`             |
| Grips beyond the arms' reach        | Leant forward at most 1 rad, then forward along the saddle at most 0.12 m     |
| A machine knocked over, stand down  | Its own lean past the stand's: drawn as it lies, no lean added                |
| No roof with room within 300 m      | Nothing marked, no `data-landing`; the assist pulls nowhere                   |
| Sinking near a marking, a key held  | The assist lets go: forward or a turn flies it as ever                        |

## Observability

`explore/walls`, `explore/enter landing buildings`, `explore/leave x z`, `explore/failed reason`,
`explore/no-roads name`, `explore/model-normalised url x y z scale`, `explore/model-failed url reason`,
`explore/clip-missing motion`, `explore/parked bicycles cars`, `explore/streets buildings ms`,
`explore/arcade reason (engine detail | slow load)`, `explore/crash car lost`, `explore/righted car`,
`explore/no-hull lot`, `explore/traffic cars`, `explore/garage load` (when the walk ends), `explore/thrown cause speed`
(the speed thrown at) (cause `hit`, `grip` or `lean`), `explore/up`, `explore/bell`, `explore/bell-silent`,
`explore/gamepad id` (once, when first read), `explore/helipad x z`, `explore/no-helipad`, `explore/heli-landed on y`
(`on` `roof` or `street`), `explore/heli-lifted`, `explore/heli-hit lost`, `explore/rider-measured seat sole standing`,
`explore/rider-unrigged reason`, `explore/no-contact name`, `explore/kickstand id to still`,
`explore/kickstand-unreadable name`, and the loading card's `viewer/load-phase source=explore`.

## Performance and limits

- Measured on a desktop (Bun): bespoke walls for 75,000 buildings in 132 ms and 82 MB; a move 0.5 µs, a ray 0.4 µs.
  Rapier: 996 ms and 312 MB at 75,000 buildings, 75 MB at 250; 1.6 MB gzipped, loaded only on Walk.
- Models: people 370 to 381 KB, vehicles 159 to 224 KB each; each file measured once, however many copies.
- The bicycle (Bun, desktop): `rideCycle` 0.71 µs a step, its load halving included; at 120 Hz under 0.01 % of a frame.
- The nearby streets at linux's size (75,256 buildings, 6.9 × 6.6 km; Bun, desktop): opening at a landing 126 to 169
  buildings in 29 to 56 ms, the engine loaded; raising 11 to 13 µs a building; a drive across the city at 30 and at 60
  m/s (2 ms a frame at 60 frames a second): never a building waiting, at most 320 and 379 standing, a frame's `follow`
  median 0.00 ms, p99 0.33 and 0.51 ms, at most 2.9 ms; the garage's world 11 to 15 MB beside the engine, against 312 MB
  for the whole city in Rapier.
- The car and 20 other Rapier cars (`?traffic=20`) on a Pixel 7 profile at 4x CPU slowdown (the live site, headless
  Chromium on an integrated GPU, Intel through ANGLE and Mesa, the closer stand-in for a phone): 60 fps, frames p99 16.8
  ms; the main thread busy 31 % (scripts 26 %); alone 60 fps, busy 24 %. Rapier takes 12.5 % of the real time with the
  traffic (4.6 % alone), about 2 ms of a 16.7 ms frame. JS heap 23 to 27 MB driving, array buffers (Rapier's memory
  among them) 9 MB: within the walk's budget of 64 MB and 32 MB. Drawn in software (SwiftShader, Chromium's default
  headless) the same drive manages 24.5 to 30 fps: the drawing binds there, not the walk.
- The motorbike's models: 256 KB; the bicycle 161 KB with its kickstand and contacts. Seating a rider: 8 passes of four
  limbs' reach, once a frame for the one ridden. Rapier's chunk: 1.6 MB gzipped, now loaded on every walk behind the
  card.
- The helicopter (Bun, desktop): a flown step through 10,000 buildings 3.2 µs (its four wall moves and the ray down),
  0.04 % of the time at 120 Hz. Its model 107 KB. Marked roofs among the same 10,000: the first ask works out the 1,100
  within 300 m in 7.5 ms (once, on the first HUD refresh in the helicopter); each refresh after 0.44 ms.
- Parking: `parkedIn` 1.8 ms for takken.io (115 kept) and 2.9 ms for livediagram (4,135 lots, 200 kept); at most
  `PARKED_MOST` 200 vehicles in the session (each step's `clearOfVehicles` and `reachable` skip a vehicle by its box
  first), and the canvas draws at most 16 models.

## Testing

Unit tests beside each module (`*.test.ts`), 100 % covered: the walls (including a property test that no walk among nine
buildings ends inside one), both adapters against real Rapier, landing, walker, session (riding, prompts, shown poses at
uneven frame times), camera, input, vehicles, models, retargeting (rest frames, turned models, hip scale), rigs, motions
and the Animator; the bicycle: hands-free self-stability within 4.3 to 6 m/s and falling below, turning by leaning,
countersteering, tracking the aim at every speed, the low-speed wobble, weight transfer and the back wheel lifting, the
grip limit, cadence and freewheel, gears, resistance, foot down, falls and getting back up; parking from the plan; the
pool; the pad; the run's gait (174 steps a minute at 4.5 m/s, contact and flight, a foot planted and swung, the bounce,
the arms, the phase, the blend) and the figure posed by it on the walk's own man (`run.test.ts`: a planted ankle held
within 1 cm, both feet up in flight, knee 5 to 25° landing and 35 to 55° loaded, hip −25 to −5° behind and 45 to 65°
ahead, knee 90 to 120° in the swing, Novacheck 1998; a 7° lean, square elbows, arms against legs, the blend); the walker
on the garage's Rapier walls (on the ground exactly, stopped and slid at a wall, a jump, a plinth stepped up and walked
off, through vehicles, pressing on a wall through a re-centring, the camera's line) and the session walking on them; the
leg reaching its pedal; the bell with a stand-in context. The rider on the walk's own models (`seat.test.ts`, the files
read from `public/models` without their textures by `testing/models.ts`): hips on the saddle, palms on the grips and the
feet's balls on the pedals within 2 cm round the crank, steered and leaning either way, on the motorbike's seat, grips
and pegs, the knees bent ahead, fingers closed and released, a foot on the ground at a stop, thrown, a figure without
bones, a missing contact said once. Each wheel of each ride and stand-in true over a full turn (`wheels.test.ts`: hub
held within 1 mm, axle within 0.002 rad of across, 24 steps; the pack's leaning bicycle fails it by 0.14 rad); the
contacts marked; the kickstand on the ground parked, the bicycle leaning 8°, and folded clear of it ridden; the
measuring functions (`contacts.test.ts`); the stand's swing and lean (`kickstand.test.ts`). The core: the benchmark's
matrices from its parameters, the middle, the loads, the wheel lifting and coming down to exactly 0. The motorbike: the
wheelie held in first until the red line, 0 to 100 km/h, top speed, the throttle's rate, changing down, both brakes,
paddling back, a slide under braking leaned, tracking the lean at 6 to 40 m/s, riding straight, the foot, falls, the
HUD. The engine and gearbox. The nearby streets: reach, ties, cells below zero, the plan, re-centring. The garage
against real Rapier: counted opening, cancelling, a hull it cannot make, the budget, re-centring by a wall 600 m off,
pulling away through the gears, braking then reversing, the handbrake's slide, a crash, righting, pushing a parked car,
two-wheelers in the way, letting go and bringing back, traffic, keeping up. The descent's order and every failure; the
HUD of each ride. The helicopter: spin-up to full in five seconds, staying down with the collective down, spin-down
slower, blades turning with the rotor, no lift below `hoverShare`; ground effect's cushion and its fade; height held let
go, the most climb and sink, a soft landing, the ceiling, height kept flying ahead; the cyclic's tilt, about 200 km/h,
backwards, levelling to a hover; the tail rotor turning on the spot, holding its heading, a banked turn and its
levelling; on its skids; thrust's axis and `tiltedOf`; contact (a slide, a hard hit, a landing, lifting off, held by its
rotor); through walls (a wall as high as the rotor, a brush, over a low building, the cabin, a roof landing, perched and
eased off, `belowOf`, `roomToLand`); the helipad (ahead, past buildings, clear of a parked car, behind, none); boarding,
the prompt, the camera, landing and spinning down in the session; stepping out onto the roof's side; the view's Up and
Down on a roof and a hit and landing by keys, logged. The landing assist: set down on the middle from inside and near
the edge of its reach, sinking gently until centred, nothing pulled beyond it, turning or holding height; rooftops:
marked with the margin, a taller neighbour within reach, the reach and the most, ties, worked out once. End to end: in,
spun up, lifted to 30 m, a marked roof named; turned to it, flown at it (W only, as fast as letting go can stop it;
faced afresh from a hover when it slips off the nose) until within 6 m and below 10 km/h; sunk and set down on it by the
assist; out on the roof and in reach again, with the touch layout measured upright and on its side. Passes at 4× CPU
throttling. End to end: loading once (its four phases), the motorbike (throttle, gears, both brakes, off), the car on
Rapier (engine, gears, reverse, parked where it stopped), arcade cars without WebAssembly, and each ride's touch layout
with nothing overlapping, upright and on its side. End to end (`e2e/explore.spec.ts`): walking by keys and by touch, the
loading log, getting on the bicycle and off, riding it (pedal, shift, brake, stop with a foot down, the HUD), the Rapier
prototype, Wobble Blocks loaded, axe light and dark.

By eye: the run lab (`/lab/run?gait=before|after&phase=…&theme=…`, not linked) shows the figure side on at a phase of
its stride before a wall lined every 10 cm, with ground marks every half metre;
`apps/web/scripts/run-shots.ts <origin> <dir> [frames]` captures a stride before and after in ten frames, light and
dark, beside Muybridge's plate 60 (public domain:
https://commons.wikimedia.org/wiki/File:Man_in_pelvis_cloth_running_at_a_half-mile_gait_(rbm-QP301M8-1887-060).jpg). The
ride lab (`/lab/ride?ride=…&pose=parked|stopped|riding|steering&view=side|front|above|behind|grip|pedal`, with `theme`,
`rolled`, `crank` and `marks=1` dotting the contacts; not linked) seats a rider as the walk does, on a plain ground;
`apps/web/scripts/ride-shots.ts <origin> <dir> [wheel]` captures each ride, pose and view in a light and a dark theme,
or the bicycle's wheel turning an eighth of a metre a frame.
