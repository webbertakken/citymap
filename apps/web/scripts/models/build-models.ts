import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Builds the models the walk uses into public/models, from their sources, reproducibly:
//   people:   Wobble Blocks' PS2 Styled Characters (CC0), split into a man and a woman, with the clips of Quaternius'
//             Universal Animation Library (CC0) retargeted and baked onto their rig;
//   vehicles: heyheythere's PSX Vehicles Free (CC BY 4.0): bicycle, sedan and pickup, with the pack's atlas attached,
//             the bicycle stood upright with its kickstand its own part; Duhgless' Another PSX Style Low-poly Bike
//             (CC0): the motorbike, its parts rigged to steer and roll; ArcheoteryxFr's AS350 B2 (CC BY 4.0, Sketchfab):
//             the helicopter, its rotors hung from their hubs. Each two-wheeler marks where its rider meets it.
// Usage: bun scripts/models/build-models.ts   (writes public/models and its CREDITS.md; prints each clip's ground speed)
// The helicopter comes through Sketchfab's API, which needs a token (SKETCHFAB_TOKEN, or ~/.secrets/sketchfab-api-token);
// without one, and with nothing cached, the committed helicopter is kept as it is.
import { Document, NodeIO, type Node as GltfNode, type mat4 } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import {
  clearNodeTransform,
  compactPrimitive,
  dedup,
  flatten,
  meshopt,
  prune,
  textureCompress,
  transformMesh,
  weld,
} from "@gltf-transform/functions";
import { $ } from "bun";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
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
import {
  endsOf,
  hubOf,
  meanOf,
  partsOf,
  rotated,
  seatOf,
  topOf,
  turnBetween,
  type Point,
  type Turn,
} from "../../src/explore/models/contacts";
import { WOBBLE_FROM_UAL, retargetClip } from "../../src/explore/models/retarget";
import { download, entry, itch, sketchfab, unzip } from "./sources";

/** glTF's NEAREST texture filter. */
const NEAREST = 9728;

const out = resolve(import.meta.dirname, "../../public/models");
const io = new NodeIO()
  .registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureWebP, EXTMeshoptCompression])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

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
  if (name === "bicycle_red") await rigBicycle(doc);
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

/** A column-major 4×4 matrix: a turn about z by `angle`, then a quaternion's turn and a uniform scale before it. */
function turnedScaled(angle: number, q: readonly [number, number, number, number], scale: number): mat4 {
  const [x, y, z, w] = q;
  // The quaternion's rotation, rows first.
  const r = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const zTurn = [
    [c, -sn, 0],
    [sn, c, 0],
    [0, 0, 1],
  ];
  const m = zTurn.map((row) => [0, 1, 2].map((j) => row.reduce((sum, v, k) => sum + v * r[k]![j]!, 0) * scale));
  const at = (i: number, j: number) => (i < 3 && j < 3 ? m[i]![j]! : i === j ? 1 : 0);
  // Column by column.
  return [
    at(0, 0),
    at(1, 0),
    at(2, 0),
    at(3, 0),
    at(0, 1),
    at(1, 1),
    at(2, 1),
    at(3, 1),
    at(0, 2),
    at(1, 2),
    at(2, 2),
    at(3, 2),
    at(0, 3),
    at(1, 3),
    at(2, 3),
    at(3, 3),
  ];
}

/** A part's own turn and scale baked into its mesh, after a turn about z; its node left only placed. */
function bake(node: GltfNode, angle: number) {
  transformMesh(node.getMesh()!, turnedScaled(angle, node.getRotation(), node.getScale()[0]));
  node.setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}

/** The named node of a document; a missing one stops the build. */
function partOf(doc: Document, name: string): GltfNode {
  const node = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === name);
  if (!node) throw new Error(`models/no-node ${name}`);
  return node;
}

/** Every vertex of a node's mesh, in the node's own frame. */
function pointsOf(node: GltfNode): Point[] {
  const mesh = node.getMesh();
  if (!mesh) throw new Error(`models/no-mesh ${node.getName()}`);
  return mesh.listPrimitives().flatMap((primitive) => {
    const positions = primitive.getAttribute("POSITION");
    if (!positions) throw new Error(`models/no-positions ${node.getName()}`);
    return Array.from({ length: positions.getCount() }, (_unused, i): Point => {
      const [x = 0, y = 0, z = 0] = positions.getElement(i, [0, 0, 0]);
      return [x, y, z];
    });
  });
}

