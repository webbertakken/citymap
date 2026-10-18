# Sources and animation libraries for GTA-style models

Where GTA-era (PS2-look, textured, realistic proportions) low-poly people and vehicles with usable licences live, which
sources cover several categories in one style, and which humanoid animation sets may be redistributed inside an
open-source repository. Researched 2026-10-18.

Evidence tags: **[M]** measured from a downloaded file, **[S]** stated by the source page or its API, **[V]** verified on
the source page itself, **[I]** inferred (reason given), **[A]** assumed.

## The answer in brief

- **Animations:** Quaternius **Universal Animation Library 1 + 2, Standard tiers** (CC0, free, scriptable from itch.io)
  are the backbone: idle, walk, jog, sprint, jump start/loop/land, roll, death, hit, swim, climb, sit enter/exit and a
  **driving loop**. Mesh2Motion's CC0 `human-base-animations.glb` repackages the same set on GitHub with a few extras.
  **Mixamo is out**: Adobe forbids "any type of free distribution of character or animation raw files".
- **Nobody** offers free, redistributable **cycling, motorbike riding or car get-in/get-out** clips. Those are cheap to
  make ourselves: procedural IK on a seated base pose for bikes, and two short authored clips for doors (ours, MIT).
- **Look:** no single free pack covers people, car, bicycle, motorbike and helicopter in a GTA style. The most
  consistent combination is the Sketchfab "retro/PSX, CC BY" cluster: **DanielZhabotinsky's "Retro Styled" cars**
  (20 fictional GTA-like cars), **WardsterSAW's PSX people and cars**, **wersaus33's PS1 vehicles**, plus a bicycle and a
  helicopter from the same texture-mapped low-poly idiom. All need a Sketchfab account/API token to download.
- **Licence trap found:** Elbolilloduro's photo-textured "Characters PSX" (the strongest GTA III look of all, ~1,000
  triangles) changed on itch.io from CC0 to "no re-upload" between 22 Aug and 15 Oct 2026, while the author's own
  Sketchfab upload still says CC BY 4.0. Mesh2Motion redistributes a copy labelled CC0. Treat as **flagged: ask the
  author** before use.

## Animation libraries: licence verdicts

