# Defaults ledger

One row per value the exploration spec leaves silent or qualitative.

| Default                 | Value                                    | Provenance                                                             | Safe range            |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------------- | --------------------- |
| Metres per street width | 10                                       | a street 10 m, a lot 5 m across, a floor 2.5 m: real proportions       | fixed                 |
| Step rate               | 120 Hz                                   | twice a 60 Hz screen; a step's move stays well under a walker's radius | 60 to 240 Hz          |
| Longest frame           | 0.1 s                                    | no tunnelling after a tab in the background                            | 0.05 to 0.25 s        |
| Person                  | 1.7 m tall, 0.3 m radius                 | an adult's height and shoulder half-width                              | fixed                 |
| Step up, snap down      | 0.45 m, 0.3 m                            | a kerb and a plinth; a drop a walker steps off without falling         | 0.2 to 0.5 m          |
| Ground                  | 0.25 m                                   | the roads' surface in the scene (0.025 street widths)                  | fixed                 |
| Walk, run, jump         | 1.6, 4.5, 3.5 m/s                        | a brisk walk, an easy run, a 0.6 m jump                                | ±30 %                 |
| Turn rate               | 10 rad/s                                 | a person turns to face a new way in about a third of a second          | 5 to 20 rad/s         |
| Shoulder side           | 0.6 m                                    | the crosshair passes beside the walker's head, not through it          | 0.4 to 0.8 m          |
| Sign pool, reach        | 24 buildings, 80 m                       | a street's worth each way; linux costs what takken.io does             | 12 to 48, 40 to 150 m |
| Sign size and place     | 0.42 m letters, 1.05 floors up           | a shop sign over the ground floor, readable across a street            | taste                 |
| Crosshair reach         | 150 m                                    | a few blocks: what a person can read across a street or a square       | 50 to 400 m           |
| Camera orbit            | 4.5 m back, 1.55 m up, pitch 0.25        | over the shoulder, the walker a third of the screen high               | taste                 |
| Wall gap, nearest       | 0.25 m, 0.4 m                            | short of a wall without clipping it; never inside the head             | fixed                 |
| Reach ease              | 0.3 s                                    | in at once (never through a wall), out without popping                 | 0.15 to 0.6 s         |
| Rounding                | 10⁻⁶ m                                   | a clear line measured a hair short is not a wall (the 25 cm flicker)   | fixed                 |
| Reach of a vehicle      | 1.2 m from its outline                   | an arm's length and a step                                             | 0.8 to 2 m            |
| Leave speed             | 1.5 m/s                                  | a fast walk: getting off a moving bicycle is a stumble                 | 0.5 to 3 m/s          |
| Bicycle                 | top 10 m/s, 0 to 25 km/h in about 2 s    | a city bicycle ridden hard                                             | taste                 |
| Car                     | top 32 m/s, 0 to 100 km/h in about 5 s   | GTA's arcade cars                                                      | taste                 |
| Chase camera            | from 1 m/s, 0.25 s                       | behind a moving vehicle, leaving the person's own look alone           | taste                 |
| Parking                 | bicycle 4 m, car 10 m ahead, at the kerb | in sight on landing, out of the walker's first steps                   | taste                 |
| Rapier slice            | 2,000 buildings                          | the page paints between slices on a phone                              | 500 to 10,000         |
| Retarget sampling       | 30 fps                                   | the library's own rate                                                 | 24 to 60 fps          |
| Walk clip speed         | 1 m/s                                    | measured from the planted foot by build-models.ts: 0.98                | measured              |
| Texture filter          | NEAREST                                  | the PS1 look heyheythere's pack is made for                            | fixed                 |
| Turn steps              | 15° a key, 10° a tilt key, 0.005 rad/px  | a few presses round a block; a drag across the screen is a half turn   | taste                 |
| Tilt range              | 15° to 85°                               | never edge-on to the ground, never quite straight down (plan view)     | 5° to 89°             |
| Roof names              | from 60 px a street width, at most 60    | a lot is then wide enough for a name; the screen stays readable        | 40 to 120 px, 20-100  |
| Free camera speed       | 20 m/s, ×1.25 a wheel step, 2 to 300     | a quick drone; the whole city crossed in seconds at the top            | taste                 |