/** A point as the build log writes it. */
const shown = (p: Point) => p.map((v) => v.toFixed(3)).join(",");

/** A column-major 4×4 matrix moving by an offset. */
const moving = ([x, y, z]: Point): mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/**
 * A turn given to a whole vehicle about its origin: every node placed by it and every mesh turned by it. Its nodes are
 * all unturned (so turning each place and each mesh turns the whole) and no mesh is shared (so none turns twice).
 */
function turnWhole(doc: Document, turn: Turn) {
  const nodes = doc.getRoot().listNodes();
  for (const node of nodes) {
    if (node.getRotation().some((v, i) => v !== (i === 3 ? 1 : 0)))
      throw new Error(`models/turned-node ${node.getName()}`);
    node.setTranslation([...rotated(turn, node.getTranslation())]);
  }
  const meshes = nodes.flatMap((n) => n.getMesh() ?? []);
  if (new Set(meshes).size !== meshes.length) throw new Error("models/shared-mesh");
  for (const mesh of meshes) transformMesh(mesh, turnedScaled(0, turn, 1));
}

/** An empty node where a rider meets a vehicle, on the part it moves with, at a point in that part's frame. */
function contact(doc: Document, part: GltfNode, name: string, at: Point) {
  part.addChild(doc.createNode(name).setTranslation([...at]));
}

/**
 * A part of a node's mesh (its one primitive's triangles) split off into a mesh of its own on a child node, pivoted at a
 * point in the node's frame, so it can turn about it.
 */
function splitOff(doc: Document, node: GltfNode, triangles: readonly number[], name: string, pivot: Point): GltfNode {
  const [primitive, ...more] = node.getMesh()?.listPrimitives() ?? [];
  const indices = primitive?.getIndices()?.getArray();
  if (!primitive || !indices || more.length > 0) throw new Error(`models/not-one-primitive ${node.getName()}`);
  const taken = new Set(triangles);
  const kept: number[] = [];
  const moved: number[] = [];
  for (let t = 0; t < indices.length / 3; t++)
    (taken.has(t) ? moved : kept).push(...indices.subarray(t * 3, t * 3 + 3));
  const buffer = doc.getRoot().listBuffers()[0]!;
  const indexOf = (list: number[]) =>
    doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(list)).setBuffer(buffer);
  const split = primitive.clone().setIndices(indexOf(moved));
  primitive.setIndices(indexOf(kept));
  compactPrimitive(primitive);
  compactPrimitive(split);
  const mesh = doc.createMesh(name).addPrimitive(split);
  transformMesh(mesh, moving([-pivot[0], -pivot[1], -pivot[2]]));
  const child = doc
    .createNode(name)
    .setMesh(mesh)
    .setTranslation([...pivot]);
  node.addChild(child);
  return child;
}

/** How the bicycle's contacts are measured, in its file's units (metres, near enough: it is drawn at 1.687 m of 1.69). */
const BICYCLE_CONTACTS = {
  /** A grip is the bars' last 10 cm: a hand's width. */
  grip: 0.1,
  /** A pedal is the crank's last 6 cm out: the pedal's own width. */
  pedal: 0.06,
  /** The saddle's top: its points within 2 cm of its highest. */
  saddle: 0.02,
  /** The kickstand's hinge: its points within 2 cm of its top; its foot, within 2 cm of its bottom. */
  stand: 0.02,
} as const;

/**
 * heyheythere's bicycle, rigged as the walk poses it. The pack leans it onto its kickstand (its wheels 8° off upright),
 * so a wheel turning about its own x would wobble: the whole bicycle is turned upright about its contact line, by the
 * turn that takes its back wheel's axle (from its tyre's ring) onto x. The kickstand (the frame's one part to reach the
 * ground) is split off on its hinge, with its folded turn (swung back along the chainstay, from the crank to the back
 * hub) and the lean it holds the bicycle at, in its extras. Its grips (the bars' ends, on the fork), saddle (the frame's
 * top) and pedals (the crank's ends, on the crank) are marked as nodes. The file faces +z, its left +x.
 */
