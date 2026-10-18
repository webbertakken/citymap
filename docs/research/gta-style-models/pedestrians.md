# GTA-style people: the player and pedestrians

The player character and the city's pedestrians: men and women in street clothes with realistic proportions, low-poly
and textured, rigged to a humanoid skeleton. Animations (idle, walk, run, jump, fall; sitting or riding) are a big plus.
The ideal is a pack of several people sharing one rig and one texture atlas. Researched 2026-10-18.

Budget per person: at most 400 KB (glb with textures) and 6,000 triangles.

Evidence tags: **[M]** measured from a downloaded file, **[S]** stated by the source page or its API, **[V]** verified
on the source page itself, **[I]** inferred (reason given).

## How this was researched

- **Sources searched:**
  - poly.pizza: 30 searches; 298 model pages read for their embedded JSON (`Tris`, `Licence`, `ResourceID`).
  - Quaternius: all 16 people-related pack pages, plus the licence page.
  - Kenney: the three Animated Characters packs.
  - OpenGameArt: advanced search, 3D art, 10 queries, 105 entries; 30 read in full.
  - Sketchfab: public search API, downloadable only, under 9,000 faces, 26 queries, about 570 results; 372 previews
    compared on contact sheets.
  - itch.io: author pages only. Its search and tag pages answered every fetch, headless Chrome included, with a
    Cloudflare challenge.
  - GitHub: PolygonalMind/100Avatars.
- **Measured** means downloaded and opened with `@gltf-transform/core` 4.5.1 in a bun script. The script counts
  triangles, skins, joints, textures and clips. FBX was converted with `FBX2glTF` 0.9.7 (npm `fbx2gltf`). Every
  shortlisted model was also rendered with three.js 0.186.1 in headless Chromium, mid-walk, from the front and from
  behind.
- **Optimised size** means the same file after a phone pipeline built from gltf-transform functions:
  - `dedup`, `prune`, `resample`, `weld`, `quantize`, then `meshopt` at level `high`.
  - Textures go to WebP at a stated size.
  - Flat-shaded models also lose their `NORMAL` attribute. Normals there only exist to split vertices, and three's
    GLTFLoader turns on `flatShading` when normals are missing. The renders confirmed it looks the same [M].
- **Sketchfab** downloads need an account or API token, and none was available, so no Sketchfab model was measured.
  Figures come from Sketchfab's own API (`faceCount`, which counts triangles, and `archives.glb.size`, the size of the
  GLB Sketchfab serves). Licences were read on each model page rendered in headless Chromium (its "CC Attribution /
  Creative Commons Attribution" block) [V].
- Sibling research: [sources-and-animations.md](./sources-and-animations.md) covers animation libraries and
  their licences in depth. This file only repeats what the people need.

## Ranking

1. **Quaternius Animated Men Pack + Animated Women Pack** (CC0). Eight people in everyday clothes: a tee and shorts,
   a shirt, long sleeves, a suit, a dress, a tank top, a casual woman and a pink-haired woman.
   - Realistic proportions, 1,786 to 2,776 triangles each [M].
   - One 31-bone rig whose bone names match across all eight [M].
   - 11 clips each: idle, walk, run, jump, running jump, sitting, standing up, death, clapping, punch, sword slash [M].
   - Each is about 480 to 570 KB as served, and 117 to 128 KB after the pipeline with every clip kept (38 to 41 KB
     gzipped) [M].
   - Direct glb URLs on poly.pizza, no login.
   - Flat colour, not textured.
2. **Wobble Blocks, PS2 Styled Characters** (CC0, OpenGameArt). A male and a female base:
   - "Inspired by games like Grand Theft Auto: Vice City" [V].
   - Textured with 128 x 256 body maps, 1,880 and 2,136 triangles [M].
   - A 40-bone humanoid rig, 47 to 50 KB each after the pipeline [M].
   - No clips, and plain grey outfits.
   - The truest GTA look among CC0 people, and the best player-character base.
3. **WardsterSAW and vinrax PSX people** (CC BY 4.0, Sketchfab). Hand-made PS1/PS2 townsfolk with real GTA III
   flavour:
   - WardsterSAW: a beat cop, a man in a green jacket and two locals.
   - vinrax: a cop with alternative textures, a secretary, a redneck and a scientist.
   - 626 to 2,346 triangles and 89 to 385 KB each [S], 256 or 512 px textures, rigged, at most one clip each.
   - Each needs a Sketchfab token to download.
   - The rigs differ from model to model.

### Recommendation

Use the Quaternius Animated Men and Women first: they are the only free pack that meets the whole brief in one
download.

- **Cast:** eight realistic people on one shared skeleton, each well under budget, with the locomotion and sitting
  clips citymap needs.
- **Shared clips:** the bone names match across all eight, so one copy of the clips can drive the whole crowd.
- **One draw call each:** gltf-transform's `palette` and `joinPrimitives` bake each person's six to nine flat colours
  into a tiny palette texture. That leaves one material and one draw call per person, 111 KB with every clip [M]. The
  same palette step can give all eight people one shared atlas.
- **Missing clips:** add a fall and a driving pose from Quaternius' CC0 Universal Animation Library (`Jump_Loop`,
  `Driving_Loop`) [M], retargeted with `SkeletonUtils.retargetClip`.

