# GTA-style cars

City cars for the walk's traffic and for the player to drive: a sedan, a hatchback, a taxi, a police car, a van or pickup,
in a GTA 3 / Vice City / San Andreas spirit, light enough for phones. Each wheel is a separate mesh, or easy to separate,
so it can spin and steer.

Budget per car: at most 400 KB (glb with textures) and 6,000 triangles.

## How this was researched

- Sources searched: Kenney, Quaternius, poly.pizza (search pages), OpenGameArt (advanced search, 3D art), itch.io
  (search and free asset tags), and Sketchfab (public API `api.sketchfab.com/v3/search`, downloadable only, under
  8,000 faces). About 90 candidates were looked at, and 38 were compared side by side on one contact sheet of their previews.
- **Measured** means downloaded and opened with a small bun script that reads the glb JSON chunk. It counts triangles
  per mesh node and lists node names, images, skins and animations. OBJ and FBX sources were first converted with
  `obj2gltf` 3.2.0 or `FBX2glTF` 0.9.7 (`fbx2gltf` npm), and textures were embedded with `gltf-transform copy` 4.5.1.
- **Stated** means read from the source: Sketchfab's own model data (`sketchfab.com/i/models/<uid>`, the data its page
  renders, which lists triangles, texture sizes and the source file) or the author's page. Sketchfab downloads need an
  account or API token, and none was available, so no Sketchfab model was measured.
- Licences were read on each source page: Kenney's asset page, OpenGameArt's licence field, the itch.io page
  description, and the Sketchfab model page rendered in headless Chrome (its `License:` block). No mirror was trusted.
- Wheel pivots were checked in the measured files. Where a wheel's node sits on its hub, it can spin in place.
  Where a wheel's vertices are baked around the car's origin, it needs a pivot group in three.js first.

## Ranking

1. **PSX Style Cars by GGBotNet** (CC0): the closest thing to GTA 3 traffic that exists for free. It has a wagon, a
   saloon, a hatchback, a minivan, a sedan in police and taxi liveries, a step van and a burnt-out wreck, all in one style.
   Each car measured 37 to 63 KB at 304 to 476 triangles. The files download without a login.
2. **PSX Vehicles Free by heyheythere** (CC BY 4.0): a boxy sedan and a pickup, ready-made glb files. The wheels are
   separate nodes on their hubs, with `drive` and `steer` clips included. Each measured 124 to 151 KB at 1,344 to 1,652
   triangles. Only two cars are free.
3. **Han66st's PSX-style cars** (CC BY 4.0, Sketchfab): a 2005 sedan, a 2020 hatchback, a blind van, a pickup, a
   Hong Kong taxi and an ambulance in one realistic hand. Each is stated at 724 to 3,732 triangles. The 1024 px
   textures put them over budget until they are resized. Downloading needs a Sketchfab account.

### Recommendation

Take GGBotNet's PSX Style Cars as the city's car set. It is the only free, CC0 pack that already _is_ the GTA 3 look:
boxy 80s and 90s American and European shapes, chrome grilles, a Caprice-style police cruiser and a yellow cab, and
crunchy 128 px textures. It also costs next to nothing: one car with its wheel is under 75 KB, and the whole set is
under 600 KB.

The price is a little assembly:

- **Conversion:** the files are OBJ, so the fetch script converts them with `obj2gltf`.
- **Wheels:** each car ships as a body plus one shared wheel model. A per-car table of four hub positions has to be
  written once, by eye, in a viewer.
- **Scale:** the author notes that scale varies between cars, so each car needs its own scale factor. The bodies come
  out about 6 m long, which is roughly 1.35 times a real car.
- **Missing pickup:** the set has no pickup. Fill that gap with heyheythere's pickup. It is CC BY 4.0, already glb, and
  its wheels are on hubs with steering. Its PS1 grime sits well beside GGBot's palette.

If assembling wheels is unwanted, Han66st's Sketchfab cars are the realistic, more modern alternative. Kenney's Car Kit,
already in the repo, stays the reliable fallback: everything is separated and named, but its toy proportions miss the
look.

## Candidates

### 1. PSX Style Cars, GGBotNet