async function rigBicycle(doc: Document) {
  const frame = partOf(doc, "bicycle_red");
  const fork = partOf(doc, "bicycle_red_fork");
  const crank = partOf(doc, "bicycle_red_crank");
  const rear = partOf(doc, "bicycle_red_wheel_rear");
  const { axle } = hubOf(pointsOf(rear), 0);
  // Leaning to its left (+x) its axle tips down on that side.
  const lean = Math.atan2(-axle[1], axle[0]);
  turnWhole(doc, turnBetween(axle, [1, 0, 0]));
  const hub = rear.getTranslation();
  const parts = partsOf(
    frame.getMesh()!.listPrimitives()[0]!.getAttribute("POSITION")!.getArray()!,
    frame.getMesh()!.listPrimitives()[0]!.getIndices()!.getArray()!,
  );
  const points = pointsOf(frame);
  const lowest = (part: { readonly vertices: readonly number[] }) =>
    Math.min(...part.vertices.map((v) => points[v]![1]));
  const stand = parts.reduce((low, part) => (lowest(part) < lowest(low) ? part : low));
  const standPoints = stand.vertices.map((v) => points[v]!);
  const hinge = topOf(standPoints, BICYCLE_CONTACTS.stand);
  const foot = meanOf(standPoints.filter((p) => p[1] <= lowest(stand) + BICYCLE_CONTACTS.stand));
  const [cx, cy, cz] = crank.getTranslation();
  const stay: Point = [hub[0] - cx, hub[1] - cy, hub[2] - cz];
  const folded = turnBetween([foot[0] - hinge[0], foot[1] - hinge[1], foot[2] - hinge[2]], stay);
  splitOff(doc, frame, stand.triangles, "bicycle_red_kickstand", hinge).setExtras({ folded: [...folded], lean });
  const grips = endsOf(pointsOf(fork), 0, BICYCLE_CONTACTS.grip);
  contact(doc, fork, "bicycle_red_grip_left", grips.high);
  contact(doc, fork, "bicycle_red_grip_right", grips.low);
  contact(doc, frame, "bicycle_red_saddle", topOf(pointsOf(frame), BICYCLE_CONTACTS.saddle));
  const pedals = endsOf(pointsOf(crank), 0, BICYCLE_CONTACTS.pedal);
  contact(doc, crank, "bicycle_red_pedal_left", pedals.high);
  contact(doc, crank, "bicycle_red_pedal_right", pedals.low);
  await doc.transform(prune({ keepLeaves: true }));
  console.log(
    `[models] bicycle stood up from a lean of ${((lean * 180) / Math.PI).toFixed(1)}°; kickstand of ${stand.triangles.length} triangles, hinge ${shown(hinge)}`,
  );
}

/** How the chopper's contacts are measured, in its file's units (0.474 m each). */
const MOTORBIKE_CONTACTS = {
  /** A grip is the bars' last 0.21 (10 cm): a hand's width. */
  grip: 0.21,
  /** The seat is the lowest top along the middle line, looked for every 0.05 (2.4 cm). */
  step: 0.05,
  /** The pegs are the frame's widest points below 0.45 (24 cm off the ground), within 0.1 (4.7 cm) of the widest. */
  below: 0.45,
  peg: 0.1,
} as const;

/**
 * Where the chopper's rider meets it, marked as nodes: its grips (the bars' ends, on the fork, in its raked frame), its
 * seat (the lowest of the frame's top surface along its middle line, between the back hub and the steering head) and its forward
 * pegs (the frame's widest points low down). The file faces +x, its right +z.
 */
function rigMotorbikeRider(doc: Document, frame: GltfNode, fork: GltfNode, hub: Point, head: Point) {
  const grips = endsOf(pointsOf(fork), 2, MOTORBIKE_CONTACTS.grip);
  contact(doc, fork, "motorbike_grip_left", grips.low);
  contact(doc, fork, "motorbike_grip_right", grips.high);
  const [fx, fy] = frame.getTranslation();
  const points = pointsOf(frame);
  const [primitive] = frame.getMesh()?.listPrimitives() ?? [];
  const positions = primitive?.getAttribute("POSITION")?.getArray();
  const indices = primitive?.getIndices()?.getArray();
  if (!positions || !indices) throw new Error("models/no-frame-mesh motorbike");
  const seat = seatOf(positions, indices, { from: hub[0] - fx, to: head[0] - fx, step: MOTORBIKE_CONTACTS.step });
  if (!seat) throw new Error("models/no-seat motorbike");
  contact(doc, frame, "motorbike_seat", seat);
  const pegs = endsOf(
    points.filter(([, y]) => y + fy < MOTORBIKE_CONTACTS.below),
    2,
    MOTORBIKE_CONTACTS.peg,
  );
  contact(doc, frame, "motorbike_peg_left", pegs.low);
  contact(doc, frame, "motorbike_peg_right", pegs.high);
  console.log(`[models] motorbike seat ${shown(seat)}, pegs ${shown(pegs.low)} ${shown(pegs.high)} (frame units)`);
}

