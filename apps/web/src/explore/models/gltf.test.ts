import {
  AnimationClip,
  BoxGeometry,
  Box3,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  Vector3,
  VectorKeyframeTrack,
  type Object3D,
} from "three";
import { describe, expect, it } from "vitest";
import { GLTF_MODELS, loadGltfModels, pose, readGltfWithThree, type GltfFile } from "./gltf";

/** A stand-in file: one box of the given size (x, y, z), textured, lit, with a clip that moves it. */
function fileOf(size: readonly [number, number, number]): GltfFile {
  const scene = new Group();
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ map: texture });
  material.color.setRGB(0.2, 0.2, 0.2);
  const box = new Mesh(new BoxGeometry(...size), material);
  box.name = "box";
  box.position.set(3, 7, -2);
  scene.add(box);
  // An untextured unlit part, a Lambert part (which glTF never gives, left as it is) and a plain group.
  const unlit = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial());
  const lambert = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshLambertMaterial());
  unlit.position.copy(box.position);
  lambert.position.copy(box.position);
  scene.add(unlit, lambert, new Group());
  const clip = new AnimationClip("walk", 1, [new VectorKeyframeTrack("box.scale", [0, 1], [1, 1, 1, 3, 3, 3])]);
  return { scene, animations: [clip] };
}

const read = async (url: string) => {
  // Figures are tall and narrow; vehicles long along the file's z, which their turn brings round to +x.
  if (url.endsWith(GLTF_MODELS.figure.url) || url.endsWith(GLTF_MODELS.walker.url)) return fileOf([0.4, 0.8, 0.3]);
  return fileOf([0.6, 0.5, 2]);
};

const boxOf = (model: Object3D) => new Box3().setFromObject(model);

describe("loadGltfModels", () => {
  it("asks for every model under the base", async () => {
    const asked: string[] = [];
    await loadGltfModels("/citymap", async (url) => {
      asked.push(url);
      return read(url);
    });
    expect(asked).toEqual(Object.values(GLTF_MODELS).map((m) => `/citymap/${m.url}`));
  });

  it("sizes a figure by its height and a vehicle by its length, in metres", async () => {
    const models = await loadGltfModels("", read);
    expect(boxOf(models.figure.make()).getSize(new Vector3()).y).toBeCloseTo(1.75, 6);
    expect(boxOf(models.car.make()).getSize(new Vector3()).x).toBeCloseTo(4.1, 6);
  });

  it("turns a model to face +x, stands it on the ground and centres its footprint", async () => {
    const models = await loadGltfModels("", read);
    const box = boxOf(models.motorbike.make());
    // Long along z in the file; along x once turned.
    expect(box.getSize(new Vector3()).x).toBeGreaterThan(box.getSize(new Vector3()).z);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.getCenter(new Vector3()).x).toBeCloseTo(0, 6);
    expect(box.getCenter(new Vector3()).z).toBeCloseTo(0, 6);
  });

  it("makes a fresh copy each time, that callers may scale without undoing the file's size", async () => {
    const models = await loadGltfModels("", read);
    const one = models.car.make();
    const two = models.car.make();
    expect(one).not.toBe(two);
    one.scale.setScalar(0.1);
    expect(boxOf(one).getSize(new Vector3()).x).toBeCloseTo(0.41, 6);
  });

  it("shows textures and colours as authored, on a canvas that writes colours as they are", async () => {
    const files: GltfFile[] = [];
    await loadGltfModels("", async () => {
      const file = fileOf([1, 1, 1]);
      files.push(file);
      return file;
    });
    const box = files[0]!.scene.getObjectByName("box");
    if (!(box instanceof Mesh) || !(box.material instanceof MeshStandardMaterial)) throw new Error("no box");
    expect(box.material.map?.colorSpace).toBe(NoColorSpace);
    expect(box.material.color.r).toBeCloseTo(new Color().setRGB(0.2, 0.2, 0.2).convertLinearToSRGB().r, 6);
  });
});

describe("pose", () => {
  it("holds a clip at a share of its length", async () => {
    const models = await loadGltfModels("", read);
    const model = models.car.make();
    pose(model, models.car.clips, "walk", 0.5);
    expect(model.getObjectByName("box")?.scale.x).toBeCloseTo(2, 6);
  });

  it("leaves the model as it is for a clip it does not have", async () => {
    const models = await loadGltfModels("", read);
    const model = models.car.make();
    pose(model, models.car.clips, "fly", 0.5);
    expect(model.getObjectByName("box")?.scale.x).toBe(1);
  });
});

describe("readGltfWithThree", () => {
  it("reads a glTF file with three.js's loader", async () => {
    const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "only" }] };
    const url = `data:model/gltf+json;base64,${btoa(JSON.stringify(json))}`;
    const gltf = await readGltfWithThree(url);
    expect(gltf.scene.getObjectByName("only")).toBeDefined();
  });
});