- **Source:** https://opengameart.org/content/psx-style-cars (also https://ggbot.itch.io/psx-style-cars)
- **Direct download:** https://opengameart.org/sites/default/files/psx_style_cars_by_ggbot_august2023.zip (2.6 MB, no
  login; verified by curl)
- **Licence (verified):**
  - OpenGameArt: "License(s): CC0".
  - itch.io: "This game assets is licensed under a CC0 1.0 Universal."
  - Credit is optional: "GGBotNet".
- **Formats:** `.obj` + `.mtl` + `.png` per car, `.blend`, engine and door sound effects (`.ogg`).
- **Triangles and size (measured, converted to glb with the texture embedded):**

  | Car                      | Triangles | glb                                                      | Liveries in the pack                                  |
  | ------------------------ | --------- | -------------------------------------------------------- | ----------------------------------------------------- |
  | Car 01, station wagon    | 438       | 55.1 KB                                                  | 4 colours plus snow-covered                           |
  | Car 02, 4-door saloon    | 312       | 42.1 KB                                                  | 3 colours                                             |
  | Car 03, 3-door hatchback | 448       | 37.2 KB without texture; about 50 KB with it (estimated) | 3 colours                                             |
  | Car 04, minivan          | 476       | 58.7 KB                                                  | 4 colours                                             |
  | Car 05, sedan            | 454       | 54.5 KB                                                  | 3 colours                                             |
  | Car 05, police           | 472       | 61.9 KB                                                  | 2 textures: `car5_police` (blue) and `car5_police_la` |
  | Car 05, taxi             | 440       | 58.8 KB                                                  | yellow cab                                            |
  | Car 06, burnt-out wreck  | 304       | 63.4 KB                                                  |                                                       |
  | Car 07, 1920s car        | 457       | 53.4 KB                                                  | 6 colours                                             |
  | Car 08, step van         | 376       | 41.9 KB                                                  | 4 colours, including mail                             |
  | Wheel (shared)           | 28        | 8.6 KB                                                   |                                                       |
  - Textures are 128 x 128 PNG.
  - After `gltf-transform optimize --compress meshopt` the police car is 38.5 KB.

- **Rig and animations:** none.
- **Separate moving parts:** the wheels are separate, but they come as one shared `Wheel.obj` rather than four placed
  wheels. Each body is a single mesh without wheels, and each car needs four hub positions authored by hand.
  - Bodies are roughly 2.6 to 3.2 m wide and 6.2 to 7.5 m long in file units; the wheel is 0.92 m across.
  - The author's note: "The scale unit between cars is not correct."
  - `Car3.mtl` names `Car3.png`, but the file is `car3.png`. Rename it before converting, or the texture is lost on
    case-sensitive systems.
- **GTA fit: 5.** Liberty City traffic, as the PS2 rendered it: boxy period sedans, a wagon, a Caprice-style cruiser,
  a yellow cab and a step van.
- **Preview:** https://opengameart.org/sites/default/files/cars_cover_art.png (also `car01.png` to `car08.png` beside it)

### 2. PSX Vehicles Free, heyheythere

- **Source:** https://heyheythere.itch.io/psx-vehicles-free
- **Direct download:** `psx-vehicles-free-assets.zip`, 2.1 MB. It needs no login, but itch.io gives the file through a
  form post:
  1. GET the page and keep its cookie and `csrf_token`.
  2. POST `https://heyheythere.itch.io/psx-vehicles-free/file/19486019?source=view_game&as_props=1` with that token.
  3. Fetch the `url` in the JSON reply. A curl script did this successfully.
- **Licence (verified on the page and in `LICENSE.txt`):** "License CC BY 4.0 : use them in any game, commercial or not,
  change them and share them, as long as you credit them."
  - Credit line: "PSX Vehicles Free by heyheythere - https://heyheythere.itch.io/psx-vehicles-free - CC BY 4.0".
  - Flags:
    - The page states "Made with AI assistance (code, text, models and textures, all generated by code)".
    - It was published about two weeks before this research.
    - The full pack, which adds a police car, a taxi and vans, is paid and under its own licence.