The look is clean, flat-shaded low-poly rather than GTA's textured grime. If the city settles on textured PSX cars
(the car research picks GGBotNet's 128 px PSX set, see [cars.md](./cars.md)), go textured instead:

- **Player:** a Wobble Blocks base, repainted into a Tommy-style shirt and jeans.
- **Pedestrians:** texture variants of the same two bases (one rig, many 128 x 256 skins), animated with the
  Universal Animation Library.
- **Accents:** WardsterSAW's and vinrax's cops and locals.

This is a genuine style fork: clean and complete now, or textured and closer to GTA with some painting and retargeting.

## Candidates

### 1. Animated Men Pack + Animated Women Pack, Quaternius

- **Source pages:**
  - [Animated Men](https://quaternius.com/packs/animatedmen.html) and
    [Animated Women](https://quaternius.com/packs/animatedwomen.html).
  - Per model on poly.pizza: [Man](https://poly.pizza/m/HMnuH5geEG), [Man](https://poly.pizza/m/fjHyMd5Wxw),
    [Man in Suit](https://poly.pizza/m/mQnGoME1ez), [Man in Long Sleeves](https://poly.pizza/m/DLptRuewTn),
    [Woman](https://poly.pizza/m/AQsd9ngvKU), [Woman Casual](https://poly.pizza/m/jpKRgGDxhk),
    [Woman in Dress](https://poly.pizza/m/zMyPlQXBzq), [Woman in Tank Top](https://poly.pizza/m/XqzeZGB7iU).
- **Direct downloads (no login) [M]:** `https://static.poly.pizza/<ResourceID>.glb`:

  | Model | ResourceID | Triangles [M] | glb as served [M] | Pipeline, all clips [M] | Pipeline, no clips [M] |
  | --- | --- | --- | --- | --- | --- |
  | Man (tee, shorts) | `3746be88-6799-4817-929b-6bc067c47caa` | 1,852 | 482 KB | 118 KB (38 KB gz) | 28 KB |
  | Man (shirt) | `985eacbf-9dde-44b7-9270-4e35c8400b13` | 1,854 | 486 KB | 123 KB (39 KB gz) | 33 KB |
  | Man in Suit | `66b57880-bcb0-479a-8d72-5c3e88afaa39` | 2,058 | 570 KB | 128 KB (41 KB gz) | 31 KB |
  | Man in Long Sleeves | `e6019b9f-aed0-400c-8df4-ce5b648e9b82` | 1,970 | 492 KB | 118 KB (39 KB gz) | 27 KB |
  | Woman | `906a0cbe-b0a4-4312-b898-0f974b6f6771` | 2,004 | 498 KB | 125 KB (40 KB gz) | 35 KB |
  | Woman Casual | `51d5abdd-bb87-4b8d-9967-21738ffb8437` | 2,776 | 572 KB | 124 KB (41 KB gz) | 34 KB |
  | Woman in Dress | `a642af96-e239-4c5f-b50d-7661ff51deec` | 1,786 | 470 KB | 117 KB (38 KB gz) | 26 KB |
  | Woman in Tank Top | `9a6a3e55-23ce-4d5c-89bc-7d3f30307ed0` | 1,983 | 528 KB | 120 KB (39 KB gz) | 30 KB |

  The packs' own Google Drive folders (FBX, OBJ, .blend, and a "Smooth_" variant of each person) are linked from
  the pack pages. They answered "Quota exceeded" on 2026-10-18, so poly.pizza is the dependable source.
- **Licence [V]:**
  - Each pack page reads "License CC0", linked to `creativecommons.org/publicdomain/zero/1.0/`.
  - Each poly.pizza page reads "Public Domain (CC0)", data `"Licence":"CC0 1.0"`.
  - Quaternius' newer [QAL v1.0](https://quaternius.com/license.html) applies only to assets released under it, and
    "Changes will not apply retroactively". These pack pages still say CC0.
- **Formats:** FBX, OBJ, .blend on Drive [S]; glb on poly.pizza [M].
- **Rig and clips [M]:**
  - One `HumanArmature` with 31 bones (`Bone, Foot.L, Body, Hips, Abdomen, Torso, Neck, Head, Shoulder.L,
    UpperArm.L, LowerArm.L, Palm.L, ...`, with IK pole targets).
  - Bone names are identical in all eight files, though rest positions differ slightly per person.
  - 11 clips, prefixed `Man_` or `Female_`: Idle (4.17 s), Walk (1.04 s), Run (0.88 s), Jump (1.04 s), RunningJump,
    Sitting (8.33 s), Standing, Death, Clapping, Punch, SwordSlash. There is no fall clip.
  - The rig is not Mixamo-named. Mixamo or Universal Animation Library clips need a bone map for
    `SkeletonUtils.retargetClip` [I: names differ].
- **Moving parts:** one skinned mesh, six to nine materials (flat colours), no textures [M].
- **GTA fit: 3.** Realistic proportions and ordinary street clothes, but a clean flat-shaded art style rather than
  textured.
- **Preview:** [animatedmen.jpg](https://quaternius.com/assets/images/fullres/animatedmen.jpg),
  [animatedwomen.jpg](https://quaternius.com/assets/images/fullres/animatedwomen.jpg).

### 2. PS2 Styled Characters, Wobble Blocks

- **Source:** [opengameart.org/content/ps2-styled-characters](https://opengameart.org/content/ps2-styled-characters)
  (2025-12-22).
- **Direct download (no login) [M]:**
  [ps2characterbase_0.zip](https://opengameart.org/sites/default/files/ps2characterbase_0.zip) (704,189 B). Also
  [the layered texture sources](https://opengameart.org/sites/default/files/ps2characterbasetexture_photoshop_and_affinity_0.zip).
- **Licence [V]:** licence field "CC0". The body text reads: "Inspired by games like Grand Theft Auto: Vice City and
  Star Wars Jedi Knight: Jedi Academy!" and "EDIT: Updated potential copywritten textures with photos of my own
  jeans, everything else is hand drawn."
- **Formats:** FBX, .blend, PNG and JPG textures [M].
- **Triangles and size [M]:** one FBX holds both people.
  - Male (`Masc`): 1,880 triangles. Female (`Femme`): 2,136 triangles.
  - As glb: 179 KB and 190 KB with textures. After the pipeline at 256 px WebP: 47 and 50 KB.
  - Textures: a 128 x 256 body map each, a 256 x 256 hair map and a 512 x 512 eye map.
- **Rig and clips [M]:**
  - 40 bones: `Hips, Spine, Spine1, Spine2, Neck, Head, Shoulder.L, UpperArm.L, ForeArm.L, Hand.L`, fingers,
    `UpperLeg.L, LowerLeg.L, Foot.L, ToeBase.L`.
  - The spine and head names match Mixamo's, but the limbs do not, so retargeting needs a short bone map [I].
  - No clips: the T-pose only.
- **Moving parts:** one skinned mesh per person with three materials (body, hair, eyes) [M].
- **Caveats:**
  - The zip's last two entries (`hair_brown.png`, `Masc_Texture01.png`) are corrupt at the source (`unzip`: "bad
    zipfile offset"). The FBX embeds all four textures, so nothing is lost [M].
  - `eye_0001_c.jpg` carries 2005 EXIF ("Adobe Photoshop CS", "ACD Systems Digital Imaging"). That sits oddly with
    "hand drawn" [M]. It is 13 KB, so repaint it before shipping.
  - Both people wear the same plain dark top and trousers [M], so every outfit has to be painted.
- **GTA fit: 4.** A PS2-era build and textured faces in the Vice City mould. The outfits are blank until painted.
- **Preview:** [ps2characterbase_0.png](https://opengameart.org/sites/default/files/ps2characterbase_0.png).

### 3. WardsterSAW and vinrax PSX people (Sketchfab)

Every model below needs a Sketchfab account or API token to download. Licence on every page: "CC Attribution /
Creative Commons Attribution" [V]. Triangles and GLB sizes are Sketchfab's own figures [S]. Both authors ask for credit.

| Model | Author | Triangles [S] | GLB [S] | Textures [S] | Rig, clips [S] | GTA fit | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [psx Cop](https://sketchfab.com/3d-models/40de6039d30b463f99f747eddb1c3ef4) | WardsterSAW | 1,418 | 217,644 B | 2, 512 px | rigged, 1 clip | 5: a GTA III beat cop in all but name | [jpg](https://media.sketchfab.com/models/40de6039d30b463f99f747eddb1c3ef4/thumbnails/32cd279c0f684240bf81a5c7c2fca9c6/9cb9e19b86684ffaa27d296da88637fc.jpeg) |
| [Character_Male_GreenJacket (Rigged)](https://sketchfab.com/3d-models/a6fa6763af6d4b90bc885e956c90d8ae) | WardsterSAW | 668 | 148,524 B | 1, 256 px | rigged, 1 clip | 4: plain street pedestrian | [jpg](https://media.sketchfab.com/models/a6fa6763af6d4b90bc885e956c90d8ae/thumbnails/c911442f614548a88fcc38eff62eeda0/8c0e022c9862443a8622b010c0f82f2b.jpeg) |
| [PSXprop - Male Character 03 (Rigged)](https://sketchfab.com/3d-models/e0e9f6a3701e4ea4a9889e9111b294e4) | WardsterSAW | 742 | 126,252 B | 1, 256 px | rigged, 1 clip | 4: Vice City local in a striped tee | [jpg](https://media.sketchfab.com/models/e0e9f6a3701e4ea4a9889e9111b294e4/thumbnails/f171a9d45daa4c5c861de9e82ef04cf9/75b698d44b91488ab410a5215765ad1d.jpeg) |
| [PSX prop - Male Character 01](https://sketchfab.com/3d-models/97d7219b3b844daf9f7c0ccb99b07bb9) | WardsterSAW | 646 | 101,528 B | 1, 512 px | not stated as rigged, 0 clips | 4: shirt-sleeved office man | [jpg](https://media.sketchfab.com/models/97d7219b3b844daf9f7c0ccb99b07bb9/thumbnails/fcd195313c08431b86c8eeb3c0b0e3ea/ddc284d5a0aa4a7cbba59fd37e6a6e54.jpeg) |
| [Cop Character PSX Style](https://sketchfab.com/3d-models/cop-character-psx-style-5576b8cbd33343f998c8b86d8bcfda48) | vinrax | 2,346 | 385,176 B | 3, 256 px ("some alt textures") | "simple humanoid rig, ready to use inside unity with mecanim", 0 clips | 5: hand-painted cop trio | [jpg](https://media.sketchfab.com/models/5576b8cbd33343f998c8b86d8bcfda48/thumbnails/626e82f99d3c4ca390f0cba05c5521ae/4d359e83e9794b4992678ac03946e19a.jpeg) |
| [Female Secretary Character PSX](https://sketchfab.com/3d-models/female-secretary-character-psx-8898a87225604a1fb335b47efff9c088) | vinrax | 932 | about 0.14 MB | not read | "Fully rigged with simple humanoid rig", 0 clips | 4: office worker | [jpg](https://media.sketchfab.com/models/8898a87225604a1fb335b47efff9c088/thumbnails/70f4a38ffe0f459e827a001d378bbfa4/18116bfe852b4bc08cf9bcd5bd116b2e.jpeg) |
| [Redneck Character PSX Style](https://sketchfab.com/3d-models/7b02de568d7c491b8be7bc50246789ad) | vinrax | 626 | 191,780 B | 1, 256 px | simple humanoid rig, 0 clips | 4: San Andreas countryside | [jpg](https://media.sketchfab.com/models/7b02de568d7c491b8be7bc50246789ad/thumbnails/99b9ff3e785746cfbdddd0c559dd6310/9e45ffca504a4d13a45637c5a52cc497.jpeg) |
| [Scientist PSX style](https://sketchfab.com/3d-models/0176c8a563dd45e29dcd58ea85f43853) | vinrax | 748 | 91,060 B | 1, 256 px | rigged, 0 clips | 3: lab coat, less urban | [jpg](https://media.sketchfab.com/models/0176c8a563dd45e29dcd58ea85f43853/thumbnails/f6918f1bbf7e45358eb312c7281c9fa2/6826d258fafd4ad7bea3cc5fbbcfd8e6.jpeg) |

- **Formats:** whatever the author uploaded, plus Sketchfab's automatic glTF/GLB [S].
- **Moving parts:** single skinned meshes [S].
- **Budget:** all fit as served [S].
- **Rig:**
  - Each model has its own rig, so pedestrians would need a retarget per author.
  - vinrax's are "Unity mecanim" humanoids [S]. The Mesh2Motion web app could re-rig any of them onto the Universal
    Animation Library skeleton (see [sources-and-animations.md](./sources-and-animations.md)) [I].
- **Avoid:** vinrax's "Male Character PS1-Style" is "Free Standard" [S], not CC, so it is out. So are his Silent Hill
  models (fan copies, BY-NC).

### 4. Ultimate Modular Men Pack + Ultimate Modular Women Pack, Quaternius

- **Source:** [Modular Men](https://quaternius.com/packs/ultimatemodularcharacters.html) (11 people),
  [Modular Women](https://quaternius.com/packs/ultimatemodularwomen.html) (10 people).
- **Urban picks on poly.pizza [M]:** `https://static.poly.pizza/<ResourceID>.glb`:

  | Model | ResourceID | Triangles [M] | As served | Pipeline, all 24 clips | Pipeline, 7 clips | No clips |
  | --- | --- | --- | --- | --- | --- | --- |
  | [Business Man](https://poly.pizza/m/JFrLIKqvCH) (suit) | `e599abbe-7d73-488c-9d7e-3ead281e705c` | 6,634 | 1,493 KB | 337 KB (100 KB gz) | 163 KB | 75 KB |
  | [Hoodie Character](https://poly.pizza/m/gKLBoRsyKe) | `bcd66ec5-5e81-4901-a222-47abc875fe2a` | 6,206 | 1,423 KB | 335 KB | 161 KB | 74 KB |
  | [Punk](https://poly.pizza/m/BTALZymknF) | `e56f23b5-3270-406f-8924-f77cad980c43` | 5,500 | 1,342 KB | 336 KB | | 74 KB |
  | [Beach Character](https://poly.pizza/m/DojKLcO34E) | `f771a536-1c18-4a47-bb56-ceea4b603455` | 6,574 | 1,470 KB | 339 KB | | 78 KB |
  | [Worker](https://poly.pizza/m/Yg2bQZO6Hj) (hi-vis, hard hat) | `3a5f3056-ffe6-42eb-bd52-122afcbd22b2` | 5,240 | 1,313 KB | 338 KB | | 77 KB |
  | [Farmer](https://poly.pizza/m/7pn3R6hPvE) | `81f2f0cf-6f53-4b57-92ea-dba0928620f2` | 5,476 | 1,338 KB | 337 KB | | 75 KB |
  | [SWAT](https://poly.pizza/m/Btfn3G5Xv4) | `713f6535-f4f3-4367-a4c6-ced126ae0936` | 7,752 | 1,524 KB | 342 KB | | 80 KB |
  | [Animated Woman](https://poly.pizza/m/nIItLV9nxS) (green dress) | `46d6db5a-3c9f-4238-8cdf-8eb7194498dc` | 6,108 | 1,457 KB | 334 KB | | 72 KB |
  | [Animated Woman](https://poly.pizza/m/qJ2gsTUBHL) | `ba7a1955-ea51-4cb9-a561-188bdef0a6c7` | 6,424 | 1,495 KB | 333 KB | | 71 KB |

  The 7 clips kept were idle, walk, run, roll, death, interact and wave. The other modular women (Formal, Casual,
  Punk, Suit, Worker, Soldier) are only in the pack's Google Drive `glTF` folder. It lists them, but downloads
  answered "Quota exceeded" [M].
- **Licence [V]:**
  - Both pack pages read "License CC0".
  - poly.pizza shows CC0 1.0 for these files.
  - One duplicate upload, "Suit" (`sOUciDsoVV`), carries poly.pizza's "CC-BY 3.0" label. The pack page's CC0 is the
    author's own statement.
- **Rig and clips [M]:**
  - 62 bones (`Root, Body, Hips, Abdomen, Torso, Chest, Neck, Head`, full fingers, `PT.L/PT.R` pole targets). The
    skeleton is byte-identical across the men.
  - 24 clips: Idle, Idle_Neutral, Walk, Run, Run_Back/Left/Right, Roll, Death, HitRecieve, Interact, Wave, Punch,
    Kick, plus gun and sword sets.
  - **No jump and no sitting.**
- **Moving parts:** four skinned meshes per person (body parts), 4 to 11 flat-colour materials, no textures [M].
- **Over budget as served:** about 1.3 to 1.5 MB. The pipeline brings them under (335 KB with every clip). Several
  sit at 6,200 to 7,750 triangles, so a meshoptimizer `simplify` pass to under 6,000 is needed [I: low-poly
  silhouettes tolerate 10 to 20 per cent].
- **GTA fit: 3.** The archetypes (suit, hoodie, punk, hi-vis worker, beach, SWAT) map straight onto GTA's
  pedestrians. Same flat look as candidate 1, slightly more detail.
- **Preview:** [modularcharacters.jpg](https://quaternius.com/assets/images/fullres/modularcharacters.jpg),
  [modularwomen.jpg](https://quaternius.com/assets/images/fullres/modularwomen.jpg).

### 5. PSX People Free, heyheythere (itch.io)

- **Source:** [heyheythere.itch.io/psx-people-free](https://heyheythere.itch.io/psx-people-free).
- **Download:** pay-what-you-want at $0, fetched without login by script [M]. The script posts the page's
  `csrf_token` to `/download_url`, reads `data-upload_id` from that page, then posts to
  `/file/<id>?source=game_download&after_download_lightbox=1&as_props=1`.
- **Licence [V][M]:** page: "CC BY 4.0: use them in any game, commercial or not, change them and share them, as long
  as you credit them". `LICENSE.txt` in the zip says the same.
- **Flag:** the page states "Made with AI assistance (code, text, models, textures and animations, all generated by
  code)" [V].
- **Formats:** GLB, FBX, OBJ, .blend, Godot addon [M].
- **Triangles and size [M]:** office worker 1,054 triangles and 290 KB; survivor woman 1,170 triangles and 297 KB.
  Each has one 1024 x 1024 atlas, and is 163 KB after the pipeline at 256 px.
- **Rig and clips [M]:**
  - 15 bones (`Hips, Spine, Head, LeftArm, LeftForeArm, LeftHand, ... RightFoot`): no neck, no fingers. The parts are
    rigid, PS1 style.
  - 10 clips: idle, walk, run, talk, wave, **sit**, cower, attack, hit, death.
- **GTA fit: 4.** Textured PS1 townsfolk (a shirt-and-tie office worker), but only two people. The 24-person pack
  is paid, under its own licence.
- **Preview:** [png](https://img.itch.zone/aW1nLzMwODg4MTM1LnBuZw==/original/NhQc%2FI.png).

### 6. Animated Characters (Protagonists, Retro, Survivors), Kenney

- **Source:** [kenney.nl/assets/animated-characters-protagonists](https://kenney.nl/assets/animated-characters-protagonists),
  plus `-retro` and `-survivors`.
- **Direct download [M]:**
  [kenney_animated-characters-protagonists.zip](https://kenney.nl/media/pages/assets/animated-characters-protagonists/608191acc4-1774773108/kenney_animated-characters-protagonists.zip)
  (the other two packs likewise).
- **Licence [V][M]:** page "License Creative Commons CC0". The zip reads "License: (Creative Commons Zero, CC0)".
- **Format:** FBX plus PNG skins [M].
- **Triangles and size [M]:**
  - One shared mesh, `characterMedium`: 1,604 triangles, 103 KB as glb, 27 KB after the pipeline.
  - 12 skins across the three packs (1024 px PNG, 34 to 72 KB): criminal, skater, cyborg, human, zombie, survivor.
- **Rig and clips [M]:** 45 joints, Unity-humanoid names (`Hips, Spine, Chest, UpperChest, LeftShoulder, ...`) plus
  foot IK controls. Clips: idle, run, jump only, each a separate FBX.
- **GTA fit: 2.** One rig with swappable skins is exactly the right structure, but the heads are oversized and
  cartoonish [M: rendered]. That breaks the "no big heads" rule.
- **Preview:** [preview.png](https://kenney.nl/media/pages/assets/animated-characters-protagonists/98921ae406-1674931821/preview.png).

### 7. More Sketchfab people (CC BY 4.0, token needed)

Licence verified on each rendered page as "CC Attribution / Creative Commons Attribution" [V]. Figures are
Sketchfab's own [S].

| Model | Author | Triangles | GLB | Rig, clips | GTA fit and why | Preview |
| --- | --- | --- | --- | --- | --- | --- |
| [psx man](https://sketchfab.com/3d-models/psx-man-41b0580d4d5c4cc183cfeae523ea0a09) | petya-petyavich | 2,651 | 968 KB | 1 clip | 4: photo-textured leather jacket and jeans. Over budget until its textures shrink | [jpg](https://media.sketchfab.com/models/41b0580d4d5c4cc183cfeae523ea0a09/thumbnails/46d8ce3b60864450aa19ac8c58a947a3/4fb7c54ab86d44839413d61dae81af09.jpeg) |
| [old man psx](https://sketchfab.com/3d-models/old-man-psx-dc42fa861cd645f489be5c9b3d2076fb) | petya-petyavich | 1,591 | 679 KB | 1 clip | 4: shabby old man, a perfect pedestrian | [jpg](https://media.sketchfab.com/models/dc42fa861cd645f489be5c9b3d2076fb/thumbnails/7f6d27709cc4446ea932e46a8eb4bed6/ec4875f22dd241fc968a880cbd9420ce.jpeg) |
| [Ronald - Ps1 styled character](https://sketchfab.com/3d-models/ronald-ps1-styled-character-0d4279bd2fe845f7aef522f1b4ae50d0) | saywhoom | 4,084 | 1.88 MB | 8 clips | 4: white tee and jeans, projection-mapped face. Heavy textures | [jpg](https://media.sketchfab.com/models/0d4279bd2fe845f7aef522f1b4ae50d0/thumbnails/5e21cc50acd74b118b6387661b2b01ca/ca3387b5ee134aab8f5c83008db7f0cd.jpeg) |
| [Thug LP](https://sketchfab.com/3d-models/thug-lp-6410256c1c41417bbc1de043983b3107) | whitecrang | 5,488 | 0.92 MB | rig not stated, 0 clips | 4: hand-painted tracksuit thug, San Andreas gang feel. 1024 px textures | [jpg](https://media.sketchfab.com/models/6410256c1c41417bbc1de043983b3107/thumbnails/c339451eb9564e15854e6acef9f1c779/69978467d97a489eb4312834c758b3b5.jpeg) |
| [Low-poly Man](https://sketchfab.com/3d-models/low-poly-man-7b93db2d46d847f191cf5e841b322856) / [Woman](https://sketchfab.com/3d-models/low-poly-woman-752778128b9a4b578586dbce40c0366f) / [Man Casual 2](https://sketchfab.com/3d-models/low-poly-man-casual-clothes-2-4a834adf1e33405c979e94555e7955c6) / [Woman Casual 3](https://sketchfab.com/3d-models/low-poly-woman-casual-3-b71bf9a6065c4836b291258f1d8587b9) | razvansavescu | 2,544 to 2,714 | 907 to 977 KB animated, about 349 KB casual | "unity rig ready", "mixamo ready"; idle, idle2, walk, run on the first two | 2: palette-textured, plain and stiff | [jpg](https://media.sketchfab.com/models/4a834adf1e33405c979e94555e7955c6/thumbnails/39bb09d90a6345ea9a2d73b073bf69ec/4057af4fe923406fb512a98970e3cba4.jpeg) |
| [Business Male/Female 1 to 4](https://sketchfab.com/3d-models/business-male-2--low-poly-style-53b9b72a1bc44192ab1ef01d450b1797) (8 models) | PolytricityLtd | 1,793 to 1,878 | 1.04 to 1.11 MB | "Rigged to the Unity Humanoid Skeleton", 1 clip | 3: a consistent office-worker set. Heavy for what it is | [jpg](https://media.sketchfab.com/models/53b9b72a1bc44192ab1ef01d450b1797/thumbnails/a528152665c34ea397136e95269f511b/cf47a857b22d4872b2fc735135f3c8b8.jpeg) |
| [Low Poly Man / Teenager / Woman - Rigged](https://sketchfab.com/3d-models/low-poly-man-rigged-8ea0cf8ee8604777900a32d1ecdf1c41) | mhkstudio | 2,908 to 3,157 | 379 to 406 KB | rigged, 0 clips | 2: flat, toy-like faces | [jpg](https://media.sketchfab.com/models/8ea0cf8ee8604777900a32d1ecdf1c41/thumbnails/7647714f74364cf89ee2022010a493de/04aca06ee6294e568da7aef7f5f04005.jpeg) |
| [Low poly ordinary man in shirt and pants](https://sketchfab.com/3d-models/low-poly-ordinary-man-in-shirt-and-pants-f658b9e1bb324f2ab1e9f00d7d6b4065) | Agor_ | 3,296 | 3.23 MB | 77 bones, 11 clips (walk, run, jump, idle, fight, pick up, steal, death) | 3: good clip set, but 4096 px PBR textures need cutting to 256 px | [jpg](https://media.sketchfab.com/models/f658b9e1bb324f2ab1e9f00d7d6b4065/thumbnails/5915f676da1a40b383de01a54bc356f2/e68a45c0dc7244449a7ee0fecedacf1d.jpeg) |
| [PS2 / PSX Lowpoly Character](https://sketchfab.com/3d-models/ps2-psx-lowpoly-character-d737592243fc433e842d745f8e7f296f) | Loco420 | 7,136 | 1.20 MB | rigged, 1 clip | 3: a credible PS2 look, but over budget, and its boilerplate description says nothing of how it was made | [jpg](https://media.sketchfab.com/models/d737592243fc433e842d745f8e7f296f/thumbnails/089b0d4c8fec4830a38f28d6d8e2026b/511d0349920b43eaa480f5cd9fc3444c.jpeg) |

### 8. Also measured or checked

| Item | Licence | Finding | GTA fit |
| --- | --- | --- | --- |
| Quaternius [Animated Woman Pack](https://quaternius.com/packs/animatedwoman.html) ([poly.pizza](https://poly.pizza/m/9kF7eTDbhO)) | CC0 [V] | 1,908 triangles, 32 x 32 palette texture, Mixamo-named 41-bone rig (`Hips, Spine, Spine1, ... HeadTop_End`), 10 clips incl. SitIdle, Sitting, Jump [M]. 1,347 KB as served, 297 KB after the pipeline [M]. **Flag:** the Mixamo bone names, `HeadTop_End` and `Toe_End` included, point to Mixamo's auto-rigger, and possibly Mixamo clips, which may not be redistributed raw [I] | 3 |
| Quaternius [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | CC0 [V] ("Free to use in personal, educational and commercial projects. (CC0 License)") | "Average 13k triangle count" [V], more than twice the budget. Bases in underwear, outfits only in a fantasy kit [V] | 2 |
| Quaternius [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) (clips, not people) | CC0 [V][M] (zip `License.txt`: "CC0 1.0 Universal") | Standard tier fetched from itch.io without login by headless Chromium [M]. 43 clips incl. Idle, Walk, Jog, Sprint, Jump_Start/Loop/Land, Sitting_Enter/Idle/Exit, **Driving_Loop**, Swim, Crouch, Death, Roll [M]. UE5-mannequin rig, 65 joints (`root, pelvis, spine_01, ...`) [M]. The animation source for any pick above | n/a |
| [100Avatars](https://github.com/PolygonalMind/100Avatars), Polygonal Mind | **CC BY 4.0** in the repo's `CCLicense.md` [V], while poly.pizza labels its copies CC0 [V]. The README adds "not to sell this avatars without any major modification" | VRChat avatars, Mixamo-rigged FBX and VRM. poly.pizza copies are unrigged, 2,450 to 5,315 triangles, 1024 px atlas [M]. Stylised and uneven | 2 |
| poly.pizza "Guy" ([BNq2fSOKXq](https://poly.pizza/m/BNq2fSOKXq)), Rafael | CC-BY 3.0 [V] | 2,164 triangles, Mixamo rig (65 joints, `mixamorig:` names), no clips, flat colours [M]. Blocky | 2 |
| poly.pizza "Rigged Character" ([yiQDOLP4Ry](https://poly.pizza/m/yiQDOLP4Ry)), Rafael | CC0 [V] | 4,864 triangles, Mixamo rig, untextured grey [M] | 1 |
| J-Toastie "Citizen", "Generic Male/Female", "Officer" (poly.pizza) | CC-BY 3.0 [V] | 3,548 to 4,956 triangles, animated [S]. Chibi proportions [M: previews] | 1 |
| OpenGameArt [Character guy (rigged)](https://opengameart.org/content/character-guy-rigged), EmoPreben | CC0 [V] | Realistic and textured, but 47,786 triangles, 2,241 KB [M]. A sculpt, not low-poly | 2 |
| yancharkin [Low Poly People Pack](https://yancharkin.itch.io/low-poly-people-pack) | CC BY-SA 4.0 [V] ("Creative Commons Attribution_ShareAlike v4.0 International") | 12 people, 900 to 1,500 triangles, 32-colour palette [V]. "Not rigged / No animations" [V] | 2 (flag SA) |
| OpenGameArt [Asian girl, PS2 style](https://opengameart.org/content/asian-girl) (McPato) | CC BY 4.0 [V] | "Triangles count is around 15.5k" [V] | 3 |

## Excluded

- **Elbolilloduro, Characters PSX:** the strongest GTA III look of all, photo-textured, about 1,000 triangles. But its
  itch.io page now reads "you may not re-upload this asset ... elsewhere, regardless of whether it has been modified
  or otherwise altered" [V]. Citymap's public repo would be a re-upload. The sibling research found the same page said
  CC0 until at least 2026-08-22, and a CC BY 4.0 Sketchfab copy. Ask the author before any use.
- **Fan copies of game characters:**
  - "CJ (Carl Johnson) 3d model" (abhishekambily, CC BY on Sketchfab) and poly.pizza's "Carl" (Matt Connors).
  - Aya Brea (Parasite Eve), Hinako Shimizu (Silent Hill f), Harry Mason, Felix (The Walten Files).
  - These are CC-labelled copies of characters owned by others, and the label cannot license the design.
- **Game rips:** "Thug1" to "Thug5 from FPS creator classic" (it_was_sonya): FPS Creator's stock models re-uploaded
  under CC BY.
- **Sketchfab "Free Standard":** vinrax's "Male Character PS1-Style", among 58 others in the search. Sketchfab's own
  licence forbids standalone redistribution.
- **Mixamo characters and clips,** including three.js's `Soldier.glb` and `Xbot.glb`. Adobe's FAQ forbids "Any type
  of free distribution of character or animation raw files" (quoted in
  [sources-and-animations.md](./sources-and-animations.md)).
- **Quaternius Ultimate Animated Character Pack, Toon Shooter characters and J-Toastie's set:** chibi or big-head
  proportions [M: previews].
- **CC BY-NC-ND and other NoDerivs models:** NoDerivs blocks the texture resize and decimation that the budget needs.

## Reproducing the measurements

- **poly.pizza:** each `/m/<id>` page embeds `"model":{...}` with `Tris`, `Licence`, `ResourceID` and `Animated`. The
  glb is at `https://static.poly.pizza/<ResourceID>.glb`, and the preview at `https://static.poly.pizza/<ResourceID>.jpg`.
  Fetch pages about one per second: faster bursts got Cloudflare challenge pages.
- **Pipeline:** `@gltf-transform/functions` 4.5.1. Drop `NORMAL` on flat-shaded models, then run `dedup`,
  `palette({ min: 2 })` and `joinPrimitives` (one material, one draw call), then `prune`, `resample`, `weld`,
  `quantize` and `meshopt({ level: 'high' })`. Textured models also get `textureCompress` to WebP at 256 px.
  Decoding needs `MeshoptDecoder` in three's GLTFLoader.
- **Sketchfab:** search is open (`api.sketchfab.com/v3/search?type=models&downloadable=true&max_face_count=...`).
  The per-model endpoint rate-limits hard (HTTP 429 for 10+ minutes after about 40 calls). Downloads need a token.
- **itch.io:** author subdomains answer plain `curl`, and free uploads can be fetched with the csrf flow above.
  `itch.io` search and tag pages answer with a Cloudflare challenge, headless Chromium included.
