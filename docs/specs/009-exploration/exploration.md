# Exploration

A person goes down into the city shown and moves through it: on foot in third person, by bicycle, motorbike, car or
helicopter, or with a free camera. Buildings carry their names, and a crosshair reads any building or window. It runs in
the browser on the static site, on desktops and phones. The city itself is the
[ground plan](../006-ground-plan/ground-plan.md) with its [buildings](../008-buildings/buildings.md); how the viewer
around it behaves lives in the [viewer](../004-interface-design/viewer.md).

## Terms

| Term      | Meaning                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| walk      | Being down in the city, from going down until back to the map; on foot or riding.             |
| walker    | The person the walk follows.                                                                  |
| vehicle   | Something the walker rides: a bicycle, a motorbike, a car or a helicopter.                    |
| ride      | Being on or in a vehicle.                                                                     |
| landing   | Where a walk begins.                                                                          |
| walls     | The city as solid ground: every building a prism its height, the streets flat ground between. |
| crosshair | The mark in the middle of the view that reads what it points at.                              |
| sign      | A building's name, on its wall facing the street.                                             |
| window    | One file of a building: a lot of several files has a share of its floors per file.            |

## Going down and coming back

- **Walk**, beside the view switch, goes down into the city or town shown. On a phone it waits at the bottom in the
  middle, under the thumb.
- The walk lands before the selected building, facing it, on the road beside it; with nothing selected (or anything but
  a building), on the road nearest the middle of the map, facing along it. A city without roads has nowhere to land, and
  says so.