- **Formats:** GLB, FBX, OBJ, `.blend`, a Godot addon. One 1024 x 1024 atlas, with shading baked into vertex colours.
- **Triangles and size (measured):**
  - `sedan_blue.glb`: 1,652 triangles, 151.2 KB.
  - `sedan_rusted.glb`: 1,652 triangles, 147.5 KB.
  - `pickup_red.glb`: 1,344 triangles, 123.8 KB.
  - Halving the atlas and adding meshopt brings the sedan to 131.5 KB, since the 1024 px atlas is most of the weight.
- **Rig and animations:** no skin. The sedan has node-animation clips `drive`, `steer`, `open_all`, `open_front_left`,
  `open_hood`, `open_trunk` and more; the pickup has `drive`, `steer`, `open_left`, `open_right`, `open_hood` and
  `open_tailgate`.
- **Separate moving parts:** yes. `*_wheel_front_left`, `*_wheel_front_right`, `*_wheel_rear_left` and
  `*_wheel_rear_right` sit on their hubs (for example `t[0.74, 0.31, 1.40]`), and the doors, hood and trunk are
  separate. Real-world scale.
- **GTA fit: 4.** San Andreas-era boxy sedan and pickup, but a little grimy and horror-tinted, and only two cars.
- **Preview:** https://img.itch.zone/aW1nLzMwNTc1MjE1LnBuZw==/original/vBD344.png

### 3. PSX-style cars, Han66st (Sketchfab)

A loose series by one author, with consistent realism and texture style. Everything here needs a Sketchfab account or
API token to download. The licence on every page reads "License: CC Attribution (Creative Commons Attribution)", which is
CC BY 4.0, verified in the rendered pages. Downloads are free.

