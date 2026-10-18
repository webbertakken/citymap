import { THEMES } from "@citymap/themes";
import { Group, Mesh, Vector3, type Object3D } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { readPublicModel } from "../../testing/models";
import { hubOf, type Point } from "./contacts";
import { GLTF_MODELS, loadModel, type Loaded } from "./gltf";
import { kickstandOf } from "./kickstand";
import { bicycle, car, motorbike, paletteOf } from "./procedural";
import { PROCEDURAL_RIGS, RIGS, poseVehicle, type Pose, type Rig } from "./rig";

/** A wheel turned this many steps over a full turn. */
const STEPS = 24;
/** Its hub stays within this many metres of where it was, and its axle within this many radians. */
const HUB_HELD = 0.001;
const AXLE_HELD = 0.002;

const still: Pose = { rolled: 0, steer: 0, lean: 0, pitch: 0, crank: 0, stand: 0 };
const palette = paletteOf(THEMES["night-atlas"]);

let loaded: { readonly bicycle: Loaded; readonly motorbike: Loaded };
beforeAll(async () => {
  const [b, m] = await Promise.all(
    [GLTF_MODELS.bicycle, GLTF_MODELS.motorbike].map((f) => loadModel("", f, readPublicModel)),
  );
  loaded = { bicycle: b!, motorbike: m! };
});

/** Every vertex of a part's meshes, in its model's frame (metres, facing +x). */
function pointsIn(model: Object3D, part: Object3D): Point[] {
  model.updateMatrixWorld(true);
  const points: Point[] = [];
  part.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const positions = node.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const p = model.worldToLocal(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld));
      points.push([p.x, p.y, p.z]);
    }
  });
  return points;
}

/** Each wheel's hub and axle in its model's frame, at each step of a full turn of the wheels. */
function turned(model: Object3D, rig: Rig) {
  return rig.wheels.map(({ name }) =>
    Array.from({ length: STEPS + 1 }, (_, i) => {
      poseVehicle(model, rig, { ...still, rolled: (i / STEPS) * 2 * Math.PI * rig.radius });
      return hubOf(pointsIn(model, model.getObjectByName(name)!), 2);
    }),
  );
}

const MODELS: readonly (readonly [string, () => Object3D, Rig])[] = [
  ["the bicycle", () => loaded.bicycle.make(), RIGS.bicycle],
  ["the motorbike", () => loaded.motorbike.make(), RIGS.motorbike],
  ["the stand-in bicycle", () => bicycle(palette), PROCEDURAL_RIGS.bicycle],
  ["the stand-in motorbike", () => motorbike(palette), PROCEDURAL_RIGS.motorbike],
  ["the stand-in car", () => car(palette), PROCEDURAL_RIGS.car],
];

describe("a wheel", () => {
  it.each(MODELS)(
    "of %s turns true: its hub held in the frame, its axle across it, over a full turn",
    (_, make, rig) => {
      for (const turns of turned(make(), rig)) {
        const [first] = turns;
        for (const { centre, axle } of turns) {
          expect(new Vector3(...centre).distanceTo(new Vector3(...first!.centre))).toBeLessThan(HUB_HELD);
          expect(new Vector3(...axle).angleTo(new Vector3(0, 0, 1))).toBeLessThan(AXLE_HELD);
        }
      }
    },
  );
});

describe("the rider's contacts", () => {
  it.each(MODELS.slice(0, 4))("of %s are marked on its model", (_, make, rig) => {
    const model = make();
    const { rider } = rig;
    for (const name of [rider!.saddle, rider!.grips.left, rider!.grips.right, rider!.feet.left, rider!.feet.right])
      expect(model.getObjectByName(name)?.name).toBe(name);
  });

  it("put the bicycle's saddle on its frame's top, its grips at the bars' ends and its pedals on the crank", () => {
    const model = loaded.bicycle.make();
    poseVehicle(model, RIGS.bicycle, still);
    const at = (name: string) => model.worldToLocal(model.getObjectByName(name)!.getWorldPosition(new Vector3()));
    // The frame's own mesh, not the parts it carries.
    const frame = model.getObjectByName("bicycle_red")!;
    if (!(frame instanceof Mesh)) throw new Error("test/no-frame-mesh");
    const own = new Group();
    model.updateMatrixWorld(true);
    const copy = new Mesh(frame.geometry);
    copy.applyMatrix4(frame.matrixWorld);
    own.add(copy);
    const top = Math.max(...pointsIn(own, own).map((p) => p[1]));
    expect(model.localToWorld(at("bicycle_red_saddle")).y).toBeCloseTo(top, 6);
    // Each pair mirrors across the middle: left at −z, right at +z.
    for (const what of ["grip", "pedal"]) {
      const [left, right] = [at(`bicycle_red_${what}_left`), at(`bicycle_red_${what}_right`)];
      expect(left.z).toBeLessThan(-0.1);
      expect(left.z).toBeCloseTo(-right.z, 3);
    }
  });
});

/** The stand's lowest point above the ground, in metres, and its model's lean. */
function stood(down: number) {
  const model = loaded.bicycle.make();
  const group = new Group();
  group.add(model);
  poseVehicle(model, RIGS.bicycle, { ...still, stand: down });
  group.updateMatrixWorld(true);
  const stand = model.getObjectByName(RIGS.bicycle.kickstand)!;
  const lowest = Math.min(...pointsIn(group, stand).map((p) => p[1]));
  return { lowest, lean: -model.rotation.x, stand: kickstandOf(stand)! };
}

describe("the bicycle's kickstand", () => {
  it("stands the parked bicycle on its foot, leaning onto it as the pack drew it", () => {
    const { lowest, lean, stand } = stood(1);
    expect(stand.lean).toBeCloseTo(0.14, 2);
    expect(lean).toBeCloseTo(stand.lean, 9);
    expect(Math.abs(lowest)).toBeLessThan(0.01);
  });

  it("folds it up, clear of the ground, the bicycle upright", () => {
    const { lowest, lean } = stood(0);
    expect(lean).toBe(0);
    expect(lowest).toBeGreaterThan(0.2);
  });
});
