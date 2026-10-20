# Defaults ledger

One row per value the exploration spec leaves silent or qualitative.

| Default                  | Value                                            | Provenance                                                                | Safe range                |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------- |
| Metres per street width  | 10                                               | a street 10 m, a lot 5 m across, a floor 2.5 m: real proportions          | fixed                     |
| Step rate                | 120 Hz                                           | twice a 60 Hz screen; a step's move stays well under a walker's radius    | 60 to 240 Hz              |
| Longest frame            | 0.1 s                                            | no tunnelling after a tab in the background                               | 0.05 to 0.25 s            |
| Person                   | 1.7 m tall, 0.3 m radius                         | an adult's height and shoulder half-width                                 | fixed                     |
| Step up, snap down       | 0.45 m, 0.3 m                                    | a kerb and a plinth; a drop a walker steps off without falling            | 0.2 to 0.5 m              |
| Ground                   | 0.25 m                                           | the roads' surface in the scene (0.025 street widths)                     | fixed                     |
| Walk, run, jump          | 1.6, 4.5, 3.5 m/s                                | a brisk walk, an easy run, a 0.6 m jump                                   | ±30 %                     |
| Turn rate                | 10 rad/s                                         | a person turns to face a new way in about a third of a second             | 5 to 20 rad/s             |
| Shoulder side            | 0.6 m                                            | the crosshair passes beside the walker's head, not through it             | 0.4 to 0.8 m              |
| Sign pool, reach         | 24 buildings, 80 m                               | a street's worth each way; linux costs what takken.io does                | 12 to 48, 40 to 150 m     |
| Sign size and place      | 0.42 m letters, 1.05 floors up                   | a shop sign over the ground floor, readable across a street               | taste                     |
| Crosshair reach          | 150 m                                            | a few blocks: what a person can read across a street or a square          | 50 to 400 m               |
| Camera orbit             | 4.5 m back, 1.55 m up, pitch 0.25                | over the shoulder, the walker a third of the screen high                  | taste                     |
| Wall gap, nearest        | 0.25 m, 0.4 m                                    | short of a wall without clipping it; never inside the head                | fixed                     |
| Reach ease               | 0.3 s                                            | in at once (never through a wall), out without popping                    | 0.15 to 0.6 s             |
| Rounding                 | 10⁻⁶ m                                           | a clear line measured a hair short is not a wall (the 25 cm flicker)      | fixed                     |
| Reach of a vehicle       | 1.2 m from its outline                           | an arm's length and a step                                                | 0.8 to 2 m                |
| Leave speed              | 1.5 m/s                                          | a fast walk: getting off a moving bicycle is a stumble                    | 0.5 to 3 m/s              |
| Bicycle                  | Meijaard et al.'s benchmark                      | a published, validated roadster: self-stable from 4.3 to 6.0 m/s          | fixed                     |
| Rider gains              | 30, 10, 5, 1; 25 N·m at most                     | tracks the aimed lean at 0.8 to 13 m/s, overshoot under 0.06 rad          | ±30 %                     |
| Lean asked for           | 3 m turns, 0.6 rad, 1.5 rad/s                    | a tight city turn; 0.68 g, short of grip; leaning in under a second       | 0.4 to 0.7 rad            |
| Balance assist           | 1,500, 300, gone by 4 m/s                        | holds it at walking pace, where no steering can                           | taste                     |
| Low-speed wobble         | 6 N·m, 1.2 Hz, below 3 m/s                       | bars swing 0.15 rad at 1.2 m/s and settle above a run                     | taste                     |
| Gears                    | 7, 1.2 to 3.6, third to start                    | a city bicycle's hub: 4 to 11 m/s at 90 rpm                               | taste                     |
| Rider's pedalling        | 150 N·m, none past 140 rpm                       | about 550 W at its best: a rider standing on the pedals                   | ±30 %                     |
| Resistance               | 0.006 rolling, 0.5 m² drag                       | city tyres on asphalt; an upright rider                                   | 0.004 to 0.01, 0.4 to 0.7 |
| Brakes, grip             | back 600 N, front 850 N, 0.9                     | the back skids, the front lifts it (7.7 m/s²); dry asphalt                | grip 0.7 to 1             |
| Stoppie held at          | 0.3 rad                                          | a rider's hold short of going over the bars (0.67 rad)                    | 0.15 to 0.4 rad           |
| Foot down, up            | 0.6 and 1.2 m/s, 0.12 rad lean                   | a dab at a stop, pedalled away from                                       | taste                     |
| Falls                    | hit 3 m/s, lean 0.9 rad, 2.5 s down              | a knock at 11 km/h throws; a moment on the ground                         | taste                     |
| Parked vehicles          | every 24 m, 30 % bicycles, 30 % cars             | a street that looks lived in, with room between                           | taste                     |
| Parked kept              | 200 nearest the landing                          | a long walk's worth; linux costs what takken.io does                      | 100 to 1,000              |
| Vehicle pool             | 5, 3, 3 and 5 (16), every 0.25 s                 | a street's worth each way drawn, as before the motorbike                  | 12 to 24 in all           |
| Gamepad                  | 0.15 dead zone, 900 px/s look                    | worn sticks rest still; a half turn in about a second                     | taste                     |
| HUD                      | every 0.1 s at most                              | readable numbers that do not flicker or re-render each frame              | 0.05 to 0.25 s            |
| Bell                     | two strikes of 2,350 and 3,520 Hz                | a ding-ding, like a brass bicycle bell                                    | taste                     |
| Car                      | top 32 m/s, 0 to 100 km/h in about 5 s           | GTA's arcade cars                                                         | taste                     |
| Chase camera             | from 1 m/s, 0.25 s                               | behind a moving vehicle, leaving the person's own look alone              | taste                     |
| Parking                  | bicycle 4 m, car 10 m ahead, at the kerb         | in sight on landing, out of the walker's first steps                      | taste                     |
| Rapier slice             | 2,000 buildings                                  | the page paints between slices on a phone                                 | 500 to 10,000             |
| Retarget sampling        | 30 fps                                           | the library's own rate                                                    | 24 to 60 fps              |
| Walk clip speed          | 1 m/s                                            | measured from the planted foot by build-models.ts: 0.98                   | measured                  |
| Texture filter           | NEAREST                                          | the PS1 look heyheythere's pack is made for                               | fixed                     |
| Turn steps               | 15° a key, 10° a tilt key, 0.005 rad/px          | a few presses round a block; a drag across the screen is a half turn      | taste                     |
| Tilt range               | 15° to 85°                                       | never edge-on to the ground, never quite straight down (plan view)        | 5° to 89°                 |
| Roof names               | from 60 px a street width, at most 60            | a lot is then wide enough for a name; the screen stays readable           | 40 to 120 px, 20-100      |
| Free camera speed        | 20 m/s, ×1.25 a wheel step, 2 to 300             | a quick drone; the whole city crossed in seconds at the top               | taste                     |
| Nearby streets           | 150 m reach, kept to 200 m                       | two blocks each way round a car at speed; linux costs what takken.io does | 100 to 300 m              |
| Looking ahead            | 1.5 s at the player's speed                      | the streets a car reaches next are raised first                           | 0.5 to 3 s                |
| Re-centring              | every 256 m                                      | Rapier's 32-bit numbers stay to a few micrometres                         | 100 to 1,000 m            |
| Raising budget           | 2 ms a frame                                     | an eighth of a 60 Hz frame; 160 buildings at 12 µs, never waited on       | 1 to 4 ms                 |
| Keeping up               | half the time covered, over 2 s                  | Rapier past half of every frame leaves no room to draw                    | 0.3 to 0.8                |
| Car build                | 1,300 kg, middle 0.55 m up, 2.6 m wheelbase      | a GTA-size saloon that rolls only when pushed to                          | taste                     |
| Car springs              | 35, 0.3 m, damping 3.5 and 5                     | 7 cm of sag; it settles without bouncing                                  | 25 to 50                  |
| Car tyres                | friction slip 1.2                                | 0.96 g in a steady turn, as a road car                                    | 1 to 1.6                  |
| Car engine               | 300 N·m at 4,000, red line 6,500                 | 0 to 100 km/h in 4.4 s                                                    | taste                     |
| Car gearbox              | 5, 3.2 to 0.87 × 3.9, up 6,000, down 2,500       | no hunting: after a change the engine is within both                      | taste                     |
| Car brakes               | 30 a wheel, handbrake 60, side 0.4               | 8 m/s² on the footbrake; the back steps out on the handbrake              | taste                     |
| Car steering             | 0.6 rad, half by 22 m/s, 4 rad/s, grip 2         | a 10 m street's corner from 50 km/h; brisk, upright, straight on release  | taste                     |
| Parked two-wheelers      | bicycle 15 kg, motorbike 200 kg, base 0.4 wide   | real weights; a push tips it over its tyres, not its bars                 | fixed                     |
| Look round held          | 1.5 s, then eased in over 1 s                    | time to look and look back; the camera never snaps behind                 | 0.5 to 3 s                |
| Reverse                  | below 0.5 m/s, at most 8 m/s                     | S stops, then backs up as GTA's does                                      | taste                     |
| Righting                 | tipped past 60°, still for 2 s                   | a moment to see it lie, then back to the game                             | 1 to 4 s                  |
| Crash                    | 4 m/s lost in a step                             | a knock, not braking (8 m/s² is 0.07 m/s a step)                          | 2 to 8 m/s                |
| Car camera               | 6.5 m, +0.08 s · v to 9.5 m, chase 0.35 s        | the road ahead opens up with speed; a drift shows                         | taste                     |
| Motorbike build          | a chopper: 1.6 m, 0.12 m trail, 0.5 rad, 312 kg  | weave-stable from 7 m/s; a real chopper's slow capsize                    | taste                     |
| Motorbike rider          | 120, 40, 20, 4; 120 N·m; 8 m, 0.75 rad           | tracks the lean at 6 to 40 m/s within 0.2 rad                             | ±30 %                     |
| Motorbike engine         | 105 N·m at 3,500, red line 5,800                 | 0 to 100 km/h in 3.7 s, 157 km/h top                                      | taste                     |
| Motorbike gearbox        | 5, 12.5 to 4.6 overall, up 5,300, down 2,200     | first wheelies, second does not                                           | taste                     |
| Motorbike brakes         | back 1,800 N, front 4,000 N, grip 1.1            | the front stops at 10.8 m/s², the back at 5.4                             | grip 0.9 to 1.3           |
| Wheelie limit            | 0.6 rad                                          | the rider's hold short of going over backwards                            | 0.3 to 0.8 rad            |
| Motorbike parking        | 6 % of kerb places; 6 m behind the landing       | fewer than bicycles and cars; out of both lines, on a walker's diagonal   | taste                     |
| Pickups                  | 35 % of cars, drawn at 4.6 m                     | two shapes in the street; wheels match the car's physics                  | taste                     |
| Measuring traffic        | ?traffic=n, throttle 0.35, steering ±0.4         | slow circles near the player, for the phone measure                       | a measuring aid           |
| Load phases              | engine 0.35, models 0.15, walls 0.3, streets 0.2 | the engine and linux's walls the longest (takken.io: 159, 68, 7, 6 ms)    | taste                     |
| Helicopter build         | 2,250 kg, rotor 5.35 m, mast 3.06 m              | the AS350 B2's most at take-off, rotor and mesh                           | fixed by the model        |
| Most thrust              | 2 of its weight                                  | arcade: 8 m/s of climb within a second; lifts at 64 % rotor on the ground | 1.3 to 2.5                |
| Rotor spin               | up 0.2 a second, down 0.08                       | five seconds to fly, as GTA's; a slower wind-down                         | taste                     |
| Climb and sink           | 8 and 6 m/s, 1.5 m/s within 1.5 s of below       | brisk on a keyboard; touches down under 1 m/s                             | taste                     |
| Ceiling                  | 500 m                                            | the city's tallest are well under; fog bounds the far plane at 4 km       | 200 to 1,000 m            |
| Cyclic                   | 0.5 rad, spring 10 rad/s                         | arcade: moves off within 0.3 s, 0 to 50 km/h in under 3 s                 | 0.3 to 0.6 rad            |
| Hover assist             | 0.15 per m/s, at most the cyclic's 0.5 rad       | let go at 50 km/h, it hovers within about 25 m, coasting on 0.2 s         | taste                     |
| Climb assist             | gain 4 a second; height held at 0.5 a second     | a climb within a second; a gentle hold, so ground effect's cushion shows  | 2 to 6; 0.3 to 1          |
| Bank                     | at most 0.6 rad, coordinated                     | a turn at speed follows its nose                                          | 0.4 to 0.8 rad            |
| Tail rotor               | 1.2 rad/s, gain 5, most 4 rad/s²                 | a hover turns round in five seconds; heading held in a climb              | taste                     |
| Drag areas               | 6.5 m² ahead, 12 m² aside                        | top speed about 200 km/h at the cyclic's most; drift dies sideways        | taste                     |
| Helicopter shadow        | 0.45 dark on its skids, gone 80 m up, 11 × 2.6 m | its height reads at a glance; the city casts no other shadow              | 0.3 to 0.6; 40 to 150 m   |
| Hard hit                 | 5 m/s lost; rotor −4 % per m/s, at most half     | a brush slides; a crash nearly brings it down                             | 3 to 8 m/s                |
| Perch slide              | probe 0.6 m, eased at 4 m/s²                     | past a step's climb (0.45 m); off the edge in a second or two             | taste                     |
| Helipad                  | 24 to 400 m on, every 2 m, 0.5 m margin          | in sight of the landing, clear of the kerbs' vehicles                     | taste                     |
| Level                    | 2 m                                              | a walker and a vehicle further apart in height are on different levels    | 1 to 3 m                  |
| Helicopter camera        | 15 m, 4 m up, +0.1 s · v to 22 m, chase 0.6 s    | the rotor and the city ahead in view                                      | taste                     |
| Helicopter model         | albedo 512 px WebP, meshopt                      | 108 KB, inside the 500 KB budget                                          | 256 to 1,024 px           |
| Arms' hold on the bars   | 0.9 of full reach                                | elbows a little bent, as riders hold bars                                 | 0.8 to 1                  |
| Grip in the hand         | 0.6 from wrist to knuckles                       | the bar across the palm, short of the fingers                             | 0.4 to 0.8                |
| Fingers round a grip     | 0.9 rad a joint, thumb 0.5                       | three joints close about 150° round a bar                                 | 0.6 to 1.1 rad            |
| Body's lean to the bars  | 1 rad forward, 0.4 back                          | a racing crouch at most; a chopper rider sat back                         | taste                     |
| Head against the lean    | 0.7 of it                                        | the eyes stay on the road ahead                                           | 0.5 to 1                  |
| Forward along the saddle | at most 0.12 m                                   | a rider shuffles forward to reach high bars                               | 0 to 0.2 m                |
| Reach passes             | 8                                                | palms and balls of the feet within a millimetre                           | 4 to 12                   |
| Foot down at a stop      | 0.15 m ahead of the saddle, 0.25 m left          | under the hip, beside the machine, within reach                           | taste                     |
| Hips above the seat      | lower hip joint + a tenth of the thigh           | the pelvis rests on the thighs' tops                                      | measured                  |
| Wheel's ring             | 3 % of its radius, 3 rounds                      | the tyre's outer corners, not spokes or hub                               | 1 to 5 %                  |
| Bicycle contacts         | grip 10 cm, pedal 6 cm, saddle and stand 2 cm    | a hand's width, a pedal's, a surface's depth                              | measured                  |
| Motorbike contacts       | grip 0.21, seat step 0.05, pegs below 0.45, 0.1  | file units (0.474 m): a hand, 2.4 cm, 24 cm, 4.7 cm                       | measured                  |
| Kickstand swing          | 0.3 s, at once under reduced motion              | the spec's about 0.3 s                                                    | 0.2 to 0.5 s              |
| Marked roofs             | room plus 0.5 m, within 300 m, at most 6         | where the assist can set it down with room to spare                       | 0.3 to 1 m                |
| Landing assist           | within 10 m, gain 2, damping 2.8                 | a keyboard pilot lands on a marking from near it                          | 5 to 15 m                 |
| Centring                 | within 0.4 m, else no faster than 1.5 m/s        | it centres before a rotor reaches a neighbour                             | 0.2 to 0.5 m              |
| Roof marking             | 7 m across, amber H in a ring                    | a helipad's marking, readable from 30 m up                                | taste                     |
| Run's steps              | 2.45 + 0.1 · v a second, 0.72 m contact          | 174 a minute, 1.55 m, 0.16 s down at 4.5 m/s (Weyand 2000)                | measured                  |
| Run's foot               | lands 0.38 ahead, trails 0.3 m, heel 0.1 · v     | Novacheck 1998's angles; Muybridge plate 60's trailing leg                | taste                     |
| Runner's body            | hips 0.94 of the leg, ±3 cm, lean 0.12 rad       | an upright runner bouncing 6 cm                                           | taste                     |
| Runner's arms            | 0.45 rad about 0.2 back, elbows 90°, fist 0.6    | Muybridge's runner: hands at the waist, loosely closed                    | taste                     |
| Run blend                | 0.2 s; at once into the air                      | no leg reaches for the ground mid-jump                                    | 0.1 to 0.4 s              |
| Helicopter glass         | tint (0.45, 0.62, 0.72) linear, alpha 0.35       | a light sky-grey tint: the pilot and the far panes read through it        | alpha 0.25 to 0.5         |
| Cabin lining             | (0.035, 0.04, 0.045) linear, about #353a3e       | a dark cabin, as real ones are, so the glass reads as glass               | taste                     |
| Glass by its paint       | blue over red by 30, blue at least 90 (of 255)   | the panes' (60, 120, 150) against the hull's red, white, greys and frames | 20 to 60; 70 to 120       |
| Pilot's door window      | faces across 0.7, at least 0.45 m tall           | the door windows (0.57 to 0.63 m) over the lower door and chin windows    | 0.4 to 0.55 m             |
| Pilot's seat             | 0.38 m above the floor, halfway to the side      | a light helicopter's seat cushion; the right of two front seats           | 0.3 to 0.45 m             |
| Pedals                   | where the floor rises 0.1 m, 0.26 m apart, +5 cm | the toe board in the nose, a pedal's face                                 | 0.05 to 0.2 m             |
| Cyclic                   | 0.4 m ahead of the seat, 0.3 m above it          | the model has none: between the knees, as a light helicopter's            | taste                     |
| Collective               | 0.3 m in, 0.15 m ahead, 0.12 m above the seat    | the model has none: beside the left hip, as a light helicopter's          | taste                     |
| See-through order        | 2                                                | after signs and markings (0) and the shadow (1)                           | above every other order   |