- Everything the walk needs loads once, as it goes down, behind the loading card: the physics engine, the people and
  vehicles, the city's walls and the streets round the landing. The card names the walk ("Going down into takken.io"),
  its phases ("Loading the physics engine", "Loading the people and vehicles", "Raising the city's walls", "Raising the
  nearby streets") and counts the models and the buildings. Once down, nothing waits: getting into a vehicle, riding and
  moving across the city are instant.
- Escape, **Back to the map**, Walk again or a view switch leaves; the map comes back centred where the walk ended.
  Showing another city or town ends the walk.
- Loading fails in one sentence, and the map stays: "Walking could not start: the city's walls did not rise." A physics
  engine that does not load stops nothing: the walk goes down, and cars drive as arcade cars (see Physics).

## On foot

- W A S D or the arrow keys walk where the camera looks; Shift runs; Space jumps. On a touch screen, a stick under the
  left thumb walks (pushed nearly all the way, it runs) and a Jump button sits under the right.
- A walk is about 1.6 m a second and a run 4.5; the figure's walk and sprint keep pace with the ground.
- Buildings and parked vehicles stop the walker, who slides along them; kerbs and plinths up to 45 cm are stepped up
  onto, and roofs are stood on.
- Dragging turns the camera, which follows over the walker's shoulder and pulls in at once short of a wall behind,
  easing back out; it never looks from inside a building. On a desktop, a click captures the mouse to look round (Escape
  releases it).

## Vehicles

- Bicycles and cars stand parked at the kerbs of the city's streets, worked out from its plan, so a city always has the
  same ones in the same places: some of the kerb places along every street hold one, never in a junction. A bicycle also
  stands at the kerb of the street the walk lands on, just ahead, a car across the street, clear of the bicycle's way,
  and a motorbike at the near kerb behind the landing, facing away. Motorbikes park at the city's kerbs too, fewer than
  bicycles and cars; cars are saloons and pickups. The walk keeps those nearest its landing, a few hundred, so a large
  city costs what a small one does. A helicopter is found in the city.
- Within reach (1.2 m), a prompt says what E does: "Get on the bicycle", "Get on the motorbike", "Get in the car".
  Riding, E gets off or out beside the vehicle once it has nearly stopped; until then the prompt says "Slow down to get
  off the bicycle". On a touch screen the prompt is a button.
- A vehicle left stays where it stopped, as it stopped: a car on its side stays on its side until it is driven again.
  Vehicles stand in the way of walkers and of each other.
- **The car**, the motorbike and the helicopter handle as GTA's do: cars on suspension that grip, drift, crash, roll
  over and are put back on their wheels; the motorbike leans on the bicycle's single-track core, with an engine and a
  wheelie; the helicopter flies by collective and cyclic and lands on roofs.

## The car

- **It drives on Rapier.** A body on four wheels, each held up by its own spring and damper, so it dips under braking,
  squats pulling away, leans in a turn and bounces over a kerb. Its tyres grip up to a limit and slide past it.
- **Engine and gearbox.** W opens the throttle. The engine pulls by its torque curve, strongest in the middle of its
  range and nothing past the red line, through five gears that change by themselves: up near the red line, down when the
  engine would labour. S brakes; once stopped, S backs up in reverse, and W brakes a car rolling back.
- **Steering.** A and D (or a stick) steer the front wheels, less the faster it goes, so it stays catchable at speed.
- **The handbrake.** Space locks the back wheels and loosens their grip: the back steps out, and the car drifts, held by
  steering into the slide and the throttle.
- **Crashes and roll-overs.** It stops against buildings and other cars, and pushes parked cars it hits. Hit hard or
  flicked over a kerb, it rolls; lying on its side or roof, nearly still, for two seconds, it is set back on its wheels
  where it lies.
- **The camera** chases the way it moves, so a drift shows the slide, and draws further back as it speeds up.
- **The HUD**, while in the car: speed in km/h, the gear (R in reverse), and the engine's turns a minute.

## The motorbike

- **It balances as the bicycle does**, on the same single-track physics with a motorbike's build: longer, heavier, its
  fork raked out as a chopper's. It leans into turns, countersteers and falls as the bicycle does, and asks the rider
  for a bigger lean at speed.
- **Engine and gearbox.** W opens the throttle: the engine pulls by its torque curve through five gears that change by
  themselves. S brakes the back wheel and Space the front; the front stops hardest. Its long wheelbase keeps the back
  wheel down: the front tyre slides before it would lift.
- **The wheelie.** Pulling away hard in a low gear lifts the front wheel; the rider holds it short of going over
  backwards, and it comes down when the throttle eases or the engine reaches its red line, the gearbox holding first
  until it is down. With the front wheel up it steers nothing.
- **The rider** sits astride with hands on the bars and feet on the pegs, a foot down at a stop, and is thrown off as
  from the bicycle.
- **The HUD**, while on the motorbike: speed in km/h, the gear, and the engine's turns a minute.

## The bicycle

The showpiece: a bicycle that rides like one, and stays fun on a keyboard.

- **It balances as a real one does.** It is a single-track machine: two wheels in line, leaning. Its front wheel trails
  behind the steering axis, so a lean steers it into the lean and brings the wheels back under it. From about 15 to 22
  km/h it rides on straight with no hands; slower, it falls over; leaning turns it.
- **Balance is assisted.** A and D (or a stick) ask for a turn: tighter slow, gentler fast. The rider leans the bicycle
  into it, first steering briefly the other way (countersteering) as a real rider does. The lean asked for stops short
  of what the tyres can hold. At walking pace the rider helps it with the body, and the bars wobble as the rider
  searches for balance; above a running pace they are steady.
- **Pedalling.** W pedals (a stick or a trigger pushed part way, gently). The crank turns at a cadence set by the speed
  and the gear; the rider pushes hardest at a slow cadence and not at all past about 140 turns a minute. Seven gears,
  the third to start: Q shifts down and R up (or the wheel). Letting go of W freewheels: the crank stops and the bicycle
  rolls on, slowed by the tyres and, more and more as it goes faster, the air.
- **Brakes.** S brakes the back wheel and Space the front. Braking moves the weight forwards, so the front brake stops
  hardest; hard enough, it lifts the back wheel, which the rider holds short of going over the bars. The back wheel
  alone skids long before that. Stopped, S walks the bicycle backwards.
- **Grip.** The tyres hold a turn and a brake together up to their grip; asking for more, such as braking hard while
  leaned over, slides the bicycle from under its rider.
- **The rider.** Pedals, legs and wheels turn in step. Coming to a stop, a foot goes down to the ground, and comes up
  again once moving. A hard hit (from about 11 km/h) or a slide throws the rider off; both lie a moment, then the rider
  gets back up, on the bicycle, a foot down.
- **The bell.** B rings it; on a touch screen, a Ring button.
- **The HUD**, while on the bicycle: speed in km/h, the gear, and the cadence in turns a minute.

## Controls per device

| Doing           | Keyboard and mouse  | Touch                 | Gamepad              |
| --------------- | ------------------- | --------------------- | -------------------- |
| Walk, steer     | W A S D, arrows     | the stick             | left stick           |
| Look            | the mouse, captured | a drag                | right stick          |
| Jump            | Space               | Jump                  | A                    |
| Get on, off     | E                   | the prompt            | Y                    |
| Pedal, throttle | W                   | the stick pushed up   | right trigger, stick |
| Back brake      | S                   | the stick pulled down | left trigger         |
| Front brake     | Space               | Brake                 | A                    |
| Handbrake (car) | Space               | Handbrake             | A                    |
| Gears           | Q down, R up, wheel | Gear down, Gear up    | LB down, RB up       |
| Bell            | B                   | Ring                  | X                    |
| Fly, land       | F                   | Fly                   | View (Back)          |
| Back to the map | Escape              | Back to the map       | (the card's button)  |

## Physics

- One game on every device. Walking, the bicycle and the motorbike move on citymap's own walls; cars on Rapier, a
  physics engine.
- **The nearby streets.** Rapier is given only the buildings near the player, never the whole city: those within a reach
  of where the player will be a moment ahead are raised, nearest first, a few each frame within a small share of it, and
  those left far behind are lowered. Rapier's world is placed round the player and moved along with it, so its numbers
  stay small and precise in any city. Raising never holds a frame up: a street not yet raised is raised a frame or two
  later. The streets round the landing are raised behind the loading card.
- Where Rapier cannot load (no WebAssembly) or cannot keep up (its steps take more than half the time they cover, for
  two seconds), cars drive as arcade cars, simpler and not tuned to match; the log says so, and the walk's card says so
  once: "Cars drive simply here: the physics engine did not load." or "Cars drive simply here: this device could not
  keep up."
- The physics steps 120 times a second whatever the screen's rate; everything is drawn between its last two steps.

## Reading the city

- Each building's name is on its wall facing the street, for the nearest buildings; from above, on its roof.
- The crosshair, in the middle of the view (the camera looks past the walker's right shoulder), reads what it points at:
  a window names its file and what its light means; a wall or a roof names the building. The card uses the hover card's
  words and measures; it sits at the right under the controls (above the stick on touch), and a finger scrolls it
  without turning the camera.

## Cameras

- The Buildings view turns and tilts: Q and E, Page Up and Page Down, a right-drag or a Shift-drag, or two fingers
  twisting and moving together. It stays orthographic, the map's own drawing; the turn is the person's, kept through
  fitting, flights and switching views. The wheel and a pinch zoom about the point under the pointer, in either view.
  The map does not pan at its edges.
- Close up in the Buildings view, the buildings nearest the middle are named over their roofs.
- The free camera flies from the walk: F lifts it from where the follow camera is and lands it on the walker again. It
  flies where it looks and through anything, Space and C (or Control) rise and sink, the wheel sets its speed; on touch,
  a Fly button and Up and Down. The walker and any ride wait where they are, and the crosshair reads from the camera.

## People and vehicles, and their sources

- The look is GTA 3 to San Andreas: textured, realistic proportions, low-poly and light.
- People: Wobble Blocks' PS2 Styled Characters (CC0), animated by Quaternius' Universal Animation Library (CC0), its
  clips retargeted onto their skeleton. Vehicles: heyheythere's PSX Vehicles Free (CC BY 4.0), GGBotNet's PSX Style Cars
  (CC0), Duhgless' PSX bikes (CC0), and helicopters from Sketchfab (CC BY 4.0). Mixamo's terms forbid freely
  distributing its files, so it is not used.
- Each model is built from its source by a script, reproducibly, and credited beside the models.

## Phones and accessibility

- Every control has a keyboard way, a pointer way and a touch way. Prompts and cards meet the viewer's design rules and
  WCAG 2.2 AA, light and dark; the walk has an accessible name that says how to move.
- On a touch screen the controls sit along the bottom, laid out per ride so nothing overlaps, upright or on its side:
  the stick under the left thumb; under the right, the ride's main button (Jump, Brake, Handbrake, Up) with its others
  beside it (Ring and the gears on the bicycle, Down while flying) and Fly above; the prompt on one line above them,
  upright, or between the stick and the buttons on its side. The walk's card and the panel in sight keep clear of them.
- Reduced motion turns off the camera's sway.
