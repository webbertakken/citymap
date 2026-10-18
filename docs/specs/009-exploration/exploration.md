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
  vehicles, and the city's walls. The card names the walk ("Going down into takken.io"), its phases ("Loading the
  physics engine", "Raising the city's walls") and counts the buildings. Once down, nothing waits: getting into a
  vehicle, riding and moving across the city are instant.
- Escape, **Back to the map**, Walk again or a view switch leaves; the map comes back centred where the walk ended.
  Showing another city or town ends the walk.
- Loading fails in one sentence, and the map stays: "Walking could not start: the physics engine did not load."

## On foot

- W A S D or the arrow keys walk where the camera looks; Shift runs; Space jumps. On a touch screen, a stick under the
  left thumb walks (pushed nearly all the way, it runs) and a Jump button sits under the right.
- A walk is about 1.6 m a second and a run 4.5. Running, the walker bounds in long, playful leaps (2.4 m, half a metre
  high), squashing as it lands; the ground, the walls and the camera stay level.
- Buildings and parked vehicles stop the walker, who slides along them; kerbs and plinths up to 45 cm are stepped up
  onto, and roofs are stood on.
- Dragging turns the camera, which follows over the walker's shoulder and pulls in at once short of a wall behind,
  easing back out; it never looks from inside a building. On a desktop, a click captures the mouse to look round (Escape
  releases it).

## Vehicles

- A bicycle and a car stand parked at the kerb of the street the walk lands on; a motorbike and a helicopter are found
  in the city. Within reach (1.2 m), a prompt says what E does: "Get on the bicycle", "Get in the car". Riding, E gets
  off or out beside the vehicle once it has nearly stopped; until then the prompt says "Slow down to get off the
  bicycle". On a touch screen the prompt is a button.
- Riding: W throttles or pedals, S brakes then backs up, A and D steer, Space brakes. A vehicle left stays where it
  stopped. Vehicles stand in the way of walkers and of each other.
- **The bicycle** is a real one: assisted balance, where steering sets a lean and the bicycle balances itself as a real
  one does above walking pace; pedalling turns the crank through its gears, the legs follow the pedals, a foot goes down
  at a stop, and a hard hit or a lean past grip throws the rider off.
- **The car**, the motorbike and the helicopter handle as GTA's do: cars on suspension that grip, drift, crash, roll
  over and are put back on their wheels; the motorbike leans on the bicycle's single-track core, with an engine and a
  wheelie; the helicopter flies by collective and cyclic and lands on roofs.

## Physics

- One game on every device. Walking and the bicycle move on citymap's own walls; cars and other vehicles on Rapier, a
  physics engine, given only the streets near the player and placed round it, so memory and precision stay the same in
  any city. Where Rapier cannot load (no WebAssembly) or cannot keep up, cars handle as today's arcade cars, simpler and
  not tuned to match, and the log says so once.
- The physics steps 120 times a second whatever the screen's rate; everything is drawn between its last two steps.

## Reading the city

- Each building's name is on its wall facing the street, for the nearest buildings; from above, on its roof.
- The crosshair, in the middle of the view, reads what it points at: a window names its file and what its light means; a
  wall or a roof names the building. The card uses the hover card's words and measures.

## Cameras

- The Buildings view gains rotate and tilt, and zoom to the cursor; a free camera flies anywhere, through anything.

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
- Reduced motion turns off the camera's sway and the running bounce.
