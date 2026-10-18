# Plan 0012: explore the city

Go down into the city and move through it: on foot in third person, by bicycle, motorbike, car and helicopter, or with
an RTS or free camera beside today's plan. Buildings carry their names, and a crosshair reads any building or window.
Built in rounds: each phase ends on a local build that Webber tests (desktop and phone) and gives feedback on; feedback
is folded into the spec before the next phase starts. Everything runs in the browser on the static site, phones
included.

Spec (to write in phase 1): `docs/specs/009-exploration/exploration.md`, with its blueprints in
`docs/specs/009-exploration/blueprints/`. Touches [viewer](../docs/specs/004-interface-design/viewer.md) (Layout, Map,
Design rules, Accessibility), [buildings](../docs/specs/008-buildings/buildings.md) (channels: names, windows) and
[scope](../docs/specs/002-project-scope/scope.md) (the walk camera moves from Later into scope).

## Components

The design each phase builds on; the spec and blueprint record it, this list only names the parts.

- **World** (`packages/world`, new, pure, framework free): the city as solid ground for movers. Flat ground, each
  building a convex prism (its lot polygon, its height from the lot table), roads and land use per cell, in a uniform
  spatial grid. Queries: collide a circle or capsule, the ground under a point, a ray to the first building with the
  face, floor and window column it meets. Units in metres (1 street width = 10 m, so a floor is 2.5 m).
- **Movers** (`packages/world/movers`): on foot, bicycle, motorbike, car, helicopter. Each is a pure step function
  `step(state, intents, dt, world) → state` at a fixed 120 Hz, deterministic, rendered with interpolation. The bicycle
  and motorbike share one single-track core (lean, steering geometry, trail, self-stability, weight transfer); the car
  is a single-track model with tyre slip; the helicopter has collective, cyclic and tail rotor, and lands on roofs.
- **Intents** (`apps/web/src/explore/input`): devices become intents (move, look, throttle, brake, steer, lean, jump,
  shift gear, ring, inspect, switch). Sources: keyboard and mouse with pointer lock, touch (virtual stick, look by drag,
  buttons), gamepad. Pure mapping, tested.
