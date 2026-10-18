import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Builds the models the walk uses into public/models, from their sources, reproducibly:
//   people:   Wobble Blocks' PS2 Styled Characters (CC0), split into a man and a woman, with the clips of Quaternius'
//             Universal Animation Library (CC0) retargeted and baked onto their rig;
//   vehicles: heyheythere's PSX Vehicles Free (CC BY 4.0): bicycle, sedan and pickup, with the pack's atlas attached.
// Usage: bun scripts/models/build-models.ts   (writes public/models and its CREDITS.md; prints each clip's ground speed)
import { Document, NodeIO, type Node as GltfNode } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import { $ } from "bun";
import {
  AnimationMixer,
  Bone,
  Box3,
  LoopOnce,
  PropertyBinding,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WOBBLE_FROM_UAL, retargetClip } from "../../src/explore/models/retarget";
import { download, entry, itch, unzip } from "./sources";

/** glTF's NEAREST texture filter. */
const NEAREST = 9728;

const out = resolve(import.meta.dirname, "../../public/models");
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

/** The clips the walk plays, by their names in the library. */
export const CLIPS = [
  "Idle_Loop",
  "Walk_Loop",
  "Jog_Fwd_Loop",
  "Sprint_Loop",
  "Jump_Start",
  "Jump_Loop",
  "Jump_Land",
  "Driving_Loop",
  "Sitting_Idle_Loop",
] as const;
/** A person stands this tall, in metres, as the walk sizes them. */
const PERSON_METRES = 1.78;

/** A glb parsed by three.js, without its textures (Bun has no image decoding): only its skeleton is needed here. */
async function skeletonOf(glb: Uint8Array): Promise<{ scene: Object3D; animations: AnimationClip[] }> {
  const doc = await io.readBinary(glb);
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
  await doc.transform(prune());
  const bare = await io.writeBinary(doc);
  return new Promise((done, fail) =>
    new GLTFLoader().parse(bare.buffer.slice(bare.byteOffset, bare.byteOffset + bare.byteLength), "", done, fail),
  );
}

/** The named node of a glTF document, matched as three.js names it (dots dropped). */
const nodeNamed = (doc: Document, sanitised: string): GltfNode | undefined =>
  doc
    .getRoot()
    .listNodes()
    .find((n) => PropertyBinding.sanitizeNodeName(n.getName()) === sanitised);

/** A three.js clip written into a glTF document as an animation over its nodes. */
function writeClip(doc: Document, clip: AnimationClip) {
  const animation = doc.createAnimation(clip.name);
  const buffer = doc.getRoot().listBuffers()[0]!;
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf(".");
    const node = nodeNamed(doc, track.name.slice(0, dot));
    if (!node) throw new Error(`models/no-node ${track.name}`);
    const path = track.name.slice(dot + 1) === "quaternion" ? "rotation" : "translation";
    const input = doc.createAccessor().setType("SCALAR").setArray(Float32Array.from(track.times)).setBuffer(buffer);
    const output = doc
      .createAccessor()
      .setType(path === "rotation" ? "VEC4" : "VEC3")
      .setArray(Float32Array.from(track.values))
      .setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
    animation
      .addSampler(sampler)
      .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  }
}

/** How fast a clip carries its figure over the ground, in metres a second: the median of its foot's speeds backwards. */
function groundSpeed(figure: Object3D, clip: AnimationClip, metresPerUnit: number): number {
  const mixer = new AnimationMixer(figure);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const foot = figure.getObjectByName("FootL");
  if (!(foot instanceof Bone)) throw new Error("models/no-foot FootL");
  const samples = Array.from({ length: 241 }, (_unused, i) => {
    mixer.setTime((i / 240) * clip.duration);
    figure.updateMatrixWorld(true);
    return foot.getWorldPosition(new Vector3());
  });
  const dt = clip.duration / 240;
  // A foot moving backwards is down, carrying the body at the clip's speed; one in the air only ever moves forwards.
  const planted = samples
    .slice(1)
    .map((p, i) => (samples[i]?.z ?? p.z) - p.z)
    .map((step) => step / dt)
    .filter((speed) => speed > 0);
  mixer.stopAllAction();
  // The median, as a foot touching down or lifting off slides for a sample or two.
  const sorted = planted.toSorted((x, y) => x - y);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]! * metresPerUnit;
}

/** The library's skeleton and clips, and its rest pose. */
type Library = { readonly scene: Object3D; readonly animations: AnimationClip[]; readonly rest: AnimationClip };