/**
 * Duhgless' chopper, rigged as the walk poses it: each part's turn and scale baked into its mesh (so a part's own turn
 * is only its pose); the fork hung from a head tilted to its rake (34.9°, from the head to the front axle) so steering
 * turns it about that axis, with the front wheel on it; the parts named; textures cut to 256 px WebP, point-filtered.
 */
async function motorbike() {
  const doc = await io.readBinary(await itch("https://duhgless.itch.io/another-psx-style-low-poly-bike", "Bike3.glb"));
  const nodes = new Map(
    doc
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const part = (name: string) => {
    const node = nodes.get(name);
    if (!node) throw new Error(`models/no-node ${name}`);
    return node;
  };
  const frame = part("Cube");
  const fork = part("Fork");
  const front = part("Front-Wheel");
  const back = part("Back-Wheel");
  const head = fork.getTranslation();
  const axle = front.getTranslation();
  const rake = Math.atan2(axle[0] - head[0], head[1] - axle[1]);
  bake(frame, 0);
  bake(back, 0);
  bake(fork, -rake);
  bake(front, -rake);
  const steering = doc
    .createNode("motorbike_head")
    .setTranslation(head)
    .setRotation([0, 0, Math.sin(rake / 2), Math.cos(rake / 2)]);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  scene.removeChild(fork);
  scene.removeChild(front);
  scene.addChild(steering);
  steering.addChild(fork.setTranslation([0, 0, 0]));
  // The front axle in the head's own (raked) frame.
  const dx = axle[0] - head[0];
  const dy = axle[1] - head[1];
  const c = Math.cos(-rake);
  const sn = Math.sin(-rake);
  fork.addChild(front.setTranslation([c * dx - sn * dy, sn * dx + c * dy, axle[2] - head[2]]));
  frame.setName("motorbike_frame");
  fork.setName("motorbike_fork");
  front.setName("motorbike_wheel_front");
  back.setName("motorbike_wheel_back");
  rigMotorbikeRider(doc, frame, fork, back.getTranslation(), head);
  for (const material of doc.getRoot().listMaterials())
    material.getBaseColorTextureInfo()?.setMagFilter(NEAREST).setMinFilter(NEAREST);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [256, 256] }),
    prune({ keepLeaves: true }),
    dedup(),
  );
  const file = join(out, "vehicles", "motorbike.glb");
  await io.write(file, doc);
  console.log(
    `[models] vehicles/motorbike.glb ${(Bun.file(file).size / 1024).toFixed(0)} KB, rake ${((rake * 180) / Math.PI).toFixed(1)}°`,
  );
}

/** ArcheoteryxFr's AS350 B2 on Sketchfab. */
const AS350 = "76cf31c232bf4514ab1794d28a2b0ee1";
const HELICOPTER = join(out, "vehicles", "helicopter.glb");

/** A mesh's box in its node's frame: the least and the most of its positions. */
function boxOf(node: GltfNode): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of node.getMesh()!.listPrimitives()) {
    const position = primitive.getAttribute("POSITION")!;
    const p = [0, 0, 0];
    for (let i = 0; i < position.getCount(); i++) {
      position.getElement(i, p);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, p[k]!);
        max[k] = Math.max(max[k]!, p[k]!);
      }
    }
  }
  return { min, max };
}

/** A box's middle along an axis. */
const middle = (box: { min: number[]; max: number[] }, k: number) => (box.min[k]! + box.max[k]!) / 2;

/**
 * A part hung from a pivot of its own at `at`, named `name`, what it turns about: its mesh moved the other way, under the
 * pivot. The pivot carries no mesh, so meshopt's quantisation (which moves and scales a mesh's own node to its box)
 * leaves the pivot where it is.
 */
function hangAt(doc: Document, node: GltfNode, at: readonly [number, number, number], name: string) {
  transformMesh(node.getMesh()!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -at[0], -at[1], -at[2], 1]);
  const pivot = doc.createNode(name).setTranslation([...at]);
  for (const scene of doc.getRoot().listScenes()) if (scene.listChildren().includes(node)) scene.addChild(pivot);
  pivot.addChild(node);
  node.setName(`${name}_mesh`);
}

