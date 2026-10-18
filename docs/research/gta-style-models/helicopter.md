# Helicopter (and other low flyers)

Research into a light civilian, news or police helicopter for citymap, plus things that can fly low over the city as alternates. The look we want is GTA 3 / Vice City / San Andreas: realistic proportions, textured low poly, and light enough for phones.

- **Budget:** at most 500 KB and 8,000 triangles per glb, textures included.
- **Hard requirement:** main and tail rotors are separate meshes, or can be split off.
- **Licences:** checked on 2026-10-18 on each source page itself.
  - Sketchfab: the model page, rendered in headless Chromium, read for its "License:" block.
  - poly.pizza and OpenGameArt: the model page HTML.
  - No mirrors and no listing summaries were trusted.

## How numbers were obtained

- **Measured:** the glb was downloaded and parsed with a small Bun glb inspector, which counts triangles from accessor counts and lists nodes, meshes, materials, images and animations. This was possible for poly.pizza and OpenGameArt.
- **Stated (Sketchfab API):** Sketchfab needs an account or API token to download, and none was available. The numbers come from two places:
  - Sketchfab's own processed-archive metadata: `api.sketchfab.com/v3/search` → `archives.glb.{size,faceCount,textureCount,textureMaxResolution}`.
  - The model metadata: `sketchfab.com/i/models/<uid>` → `metadata.{totalTriangle,textureFiles,isRigged,materialCount}`.
- **Scene graph (verified):** the hierarchy of each Sketchfab candidate was read live through the public Sketchfab Viewer API (`api.getSceneGraph`, `api.getAnimations`). That is how rotor separation was confirmed without downloading. Pivot placement still needs checking after download.
- **Sketchfab download for a script:**
  1. A free account gives an API token.
  2. `GET https://api.sketchfab.com/v3/models/<uid>/download` with `Authorization: Token <token>` returns a short-lived signed `glb` URL.
  3. Every Sketchfab pick below needs this.

## Top 3