/** One of the pair, the other's mesh dropped, with the library's clips baked onto its rig. */
async function personOf(pair: string, keep: string, drop: string, name: string, library: Library) {
  const doc = await io.read(pair);
  for (const node of doc.getRoot().listNodes()) if (node.getName() === drop) node.dispose();
  await doc.transform(prune(), dedup());
  const target = await skeletonOf(await io.writeBinary(doc));
  // Metres per unit of the file: its person stands PERSON_METRES tall, as posed by its skeleton.
  target.scene.updateMatrixWorld(true);
  target.scene.traverse((n) => {
    if (n instanceof SkinnedMesh) n.skeleton.update();
  });
  const metresPerUnit = PERSON_METRES / new Box3().setFromObject(target.scene, true).getSize(new Vector3()).y;
  for (const clipName of CLIPS) {
    const clip = library.animations.find((c) => c.name === clipName);
    if (!clip) throw new Error(`models/no-clip ${clipName}`);
    const baked = retargetClip(target.scene, library.scene, clip, library.rest, WOBBLE_FROM_UAL, { hip: "Hips" });
    writeClip(doc, baked);
    const speed = groundSpeed(target.scene, baked, metresPerUnit);
    console.log(
      `[models] ${name} ${clipName}: ${baked.duration.toFixed(3)} s, ground ${speed.toFixed(2)} m/s (${keep})`,
    );
  }
  await doc.transform(dedup());
  const file = join(out, "people", `${name}.glb`);
  await io.write(file, doc);
  console.log(`[models] people/${name}.glb ${(Bun.file(file).size / 1024).toFixed(0)} KB`);
}

/** Wobble Blocks' pair split into its man and its woman, each with the library's clips baked onto its rig. */
async function people(scratch: string) {
  const pair = unzip(await download("https://opengameart.org/sites/default/files/ps2characterbase_0.zip"));
  const fbx = join(scratch, "PS2CharacterBase.fbx");
  await mkdir(join(scratch, "textures"), { recursive: true });
  await Promise.all([
    Bun.write(fbx, entry(pair, "PS2CharacterBase.fbx")),
    ...[...pair]
      .filter(([name]) => name.startsWith("textures/"))
      .map(([name, bytes]) => Bun.write(join(scratch, name), bytes)),
  ]);
  const converter = resolve(import.meta.dirname, "../../node_modules/fbx2gltf/bin/Linux/FBX2glTF");
  await $`${converter} --binary --input ${fbx} --output ${join(scratch, "pair")}`.quiet();
  const zip = unzip(await itch("https://quaternius.itch.io/universal-animation-library", "Standard"));
  const ual = await skeletonOf(entry(zip, "Unreal-Godot/UAL1_Standard.glb"));
  const rest = ual.animations.find((c) => c.name === "A_TPose");
  if (!rest) throw new Error("models/no-clip A_TPose");
  const library: Library = { ...ual, rest };
  await mkdir(join(out, "people"), { recursive: true });
  const glb = join(scratch, "pair.glb");
  await Promise.all([personOf(glb, "Masc", "Femme", "man", library), personOf(glb, "Femme", "Masc", "woman", library)]);
}

/** One of heyheythere's vehicles, point-filtered, its atlas (which the pack keeps beside it) embedded. */
async function vehicle(pack: Map<string, Uint8Array>, scratch: string, name: string) {
  const glb = [...pack.keys()].find((n) => n.endsWith(`glb/${name}.glb`));
  if (!glb) throw new Error(`models/no-entry ${name}`);
  const doc = await io.read(join(scratch, "pack", glb));
  for (const material of doc.getRoot().listMaterials()) {
    const info = material.getBaseColorTextureInfo();
    if (!info) throw new Error(`models/no-atlas ${name}`);
    // Point-filtered, as the PS1 look wants: glTF's NEAREST.
    info.setMagFilter(NEAREST).setMinFilter(NEAREST);
  }
  const file = join(out, "vehicles", `${name.split("_")[0]}.glb`);
  await io.write(file, doc);
  console.log(`[models] vehicles/${name.split("_")[0]}.glb ${(Bun.file(file).size / 1024).toFixed(0)} KB`);
}

/** heyheythere's bicycle, sedan and pickup. */
async function vehicles(scratch: string) {
  const pack = unzip(await itch("https://heyheythere.itch.io/psx-vehicles-free", "psx-vehicles-free"));
  await Promise.all(
    [...pack]
      .filter(([name]) => name.includes("/glb/") || name.includes("/textures/"))
      .map(([name, bytes]) => Bun.write(join(scratch, "pack", name), bytes)),
  );
  await mkdir(join(out, "vehicles"), { recursive: true });
  await Promise.all(["bicycle_red", "sedan_blue", "pickup_red"].map((name) => vehicle(pack, scratch, name)));
}

const CREDITS = `# Model credits

- People: PS2 Styled Characters by Wobble Blocks, CC0 1.0, https://opengameart.org/content/ps2-styled-characters
- Their clips: Universal Animation Library by Quaternius, CC0 1.0, https://quaternius.com/packs/universalanimationlibrary.html
- Vehicles: PSX Vehicles Free by heyheythere - https://heyheythere.itch.io/psx-vehicles-free - CC BY 4.0
`;

const scratch = await mkdtemp(join(tmpdir(), "citymap-models-"));
try {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await Promise.all([people(scratch), vehicles(scratch)]);
  await Bun.write(join(out, "CREDITS.md"), CREDITS);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