/**
 * ArcheoteryxFr's AS350 B2, rigged as the walk poses it: the file's centimetre scale dropped (its mesh is in metres),
 * every part's place baked into its mesh; the main rotor hung from its hub (the hub's middle in plan, about y) and the
 * tail rotor from its own middle (about x); the parts named; the albedo alone kept, as 512 px WebP, and the geometry
 * compressed by meshopt. Built facing −z. The committed file is kept where there is no token and nothing cached.
 */
async function helicopter(kept: Uint8Array | null) {
  const source = await sketchfab(AS350);
  if (!source) {
    if (!kept) throw new Error("models/helicopter-missing: no Sketchfab token, nothing cached and nothing committed");
    await Bun.write(HELICOPTER, kept);
    console.log("[models] vehicles/helicopter.glb kept as committed: no Sketchfab token and nothing cached");
    return;
  }
  const doc = await io.readBinary(source);
  const named = (prefix: string) => {
    const node = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName().startsWith(prefix) && n.getMesh());
    if (!node) throw new Error(`models/no-node ${prefix}`);
    return node;
  };
  const whole = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === "AS350_B2_complet_LP");
  if (!whole) throw new Error("models/no-node AS350_B2_complet_LP");
  whole.setScale([1, 1, 1]);
  await doc.transform(flatten());
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) clearNodeTransform(node);
  const rotor = named("rotor_pales");
  const tail = named("rotor_anticouple");
  const hub = boxOf(named("moyeu_arbre"));
  const blades = boxOf(rotor);
  const fin = boxOf(tail);
  hangAt(doc, rotor, [middle(hub, 0), middle(blades, 1), middle(hub, 2)], "helicopter_rotor");
  hangAt(doc, tail, [middle(fin, 0), middle(fin, 1), middle(fin, 2)], "helicopter_tail_rotor");
  named("cabine").setName("helicopter_body");
  for (const material of doc.getRoot().listMaterials()) {
    material.setNormalTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(1);
    material.setOcclusionTexture(null).setEmissiveTexture(null);
  }
  await doc.transform(
    prune(),
    dedup(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(HELICOPTER, doc);
  // The rotor's reach and the hubs' places, in metres, for the walk's rig.
  const reach = Math.max(
    ...[0, 2].flatMap((k) => [Math.abs(blades.min[k]! - middle(hub, k)), Math.abs(blades.max[k]! - middle(hub, k))]),
  );
  console.log(
    `[models] vehicles/helicopter.glb ${(Bun.file(HELICOPTER).size / 1024).toFixed(0)} KB, rotor hub (${[middle(hub, 0), middle(blades, 1), middle(hub, 2)].map((v) => v.toFixed(3)).join(", ")}) reach <= ${reach.toFixed(2)} m, tail rotor (${[0, 1, 2].map((k) => middle(fin, k).toFixed(3)).join(", ")})`,
  );
}

const CREDITS = `# Model credits

- People: PS2 Styled Characters by Wobble Blocks, CC0 1.0, https://opengameart.org/content/ps2-styled-characters
- Their clips: Universal Animation Library by Quaternius, CC0 1.0,
  https://quaternius.com/packs/universalanimationlibrary.html
- Vehicles: PSX Vehicles Free by heyheythere - https://heyheythere.itch.io/psx-vehicles-free - CC BY 4.0
- Motorbike: Another PSX Style Low-poly Bike by Duhgless, CC0 1.0,
  https://duhgless.itch.io/another-psx-style-low-poly-bike
- Helicopter: AS350 B2 by ArcheoteryxFr, CC BY 4.0,
  https://sketchfab.com/3d-models/as350-b2-76cf31c232bf4514ab1794d28a2b0ee1 (cut down: albedo only, at 512 px WebP;
  geometry compressed)
`;

const scratch = await mkdtemp(join(tmpdir(), "citymap-models-"));
// The committed helicopter, kept for a build without a Sketchfab token.
const keptHelicopter = (await Bun.file(HELICOPTER).exists()) ? await Bun.file(HELICOPTER).bytes() : null;
try {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await Promise.all([people(scratch), vehicles(scratch)]);
  await motorbike();
  await helicopter(keptHelicopter);
  await Bun.write(join(out, "CREDITS.md"), CREDITS);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
