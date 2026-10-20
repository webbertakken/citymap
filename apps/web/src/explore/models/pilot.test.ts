import { THEMES } from "@citymap/themes";
import { Group, Matrix4, Mesh, Object3D, PropertyBinding, SkinnedMesh, Vector3 } from "three";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Hull } from "../../testing/hull";
import { readPublicModel } from "../../testing/models";
import { METRE } from "../street";
import { standing, type Helicopter } from "../vehicles";
import { GLTF_MODELS, loadModel, pose, type Loaded } from "./gltf";
import { figure as standIn, paletteOf } from "./procedural";
import { RIGS } from "./rig";
import { figureOf, pilot, placeVehicle, slotOf, type Slot } from "./seat";

// The pilot on the walk's own models: the man seated in the AS350's cockpit by the nodes its build marks, and nothing of
// him outside its hull or its glass, however it is tilted.

const theme = THEMES["night-atlas"];
/** A contact is met within this many metres. */
const MET = 0.02;

let person: Loaded;
let helicopter: Loaded;
beforeAll(async () => {
  [person, helicopter] = await Promise.all([
    loadModel("", GLTF_MODELS.figure, readPublicModel),
    loadModel("", GLTF_MODELS.helicopter, readPublicModel),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A pilot as the walk draws one: the figure measured as made, then in its driving clip, at the walk's scale. */
function aboard() {
  const walker = person.make();
  walker.scale.setScalar(METRE);
  const figure = figureOf(walker);
  if (!figure) throw new Error("test/no-figure");
  pose(walker, person.clips, "Driving_Loop", 0);
  return { walker, figure };
}

/** The helicopter as the walk draws it, flying at a heading, nose down by `pitch` and its right down by `roll`. */
function flown(heading: number, pitch: number, roll: number, slot = slotOf("helicopter", helicopter, theme)) {
  const parked = standing("h", "helicopter", { x: 4, y: 12, z: -3 }, heading);
  const vehicle: Helicopter = { ...parked, heli: { ...parked.heli, pitch, roll, grounded: false } };
  const group = new Group();
  group.scale.setScalar(METRE);
  group.add(slot.model);
  placeVehicle(slot, group, vehicle, new Map(), 0);
  return slot;
}

const at = (part: Object3D) => part.getWorldPosition(new Vector3());
const inFrame = (slot: Slot, point: Vector3) => slot.model.worldToLocal(point.clone());
const contact = (slot: Slot, name: string) => inFrame(slot, at(slot.model.getObjectByName(name)!));
const bone = (walker: Object3D, name: string) => walker.getObjectByName(PropertyBinding.sanitizeNodeName(name))!;
const palm = (slot: Slot, walker: Object3D, s: "L" | "R") =>
  inFrame(slot, at(bone(walker, `Hand.${s}`)).lerp(at(bone(walker, `Middle1.${s}`)), 0.6));
const ball = (slot: Slot, walker: Object3D, s: "L" | "R") => inFrame(slot, at(bone(walker, `ToeBase.${s}`)));

/** The helicopter's hull and glass, in its model's own frame. */
function hullOf(slot: Slot) {
  slot.model.updateMatrixWorld(true);
  const into = new Matrix4().copy(slot.model.matrixWorld).invert();
  const parts: Mesh[] = [];
  slot.model.traverse((node) => {
    if (!(node instanceof Mesh) || Array.isArray(node.material)) return;
    if (node.material.name === "helicopter_paint" || node.material.name === "helicopter_glass") parts.push(node);
  });
  expect(parts).toHaveLength(2);
  return new Hull(parts.map((m) => ({ geometry: m.geometry, matrix: into.clone().multiply(m.matrixWorld) })));
}

/** Every vertex of the figure's skin as drawn, in the helicopter's model's frame. */
function skinOf(walker: Object3D, slot: Slot) {
  walker.updateMatrixWorld(true);
  const points: Vector3[] = [];
  walker.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const count = node.geometry.getAttribute("position").count;
    for (let i = 0; i < count; i++)
      points.push(inFrame(slot, node.getVertexPosition(i, new Vector3()).applyMatrix4(node.matrixWorld)));
  });
  return points;
}

const ATTITUDES = [
  { heading: 0, pitch: 0, roll: 0 },
  { heading: 1, pitch: 0.4, roll: -0.5 },
  { heading: -2.2, pitch: -0.4, roll: 0.5 },
] as const;

describe("pilot", () => {
  it("sits the pilot's hips on the seat, the right palm on the cyclic, the left on the collective, feet on the pedals", () => {
    for (const { heading, pitch, roll } of ATTITUDES) {
      const slot = flown(heading, pitch, roll);
      const { walker, figure } = aboard();
      pilot(walker, figure, slot);
      const marks = RIGS.helicopter.pilot;
      const seat = contact(slot, marks.seat);
      expect(inFrame(slot, at(figure.hips)).distanceTo(seat.setY(seat.y + figure.seat))).toBeLessThan(1e-6);
      expect(palm(slot, walker, "R").distanceTo(contact(slot, marks.cyclic))).toBeLessThan(MET);
      expect(palm(slot, walker, "L").distanceTo(contact(slot, marks.collective))).toBeLessThan(MET);
      const sole = new Vector3(0, figure.sole, 0);
      expect(ball(slot, walker, "R").distanceTo(contact(slot, marks.pedals.right).add(sole))).toBeLessThan(MET);
      expect(ball(slot, walker, "L").distanceTo(contact(slot, marks.pedals.left).add(sole))).toBeLessThan(MET);
      expect(walker.visible).toBe(true);
    }
  });

  it("keeps every part of the pilot inside the hull and its glass, however the helicopter is tilted", () => {
    for (const { heading, pitch, roll } of ATTITUDES) {
      const slot = flown(heading, pitch, roll);
      const { walker, figure } = aboard();
      pilot(walker, figure, slot);
      const hull = hullOf(slot);
      const skin = skinOf(walker, slot);
      const out = skin.filter((p) => !hull.holds(p));
      expect(skin.length).toBeGreaterThan(500);
      expect(
        out
          .map((p) =>
            p
              .toArray()
              .map((v) => v.toFixed(2))
              .join(", "),
          )
          .slice(0, 5),
      ).toEqual([]);
    }
  });

  it("would see a pilot poking out: one lifted through the roof, or slid through the windscreen", () => {
    const slot = flown(0.5, 0.2, 0.3);
    const hull = hullOf(slot);
    const { walker, figure } = aboard();
    pilot(walker, figure, slot);
    const inside = skinOf(walker, slot).filter((p) => hull.holds(p)).length;
    for (const step of [new Vector3(0, 1.5, 0), new Vector3(1.2, 0, 0)]) {
      const moved = skinOf(walker, slot).map((p) => p.clone().add(step));
      expect(moved.filter((p) => hull.holds(p)).length).toBeLessThan(inside * 0.8);
    }
  });

  it("closes the pilot's hands round the controls", () => {
    const slot = flown(0, 0, 0);
    const { walker, figure } = aboard();
    pilot(walker, figure, slot);
    for (const side of [figure.left, figure.right])
      expect(side.fingers[0]![1].quaternion.angleTo(figure.rest.get(side.fingers[0]![1])!)).toBeGreaterThan(0.5);
  });

  it("keeps the pilot out of sight in the stand-in, which has no cabin", () => {
    const slot = flown(0, 0, 0, slotOf("helicopter", null, theme));
    const { walker, figure } = aboard();
    pilot(walker, figure, slot);
    expect(walker.visible).toBe(false);
  });

  it("keeps a figure without the bones to sit out of sight", () => {
    const slot = flown(0, 0, 0);
    const walker = standIn(paletteOf(theme));
    pilot(walker, figureOf(walker), slot);
    expect(walker.visible).toBe(false);
  });

  it("keeps the pilot out of sight in a model without its cockpit, said once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const slot = flown(0, 0, 0);
    slot.model.getObjectByName(RIGS.helicopter.pilot.cyclic)!.removeFromParent();
    const { walker, figure } = aboard();
    pilot(walker, figure, slot);
    pilot(walker, figure, slot);
    expect(walker.visible).toBe(false);
    const said = error.mock.calls.filter(([line]) => String(line).includes("explore/no-contact"));
    expect(said).toHaveLength(1);
    expect(String(said[0]![0])).toContain(RIGS.helicopter.pilot.cyclic);
  });
});
