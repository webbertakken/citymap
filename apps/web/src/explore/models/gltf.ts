// Figures and vehicles from glTF files (Kenney's CC0 packs and poly.pizza), normalised to one frame: metres, facing +x,
// standing on y = 0, centred on their footprint. The walk's people and vehicles ship with the app (public/models), built
// by scripts/models/build-models.ts; the model lab's other candidates are in public/lab/models.
import {
  AnimationMixer,
  Box3,
  Group,
  Mesh,
  SkinnedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Vector3,
  type AnimationClip,
  type Object3D,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { log } from "../../log";

/** One model file: where it is under the site, how long (or tall) it stands in metres, and the turn to face +x. */
export interface ModelFile {
  readonly url: string;
  /** Its size in metres along its longest ground axis, or its height for a figure. */
  readonly metres: number;
  readonly measure: "length" | "height";
  /** Radians about y that turn the file's forward to +x. */
  readonly yaw: number;
}

/**
 * The models the walk uses, built by scripts/models/build-models.ts into public/models (credited in its CREDITS.md):
 * Wobble Blocks' people with the Universal Animation Library's clips baked on, heyheythere's PSX vehicles (facing +z in
 * their files), Duhgless' motorbike (facing +x) and ArcheoteryxFr's AS350 B2 helicopter (facing −z, its fuselage 11.01
 * m long; its geometry meshopt-compressed), at their real sizes.
 */
export const GLTF_MODELS = {
  figure: { url: "models/people/man.glb", metres: 1.78, measure: "height", yaw: Math.PI / 2 },
  walker: { url: "models/people/woman.glb", metres: 1.7, measure: "height", yaw: Math.PI / 2 },
  bicycle: { url: "models/vehicles/bicycle.glb", metres: 1.687, measure: "length", yaw: Math.PI / 2 },
  motorbike: { url: "models/vehicles/motorbike.glb", metres: 2.36, measure: "length", yaw: 0 },
  car: { url: "models/vehicles/sedan.glb", metres: 4.68, measure: "length", yaw: Math.PI / 2 },
  // Drawn a little under its own 5.2 m, so its wheels and wheelbase are the car's on Rapier.
  pickup: { url: "models/vehicles/pickup.glb", metres: 4.6, measure: "length", yaw: Math.PI / 2 },
  helicopter: { url: "models/vehicles/helicopter.glb", metres: 11.01, measure: "length", yaw: -Math.PI / 2 },
} as const satisfies Record<string, ModelFile>;

export type GltfName = keyof typeof GLTF_MODELS;

/** A loaded model: a fresh copy of its scene each time, and its animations. */
export interface Loaded {
  readonly make: () => Object3D;
  readonly clips: readonly AnimationClip[];
  /**
   * The file's own scene, as loaded and never drawn: the frame its skeleton was made in, to map other clips onto. A clip
   * mapped onto it plays on every copy `make` gives, by its bones' names.
   */
  readonly original: Object3D;
}

/** How a file's scene is set into the procedural frame: moved (after its turn) and scaled. */
interface Framing {
  readonly position: Vector3;
  readonly scale: number;
}

/** A file's scene turned, moved and scaled into the procedural frame, inside a group callers place, turn and scale. */
function framed(scene: Object3D, file: ModelFile, framing: Framing): Object3D {
  const turned = new Group();
  scene.rotation.y = file.yaw;
  scene.position.copy(framing.position);
  turned.add(scene);
  const scaled = new Group();
  scaled.add(turned);
  scaled.scale.setScalar(framing.scale);
  // Callers place, turn and scale the outer group; the file's own correction stays inside it.
  const outer = new Group();
  outer.add(scaled);
  posed(outer);
  return outer;
}

/** A model's world matrices and skins brought up to date: posed by its skeleton, as it is measured and drawn. */
function posed(model: Object3D) {
  model.updateMatrixWorld(true);
  model.traverse((node) => {
    if (node instanceof SkinnedMesh) node.skeleton.update();
  });
}

/**
 * How to set a file's scene (measured on a copy, so the file's own stays untouched) into the procedural frame: turned
 * to face +x, sized, on y = 0 and centred. Measured once per file, said once in the log.
 */
function framingOf(original: Object3D, file: ModelFile): Framing {
  const scene = clone(original);
  const turned = new Group();
  scene.rotation.y = file.yaw;
  turned.add(scene);
  // A rigged model is measured as posed by its skeleton: its raw mesh may be in other units (Quaternius rigs in
  // centimetres under a 100x armature), so its stated bounds say nothing of how it is drawn.
  posed(turned);
  const box = new Box3().setFromObject(turned, true);
  const size = box.getSize(new Vector3());
  const along = file.measure === "height" ? size.y : Math.max(size.x, size.z);
  const scale = file.metres / along;
  log.info("explore/model-normalised", {
    url: file.url,
    x: size.x.toFixed(3),
    y: size.y.toFixed(3),
    z: size.z.toFixed(3),
    scale: scale.toFixed(4),
  });
  const centre = box.getCenter(new Vector3());
  return { position: new Vector3(-centre.x, -box.min.y, -centre.z), scale };
}

/**
 * The canvas writes colours as they are (no output encoding), as the city's own meshes are coloured; so a model's
 * textures are sampled undecoded and its colour factors turned back to display values, to show as authored.
 */
function asAuthored(scene: Object3D) {
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials: unknown[] = [node.material].flat();
    for (const m of materials) {
      // glTF gives standard materials, or basic ones for unlit models.
      if (!(m instanceof MeshStandardMaterial || m instanceof MeshBasicMaterial)) continue;
      if (m.map) {
        m.map.colorSpace = NoColorSpace;
        m.map.needsUpdate = true;
      }
      m.color.convertLinearToSRGB();
    }
  });
}