- **Cameras**: Plan (today's orthographic), RTS (perspective, tilt, rotate, zoom to cursor, edge and drag pan), Free
  (fly, no collision), and a third-person follow camera per mover (spring arm that never enters a building).
- **Inspection**: the ray from the crosshair, through the world, to a window or a building; the card reuses the hover
  card's words and measures. On touch the crosshair stays centred; a tap reads what it points at.
- **Signs**: each building's name on its street-facing wall, in SDF text with a self-hosted font, drawn only for the
  nearest buildings from a small pool, so linux's 75,000 cost no more than takken.io's.
- **Explore UI**: a "Ride" switch beside the view switch (no more than seven choices each), a crosshair, a HUD per mover
  (speed, gear, cadence, altitude), a controls sheet behind `?`, and touch controls on phones.
- **Renderer**: a perspective camera and a running frame loop while exploring (on demand otherwise), sky and fog that
  bound the far plane, the existing building shader unchanged in meaning.

## Phase 1: decisions, spec and blueprint

- [x] Webber's answers to the open forks (DECISIONS.md § Exploring): a window is a file; the Buildings view gains rotate
      and tilt instead of a separate RTS camera; rides are parked vehicles to walk up to; physics is bespoke 2.5D, with
      a Rapier prototype on the same code to compare; the bicycle balances assisted; landing is before the selected
      building, else on the road nearest the view's centre
- [x] Model lab (`/lab/models`): procedural, glTF (Kenney CC0, poly.pizza) and mixed, captured on a real street, light
      and dark, for Webber to choose
- [x] Rapier prototype on the viewer: Walk button, loading card (engine, then walls, counted), a walker by keys, drag,
      touch stick and jump, follow camera, back to the map where the walk ended; physics behind a `Walls` port
- [x] Webber's choice of model style: glTF in a GTA look; people Wobble Blocks on the Universal Animation Library
      (retargeted, baked by `scripts/models/build-models.ts`), vehicles heyheythere's PSX pack
- [x] Webber's verdict on the Rapier prototype: one physics game everywhere; our walls for walking and the bicycle,
      Rapier for cars and other vehicles on every device, arcade cars as the fallback (DECISIONS.md)
- [x] Rapier's walker held to the ground by the adapter, not a city-wide box (32-bit precision); measured per frame,
      wall raising and memory against the bespoke walls
- [x] Research: single-track bicycle dynamics fit for 120 Hz in a browser (Whipple-derived, self-stability from trail),
      arcade-real car tyre models, helicopter flight models in web games, third-person spring-arm cameras, SDF text
      pooling in three.js, touch controls in mobile web games, pointer lock and gamepad support per browser
- [x] Measure the scale: lot, road and floor sizes in metres over the corpus, to confirm 1 street width = 10 m reads
      right at eye height
- [x] Spec `009-exploration/exploration.md`: terms, modes and rides, controls per device, inspection, signs, HUD,
      accessibility (motion, reduced motion, keyboard), phones; viewer, buildings and scope specs updated with the delta
- [x] Blueprint: world model and queries, the step function contract, each mover's equations and constants, intents and
      bindings, cameras, inspection, signs, UI copy; defaults ledger and completeness
- [x] Index the new spec and blueprints in `docs/specs/README.md`

## Phase 2: tracer bullet, on foot

The thinnest path through every layer: world, one mover, intents, camera, renderer, UI.

- [x] `packages/world`: the bespoke `Walls`: prisms from the footprints, spatial grid, capsule collision with sliding
      and stepping up, ground query, rays (tests first, property tests: never inside a building); the Rapier walls stay
      behind a switch until Webber retires them
- [x] On-foot mover: walk, run, jump, turn (`explore/walker.ts`, tests first)
- [x] Intents from keyboard and touch (stick, drag to look, jump button), pure and tested (`explore/input.ts`)
- [x] Pointer lock for mouse look on desktop, granted or refused in the log
- [x] Third-person follow camera that pulls in short of walls (`explore/camera.ts`); perspective renderer, frame loop
      only while walking
- [x] Fog in the building shader, so the far city fades instead of ending at the far plane
- [x] Explore UI: Walk enters at the landing place (`explore/landing.ts`), Escape, the card or a view leaves; a
      procedural placeholder figure with a stride
- [x] Logs: `explore/walls`, `explore/enter`, `explore/leave`, `explore/failed`, `explore/no-roads`
- [x] E2E: enter on foot, move by keyboard and by touch, leave; axe light and dark; phone viewport
- [x] E2E: never pass a wall; run at three selected buildings, each stopped within 12 m and outside it
- [x] Gate (`bun run check`), commit, local build served for Webber
- [x] Webber tests on desktop and phone; feedback folded into the spec; desktop by Webber (jitter, acceleration,
      steering folded in), phones on the LAN

## Phase 3: names and the crosshair

- [x] World ray query: building, face, floor and window column (tests first)
- [x] Inspection: crosshair over a window or a building shows its card; a window says what it holds and whether it is
      lit, and why
- [x] Signs: the nearest buildings' names on their street-facing walls, pooled, self-hosted font
- [x] Roofs named in the turned Buildings view (Phase 4)
- [x] E2E: aim at a known building and window, read the card; signs never more than the pool
- [x] Gate, commit, local build; Webber tests; feedback folded in (crosshair: shoulder offset, panel at the right, touch
      scrolling)

## Phase 4: cameras, the Buildings view turned and free

- [x] Buildings view gains rotate and tilt (orthographic kept; no edge pan), zoom to the cursor, drag, touch gestures
      (tests first on the maths)
- [x] Free camera: fly in six directions, speed by wheel, no collision (F from the walk; Fly on touch)
- [x] View switch: Plan and Buildings keep centre, zoom and turn; the free camera lifts from the walk and lands back
- [ ] E2E and vitals in each view; gate, commit, local build; Webber tests; feedback folded in

## Phase 5: parked vehicles and the bicycle

- [x] Parked vehicles: where they stand in a city (deterministic from the plan), walking up to one, getting on and off

The showpiece: a bicycle that rides like one.

- [x] Single-track core: lean, steering geometry with trail and self-stability, countersteer, weight transfer, tyre grip
      limit, low-speed wobble (tests first: rides straight hands-free above its stable speed, falls below it, turns by
      leaning)
- [x] Drivetrain: pedalling cadence and torque, gears up and down, freewheel, front and rear brakes (a hard front brake
      lifts the rear), rolling resistance and air drag
- [x] Rider: pedals, legs and wheels turn in step with cadence and speed; foot down at a stop; a fall on a hard hit or a
      lean past grip, then back up
- [x] Bell, HUD (speed, gear, cadence), controls on keyboard, touch and gamepad
- [x] E2E: ride, shift, brake, stop with a foot down; gate, commit, local build
- [x] Released (Webber's standing approval): PR, CI, squash-merge, the live site checked on desktop and phone
- [ ] Webber tests on desktop and phone; feedback folded in

## Phase 6: motorbike and car

- [x] Nearby streets for Rapier: only buildings within a window round the player, added and removed as it moves, in a
      frame centred near the player (no 32-bit drift); memory and raising time measured at linux's size (tests first)
- [x] Everything loads once, behind the Walk loading card (Rapier, every model, the walls), so nothing waits after:
      getting into a car is instant; falls back to the arcade car (logged) where Rapier cannot load (no WebAssembly) or
      cannot keep up (frame time), saying so once
- [x] Nearby streets swapped in without a hitch: raised ahead of the player within a frame's budget, never waited on
- [x] Car on Rapier's ray-cast vehicle controller: suspension, tyre grip, drift, crashes and roll-overs, getting it back
      on its wheels; engine, automatic gearbox, handbrake; follow camera tuned for it
- [x] Measured on a 4x slowed phone: the car and 20 other Rapier cars at 30 fps, memory within budget
- [x] Motorbike on the single-track core (our own): engine torque curve, gearbox, throttle, both brakes, wheelie limit
- [x] HUD per ride; getting off leaves the vehicle parked where it stopped
- [x] Touch layout per ride: nothing overlapping at 412 × 915 and on its side, the prompt on one line (Phase 8's touch
      step, brought forward); the walk no longer dimmed while the loading card holds
- [x] E2E; gate, commit, local build
- [x] Released (Webber's standing approval): PR, CI, squash-merge, the live site checked on desktop and phone
- [ ] Webber tests on desktop and phone (the 30 fps on a real phone's GPU too); feedback folded in

## Phase 7: helicopter

- [x] The AS350 B2 built from Sketchfab (token optional, the glb committed), 107 KB; parked on open ground along the
      landing's road, boarded with E
- [x] Flight model: collective, cyclic, tail rotor, ground effect, rotor spin-up; lands on ground and roofs (tests
      first)
- [x] Collision with buildings at any height; altitude and vertical speed in the HUD
- [x] Controls on keyboard, touch (nothing overlapping at 412 × 915 and on its side) and gamepad; a camera for flying
- [x] E2E: board, spin up, lift, fly, land on a roof, get out; gate, commit, local build
- [ ] Released (Webber's standing approval): PR, CI, squash-merge, the live site checked on desktop and phone
- [ ] Webber tests on desktop and phone; feedback folded in

## Phase 8: phones, gamepads and the hosted site

- [x] Touch controls per ride, sized and spaced by the design rules; landscape and portrait (in Phase 6)
- [ ] Gamepad bindings per ride
- [ ] Budgets: linux at 60 fps on desktop and 30 fps on a 4x slowed phone while riding; signs and world build within
      budget
- [ ] Accessibility: every mode reachable and leavable by keyboard; reduced motion turns off camera sway and shake;
      contrast of crosshair, HUD and cards light and dark; axe
- [ ] Pages build and deploy; tried on the hosted site from a desktop and a phone

## Phase 9: fold-back

- [ ] Fold-back: specs (exploration, viewer, buildings, scope) reconciled to what shipped, blueprints re-derived, every
      symbol, file and reference verified; README updated with images; AMBIGUITIES.md entries removed
