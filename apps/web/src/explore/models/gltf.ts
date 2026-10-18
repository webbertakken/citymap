// Figures and vehicles from glTF files (Kenney's CC0 packs and poly.pizza), normalised to the procedural models'
// frame: metres, facing +x, standing on y = 0, centred on their footprint.
import {
  AnimationMixer,
  Box3,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Vector3,
  type AnimationClip,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { log } from "../../log";

/** One model file: where it is, how long (or tall) it stands in metres, and the turn that points it along +x. */
export interface ModelFile {
  readonly url: string;
  /** Its size in metres along its longest ground axis, or its height for a figure. */
  readonly metres: number;
  readonly measure: "length" | "height";
  /** Radians about y that turn the file's forward to +x. */
  readonly yaw: number;
}

export const GLTF_MODELS = {
  figure: { url: "kenney-people/character-male-a.glb", metres: 1.75, measure: "height", yaw: Math.PI / 2 },
  walker: { url: "kenney-people/character-female-b.glb", metres: 1.68, measure: "height", yaw: Math.PI / 2 },
  bicycle: { url: "bicycle.glb", metres: 1.75, measure: "length", yaw: 0 },
  motorbike: { url: "motorbike.glb", metres: 2.1, measure: "length", yaw: Math.PI / 2 },
  car: { url: "kenney-cars/hatchback-sports.glb", metres: 4.1, measure: "length", yaw: Math.PI / 2 },
  helicopter: { url: "helicopter.glb", metres: 10, measure: "length", yaw: 0 },
} as const satisfies Record<string, ModelFile>;

export type GltfName = keyof typeof GLTF_MODELS;

/** A loaded model: a fresh copy of its scene each time, and its animations. */
export interface Loaded {
  readonly make: () => Object3D;
  readonly clips: readonly AnimationClip[];
}

/** The file's scene, turned, scaled and set down so it matches the procedural frame. */
function normalised(scene: Object3D, file: ModelFile): Object3D {
  const turned = new Group();
  scene.rotation.y = file.yaw;
  turned.add(scene);
  const box = new Box3().setFromObject(turned);
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
  scene.position.set(-centre.x, -box.min.y, -centre.z);
  const scaled = new Group();
  scaled.add(turned);
  scaled.scale.setScalar(scale);
  // Callers place, turn and scale the outer group; the file's own correction stays inside it.
  const outer = new Group();
  outer.add(scaled);
  return outer;
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

/** What a glTF file gives: its scene and its animations. */
export interface GltfFile {
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
}

/** Reads a glTF file from a URL: three.js's loader in the browser, a stand-in in tests. */
export type ReadGltf = (url: string) => Promise<GltfFile>;

export const readGltfWithThree: ReadGltf = (url) => new GLTFLoader().loadAsync(url);

/** Loads every model under `base` (the site's lab folder), once. */
export async function loadGltfModels(
  base: string,
  read: ReadGltf = readGltfWithThree,
): Promise<Record<GltfName, Loaded>> {
  const load = async (file: ModelFile): Promise<Loaded> => {
    const gltf = await read(`${base}/${file.url}`);
    asAuthored(gltf.scene);
    return { make: () => normalised(clone(gltf.scene), file), clips: gltf.animations };
  };
  const m = GLTF_MODELS;
  const [figure, walker, bicycle, motorbike, car, helicopter] = await Promise.all(
    [m.figure, m.walker, m.bicycle, m.motorbike, m.car, m.helicopter].map(load),
  );
  return {
    figure: figure!,
    walker: walker!,
    bicycle: bicycle!,
    motorbike: motorbike!,
    car: car!,
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