/**
 * A model's see-through parts (glass) draw after the city's own see-through things: its signs and roof markings (0) and
 * the helicopter's shadow (1). So whatever lies behind glass is drawn before it, and shows through. Glass writes no
 * depth (three.js's loader gives a blended material none), so it never hides what lies behind it.
 */
export const SEE_THROUGH_ORDER = 2;

/** Gives every see-through mesh of a file's scene its order, said once a file with how many there are. */
function seeThrough(scene: Object3D, url: string) {
  let meshes = 0;
  scene.traverse((node) => {
    if (!(node instanceof Mesh) || ![node.material].flat().some((m) => m.transparent)) return;
    node.renderOrder = SEE_THROUGH_ORDER;
    meshes++;
  });
  if (meshes > 0) log.info("explore/model-glass", { url, meshes });
}

/** What a glTF file gives: its scene and its animations. */
export interface GltfFile {
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
}

/** Reads a glTF file from a URL: three.js's loader in the browser, a stand-in in tests. */
export type ReadGltf = (url: string) => Promise<GltfFile>;

/** Reads a glTF file with three.js's loader, which decodes meshopt-compressed geometry (the helicopter's). */
export const readGltfWithThree: ReadGltf = (url) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);

/** Loads one model from under the site's path (`base`): each `make` gives a fresh copy, sized and turned. */
export async function loadModel(base: string, file: ModelFile, read: ReadGltf = readGltfWithThree): Promise<Loaded> {
  const gltf = await read(`${base}/${file.url}`);
  asAuthored(gltf.scene);
  seeThrough(gltf.scene, file.url);
  const framing = framingOf(gltf.scene, file);
  return { make: () => framed(clone(gltf.scene), file, framing), clips: gltf.animations, original: gltf.scene };
}

/** Loads every model, under the site's path (`base`), for the model lab. */
export async function loadGltfModels(
  base: string,
  read: ReadGltf = readGltfWithThree,
  files: Readonly<Record<GltfName, ModelFile>> = GLTF_MODELS,
): Promise<Record<GltfName, Loaded>> {
  const load = (file: ModelFile) => loadModel(base, file, read);
  const m = files;
  const [figure, walker, bicycle, motorbike, car, pickup, helicopter] = await Promise.all(
    [m.figure, m.walker, m.bicycle, m.motorbike, m.car, m.pickup, m.helicopter].map(load),
  );
  return {
    figure: figure!,
    walker: walker!,
    bicycle: bicycle!,
    motorbike: motorbike!,
    car: car!,
    pickup: pickup!,
    helicopter: helicopter!,
  };
}

/** Plays a model's clip by name from a point in it, frozen there: a pose for a still picture. */
export function pose(model: Object3D, clips: readonly AnimationClip[], name: string, at: number) {
  const clip = clips.find((c) => c.name === name);
  if (!clip) return;
  const mixer = new AnimationMixer(model);
  mixer.clipAction(clip).play();
  mixer.update(at * clip.duration);
}
