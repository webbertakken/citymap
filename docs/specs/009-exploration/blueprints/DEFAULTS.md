# Defaults ledger

One row per value the exploration spec leaves silent or qualitative.

| Default                 | Value                                    | Provenance                                                             | Safe range                |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| Metres per street width | 10                                       | a street 10 m, a lot 5 m across, a floor 2.5 m: real proportions       | fixed                     |
| Step rate               | 120 Hz                                   | twice a 60 Hz screen; a step's move stays well under a walker's radius | 60 to 240 Hz              |
| Longest frame           | 0.1 s                                    | no tunnelling after a tab in the background                            | 0.05 to 0.25 s            |
| Person                  | 1.7 m tall, 0.3 m radius                 | an adult's height and shoulder half-width                              | fixed                     |
| Step up, snap down      | 0.45 m, 0.3 m                            | a kerb and a plinth; a drop a walker steps off without falling         | 0.2 to 0.5 m              |
| Ground                  | 0.25 m                                   | the roads' surface in the scene (0.025 street widths)                  | fixed                     |
| Walk, run, jump         | 1.6, 4.5, 3.5 m/s                        | a brisk walk, an easy run, a 0.6 m jump                                | ±30 %                     |
| Turn rate               | 10 rad/s                                 | a person turns to face a new way in about a third of a second          | 5 to 20 rad/s             |
| Shoulder side           | 0.6 m                                    | the crosshair passes beside the walker's head, not through it          | 0.4 to 0.8 m              |
| Sign pool, reach        | 24 buildings, 80 m                       | a street's worth each way; linux costs what takken.io does             | 12 to 48, 40 to 150 m     |
| Sign size and place     | 0.42 m letters, 1.05 floors up           | a shop sign over the ground floor, readable across a street            | taste                     |
| Crosshair reach         | 150 m                                    | a few blocks: what a person can read across a street or a square       | 50 to 400 m               |
| Camera orbit            | 4.5 m back, 1.55 m up, pitch 0.25        | over the shoulder, the walker a third of the screen high               | taste                     |
| Wall gap, nearest       | 0.25 m, 0.4 m                            | short of a wall without clipping it; never inside the head             | fixed                     |
| Reach ease              | 0.3 s                                    | in at once (never through a wall), out without popping                 | 0.15 to 0.6 s             |
| Rounding                | 10⁻⁶ m                                   | a clear line measured a hair short is not a wall (the 25 cm flicker)   | fixed                     |
| Reach of a vehicle      | 1.2 m from its outline                   | an arm's length and a step                                             | 0.8 to 2 m                |
| Leave speed             | 1.5 m/s                                  | a fast walk: getting off a moving bicycle is a stumble                 | 0.5 to 3 m/s              |
| Bicycle                 | Meijaard et al.'s benchmark              | a published, validated roadster: self-stable from 4.3 to 6.0 m/s       | fixed                     |
| Rider gains             | 30, 10, 5, 1; 25 N·m at most             | tracks the aimed lean at 0.8 to 13 m/s, overshoot under 0.06 rad       | ±30 %                     |
| Lean asked for          | 3 m turns, 0.6 rad, 1.5 rad/s            | a tight city turn; 0.68 g, short of grip; leaning in under a second    | 0.4 to 0.7 rad            |
| Balance assist          | 1,500, 300, gone by 4 m/s                | holds it at walking pace, where no steering can                        | taste                     |
| Low-speed wobble        | 6 N·m, 1.2 Hz, below 3 m/s               | bars swing 0.15 rad at 1.2 m/s and settle above a run                  | taste                     |
| Gears                   | 7, 1.2 to 3.6, third to start            | a city bicycle's hub: 4 to 11 m/s at 90 rpm                            | taste                     |
| Rider's pedalling       | 150 N·m, none past 140 rpm               | about 550 W at its best: a rider standing on the pedals                | ±30 %                     |
| Resistance              | 0.006 rolling, 0.5 m² drag               | city tyres on asphalt; an upright rider                                | 0.004 to 0.01, 0.4 to 0.7 |
| Brakes, grip            | back 600 N, front 850 N, 0.9             | the back skids, the front lifts it (7.7 m/s²); dry asphalt             | grip 0.7 to 1             |
| Stoppie held at         | 0.3 rad                                  | a rider's hold short of going over the bars (0.67 rad)                 | 0.15 to 0.4 rad           |
| Foot down, up           | 0.6 and 1.2 m/s, 0.12 rad lean           | a dab at a stop, pedalled away from                                    | taste                     |
| Falls                   | hit 3 m/s, lean 0.9 rad, 2.5 s down      | a knock at 11 km/h throws; a moment on the ground                      | taste                     |
| Parked vehicles         | every 24 m, 30 % bicycles, 30 % cars     | a street that looks lived in, with room between                        | taste                     |
| Parked kept             | 200 nearest the landing                  | a long walk's worth; linux costs what takken.io does                   | 100 to 1,000              |
| Vehicle pool            | 8 of each kind, every 0.25 s             | a street's worth each way drawn; the rest unseen                       | 4 to 16                   |
| Gamepad                 | 0.15 dead zone, 900 px/s look            | worn sticks rest still; a half turn in about a second                  | taste                     |
| HUD                     | every 0.1 s at most                      | readable numbers that do not flicker or re-render each frame           | 0.05 to 0.25 s            |
| Bell                    | two strikes of 2,350 and 3,520 Hz        | a ding-ding, like a brass bicycle bell                                 | taste                     |
| Car                     | top 32 m/s, 0 to 100 km/h in about 5 s   | GTA's arcade cars                                                      | taste                     |
| Chase camera            | from 1 m/s, 0.25 s                       | behind a moving vehicle, leaving the person's own look alone           | taste                     |
| Parking                 | bicycle 4 m, car 10 m ahead, at the kerb | in sight on landing, out of the walker's first steps                   | taste                     |
| Rapier slice            | 2,000 buildings                          | the page paints between slices on a phone                              | 500 to 10,000             |
| Retarget sampling       | 30 fps                                   | the library's own rate                                                 | 24 to 60 fps              |
| Walk clip speed         | 1 m/s                                    | measured from the planted foot by build-models.ts: 0.98                | measured                  |
| Texture filter          | NEAREST                                  | the PS1 look heyheythere's pack is made for                            | fixed                     |
| Turn steps              | 15° a key, 10° a tilt key, 0.005 rad/px  | a few presses round a block; a drag across the screen is a half turn   | taste                     |
| Tilt range              | 15° to 85°                               | never edge-on to the ground, never quite straight down (plan view)     | 5° to 89°                 |
| Roof names              | from 60 px a street width, at most 60    | a lot is then wide enough for a name; the screen stays readable        | 40 to 120 px, 20-100      |
| Free camera speed       | 20 m/s, ×1.25 a wheel step, 2 to 300     | a quick drone; the whole city crossed in seconds at the top            | taste                     |