| Model                                                                                                                                               | Triangles (stated) | Textures (stated)                                 | Preview                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [2005 Sedan PSX Style](https://sketchfab.com/3d-models/2005-sedan-psx-style-han66st-5d370d67172041dbae7d6f112255fdd9)                               | 724                | colour 1024 PNG 709 KB, roughness 1024 PNG 163 KB | [jpeg](https://media.sketchfab.com/models/5d370d67172041dbae7d6f112255fdd9/thumbnails/4968642a06804921b5ed544de8a650b8/f9b772a36812455aab2b5706a2005ebf.jpeg) |
| [2020 Small City Hatchback PSX Style](https://sketchfab.com/3d-models/2020-small-city-hatchback-psx-style-han66st-1c2fdb3a653e4cd2b6cd0fa1a5c7c1e9) | 826                | colour 1024 PNG 786 KB, roughness 1024 PNG 255 KB | [jpeg](https://media.sketchfab.com/models/1c2fdb3a653e4cd2b6cd0fa1a5c7c1e9/thumbnails/7c503260376a4712928465684fb7e26f/07f881e5513a49ad8f770a9f4e3ce8eb.jpeg) |
| [Blind Van PSX Style](https://sketchfab.com/3d-models/blind-van-psx-style-095ecbdd43ac450fa392dcb47c2478cb)                                         | 753                | colour 1024 PNG 835 KB, roughness 1024 PNG 235 KB | [jpeg](https://media.sketchfab.com/models/095ecbdd43ac450fa392dcb47c2478cb/thumbnails/f88f41303b0e4688ae5d17c3f9a8fd0f/ecfd9f0499924f76b6fa3e884f1218bf.jpeg) |
| [Pickup Truck](https://sketchfab.com/3d-models/pickup-truck-616761063ad845fe84e1d965bdce5595)                                                       | 1,193              | 1024 PNG 124 KB                                   | [jpeg](https://media.sketchfab.com/models/616761063ad845fe84e1d965bdce5595/thumbnails/5d264e5bb16d44e3b7ee0e15ff175619/b6dedaab48ce407cbc4a53e2929ce99c.jpeg) |
| [Low Poly Hongkong Taxi](https://sketchfab.com/3d-models/low-poly-hongkong-taxi-52f3e00f0f2a4c4a894c3082639d4431)                                   | 3,732              | 1024 PNG 136 KB                                   | [jpeg](https://media.sketchfab.com/models/52f3e00f0f2a4c4a894c3082639d4431/thumbnails/092ae029672841e68aac15285e62ce5e/892722dfcf2c4c9585ed1af4b90b6f18.jpeg) |
| [Ambulance 1](https://sketchfab.com/3d-models/ambulance-1-1b51ba24cf4a4cd5b945b3a6143d9939)                                                         | 2,074              | two 1024 PNGs, 99 KB and 89 KB                    | [jpeg](https://media.sketchfab.com/models/1b51ba24cf4a4cd5b945b3a6143d9939/thumbnails/a8696990e56d484a8fda28003f08cc24/bf17a988ce9f4985aa194864d1a1036a.jpeg) |

- **Direct download:** none without an account. Sketchfab's `/v3/models/<uid>/download` answered 401 without a token.
- **Formats:** Sketchfab's converted glTF, glb and USDZ, plus the source FBX or `.blend` per model.
- **Size (stated, estimated as glb):**
  - The three PSX-style models weigh about 0.9 to 1.1 MB each, almost all of it the 1024 px colour and roughness PNGs.
  - Dropping the roughness map and resizing the colour map to 256 px should bring each well under 150 KB without
    visible loss at street distance (estimated, not measured).
  - The pickup and taxi are already about 200 KB.
- **Rig and animations:** none.
- **Separate moving parts:**
  - The taxi page states "Separated Wheel".
  - Unverified for the others until downloaded. The PSX trio are 724 to 826 triangles, so separating wheels in Blender
    would be a few minutes each if needed.
- **GTA fit: 4.** Realistic proportions and textures, but contemporary Indonesian and Hong Kong traffic. That reads as
  GTA IV or V rather than the 80s and 90s.

### 4. Low poly cars, WardsterSAW (Sketchfab)

- **Models:**
  - [low poly cars - Monte Carlo + Police cruiser](https://sketchfab.com/3d-models/low-poly-cars-monte-carlo-police-cruiser-0258b09b99a64eca8cd4279943de6dba):
    2 cars, 1,800 triangles in total (stated).
  - [lowpoly cars](https://sketchfab.com/3d-models/lowpoly-cars-59453d0341ee4c41b12545ab7ee462e3): 3 cars, coupe and
    wagons, 2,012 triangles in total (stated).
- **Author:** Wardster (@WardsterSAW). Sketchfab, so an account is needed.
- **Licence (verified):**
  - Both pages show "License: CC Attribution (Creative Commons Attribution)".
  - The descriptions say "Free to use in any project."
  - Other WardsterSAW models are CC BY-NC, so pick these two by URL.
- **Formats:** source FBX (89 KB and 91 KB), plus Sketchfab's glTF and glb.
- **Textures (stated):**
  - The cruiser pair uses `carTexture01.jpg` (1024 px, 305 KB), `copCarpx.jpg` (256 px, 58 KB) and `copCarDetailpx.png`
    (256 px, 59 KB). Its glb is estimated at about 450 KB for both cars, below 250 KB each once the 1024 map is halved.
  - The trio uses three 256 px JPEGs of 22 to 66 KB, so each car is estimated well under 100 KB.
- **Rig and animations:** none. Wheels are separate: unverified.
- **GTA fit: 4.** San Andreas street cruisers (a Monte Carlo and a Caprice-like cop car), but only two or three cars and a
  heavier PS1 crunch.
- **Previews:**
  - [cruiser pair](https://media.sketchfab.com/models/0258b09b99a64eca8cd4279943de6dba/thumbnails/43769760a35244289187d649a8761183/188df89f9dc74512bb6262152aff5275.jpeg)
  - [trio](https://media.sketchfab.com/models/59453d0341ee4c41b12545ab7ee462e3/thumbnails/8ffd205005ca494180198690e19a5dc9/6d3ddc7c027e4706a7a2661098097d1c.jpeg)

### 5. Super Retro Compact Car Pack, Geibu3D (Cheese Animal Productions)

- **Source:** https://opengameart.org/content/super-retro-compact-car-pack
- **Direct download:** https://opengameart.org/sites/default/files/superretrocompactcarpack.zip (8.3 MB, no login)
- **Licence (verified):** OpenGameArt shows "License(s): CC-BY 4.0", and the page says "you can use them in your own
  games, commercial or otherwise". Credit "Cheese Animal Productions (Geibu3D)".
- **Formats:** FBX, OBJ, 16 textures at 1024 px PNG (400 to 540 KB each), and a small highway kit.
- **Models:** one 80s Golf-like hatchback body with 16 liveries, including taxi, police (with a light bar mesh) and three
  muscle variants (with an engine mesh).
- **Triangles and size (measured):**
  - Police: 481 triangles, 485 KB as glb with its 1024 px texture.
  - Taxi: 461 triangles, 93 KB with the texture resized to 256 px.
  - The `.mtl` points at an absolute Windows `.psd` path, so the texture must be wired by the fetch script.
- **Rig and animations:** none.
- **Separate moving parts:** four wheel meshes (34 to 39 triangles), plus licence plates, sirens and a taxi sign. The
  wheel vertices are baked around the car origin, so each wheel needs a pivot group at its centre in three.js.
- **GTA fit: 3.** Right era and proportions, but one body for every role, and bright arcade colours.
- **Preview:** https://opengameart.org/sites/default/files/compactcar_itch.png

### 6. Car Kit, Kenney (already used by citymap)

- **Source:** https://kenney.nl/assets/car-kit
- **Direct download:** https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip (4.8 MB)
- **Licence (verified):**
  - The page says "Creative Commons CC0".
  - `License.txt` says "License: (Creative Commons Zero, CC0) ... You can use this content for personal, educational,
    and commercial purposes."
- **Formats:** GLB (external `Textures/colormap.png`, 512 px, 12 KB), FBX, OBJ.
- **Triangles and size (measured, with the texture embedded):**

  | Model            | Triangles | glb      |
  | ---------------- | --------- | -------- |
  | sedan            | 2,032     | 178.0 KB |
  | hatchback-sports | 2,088     | 203.0 KB |
  | taxi             | 2,072     | 181.3 KB |
  | police           | 2,304     | 200.2 KB |
  | van              | 2,082     | 181.4 KB |
  | truck (pickup)   | 2,082     | 182.0 KB |
  | suv              | 2,474     | 212.0 KB |
  | delivery         | 2,476     | 244.4 KB |
  - Also in the pack: sedan-sports, suv-luxury, ambulance, firetruck, garbage-truck and tractors.
  - After meshopt, with joining disabled, the sedan is 33.7 KB.

- **Rig and animations:** none.
- **Separate moving parts:** yes. The nodes are named `body`, `wheel-front-left`, `wheel-front-right`,
  `wheel-back-left` and `wheel-back-right`, each on its hub (for example `t[0.30, 0.30, 0.66]`). Some models add
  `grill`, `spoiler`, `door`, and so on.
- **GTA fit: 2.** A complete, matching city set, but chunky toy proportions: big wheels, short bodies.
- **Preview:** https://kenney.nl/media/pages/assets/car-kit/81f9d77bc7-1775131953/preview.png

### 7. PS1 Police Car - Chevrolet Caprice 1978, zufari4 (Sketchfab)

- **Source:** https://sketchfab.com/3d-models/ps1-police-car-chevrolet-caprice-1978-3000906db39245ff8e519f85a50a8403
  (account needed).
- **Licence (verified):** "License: CC Attribution (Creative Commons Attribution)".
- **Formats:** source GLB (74 KB), plus Sketchfab's glTF.
- **Triangles and size (stated):** 600 triangles, one 256 px texture (33 KB), so about 75 KB.
- **Rig and animations:** none. Wheels are separate: unverified.
- **GTA fit: 4.** A Vice City cop car to the life, but it is the only car.
- **Preview:** https://media.sketchfab.com/models/3000906db39245ff8e519f85a50a8403/thumbnails/803d35b18d3347b09f19fa6a7cf952d1/eb447ba40ab542528311049ab2537fd9.jpeg

### 8. Carbon Motors E7 civilian, taxi and police, TSB3DMODELS (Sketchfab)

- **Sources (account needed):**
  - [civilian](https://sketchfab.com/3d-models/carbon-motors-e7-civilian-cities-skylines-19a2ee7b29914c90bfc5e008aa6fded5)
  - [taxi](https://sketchfab.com/3d-models/carbon-motors-e7-taxi-cities-skylines-210f95a0ea374c4fbdd27849f8c3c7a0)
  - [police](https://sketchfab.com/3d-models/carbon-motors-e7-police-cities-skylines-692c68c4f6374a3c8f114c11497fe1c2)
  - A sheriff variant also exists.
- **Licence (verified):** all three pages show "License: CC Attribution (Creative Commons Attribution)". The
  descriptions add "Not for sale!", which is consistent with CC BY for free use.
- **Triangles and size (stated):**
  - 1,540, 1,564 and 1,660 triangles.
  - Each has a 1024 px diffuse (470 to 650 KB) and a 1024 px normal map (870 to 885 KB), so about 1.4 MB each.
  - Dropping the normal map and resizing the diffuse to 512 px should land under 200 KB (estimated).
- **Rig and animations:** none. Wheels are separate: unverified.
- **GTA fit: 3.** A neat matching trio with realistic proportions, but a clean, modern Cities: Skylines look and one
  body shape. The model is a real (defunct) brand.
- **Preview:** https://media.sketchfab.com/models/692c68c4f6374a3c8f114c11497fe1c2/thumbnails/cf956b2f71aa4fa5bff372255c8df43c/a4b0fe56d7aa40389e5b7bcd5ddaa157.jpeg

### 9. Double Rocks cars, eightismore (Sketchfab)

- **Models (account needed):**

  | Model                                                                                                               | Triangles (stated) | Texture (stated)                       |
  | ------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- |
  | [Ford LTD Crown Victoria](https://sketchfab.com/3d-models/ford-ltd-crown-victoria-0097d3f7d6844162b38c587d61933c4f) | 4,850              | one palette PNG, 1024 px, about 200 KB |
  | [Dodge Diplomat 1981](https://sketchfab.com/3d-models/dodge-diplomat-1981-b758764d7f8746f4b2d95732fa8cc05a)         | 6,220              | one palette PNG, 1024 px, about 200 KB |
  | [Bronco sheriff](https://sketchfab.com/3d-models/bronco-double-rocks-car-fe533dcb116d4d35bf55fcf5c0bfb008)          | 4,224              | one palette PNG, 904 x 510 px, 47 KB   |
  | [Dodge D100 pickup](https://sketchfab.com/3d-models/dodge-d100-from-double-rocks-058400ba2b834c09b028b0acb4eb3eb8)  | 8,249              | one palette PNG, 1024 px, about 110 KB |

- **Licence (verified):** all four pages show "License: CC Attribution (Creative Commons Attribution)".
- **Over budget:** the Diplomat and D100 are over the triangle budget. Decimation would cost their look.
- **GTA fit: 3.** The cars are right for Vice City, but they are flat-shaded palette colour rather than textured.
- **Preview:** https://media.sketchfab.com/models/0097d3f7d6844162b38c587d61933c4f/thumbnails/f6bd258e2ab540a4b75ba46f9ce4c6c2/78d756e6a5fc4f61afed08b45f724b51.jpeg

### 10. Free Low Poly Vehicles Pack, rgsdev

- **Source:** https://opengameart.org/content/free-low-poly-vehicles-pack
- **Direct download:** https://opengameart.org/sites/default/files/free_low_poly_vehicles_pack_by_rgsdev.zip (1.4 MB)
- **Licence (verified):**
  - OpenGameArt shows "License(s): CC0".
  - The page body says "Licence is CC0."
  - `License.txt` says "This asset is under CC0 License ... Credit is not required."
- **Formats:** FBX only.
- **Triangles and size (measured as glb):** sedan 1,468 (108 KB), hatchback 1,378, taxi 1,516, police sedan 1,508, van
  1,392, pickup 1,658, SUV 1,748, muscle 1,732. All are 102 to 129 KB, with material colours and no textures.
- **Rig and animations:** none.
- **Separate moving parts:** four wheel nodes per car, on their hubs. FBX centimetres give them a scale of 100.
- **GTA fit: 2.** Good coverage and proportions, but untextured flat colour.
- **Preview:** https://opengameart.org/sites/default/files/low_poly_cars_pack_render_1.png

### 11. Also measured or checked

| Name and author                                                                                                                                        | Licence (verified)                                                              | Measured or stated                                                          | Wheels                                  | GTA fit                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| [Police Car, Kay Lousberg (KayKit)](https://poly.pizza/m/Uj7i2vlmir), also taxi, hatchback, stationwagon                                               | CC0 1.0 (poly.pizza page)                                                       | measured 1,316 triangles, 87.4 KB, gradient atlas                           | 4 named wheel nodes                     | 2: cute, chunky           |
| [Taxi, Quaternius](https://poly.pizza/m/x43lOScTpN), Cars pack                                                                                         | CC0 1.0 (poly.pizza page; quaternius.com "License CC0")                         | measured 3,278 triangles, 176.8 KB, flat colours                            | front wheels separate, rear axle merged | 2                         |
| [Retro Police Car, MadeByYeshe](https://sketchfab.com/3d-models/retro-police-car-987ac49f178d4fdb82ded6988a9e96e6)                                     | CC Attribution (page)                                                           | stated 1,212 triangles, 2048 px texture (378 KB)                            | unverified                              | 3: Jet Set Radio outlines |
| [Low-Poly Cars, spospider](https://sketchfab.com/3d-models/low-poly-cars-0c90176d96734808b57c6d1a5aca615f)                                             | CC Attribution (page)                                                           | stated 2,814 triangles for 3 cars, but 15 PBR maps at 2048 px (about 30 MB) | unverified                              | 3                         |
| [Generic 80s european car, henryviii](https://sketchfab.com/3d-models/generic-80s-european-car-af108d4773df4722a62420f65dd5b8fe)                       | CC Attribution (page)                                                           | stated 1,596 triangles, five 1024 px PBR maps                               | unverified                              | 3                         |
| [Low Poly American Muscle Car, T Allen Studios](https://opengameart.org/content/low-poly-american-muscle-car)                                          | CC-BY 4.0 (OpenGameArt)                                                         | measured 2,020 triangles, 134.6 KB without texture                          | separate front and rear wheel FBX       | 3: one muscle car         |
| [PSX Low-poly Renault, Camper Van and Truck, korkskrew2000](https://sketchfab.com/3d-models/psx-low-poly-car-renault-652615054a504e4b94933b870118e434) | **CC BY-SA** (Renault page; the others are listed the same by the API), flagged | stated 168 to 392 triangles                                                 | unverified                              | 3                         |

## Excluded

| Candidate                                                                                                                           | Why                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GTA SA Voodoo (MimiOfArtist), Car - GREENWOOD [GTA San Andreas], Grand Theft Auto Vice City, Sabre Four Door                        | Game vehicles or recreations of them, whatever the label says.                                                |
| PS2 car pack (zaidluigi64)                                                                                                          | Provenance unclear: one `ps2 cars.obj` with `Meshescar5police1_diff`-style names looks extracted from a game. |
| Checker Taxi Low Poly PSX, Low Poly Gage Ranger (Rysky)                                                                             | Twisted Metal's Yellow Jacket recreation; New Blood's car "published with permission". Third-party designs.   |
| PSX Passat LS 1978, PSX/Low Poly Pickup, PSX Bus, PS1 GT1-Style 1997 Dale Aristocrat                                                | Sketchfab "Free Standard" licence, not CC.                                                                    |
| BMW M5 (E39) [GT2/PSX Style] (SMLiberato), PSX Style 2008 Volvo V70                                                                 | CC BY-NC-ND or CC BY-NC-SA.                                                                                   |
| PSX Cars [FREE] (CipriEnt)                                                                                                          | "sold under a No License / No Restrictions model": an unclear licence.                                        |
| PSX Vehicles (jillk), PSX Cars pack (tttako), psx car pack (chrigamet-coder)                                                        | No licence stated on the page.                                                                                |
| PSX Style Vehicles (boggle), PSX Low-Poly Vehicles Pack (aquicor), PSX Vehicles Pack (mfsch), PSX Vehicles (heyheythere, full pack) | Paid, with a custom licence.                                                                                  |
| Low Poly City Traffic Free (eh98)                                                                                                   | 8,200 to 9,300 triangles per vehicle, untextured, AI-assisted.                                                |