| Rank | Model | Licence | Tris | glb as stated | After cut-down (est.) | Rotors | GTA fit |
|------|-------|---------|------|---------------|-----------------------|--------|---------|
| 1 | [AS350 B2](https://sketchfab.com/3d-models/as350-b2-76cf31c232bf4514ab1794d28a2b0ee1) by ArcheoteryxFr | CC BY 4.0 | 5,740 | 1,779 KB | ~150-300 KB | separate: `rotor_pales`, `moyeu_arbre`, `rotor_anticouple` | 4 |
| 2 | [helicopter Police](https://sketchfab.com/3d-models/helicopter-police-595f18c1672c44049deb3be2cabaf169) by LeftysArt | CC BY 4.0 | 1,646 | 512 KB | ~80-130 KB | separate: `Cube` body + `Cylinder`, `Cylinder.001` | 4 |
| 3 | [Bell206 Helicopter](https://sketchfab.com/3d-models/bell206-helicopter-0d0455b7fbe04fb9a66886f306f8ae22) by kuuvalas | CC BY-NC 4.0 (flag: NC) | 462 | 1,469 KB | ~100-150 KB | separate: `rotor_plane_low`, `rotorsmall_low` (blurred-disc planes) | 5 |

### Recommendation

My pick is the **AS350 B2** by ArcheoteryxFr as the city's helicopter.

- **Why it fits:** the Écureuil is the real-world police, news and air-ambulance workhorse, and the silhouette GTA's Maverick borrows from. It has realistic proportions, a clean painted livery and CC BY, so it can be used without the NC caveat.
- **Rotors:** main blades, hub and tail rotor are already named, separate nodes.
- **Size:** 5,740 triangles is well inside 8,000. The 1.8 MB is almost all texture, so it drops to roughly 150-300 KB without losing the look:
  - three 2048² PBR maps → one 512² WebP albedo, either dropping the normal and metallic maps or keeping them at 256²
  - meshopt on the geometry
- **Police variant:** take LeftysArt's **helicopter Police**. It is a third of the triangles and already reads "POLICE" from the street. Its sibling **helicopter Emergency** shares the same mesh, so one download pattern gives two liveries.
- **Most GTA-feeling:** kuuvalas's **Bell206**, at a PS2-era 462 triangles with San Andreas-style motion-blurred rotor discs. It is CC BY-NC, so it is a fallback for this non-commercial project rather than the default.

## Candidates

Fields are the same for each model: author, source, download, licence (quoted), formats, triangles and size, rig and animations, rotors, GTA fit and preview.

### 1. AS350 B2

- **Author:** ArcheoteryxFr (`Archeopteryxfr`)
- **Source:** https://sketchfab.com/3d-models/as350-b2-76cf31c232bf4514ab1794d28a2b0ee1
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to http://creativecommons.org/licenses/by/4.0/. Sketchfab's licence requirements text: "Author must be credited. Commercial use is allowed."
- **Formats:** source FBX (214 KB). Sketchfab auto-converts to glb, gltf and usdz.
- **Triangles and size:** 5,740 triangles and 2,904 vertices (stated). glb 1,779 KB (stated, Sketchfab archive).
- **Textures:** three 2048² PBR maps, 1 material: `AlbedoTransp`, `MetallicSmoo`, `Normal`.
- **Cut-down:** albedo to 512² (or 1024²) WebP, metallic and normal dropped or taken to 256², plus meshopt. Estimate ~150-300 KB.
- **Rig and animations:** none, not rigged.
- **Rotors (verified scene graph):** separate nodes under `AS350_B2_complet_LP`: `rotor_pales` (main blades), `moyeu_arbre` (hub and shaft), `rotor_anticouple` (tail rotor), `patins` (skids), `cabine_poste_reservoir_soute` (body), `tuyere` (exhaust).
- **GTA fit: 4.** The archetypal light city helicopter in a red rescue livery, realistic and tidy. It is a touch cleaner than PS2 grit.
- **Preview:** https://media.sketchfab.com/models/76cf31c232bf4514ab1794d28a2b0ee1/thumbnails/c948853fcc7e49788de35e83ff237a13/0170053d4a53410eb96eb75c303b309a.jpeg
- **Note:** a re-upload exists, [AS350_B2 by kulunk](https://sketchfab.com/3d-models/as350_b2-48d812a1a2574c5182565902051ca846), with the same 5,740 triangles and no textures. Use the original.

### 2. helicopter Police

- **Author:** LeftysArt
- **Source:** https://sketchfab.com/3d-models/helicopter-police-595f18c1672c44049deb3be2cabaf169
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to http://creativecommons.org/licenses/by/4.0/
- **Formats:** source FBX (66 KB), plus Sketchfab auto glb and gltf.
- **Triangles and size:** 1,646 triangles and 875 vertices (stated). glb 512 KB (stated). One 1024² painted texture (`helipolice_texture.png`), 2 materials.
- **Cut-down:** texture to 512² WebP and meshopt. Estimate ~80-130 KB. It is only 12 KB over budget as is.
- **Rig and animations:** none.
- **Rotors (verified scene graph):** three separate nodes, `Cube` (body), `Cylinder` and `Cylinder.001`. That the two cylinders are the main and tail rotors is inferred from the hierarchy and the preview; check pivots on download.
- **GTA fit: 4.** A twin-engine police helicopter in a dark-blue "POLICE" livery with painted (not PBR) texture. Very Police Maverick.
- **Preview:** https://media.sketchfab.com/models/595f18c1672c44049deb3be2cabaf169/thumbnails/2b003baac20040bd952c745dfd12a9d5/247d475c28be46769c30ddf86a4e04f9.jpeg
- **Provenance:** the author's portfolio is all original small assets (fish, UFO, office chair, test level). No game-rip signals.

### 2b. helicopter Emergency (sibling of #2)

- **Author:** LeftysArt
- **Source:** https://sketchfab.com/3d-models/helicopter-emergency-646bbbc616384d9498067634b79dff62
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Triangles:** 1,738 (stated). Same node layout as #2: `Cube`, `Cylinder`, `Cylinder.001`.
- **Look:** yellow and red air-ambulance livery.
- **GTA fit: 4.** A ready-made second livery for an ambulance or news variant.
- **Preview:** https://media.sketchfab.com/models/646bbbc616384d9498067634b79dff62/thumbnails/fecb9f7405534181a8806c547608d4bc/71689fd4669142ceb229a4b6527bf25c.jpeg

### 3. Bell206 Helicopter (flag: NC)

- **Author:** kuuvalas
- **Source:** https://sketchfab.com/3d-models/bell206-helicopter-0d0455b7fbe04fb9a66886f306f8ae22
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution-NonCommercial / Creative Commons Attribution-NonCommercial", linking to http://creativecommons.org/licenses/by-nc/4.0/. Requirements text: "Author must be credited. No commercial use."
- **Formats:** source `.blend` (1.2 MB), plus Sketchfab auto glb and gltf.
- **Triangles and size:** 462 triangles and 290 vertices (stated). glb 1,469 KB (stated).
- **Textures:** 6 textures:
  - body PBR at 1024²: albedo, spec-gloss-AO and normal
  - skids at 512²: base and normal
  - `rotor_helicopter.png` at 512², the blurred rotor disc
- **Cut-down:** body albedo to 512² WebP, normal and spec dropped, rotor disc to 256² (alpha), meshopt. Estimate ~100-150 KB.
- **Rig and animations:** 1 animation clip, "Animation" (3.13 s), presumably the rotor spin. Not rigged.
- **Rotors (verified scene graph):** separate top-level nodes: `rotor_plane_low` (main rotor, as a motion-blurred disc plane) and `rotorsmall_low` (tail rotor). The body is split into `Body_low`, `bodytop_low`, `skids`, `stable*`, `whing*` and `stick_low`.
- **Rotor caveat:** blurred discs look right in flight, as in San Andreas, but odd when parked. A simple blade mesh may be wanted for the "engine off" state.
- **GTA fit: 5.** The Bell 206 JetRanger is the classic news and police chopper. White and red livery, and a PS2-level polygon count.
- **Preview:** https://media.sketchfab.com/models/0d0455b7fbe04fb9a66886f306f8ae22/thumbnails/6a8d4f3b795b472594f71ca607db3e5c/bcac4f3e8ec046e3b6b93c6b8d9cb8be.jpeg
- **Provenance:** the author's other uploads are custom game trains ("specially shortened for the needs of the game engine"). They look original. No game-rip signals.

### 4. Eurocopter "Ecureil EC145" (flag: NC)

- **Author:** BlueMesh
- **Source:** https://sketchfab.com/3d-models/eurocopter-ecureil-ec145-db2cc9a069034cd2a28cd470864b66e7
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution-NonCommercial / Creative Commons Attribution-NonCommercial", linking to /by-nc/4.0/. The description adds: "If you use this model you have to credit me."
- **Formats:** source `.blend` (715 KB), plus Sketchfab auto glb and gltf.
- **Triangles and size:** 4,950 triangles (stated). glb 36,659 KB (stated).
- **Textures:** five 4096² PBR maps, a 1024² decals texture and a 512² ground AO.
- **Cut-down:** base colour to 512² or 1024² WebP, decals to 512² and the other maps dropped. Estimate ~250-400 KB. This is a heavy texture cut, but the livery is mostly flat colour plus decals, so it should hold.
- **Rig and animations:** none.
- **Rotors (verified scene graph):** many separate nodes. `Circle` has four `Plane.00x` children, which is likely the rotor head with its four blades (inferred). A Fenestron-style tail is among the `Circle.00x` nodes. Rotor nodes need identifying by hand after download.
- **GTA fit: 4.** A detailed, realistic Sécurité Civile air ambulance, but its 4K PBR heritage is more modern than PS2.
- **Preview:** https://media.sketchfab.com/models/db2cc9a069034cd2a28cd470864b66e7/thumbnails/0f490258fc2348cc845c0a239cb6f2a8/13df4fce50a34fa0ab61a61c5880e122.jpeg
- **Note:** despite the name, the shape is an EC145 or BK117, not an Écureuil.

### 5. MD-500 Defender Helicopter

- **Author:** Duane's Mind (`duanesmind`)
- **Source:** https://sketchfab.com/3d-models/md-500-defender-helicopter-da5daae0fe354269895b58c2ed72e2b8
- **Download:** Sketchfab only; needs an account or API token. The author says it is also free on the Unity Asset Store, but that link was removed from the page.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Formats:** source FBX (9 MB, animation baked), plus Sketchfab auto glb and gltf.
- **Triangles and size:** 1,865 triangles (stated). glb 2,528 KB (stated).
- **Textures:** three 1024² textures: `MD500-TXTR3`, `Cockpit_TXTR` and `Cockpit_ILLUM`.
- **Cut-down:** to 512² WebP and meshopt. Estimate ~150 KB.
- **Rig and animations:** 1 clip, "Rotor Rotation" (1.21 s).
- **Rotors (verified scene graph):** separate `Top_rotor` and `Tail_Rotor` under `Helicopter`, plus `Cockpit` and `Glass`.
- **GTA fit: 3.** Great proportions and a modelled interior, but the livery is military camouflage with a gun pod. A civilian repaint, or dropping the pod, is needed. The description mentions "4 different skins", which were not verified.
- **Preview:** https://media.sketchfab.com/models/da5daae0fe354269895b58c2ed72e2b8/thumbnails/d0bbec43c48243b6aafae1ed9f369c66/5d1b3937f14d459b83e9aec52839c350.jpeg

### 6. Low Poly Helicopter

- **Author:** antonmoek
- **Source:** https://sketchfab.com/3d-models/low-poly-helicopter-5bbed2de9baa4a13a7faa72653b78b64
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Formats:** source FBX (159 KB), plus Sketchfab auto glb and gltf.
- **Triangles and size:** 1,930 triangles (stated). glb 198 KB (stated). One 1024² colour palette texture.
- **Rig and animations:** 1 clip, "Main" (12 s).
- **Rotors (verified scene graph):** separate `Propeller` and `Propeller_2`, plus `Copter_Body`, `Tail_part` and `Legs`.
- **GTA fit: 2.** A cartoony toy look with palette shading rather than painted detail. Within budget as is, and it has 8k downloads.
- **Preview:** https://media.sketchfab.com/models/5bbed2de9baa4a13a7faa72653b78b64/thumbnails/b4e9e8855aef470fadc920dd3af86d59/c3e4a6e6258a46c399e5fde4ff32ca26.jpeg

### 7. lowpoly police helicopter

- **Author:** creosine
- **Source:** https://sketchfab.com/3d-models/lowpoly-police-helicopter-fe4a24ce25fc41f882cb0fb25fd0deeb
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Formats:** source Collada (336 KB).
- **Triangles and size:** 2,192 triangles (stated). glb 9,804 KB (stated). Five 2048² PBR maps.
- **Rig and animations:** none.
- **Rotors (verified scene graph):** a **single merged node, `Box003`**. Rotors would need splitting by loose parts in Blender.
- **GTA fit: 3.** A Hughes 300-style police chopper on yellow floats. Nice, but not separable without editing.
- **Preview:** https://media.sketchfab.com/models/fe4a24ce25fc41f882cb0fb25fd0deeb/thumbnails/06cc7764095e41adb4c94968a87e4978/3448f329f70247e9a4157c3b2d3cdf59.jpeg

### 8. helicopter

- **Author:** linus1178
- **Source:** https://sketchfab.com/3d-models/helicopter-dec45a28e6f346648c3d6585426157b8
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Triangles and size:** 746 triangles (stated). glb 60 KB (stated). The texture is a 2 px palette, so it is effectively flat colour.
- **Rotors (verified scene graph):** separate `blades_0` and `tail_rotor_1` under `helicopter_2`.
- **GTA fit: 2.** A good Bell 206 silhouette, but plain white flat shading with no livery. It would need texturing.
- **Preview:** https://media.sketchfab.com/models/dec45a28e6f346648c3d6585426157b8/thumbnails/8f19563f204a47519d557d5488ddd1cd/010227df5c6449f984e121e83c933695.jpeg

### 9. Helicopter bell

- **Author:** 3DDomino
- **Source:** https://sketchfab.com/3d-models/helicopter-bell-20d80ac1480b42eb855b8136a4c411b4
- **Download:** Sketchfab only; needs an account or API token.
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Triangles and size:** 2,028 triangles (stated). glb 94 KB (stated). No textures, 4 materials.
- **Rotors (verified scene graph):** 6 separate nodes, all named `Layer:0`. Which ones are the rotors is unknown until download.
- **GTA fit: 2.** A yellow Bell 47/206 shape, untextured.
- **Preview:** https://media.sketchfab.com/models/20d80ac1480b42eb855b8136a4c411b4/thumbnails/6ef386470f12480f8354572cd7d3ef99/6281c58ba8994305a45f6cbd2f67d6d8.jpeg

### 10. Low poly Helicopter

- **Author:** The SpezX
- **Source:** https://sketchfab.com/3d-models/low-poly-helicopter-80f9eb8d21ee40aba4e3753fc43d65b5
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Triangles and size:** 3,484 triangles (stated). glb 261 KB (stated). Imphenzia 256² gradient palette.
- **Rotors (verified scene graph):** a **single node, `Helicopter_0`**, so rotors are merged.
- **GTA fit: 2.** An EC135-like shape in palette style.
- **Preview:** https://media.sketchfab.com/models/80f9eb8d21ee40aba4e3753fc43d65b5/thumbnails/35f0c22059da40e587d75f10b4e8de5e/5edc70fcd9e7405faad178733535bd87.jpeg

### 11. Helicopter EC225 ULP

- **Author:** Thomas Dion (`Blaast`)
- **Source:** https://sketchfab.com/3d-models/helicopter-ec225-ulp-1063b98873c84e09a180968abaebebb2
- **Licence (verified on page):** "License: CC Attribution / Creative Commons Attribution", linking to /by/4.0/
- **Triangles and size:** 2,557 triangles (stated). glb 888 KB (stated). One 1024² texture named `QuickTextureWIP`.
- **Rotors (verified scene graph):** single merged node.
- **GTA fit: 2.** A heavy offshore type and a work-in-progress texture.
- **Preview:** https://media.sketchfab.com/models/1063b98873c84e09a180968abaebebb2/thumbnails/993566319d544418b246d9258a20a1b6/26093be1d07543adb82b215d8a69dc4c.jpeg

### Script-fetchable, measured (poly.pizza)

All of these are flat-shaded vertex and material colour. None is textured, so none fits the textured GTA look. They are the right choice only if the city goes flat-shaded.

| Model | Author | Licence on page | Direct glb | Measured | Rotors | Fit |
|-------|--------|-----------------|------------|----------|--------|-----|
| [Helicopter](https://poly.pizza/m/6U2H_0VSAXY) | Poly by Google | "CC-BY 3.0 / Creative Commons Attribution" | https://static.poly.pizza/fda50fdb-275b-4443-a32f-52e5b8c55280.glb | 2,372 tris, 100.1 KB, 1 mesh with 10 primitives | merged into one mesh; split by loose parts | 2 (chunky Bell shape) |
| [Helicopter](https://poly.pizza/m/cTzINMr0WdS) | Poly by Google | "CC-BY 3.0" | https://static.poly.pizza/5b60184f-6dbc-4dd9-8f9c-98db31bc2b79.glb | 1,041 tris, 67.6 KB, 19 meshes | many separate nodes (`Cylinder005`…); rotors likely separable | 2 (Huey style, yellow and black) |
| [Helicopter](https://poly.pizza/m/EQJ2MECUbx) | kazuma | "CC0 / Public Domain" | https://static.poly.pizza/e3dfeb10-5525-4a39-83d8-13a709aaca4b.glb | 1,094 tris, 75.9 KB, 1 mesh | merged | 2 (black and red Bell 206 shape; the only CC0 option) |
| [Helicopter](https://poly.pizza/m/eb7b31pjGtQ) | jeremy | "CC-BY 3.0" | https://static.poly.pizza/7899f9de-bd5d-452f-9248-a96d447ff133.glb | 840 tris, 44.1 KB, 1 mesh | merged | 2 |
| [Helicopter](https://poly.pizza/m/hG2Qr0A3zR) | Zsky | "CC-BY 3.0" | https://static.poly.pizza/6f3cef79-867c-4b3c-9d97-346e465e4079.glb | 1,088 tris, 78.9 KB, 1 mesh | merged | 1 (military) |
| [Helicopter and Helipad](https://poly.pizza/m/goudZAiTcJ) | Arif | "CC-BY 3.0" | https://static.poly.pizza/a57d2f32-b663-41ce-9d4a-c7f99fe5df08.glb | 3,138 tris, 184.2 KB, 5 meshes | separate meshes (`Cylinder.00x`) | 2 (toy-like, with helipad) |

Previews are the same URLs with `.webp` in place of `.glb`.

### Script-fetchable, measured (OpenGameArt)

- **[Rescue Helicopter (low poly)](https://opengameart.org/content/rescue-helicopter-low-poly)**
  - **Uploader and credit:** uploaded by brylie. The page's attribution notice and the zip's `AUTHOR` file credit "blueskinrulez (https://sketchfab.com/blueskinrulez)". That Sketchfab account no longer has any public models.
  - **Licence:** CC BY 4.0, from the licence badge and link on the page.
  - **Download:** https://opengameart.org/sites/default/files/rescue_helicopter_free_low_poly_model.gltf_.zip
  - **Measured** after packing to glb: **8,661 tris, 350 KB**, 15 meshes, 5 untextured materials (`KHR_materials_pbrSpecularGlossiness`), 1 clip "Take 01".
  - **Rotors:** separate meshes.
  - **Fit: 2.** Untextured, over the triangle budget, and its provenance chain runs through an uploader who is not the author.
  - **Preview:** https://opengameart.org/sites/default/files/Screenshot_20180310_234401.png
- **[Helicopter](https://opengameart.org/content/helicopter-4)** by z3eus
  - **Licence:** CC0, from the badge on the page.
  - **Download:** https://opengameart.org/sites/default/files/helicopter_0.zip (`HelicopterBody` and `HelicopterWings` are separate FBX files, so the rotors are separate by construction).
  - **Size:** 635 KB zip (measured). Triangles not measured, since the files are FBX.
  - **Fit: 1.** The author describes it as an amateur model.
  - **Preview:** https://opengameart.org/sites/default/files/helicopterbody.png
- **[Simple helicopter](https://opengameart.org/content/simple-helicopter)** by whitaker (CC0) and **[Helicopter](https://opengameart.org/content/helicopter-0)** by Savino (CC0, untextured OBJ): both are engine-test props. **Fit: 1.**

### itch.io

- **[Low Poly Helicopter with animations](https://kumasousa.itch.io/low-poly-helicopter-with-animations)** by kumasousa
  - **Licence:** the page states "CC0 license. free for commercial use or anything you want."
  - **Download:** 62 KB FBX zip, behind itch's download button, so it is scriptable only via itch's download flow.
  - **Fit: 2.** It is an Airwolf-like attack shape.
  - The description is identical to davimfs7's Sketchfab model ([link](https://sketchfab.com/3d-models/low-poly-helicopter-with-animations-7aa4dd2c136a46c3a6179f780a37078e), CC BY, 2,004 tris, 3 clips). It is likely the same author, which was not verified.
- **[PSX Helicopter](https://othur.itch.io/psx-helicopter)** by othur: retro, but an attack helicopter and with **no licence stated**, so excluded.
- **[Helicopter (Huey)](https://samifd3f122.itch.io/helicopter)** (CC BY 4.0, 3.6 MB): military. **Fit: 1.**

### Checked with nothing suitable

- **Quaternius:** no helicopter or aircraft pack in the full pack list on quaternius.com.
- **Kenney:** the `car-kit`, `city-kit-commercial` and `space-kit` pages contain no helicopter.

## Alternates: other low flyers

| Model | Author | Licence (verified on page) | Tris / glb (stated) | Moving parts (scene graph) | Fit | Preview |
|-------|--------|----------------------------|---------------------|----------------------------|-----|---------|
| [Low-poly Floatplane PBR](https://sketchfab.com/3d-models/low-poly-floatplane-pbr-9571eea70b4744b9ae2d58aa1ff2c935) | MaX3Dd | CC BY 4.0 | 522 / 23,520 KB (five 4096² PBR maps; albedo at 512² gives ~60-90 KB) | **single node**; the propeller needs splitting | 4 (Vice City Skimmer energy) | [jpeg](https://media.sketchfab.com/models/9571eea70b4744b9ae2d58aa1ff2c935/thumbnails/62ea2a2f808b4a738c3ab062c60f084c/f8575ed2902f4739956edcd9ae07995f.jpeg) |
| [Cessna 310 Airplane - Low Poly](https://sketchfab.com/3d-models/cessna-310-airplane-low-poly-bbf73d06537c4a2ba86b96a3b97209c1) | BorealRiver | CC BY 4.0 | 4,020 / 319 KB (5 textures, 500-3000 px, 14 materials) | many separate parts incl. `Prop1`, `Engine`, `Engine2`, landing gear | 4 (Dodo-adjacent light twin) | [jpeg](https://media.sketchfab.com/models/bbf73d06537c4a2ba86b96a3b97209c1/thumbnails/67b4ccbb80b74b7bac26a94029562ab8/31f8d0d0bf4a4aaf8d24d9fbfe2d2ffb.jpeg) |
| [Goodyear Blimp](https://sketchfab.com/3d-models/goodyear-blimp-17896b8db3ed41b39a31a6fdefbe7a70) | federicogonz2124 | CC BY 4.0 | 1,088 / 419 KB | rigged armature, 4 skinned parts | 4 for the GTA blimp vibe, **but flag**: real Goodyear trademark, and the texture file name (`20250226_222604.jpg`) suggests a photo. Needs a re-skin. | [jpeg](https://media.sketchfab.com/models/17896b8db3ed41b39a31a6fdefbe7a70/thumbnails/a38300f30f42415a981fd4ad3d064c4e/1b613c7f35d54e0397851bcea0733a4a.jpeg) |
| [Blimp](https://poly.pizza/m/45-KKnBcxvE) and others | Poly by Google | CC BY 3.0 (poly.pizza page) | flat-shaded | n/a | 2 | poly.pizza |

## Rejected

| Model | Reason |
|-------|--------|
| `SM_Vehicle_Air_Helicopter_Police_01_A`, `..._Ambulance_01_A`, `..._Rescue_01_A` (caijianying) | The `SM_Vehicle_*` naming matches Synty POLYGON City assets: a paid pack re-uploaded as CC BY. |
| Police Helicopter 1 and 2 (Unity3D) (unitygtt34 / r34maxpro) | The account re-uploads game and asset-store content ("(NFS MW) BMW M3 GTR", "Burnin Rubber Unity Pack"). Provenance unclear. |
| Generic Helicopter (JUSTGAME) | The account re-uploads World of Tanks models. Provenance unclear. |
| Cargobob Helicrash, GTA V (Mod) Catalina, helicopter (burnout 3), Helicopter - Super Rally 3D, Shinra Helicopter (Crisis Core), Half-Life 2 Combine and Hunter choppers, the Heliborne series, Army Helicopter - Fortnite | Ripped from games. |
| TV / Radio / Camera helicopters, Skibidi helicopters (Professor_E12, EvesStudio2008 and others) | Fan models of a web series, duplicated across many accounts (identical 1,934 tris); off-theme. |
| 3D Helicopter GLB (dimenxioner.com), Low Poly Helicopters Pack Free (gvrocksnow) | "Free Standard" licence, which is not on the accepted list. |
| Dolphin AS-365 (Martini-SF, NC, 15,799 tris, 22 MB), Bell 222 (8_bit, 16,348 tris), UH-60 and Mi-24 variants | Over the triangle budget, and/or military. |
| PS1/Low Poly Apache and Ka-29 (jellypack) | Lovely PS1 style, but military. The Ka-29 is NC. |

## Cut-down recipe (for any Sketchfab pick)

Run with `bunx @gltf-transform/cli` (v4.5.1 at the time of writing):

```bash
gltf-transform resize in.glb s1.glb --width 512 --height 512
gltf-transform webp s1.glb s2.glb --quality 85
gltf-transform meshopt s2.glb out.glb   # or: draco
```

- **PS2-style material:** drop the normal and metallic-roughness maps, and use the albedo with a Lambert-like material. This suits the GTA-era look and saves the most bytes.
- **Rotor spin:** rotate the rotor nodes around their local up axis (main rotor) or side axis (tail rotor).
  - Check after download that each pivot sits at the hub.
  - If it does not, re-centre in Blender: Origin to geometry on the hub ring, then re-export.