| Library | Licence (verified, quoted) | Redistribute raw clips in a public MIT repo? | Format, rig | Verdict |
| --- | --- | --- | --- | --- |
| [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) (UAL1) | Pack page: "License CC0" [V]; itch page: "Free to use in personal, educational and commercial projects. (CC0 License)" [V]; `License.txt` in the zip: "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication" [M] | Yes (public domain dedication) | GLB + FBX, UE5-mannequin bone names (`pelvis`, `spine_01`, `clavicle_l`...), 65 joints [M] | **Use** |
| [Quaternius UAL 2](https://quaternius.com/packs/universalanimationlibrary2.html) | Same wording, "(CC0 License)" [V]; zip `License.txt` CC0 [M] | Yes | Same rig [M] | **Use** |
| Quaternius site-wide [QAL v1.0](https://quaternius.com/license.html) | "Last updated: 8/28/2026 ... You may not ... redistribute the Assets themselves" and "Changes will not apply retroactively to Assets you've already obtained under an earlier version" [V] | Only for assets released under QAL | n/a | Every pack page checked (16 incl. UAL1/2, Universal Base Characters, Cars, Public Transport, Downtown City MegaKit) still says CC0 [V]. Re-check the pack page and the zip's `License.txt` at download time; keep the zip's licence file. |
| [Mesh2Motion](https://github.com/Mesh2Motion/mesh2motion-app) animations | README: "The art assets (3d models, rigs, animations) are all licensed under CC0" [V]; `LICENSE-CC0.MD` [V] | Yes for animations [I: they are UAL (CC0), CMU-derived and the author's own mocopi captures] | GLB on GitHub, UE5-style rig, 66 joints [M] | **Use** (animations). Do **not** trust its CC0 label for its third-party character models (Sintel, Elbolilloduro; see below). |
| [Kenney Animated Characters](https://kenney.nl/assets/animated-characters-protagonists) (Protagonists/Retro/Survivors) | Page: "License Creative Commons CC0" [V]; zip: "License: (Creative Commons Zero, CC0)" [M] | Yes | FBX only; idle, run, jump [M]; 45 joints, Unity-humanoid names (`Hips`, `Spine`, `Chest`, `UpperChest`) [M] | Use if needed; three clips only |
| [CMU Graphics Lab Motion Capture](http://mocap.cs.cmu.edu/) | "This dataset of motions is free for all uses." and "You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form." [V] | Yes (free redistribution is not resale) [I] | ASF/AMC, C3D; BVH conversions exist | Usable for extra locomotion. No cycling, riding, driving or car-entry takes: searches for bike, bicycle and drive found none; "motorcycle pose" takes are calibration poses [V] |
| [Bandai Namco Research Motion Dataset](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset) | README: "CC BY-NC 4.0" for both datasets [V]; `LICENSE`: "Attribution-NonCommercial 4.0 International" [V] | Yes, with credit, non-commercial only | BVH; walk/run/turns in 7-15 styles [V] | **Flag (NC)**: fine for citymap today, blocks commercial forks |
| [100STYLE](https://zenodo.org/records/8127870) | Zenodo record licence `cc-by-4.0` [V] | Yes, with credit | BVH, 1.47 GB zip [S]; 100 locomotion styles | Usable for stylised walks; heavy to retarget |
| Ubisoft [LAFAN1](https://github.com/ubisoft/ubisoft-laforge-animation-dataset) | "Creative Commons Attribution-NonCommercial-NoDerivatives 4.0" [V] | No: retargeting is a derivative | BVH | **Reject** |
| [Mixamo](https://www.mixamo.com) | helpx FAQ: "You can use both characters and animations royalty free for personal, commercial, and non-profit projects" [V]. Adobe's pinned [Mixamo licensing FAQ](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775) (2022-09-29) lists under "NO, you cannot create...": "Any type of free distribution of character or animation raw files" and "Packages for 3D stock or asset store websites where character or animation raw files will be sold or distributed"; and: "really the only thing you can't do is distribute the raw character and animation files ... You may not distribute the files to customers or non-team members". Also: "The only research application Mixamo content can't be used in is training machine-learning models." [V] | **No.** A GLB/FBX of Mixamo clips committed to a public repo is free distribution of raw animation files to non-team members. Shipping the same file on GitHub Pages is the same file, freely downloadable. | FBX | **Reject** |
| [Ready Player Me animation library](https://github.com/readyplayerme/animation-library) | "licensed for use with Ready Player Me Avatars" and "You may not redistribute ... the Animations ... for commercial or non-commercial purposes" [V] | No | FBX/GLB | **Reject** |
| ActorCore / [Reallusion content](https://www.reallusion.com/license/content.html) | Royalty-free for products; "Request for content resell or redistribution ..." needs Enterprise arrangement [V] | No | FBX | **Reject** |
| Unity Starter Assets ([Unity Companion License](https://unity.com/legal/licenses/unity-companion-license)) | "in connection with the authoring and/or distribution of applications ... under a valid Unity ... Engine License" [V] | No (not a Unity project) | FBX | **Reject** |
| Rokoko free motion library | Licence page returned 404 [V]; terms not found | Unknown | FBX | **Reject (unclear)** |

### Coverage of what citymap needs

Clip names are the actual names inside the files [M].

| Need | UAL1 Standard (CC0) | UAL2 Standard (CC0) | Mesh2Motion (CC0) | Others |
| --- | --- | --- | --- | --- |
| Idle | `Idle_Loop`, `Idle_Talking_Loop` | `Idle_FoldArms_Loop`, `Idle_TalkingPhone_Loop` | `Idle_A`, `Idle_Subtle`, `Idle_Listening` | Kenney `idle` |
| Walk | `Walk_Loop`, `Walk_Formal_Loop` | `Walk_Carry_Loop` | `Walk`, `Walk_Female`, `Walk_Backwards`, `Strafe_left/right` | CMU, Bandai (NC), 100STYLE |
| Run | `Jog_Fwd_Loop`, `Sprint_Loop` | | `Jog`, `Sprint`, `Run_Female`, `Run Jump` | Kenney `run` |
| Jump | `Jump_Start`, `Jump_Loop`, `Jump_Land` | `NinjaJump_*` | `Jump_Start`, `Jump_air`, `Jump_Land`, `Jump_2` | Kenney `jump` |
| Fall | airborne `Jump_Loop`; `Roll`; `Death01` | `Hit_Knockback`, `LayToIdle` (get up) | `Hit_Knockback`, `LayToIdle`, `Death_A..D`, `Land_Three_Point` | none has a dedicated long fall [V] |
| Driving | `Driving_Loop` (1.7 s) | | `Driving` | none else free and redistributable |
| Get in/out of car | approximated by `Sitting_Enter` / `Sitting_Exit` | | `Sitting_Enter` / `Sitting_Exit` | **none** anywhere [V]; author two short clips ourselves |
| Cycling | none | | none | **none**. [OGA "Bicycle"](https://opengameart.org/content/bicycle) (CC-BY 3.0) animates the bike only; drive legs procedurally (two-bone IK to pedals) on a seated base |
| Motorbike riding | `Sitting_Idle_Loop` / `Driving_Loop` as a base | | same | **none**; one authored lean pose plus IK hands |
| Extras | `Swim_*`, `Crouch_*`, `Punch_*`, `Pistol_*`, `Interact` | `ClimbUp_1m`, `Slide_*` | `Climb Ladder`, `Pipe Climb`, `Ledge Hang`, `Turn_*` | |

### Animation data on the wire

- `UAL1_Standard.glb`: 7,618,436 bytes, 43 clips plus a 13,744-triangle mannequin, 65 joints [M].
- Mesh2Motion `human-base-animations.glb`: 5,656,648 bytes, 87 clips [M].
- An 18-clip citymap subset of UAL1 (idle, walk, jog, sprint, jump x3, driving, sit x3, roll, death, hit, swim x2, talk,
  interact), mesh removed, finger, scale and non-root translation channels dropped, resampled and meshopt-compressed
  with `@gltf-transform`: **1,014,244 bytes raw, 231,092 bytes gzipped** [M]. Loaded once, shared by every person.
  Further cuts (fewer clips, lazy-loading vehicle clips) are straightforward [I].

### Rig compatibility

- Mesh2Motion characters and Mesh2Motion animations share **identical bone names** [M], so clips play without
  retargeting.
- UAL1 versus Mesh2Motion: the only difference is `Head` versus `head` plus `head_leaf` [M]; a one-line rename.
- Kenney (Unity-humanoid names) and heyheythere (15 bones: `Hips`, `Spine`, `Head`, arms, legs) [M] need
  `SkeletonUtils.retargetClip` or an offline retarget; heyheythere has no neck or fingers.
- Any unrigged pick can be auto-rigged onto the UAL-compatible skeleton in the
  [Mesh2Motion web app](https://mesh2motion.org/) (MIT code, CC0 rigs) [V], which keeps the whole cast on one
  skeleton and one animation file.

## Where GTA-style assets live

| Source | Login to download | Scriptable | Licence culture | GTA-style supply |
| --- | --- | --- | --- | --- |
| **Sketchfab** | Search API open; **download needs an account or API token** (`Authorization: Token`) [V] | Yes with token | Per-model CC labels (CC0, BY, BY-NC, BY-SA...). "Free Standard" is Sketchfab's own licence (no standalone redistribution): reject. Many rips and fan copies carry CC labels | **Best**: retro/PSX/PS2 textured vehicles and people |
| **itch.io** | No, for free and pay-what-you-want items | **Yes** [M]: GET page for `csrf_token`, POST `/download_url`, GET that page for `data-upload_id`, POST `/<slug>/file/<id>?source=game_download&after_download_lightbox=1&as_props=1` with the token, follow the returned URL. Used here to fetch UAL1, UAL2, GermanCar and PSX People Free | Mostly **custom "no re-upload / no redistribution"** licences (zenithgridstudio, pizzadoggy, mfsch, oppicraft, Elbolilloduro now): incompatible with a public repo. Exceptions: Quaternius (CC0), sunfl0w (CC BY 4.0), heyheythere (CC BY 4.0), katcho (CC0) | Large PSX/horror scene; few urban vehicles under open licences |
| **OpenGameArt** | No; direct `sites/default/files/...` URLs [M] | Yes | Clear structured licence field (CC0, CC-BY, GPL) [V] | Some: GGBotNet PSX cars, retro compact car, bicycle |
| **poly.pizza** | No for files: `static.poly.pizza/<id>.glb` returns 200 [M]; the search API needs a key (401) [M] | Yes (scrape `/search`, then `/m/<id>` JSON has `Tris`, licence, `ResourceID`) | CC0 / CC-BY 3.0 per model [V] | Low: mostly flat-colour Google Poly, Quaternius, Kenney |
| **Quaternius** | No (via itch) | Yes (itch flow) | CC0 per pack [V]; QAL for new releases | Clean, realistic-proportion people; flat-shaded vehicles |
| **Kenney** | No; direct zip URLs on each asset page [M] | Yes | CC0 [V] | Toy style; Car Kit is 2,032-2,474 tris per car with separate wheels [M] |
| **GitHub** | No | Yes | Per repo | Mesh2Motion (animations), Bandai Namco (BVH) |
| **Zenodo / CMU** | No | Yes | CC BY 4.0 / "free for all uses" | Mocap only |

Traps seen while surveying (reject on sight):

- **Rockstar IP fan copies**: "GTA SA Voodoo (Chevrolet Impala 1960)" (MimiOfArtist), "Sabre Four Door"
  (cristian1996coronel, a GTA vehicle name), "CJ_Animated Gta Character" (Sufi.Gen). CC labels cannot license
  Rockstar's designs.
- **Game rips with CC labels**: Burnout garage and trucks (amogusstrikesback2), Silent Hill meshes (SilentQuest, BY-NC),
  Transformers and Disney Infinity models, Granny helicopter, a "RE2 PSX character extractor".
- **Real brands**: wersaus33's Toyota, VW, Honda and Kawasaki models are CC BY and fine on copyright, but carry
  trademarked badges and shapes [I]; GTA's own answer is parody brands, which DanielZhabotinsky's series already is.

## Packs and artists that cover several categories in one style

| Artist / pack | People | Car | Bicycle | Motorbike | Helicopter | Style | Licence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [WardsterSAW](https://sketchfab.com/WardsterSAW) (Sketchfab) | Yes: psx Cop, GreenJacket, Male 01/03 (rigged) | Yes: Monte Carlo + police cruiser, "lowpoly cars" | No | No | No | PS1/PS2 textured, realistic proportions | CC BY (some models "Free Standard" or BY-NC: pick per model) [V] |
| [DanielZhabotinsky](https://sketchfab.com/DanielZhabotinsky) "Retro Styled" | No | **20** fictional 70s-90s cars, 1,622-5,017 faces | No | No | No | PS2-era GTA, parody names | CC BY 4.0, plus "I unconditionally give you permission to use this model at your discretion" [V] |
| [wersaus33](https://sketchfab.com/wersaus33) "PS1 Low Poly" | No | Yes (vans, saloons, estate) 140-278 faces | No | Yes (Kawasaki Spectre) | No | PS1, photo-ish textures | CC BY [V] |
| [jellypack](https://sketchfab.com/jellypack) "PS1/Low Poly" | Pilot | No | No | No | Apache (BY), Ka-29 (BY-NC) | PS1 military | Mixed [V] |
| Quaternius | Universal Base Characters, Modular Men/Women | Cars (8), Public Transport (12) | No | No | No | Flat-shaded clean | CC0 [V] |
| Kenney | Animated Characters (blocky) | Car Kit (police, taxi, van...) | No | No | No | Toy | CC0 [V] |
| [GGBotNet PSX Style Cars](https://opengameart.org/content/psx-style-cars) | No | 8 cars incl. police and taxi | No | No | No | PS1 128 px | CC0 [V] |

No free source covers all five categories. Consistency therefore comes from matching **idiom** (diffuse-only,
low-resolution photo-ish textures, hard edges, realistic proportions) rather than one author.

## Candidates

Sketchfab download needs an account or API token for every Sketchfab row. Sketchfab figures are from the model API
(`faceCount`, `archives.glb.size`, `textureCount`) [S]; Sketchfab's licence label was read from the same API, which is
the page's own data (the HTML page is client-rendered and did not answer a plain fetch).

### People

| Name | Author | Source | Direct download | Licence | Format | Tris, size | Rig, animations | GTA fit | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| psx Cop | WardsterSAW | [Sketchfab](https://sketchfab.com/3d-models/40de6039d30b463f99f747eddb1c3ef4) | Token | CC BY 4.0 [V] | glTF/GLB via Sketchfab | 1,418 faces, GLB 217,644 B, 2 textures [S] | Rigged, 1 animation [S] | 5: GTA III beat cop in all but name | [jpg](https://media.sketchfab.com/models/40de6039d30b463f99f747eddb1c3ef4/thumbnails/32cd279c0f684240bf81a5c7c2fca9c6/23a9ebac53e2409695b6c1802321ee09.jpeg) |
| Character_Male_GreenJacket (Rigged) | WardsterSAW | [Sketchfab](https://sketchfab.com/3d-models/a6fa6763af6d4b90bc885e956c90d8ae) | Token | CC BY 4.0 [V] | GLB via Sketchfab | 668 faces, 148,524 B, 1 texture [S] | Rigged, 1 animation [S] | 4: plain street pedestrian | [jpg](https://media.sketchfab.com/models/a6fa6763af6d4b90bc885e956c90d8ae/thumbnails/c911442f614548a88fcc38eff62eeda0/c5b344bc04d8461696a9cce49b6a9555.jpeg) |
| PSXprop - Male Character 03 (Rigged) | WardsterSAW | [Sketchfab](https://sketchfab.com/3d-models/e0e9f6a3701e4ea4a9889e9111b294e4) | Token | CC BY 4.0 [V] | GLB via Sketchfab | 742 faces, 126,252 B [S] | Rigged, 1 animation [S] | 4: Vice City local | [jpg](https://media.sketchfab.com/models/e0e9f6a3701e4ea4a9889e9111b294e4/thumbnails/f171a9d45daa4c5c861de9e82ef04cf9/b3fd9dace0b34059abf673a4d38c0b0f.jpeg) |
| Characters_psx (79 characters) | Elbolilloduro | [Sketchfab](https://sketchfab.com/3d-models/d940162487c3493b9e203d624fdd763a); [itch](https://elbolilloduro.itch.io/characters-psx) | Token (Sketchfab); itch is scriptable but its licence forbids re-upload | **Flagged.** Sketchfab: CC BY 4.0 [V]. itch now: "you may not re-upload this asset ... elsewhere, regardless of whether it has been modified" [V]; Wayback copies of 2025-11-28, 2026-06-29 and 2026-08-22 read "The models in this package are under the CC0 license" [V] | FBX, .blend [S] | Whole pack 80,288 faces [S]; Mesh2Motion's rigged copies measure 868-1,308 tris and 282-446 KB with one PNG [M]; police_male cut to 87,740 B (512 px WebP) and 42,976 B (256 px WebP + meshopt) [M] | Unrigged on Sketchfab [S]; Mesh2Motion copies rigged to its skeleton [M] | 5: photo-mapped faces, exactly GTA III/VC | [jpg](https://media.sketchfab.com/models/d940162487c3493b9e203d624fdd763a/thumbnails/3e9cd4fa13284cc49f02c2422aa5239a/dcc8c571755d48919240ac1781abfcc9.jpeg) |
| PSX People Free | heyheythere | [itch](https://heyheythere.itch.io/psx-people-free) | Scriptable (itch flow) | CC BY 4.0: "use them in any game, commercial or not, change them and share them, as long as you credit them" [V]. Page also says "Made with AI assistance (code, text, models, textures and animations, all generated by code)" [V]: flag | GLB, FBX, OBJ, .blend | 1,054 and 1,170 tris, 296,892 and 304,400 B [M] | 15-bone rig; idle, walk, run, talk, wave, sit, cower, attack, hit, death [M] | 4: PS1 office worker, survivor | [png](https://img.itch.zone/aW1nLzMwODg4MTM1LnBuZw==/original/NhQc%2FI.png) |
| Animated Characters Protagonists | Kenney | [kenney.nl](https://kenney.nl/assets/animated-characters-protagonists) | [zip](https://kenney.nl/media/pages/assets/animated-characters-protagonists/608191acc4-1774773108/kenney_animated-characters-protagonists.zip) | CC0 [V][M] | FBX + PNG skins | 1,604 tris, 104,972 B as GLB [M] + 35-52 KB skin | 45 joints; idle, run, jump [M] | 2: chunky cartoon heads | `Preview.png` inside the zip |

### Cars

| Name | Author | Source | Direct download | Licence | Format | Tris, size | Separate parts | GTA fit | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Casini '75 (Retro Styled) | DanielZhabotinsky | [Sketchfab](https://sketchfab.com/3d-models/52d1fddd66ce4edfb360b09aa0a1b039) | Token | CC BY 4.0 + "I unconditionally give you permission to use this model at your discretion, modify it or implement it into a digital product" [V] | GLB via Sketchfab | 2,907 faces, GLB 681,472 B, 8 textures [S]. Over size: atlas to one 512 px WebP + meshopt, estimate 120-200 KB [I: police_male shrank 350 to 88 KB the same way] | Unknown until downloaded [A] | 5: a Vice City coupe | [jpg](https://media.sketchfab.com/models/52d1fddd66ce4edfb360b09aa0a1b039/thumbnails/28868ef1805947abaef48646e5cdc7ae/78b128a7f8ba425994911a1af65d709e.jpeg) |
| Pueblo '74 (Retro Styled) | DanielZhabotinsky | [Sketchfab](https://sketchfab.com/3d-models/d66b00e369af4d118c3310ab7156f7b5) | Token | as above [V] | GLB | 1,822 faces, 504,112 B, 9 textures [S] | Unknown [A] | 5 | [jpg](https://media.sketchfab.com/models/d66b00e369af4d118c3310ab7156f7b5/thumbnails/0875b0bc2e03420b8b1e76b2009fb6e0/56ced528471a4d73b36f1741de71c998.jpeg) |
| Stallion '70 (Retro Styled) | DanielZhabotinsky | [Sketchfab](https://sketchfab.com/3d-models/0a7e200181db468495485d09121029dc) | Token | as above [V] | GLB | 2,353 faces, 807,220 B, 11 textures [S] | Unknown [A] | 5 | [jpg](https://media.sketchfab.com/models/0a7e200181db468495485d09121029dc/thumbnails/6c25110e78cd4482aa0b6c301478c4e1/05ba9738c00a42499c2a8c7e0f01995e.jpeg) |
| low poly cars - Monte Carlo + Police cruiser | WardsterSAW | [Sketchfab](https://sketchfab.com/3d-models/0258b09b99a64eca8cd4279943de6dba) | Token | CC BY 4.0; "Free to use in any project" [V] | GLB | 1,800 faces for both, 389,632 B, 3 textures [S] | Unknown [A] | 5: San Andreas street cars and a cop car | [jpg](https://media.sketchfab.com/models/0258b09b99a64eca8cd4279943de6dba/thumbnails/43769760a35244289187d649a8761183/188df89f9dc74512bb6262152aff5275.jpeg) |
| PSX Style Cars (8 cars incl. police, taxi) | GGBotNet | [OpenGameArt](https://opengameart.org/content/psx-style-cars) | [zip](https://opengameart.org/sites/default/files/psx_style_cars_by_ggbot_august2023.zip) | CC0 [V] | OBJ, .blend, 128 px PNG | 515-856 tris per body [M: OBJ faces]; OBJ 24-41 KB + 128 px PNG | **Yes**: one shared `Wheel.obj` (44 tris) [M] | 3: PS1 rather than PS2 | [png](https://opengameart.org/sites/default/files/cars_cover_art.png) |
| GermanCar | Luca Anthony Schwarz (sunfl0w) | [itch](https://sunfl0w.itch.io/german-psx-car) | Scriptable (itch flow) | CC BY 4.0: "GermanCar is licensed under CC-BY 4.0 International License" [V][M] | FBX, .blend | 488 tris, 33,136 B as GLB, 128 px texture [M] | No, one mesh [M] | 3 | [png](https://img.itch.zone/aW1nLzE0Nzg4NjY4LnBuZw==/original/tIWI1G.png) |
| Car Kit (sedan, taxi, police...) | Kenney | [kenney.nl](https://kenney.nl/assets/car-kit) | [zip](https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip) | CC0 [V] | GLB + shared 12 KB colormap | 2,032-2,474 tris, 172-208 KB [M] | **Yes**: body + 4 wheels [M] | 2: toy look | (in zip) |

### Bicycles, motorbikes, helicopters

| Name | Author | Source | Licence | Tris, size | Parts, animation | GTA fit | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kawasaki Spectre - PS1 Low Poly | wersaus33 | [Sketchfab](https://sketchfab.com/3d-models/9c486accf04f41389b8d5ca01968ec06) (token) | CC BY 4.0 [V] | 481 faces, 103,180 B, 2 textures [S] | Unknown [A] | 4: PCJ-style street bike, real brand | [jpg](https://media.sketchfab.com/models/9c486accf04f41389b8d5ca01968ec06/thumbnails/6effce907fb14876bb536573b70d28b4/f98308b1e29741ec9b35b7081da2572c.jpeg) |
| [Mobile Optimized] Suzuki PV 50 | Rysky | [Sketchfab](https://sketchfab.com/3d-models/2417ca0dab054765981cbd7ddc5efd1c) (token) | CC BY 4.0 [V] | 3,744 faces, 2,134,272 B, 3 textures [S]; textures dominate, 512 px WebP brings it near 200 KB [I] | Unknown [A] | 4: a Faggio-like moped | [jpg](https://media.sketchfab.com/models/2417ca0dab054765981cbd7ddc5efd1c/thumbnails/a6e880d4cc454af7a38c8ef90076a360/84bb81c086354fafac2e1fe10f71f5ec.jpeg) |
| Ultra Low Poly Bicycles, set of 3 | kambu_ch | [Sketchfab](https://sketchfab.com/3d-models/fca3293dcac3417ebce7625f5261275c) (token) | CC BY 4.0 [V] | 3,110 faces for three, 176,368 B, 1 texture [S] | Unknown [A] | 3 | [jpg](https://media.sketchfab.com/models/fca3293dcac3417ebce7625f5261275c/thumbnails/ac31282488224255addfdac7b27f493f/33bbd5a00bd247f7904fa4ae9ff0a24d.jpeg) |
| Low-Poly Vintage Bicycle Model | wasabicats | [Sketchfab](https://sketchfab.com/3d-models/5297f7525763435c8ef2e97fd3a6d30d) (token) | CC BY 4.0 [V] | 2,656 faces, 521,868 B, 3 textures [S] | Unknown [A] | 4: textured black roadster | [jpg](https://media.sketchfab.com/models/5297f7525763435c8ef2e97fd3a6d30d/thumbnails/98f0a34d9daa4a2686ee8349d0242ad7/36b9f07cc9444b6b8f429d30e1fd4742.jpeg) |
| Bicycle | Clint Bellanger | [OpenGameArt](https://opengameart.org/content/bicycle), [zip](https://opengameart.org/sites/default/files/bicycle.zip) | CC-BY 3.0 [V] | 820 tris [S] | **Rigged, pedalling animation** [S] | 2: toon materials | [png](https://opengameart.org/sites/default/files/bicycle_preview.png) |
| helicopter Police | LeftysArt | [Sketchfab](https://sketchfab.com/3d-models/595f18c1672c44049deb3be2cabaf169) (token) | CC BY 4.0 [V] | 1,646 faces, 524,516 B, 1 texture [S]; resize texture to fit 500 KB | Unknown [A] | 4: police chopper | [jpg](https://media.sketchfab.com/models/595f18c1672c44049deb3be2cabaf169/thumbnails/2b003baac20040bd952c745dfd12a9d5/7ec7447e6e2e4c68b02ac9b68d417052.jpeg) |
| Low Poly Helicopter | antonmoek | [Sketchfab](https://sketchfab.com/3d-models/5bbed2de9baa4a13a7faa72653b78b64) (token) | CC BY 4.0 [V] | 1,930 faces, 202,876 B, 1 texture [S] | 1 animation (rotor) [S] | 3: clean civilian, flat colours | [jpg](https://media.sketchfab.com/models/5bbed2de9baa4a13a7faa72653b78b64/thumbnails/b4e9e8855aef470fadc920dd3af86d59/80f8d9a961394229b9a0a1122147e4e1.jpeg) |
| MD-500 Defender Helicopter | duanesmind | [Sketchfab](https://sketchfab.com/3d-models/da5daae0fe354269895b58c2ed72e2b8) (token) | CC BY 4.0 [V] | 1,865 faces, 2,588,952 B, 3 textures [S]; retexture or resize | 1 animation [S] | 3: military camo, Maverick-like shape | [jpg](https://media.sketchfab.com/models/da5daae0fe354269895b58c2ed72e2b8/thumbnails/d0bbec43c48243b6aafae1ed9f369c66/968d7db41f5342e685fbd88a2998b5d5.jpeg) |

Other packs checked and set aside: Quaternius Cars/Public Transport and poly.pizza vehicles (CC0/CC-BY, flat colour,
fit 2); Kenney Retro Urban Kit (CC0, only trucks); "Police Helicopter 2 (Unity3D)" (name suggests a re-upload, [I]);
pizzadoggy PSX Mega Packs, zenithgridstudio PS2 Civilians, mfsch, oppicraft, morvyne, retro-spud, kag3d (paid and/or
"no redistribution"); ciprient "PSX Cars [FREE]" ("No License / No Restrictions" yet "within your own projects":
unclear); boggle "2 Seater Coupe" (licence only in a comment: unclear); katcho Free Characters (CC0, but horror cast).

## Top 3 combinations

1. **Retro CC BY set on UAL animations (fit 4.5/5).** People: WardsterSAW PSX characters, widened with Elbolilloduro's
   Sketchfab pack once the author confirms. Cars: DanielZhabotinsky "Retro Styled" plus WardsterSAW's cop car.
   Motorbike: wersaus33 Kawasaki or Rysky PV 50. Bicycle: wasabicats vintage. Helicopter: LeftysArt police.
   Animations: UAL1 + UAL2 Standard (CC0), plus our own IK and two door clips. Costs: a Sketchfab token, a credits file,
   texture atlasing to hit budgets.
2. **No-login, scriptable set (fit 3/5).** People: heyheythere PSX People Free (CC BY, AI-made: flag). Cars: GGBotNet
   PSX Style Cars (CC0) and GermanCar (CC BY). Bicycle: Clint Bellanger (CC-BY 3.0, pedalling). Motorbike and
   helicopter still need Sketchfab or poly.pizza. Animations: UAL. Every file reachable by `curl`/bun; a PS1 rather
   than PS2 look.
3. **Pure CC0 (fit 2/5).** Quaternius Universal Base Characters on the native UAL rig, Quaternius Cars, Kenney Car Kit.
   Zero licence friction and zero retargeting, but it reads as a toy town, not Liberty City.

**Recommendation.** Take combination 1. Its parts share one idiom (diffuse-only photo-ish textures, hard silhouettes,
realistic proportions, parody brands) and every licence is CC BY 4.0 or CC0, verified on the source page. Each fits
the budgets after a texture pass (atlas, 256-512 px WebP, meshopt), which shrank a comparable PSX character from 350 KB
to 43-88 KB here. Put every person on the UAL/Mesh2Motion skeleton, auto-rigging with the Mesh2Motion app where needed,
so one shared CC0 clip file (about 230 KB gzipped for 18 clips) drives the whole cast. Author the missing pieces
ourselves: pedalling and handlebar IK for the bicycle, a lean pose for the motorbike, and car door enter and exit
clips. That keeps them MIT and avoids Mixamo, whose terms forbid exactly what a public repo does. Keep each asset's own
licence and credit line in an assets credits file; the repo's MIT licence does not cover them. Before relying on
Elbolilloduro's cast, write to the author to reconcile the itch "no re-upload" terms with the Sketchfab CC BY grant,
and never source it from Mesh2Motion's mirror.

## Method

- Sketchfab: `api.sketchfab.com/v3/search` and `/v3/models?user=` sweeps over about 40 queries (cars, PS1/PS2/PSX,
  motorbike, scooter, bicycle, BMX, helicopter, police helicopter, rigged characters, riding and driving animations),
  filtered by licence and face count; contact sheets of 36 thumbnails inspected.
- itch.io: search plus `bun` scripts reading each page's price, licence lines and files; free packs downloaded through
  the itch download flow above.
- OpenGameArt: advanced search for 3D art, licence field read per page; GGBotNet cars downloaded and counted.
- poly.pizza: 80 model pages scraped for `Tris`, licence and resource ID.
- Files measured with a `bun` GLB reader (triangles, joints, clips, images); FBX converted with FBX2glTF; texture and
  animation cuts tried with `@gltf-transform`.
