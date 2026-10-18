import { THEMES } from "@citymap/themes";
import { Group, Object3D, PropertyBinding, Vector3 } from "three";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readPublicModel } from "../../testing/models";
import { FALLING } from "../singletrack";
import { METRE } from "../street";
import { standing, type Bicycle, type Motorbike } from "../vehicles";
import { GLTF_MODELS, loadModel, pose, type Loaded } from "./gltf";
import { FOOT_AHEAD, FOOT_OUT, THROWN } from "./pedalling";
import { figure as standIn, paletteOf } from "./procedural";
import { PROCEDURAL_RIGS, RIGS } from "./rig";
import { SLIDE_MOST, figureOf, placeVehicle, release, seat, slotOf, type Figure, type Slot } from "./seat";

const theme = THEMES["night-atlas"];
/** A contact is met within this many metres. */
const MET = 0.02;

let person: Loaded;
let rides: { readonly bicycle: Loaded; readonly motorbike: Loaded };
beforeAll(async () => {
  const [man, bicycle, motorbike] = await Promise.all(
    [GLTF_MODELS.figure, GLTF_MODELS.bicycle, GLTF_MODELS.motorbike].map((file) =>
      loadModel("", file, readPublicModel),
    ),
  );
  person = man!;
  rides = { bicycle: bicycle!, motorbike: motorbike! };
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A rider as the walk draws one: the figure measured as made, then in its driving clip, at the walk's scale. */
function rider() {
  const walker = person.make();
  walker.scale.setScalar(METRE);
  const figure = figureOf(walker);
  if (!figure) throw new Error("test/no-figure");
  pose(walker, person.clips, "Driving_Loop", 0);
  return { walker, figure };
}

/** A ride in its group, as the walk draws it, posed for a vehicle with its stand folded. */
function ride(kind: "bicycle" | "motorbike", vehicle: Bicycle | Motorbike) {
  const slot = slotOf(kind, rides[kind], theme);
  const group = new Group();
  group.scale.setScalar(METRE);
  group.add(slot.model);
  placeVehicle(slot, group, vehicle, new Map(), 0);
  return { slot, group };
}

const feet = { x: 3, y: 0, z: -2 };
const bicycleAt = (cycle: Partial<Bicycle["cycle"]>, steer = 0): Bicycle => {
  const bike = standing("b", "bicycle", feet, 0.7, 0);
  return { ...bike, steer, speed: 5, cycle: { ...bike.cycle, footDown: false, ...cycle } };
};
const motorbikeAt = (moto: Partial<Motorbike["moto"]>, steer = 0): Motorbike => {
  const bike = standing("m", "motorbike", feet, -0.4);
  return { ...bike, steer, speed: 6, moto: { ...bike.moto, footDown: false, ...moto } };
};

const at = (part: Object3D) => part.getWorldPosition(new Vector3());
/** A point in a machine's frame (metres), from the world. */
const inFrame = (slot: Slot, point: Vector3) => slot.model.worldToLocal(point.clone());
const contact = (slot: Slot, name: string) => inFrame(slot, at(slot.model.getObjectByName(name)!));
const bone = (walker: Object3D, name: string) => walker.getObjectByName(PropertyBinding.sanitizeNodeName(name))!;
const palm = (slot: Slot, walker: Object3D, s: "L" | "R") =>
  inFrame(slot, at(bone(walker, `Hand.${s}`)).lerp(at(bone(walker, `Middle1.${s}`)), 0.6));
const ball = (slot: Slot, walker: Object3D, s: "L" | "R") => inFrame(slot, at(bone(walker, `ToeBase.${s}`)));

/**
 * How far the ball of a rider's left foot is from the ground `FOOT_OUT` to the left of a point along the machine (its
 * sole's height up), on the ground the machine stands on (its group's y = 0, whatever its lean).
 */
function onGround(group: Group, slot: Slot, walker: Object3D, along: number) {
  const ground = group.worldToLocal(slot.model.localToWorld(new Vector3(along, 0, -FOOT_OUT))).setY(0);
  const left = group.worldToLocal(at(bone(walker, "ToeBase.L")));
  return left.distanceTo(ground);
}

/**
 * Where a rider misses a machine, said in words (none when seated): hips on its saddle (or forward along it as far as
 * the arms needed), palms on its grips, the balls of the feet on its feet's nodes (the left free at a stop), and the
 * knees bent ahead of the line from hip to foot.
 */
function missesOf(slot: Slot, walker: Object3D, figure: Figure, footDown = false): string[] {
  const marks = slot.rig.rider!;
  const misses: string[] = [];
  const saddle = contact(slot, marks.saddle);
  const off = inFrame(slot, at(figure.hips)).sub(saddle.clone().setY(saddle.y + figure.seat));
  if (Math.hypot(off.y, off.z) > 1e-6 || off.x < -1e-9 || off.x > SLIDE_MOST + 1e-9)
    misses.push(
      `hips off the saddle by ${off
        .toArray()
        .map((v) => v.toFixed(3))
        .join(", ")}`,
    );
  const sole = new Vector3(0, figure.sole, 0);
  const near = (what: string, from: Vector3, to: Vector3) => {
    if (from.distanceTo(to) >= MET) misses.push(`${what} ${from.distanceTo(to).toFixed(3)} m off`);
  };
  near("left palm", palm(slot, walker, "L"), contact(slot, marks.grips.left));
  near("right palm", palm(slot, walker, "R"), contact(slot, marks.grips.right));
  near("right foot", ball(slot, walker, "R"), contact(slot, marks.feet.right).add(sole));
  if (!footDown) near("left foot", ball(slot, walker, "L"), contact(slot, marks.feet.left).add(sole));
  for (const s of ["L", "R"] as const) {
    const hip = inFrame(slot, at(bone(walker, `UpperLeg.${s}`)));
    const knee = inFrame(slot, at(bone(walker, `LowerLeg.${s}`)));
    const foot = inFrame(slot, at(bone(walker, `Foot.${s}`)));
    const line = foot.clone().sub(hip).normalize();
    const out = knee.clone().sub(hip);
    if (out.sub(line.multiplyScalar(out.dot(line))).x <= 0.02) misses.push(`${s} knee not bent ahead`);
  }
  return misses;
}

describe("figureOf", () => {
  it("measures a rigged figure: its hips above what it sits on, its foot's ball above its sole, its hips standing", () => {
    const { figure } = rider();
    expect(figure.seat).toBeGreaterThan(0.03);
    expect(figure.seat).toBeLessThan(0.2);
    expect(figure.sole).toBeGreaterThanOrEqual(0);
    expect(figure.sole).toBeLessThan(0.1);
    expect(figure.standing).toBeGreaterThan(0.8);
    expect(figure.standing).toBeLessThan(1.1);
  });

  it("calls a figure without the bones to ride none", () => {
    expect(figureOf(standIn(paletteOf(theme)))).toBeNull();
    const handless = rider().walker;
    bone(handless, "Middle1.L").removeFromParent();
    expect(figureOf(handless)).toBeNull();
    const fingerless = rider().walker;
    bone(fingerless, "Thumb3.R").removeFromParent();
    expect(figureOf(fingerless)).toBeNull();
    const headless = rider().walker;
    bone(headless, "Head").removeFromParent();
    expect(figureOf(headless)).toBeNull();
  });
});

describe("seat on the bicycle", () => {
  it.each([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2])(
    "puts the hips on the saddle, the palms on the grips and the feet on the pedals as the crank turns (%f)",
    (crank) => {
      const vehicle = bicycleAt({ crank });
      const { slot, group } = ride("bicycle", vehicle);
      const { walker, figure } = rider();
      seat(walker, figure, slot, group, vehicle);
      expect(missesOf(slot, walker, figure)).toEqual([]);
    },
  );

  it("holds the grips as the bars turn and the bicycle leans, either way", () => {
    for (const [steer, lean] of [
      [0.4, 0.3],
      [-0.4, -0.3],
    ] as const) {
      const vehicle = bicycleAt({ lean, steer, crank: 1 }, steer);
      const { slot, group } = ride("bicycle", vehicle);
      const { walker, figure } = rider();
      seat(walker, figure, slot, group, vehicle);
      expect(missesOf(slot, walker, figure)).toEqual([]);
    }
  });

  it("closes the fingers round the grips, and opens them again when released", () => {
    const vehicle = bicycleAt({});
    const { slot, group } = ride("bicycle", vehicle);
    const { walker, figure } = rider();
    const open = bone(walker, "Middle3.L").quaternion.clone();
    seat(walker, figure, slot, group, vehicle);
    // The fingertip curls down, below the knuckle it reaches from.
    const knuckle = inFrame(slot, at(bone(walker, "Middle1.L")));
    const tip = inFrame(slot, at(bone(walker, "Middle3.L")));
    expect(tip.y).toBeLessThan(knuckle.y);
    expect(bone(walker, "Middle3.L").quaternion.equals(open)).toBe(false);
    release(figure);
    expect(bone(walker, "Middle3.L").quaternion.equals(open)).toBe(true);
  });

  it("puts the left foot on the ground beside the saddle at a stop, the bicycle leaning onto it", () => {
    const vehicle = bicycleAt({ footDown: true, lean: 0.12 });
    const { slot, group } = ride("bicycle", vehicle);
    const { walker, figure } = rider();
    seat(walker, figure, slot, group, vehicle);
    expect(missesOf(slot, walker, figure, true)).toEqual([]);
    const saddle = contact(slot, RIGS.bicycle.rider.saddle);
    expect(onGround(group, slot, walker, saddle.x + FOOT_AHEAD)).toBeLessThan(MET);
  });

  it("lays a thrown rider beside it, fingers open, and seats a figure without bones by its legs' tops", () => {
    const thrown = bicycleAt({ fall: { time: FALLING, side: 1, cause: "hit", speed: 5 } });
    const { slot, group } = ride("bicycle", thrown);
    const { walker, figure } = rider();
    seat(walker, figure, slot, group, thrown);
    const lying = group.worldToLocal(walker.position.clone());
    expect(lying.x).toBeCloseTo(THROWN, 6);
    expect(lying.y).toBeCloseTo(0, 6);
    expect(walker.rotation.x).toBeCloseTo(-Math.PI / 2, 6);
    const stand = standIn(paletteOf(theme));
    const upright = bicycleAt({});
    seat(stand, null, slot, group, upright);
    const saddle = contact(slot, RIGS.bicycle.rider.saddle);
    const legs = stand.getObjectByName("leg-left")!.position.y;
    expect(inFrame(slot, stand.position).y).toBeCloseTo(saddle.y - legs, 6);
  });
});

describe("seat on the motorbike", () => {
  it("puts the hips on the seat, the palms on the grips and the feet on the pegs, steered and leaning", () => {
    for (const [steer, lean] of [
      [0, 0],
      [0.3, 0.4],
      [-0.3, -0.4],
    ] as const) {
      const vehicle = motorbikeAt({ lean, steer }, steer);
      const { slot, group } = ride("motorbike", vehicle);
      const { walker, figure } = rider();
      seat(walker, figure, slot, group, vehicle);
      expect(missesOf(slot, walker, figure)).toEqual([]);
    }
  });

  it("puts the left foot down beside the seat at a stop", () => {
    const vehicle = motorbikeAt({ footDown: true });
    const { slot, group } = ride("motorbike", vehicle);
    const { walker, figure } = rider();
    seat(walker, figure, slot, group, vehicle);
    const seated = contact(slot, RIGS.motorbike.rider.saddle);
    expect(onGround(group, slot, walker, seated.x + FOOT_AHEAD)).toBeLessThan(MET);
  });
});

describe("seat without contacts", () => {
  it("leaves a rider of a machine whose rig marks none where it was", () => {
    const vehicle = bicycleAt({});
    const { slot, group } = ride("bicycle", vehicle);
    const { walker, figure } = rider();
    const before = walker.position.clone();
    seat(walker, figure, { ...slot, rig: RIGS.car }, group, vehicle);
    expect(walker.position.equals(before)).toBe(true);
  });

  it("says once which contact a model lacks, and leaves its rider where it was", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const vehicle = bicycleAt({});
    const { slot, group } = ride("bicycle", vehicle);
    slot.model.getObjectByName(RIGS.bicycle.rider.saddle)!.removeFromParent();
    const { walker, figure } = rider();
    const before = walker.position.clone();
    seat(walker, figure, slot, group, vehicle);
    seat(walker, figure, slot, group, vehicle);
    expect(walker.position.equals(before)).toBe(true);
    expect(error.mock.calls.map(([line]) => String(line))).toEqual(["explore/no-contact name=bicycle_red_saddle"]);
  });
});

describe("slotOf", () => {
  it("draws a kind by its loaded model and rig, or by its stand-in and the stand-in's rig", () => {
    expect(slotOf("bicycle", rides.bicycle, theme).rig).toBe(RIGS.bicycle);
    expect(slotOf("saloon", rides.bicycle, theme).rig).toBe(RIGS.car);
    expect(slotOf("bicycle", null, theme).rig).toBe(PROCEDURAL_RIGS.bicycle);
    expect(slotOf("motorbike", null, theme).rig).toBe(PROCEDURAL_RIGS.motorbike);
    expect(slotOf("pickup", null, theme).rig).toBe(PROCEDURAL_RIGS.car);
    expect(slotOf("helicopter", null, theme).rig).toBe(PROCEDURAL_RIGS.helicopter);
  });
});

describe("placeVehicle", () => {
  it("turns a car's group by its whole attitude, and rolls its wheels by how far it moved since last drawn", () => {
    const slot = slotOf("saloon", null, theme);
    const group = new Group();
    const parked = standing("c", "car", feet, 0);
    const rolled = new Map();
    placeVehicle(slot, group, parked, rolled, 1);
    const tipped = {
      ...parked,
      speed: 2,
      feet: { ...feet, x: feet.x + 0.5 },
      attitude: { x: 0, y: 0, z: 0.6, w: 0.8 },
    };
    placeVehicle(slot, group, tipped, rolled, 1);
    expect(group.quaternion.z).toBeCloseTo(0.6, 9);
    expect(rolled.get("c").rolled).toBeCloseTo(0.5, 9);
    expect(group.visible).toBe(true);
  });
});

describe("placeVehicle for the helicopter", () => {
  it("tilts its group by its pitch and roll on its heading", () => {
    const slot = slotOf("helicopter", null, theme);
    const group = new Group();
    const parked = standing("h", "helicopter", feet, 0.5);
    placeVehicle(slot, group, { ...parked, heli: { ...parked.heli, pitch: 0.2, roll: 0 } }, new Map(), 1);
    const nose = new Vector3(1, 0, 0).applyQuaternion(group.quaternion);
    expect(nose.y).toBeCloseTo(-Math.sin(0.2), 6);
  });
});

describe("seat with a figure without bones", () => {
  it("sits a stand-in without legs at the saddle, and lays it beside the bicycle when thrown", () => {
    const vehicle = bicycleAt({});
    const { slot, group } = ride("bicycle", vehicle);
    const legless = new Group();
    seat(legless, null, slot, group, vehicle);
    expect(inFrame(slot, legless.position).y).toBeCloseTo(contact(slot, RIGS.bicycle.rider.saddle).y, 6);
    const thrown = bicycleAt({ fall: { time: FALLING, side: -1, cause: "grip", speed: 5 } });
    seat(legless, null, slot, group, thrown);
    expect(legless.rotation.x).toBeCloseTo(Math.PI / 2, 6);
  });
});
