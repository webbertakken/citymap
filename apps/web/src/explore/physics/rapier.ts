// The city's walls in Rapier (a physics engine compiled to WebAssembly): a ground plane, every building a convex prism,
// and a capsule the size of a person moved by Rapier's character controller. The engine loads on first use; the walls
// rise in slices, reporting their progress, so the page stays responsive and the loading card can count them.
import {
  GROUND,
  PERSON_HEIGHT,
  PERSON_RADIUS,
  SNAP_DOWN,
  STEP_UP,
  solid,
  type Footprint,
  type Vec3,
  type Walls,
} from "@citymap/world";
import { log } from "../../log";
import { breathe, type WallOptions } from "./raise";

type Rapier = typeof import("@dimforge/rapier3d-compat");

/** A mover as Rapier's capsule, as tall as a person: the straight part between its two half spheres, at a radius. */
export const capsuleHalf = (radius: number) => Math.max(0, PERSON_HEIGHT / 2 - radius);
/** The controller keeps this gap to every wall, in metres. */
export const SKIN = 0.02;
/** Walls rise in slices of this many buildings between reports. */
export const SLICE = 2000;

let engine: Promise<Rapier> | null = null;

/** Rapier, loaded and initialised once. */
const loadRapier = (): Promise<Rapier> => {
  engine ??= import("@dimforge/rapier3d-compat").then(async (rapier) => {
    await rapier.init();
    return rapier;
  });
  return engine;
};

/** The walls of these buildings; Rapier's hull of a footprint without area or height fails, so none is made. */
export async function rapierWalls(footprints: readonly Footprint[], options: WallOptions = {}): Promise<Walls> {
  const { onStep, signal } = options;
  const started = performance.now();
  onStep?.({ phase: "engine" });
  const rapier = await loadRapier();
  signal?.throwIfAborted();
  const engineMs = Math.round(performance.now() - started);
  const world = new rapier.World({ x: 0, y: 0, z: 0 });
  try {
    // No ground collider: a box a city wide is beyond Rapier's 32-bit precision, and a walker on it sinks and bobs by
    // centimetres. The flat ground is held here instead, as the bespoke walls hold it; Rapier has buildings and roofs.
    // Slice by slice, letting the page paint between them; each says how many it could not raise.
    const raiseFrom = async (from: number): Promise<number> => {
      if (from >= footprints.length) return 0;
      onStep?.({ phase: "walls", done: from, of: footprints.length });
      const skipped = footprints
        .slice(from, from + SLICE)
        .filter((footprint) => !raise(rapier, world, footprint)).length;
      await breathe();
      signal?.throwIfAborted();
      return skipped + (await raiseFrom(from + SLICE));
    };
    const skipped = await raiseFrom(0);
    onStep?.({ phase: "walls", done: footprints.length, of: footprints.length });
    // One step lets the world's queries see every wall.
    world.step();
    log.info("explore/walls", {
      engine: "rapier",
      buildings: footprints.length,
      skipped,
      engineMs,
      ms: Math.round(performance.now() - started),
    });
    return walk(rapier, world);
  } catch (failure) {
    world.free();
    throw failure;
  }
}

/** One building's wall: its footprint from the ground to its roof, in metres. False when it cannot stand. */
function raise(rapier: Rapier, world: InstanceType<Rapier["World"]>, footprint: Footprint): boolean {
  if (!solid(footprint)) return false;
  const points = new Float32Array(footprint.corners.length * 6);
  footprint.corners.forEach((c, i) => {
    points.set([c.x, 0, c.z, c.x, footprint.top, c.z], i * 6);
  });
  const hull = rapier.ColliderDesc.convexHull(points);
  if (!hull) return false;
  world.createCollider(hull);
  return true;
}

/**
 * Feet after a move, held to the flat ground: never below it, and kept on it over a small drop going down, as a walker
 * keeps to a pavement; rising, they leave it.
 */
export function onGround(moved: Vec3, from: Vec3, delta: Vec3): { readonly feet: Vec3; readonly grounded: boolean } {
  const near = delta.y <= 0 && moved.y - GROUND <= SNAP_DOWN && from.y - GROUND <= SNAP_DOWN;
  if (moved.y <= GROUND || near) return { feet: { ...moved, y: GROUND }, grounded: true };
  return { feet: moved, grounded: false };
}

/** Movers in the world: a capsule per size, moved by the character controller; and rays for the camera. */
function walk(rapier: Rapier, world: InstanceType<Rapier["World"]>): Walls {
  // Movers are sensors: rays and other movers pass through them, and only the walls stop them.
  const passThrough = rapier.QueryFilterFlags.EXCLUDE_SENSORS;
  const capsules = new Map<number, InstanceType<Rapier["Collider"]>>();
  const capsuleOf = (radius: number) => {
    let capsule = capsules.get(radius);
    if (!capsule) {
      capsule = world.createCollider(rapier.ColliderDesc.capsule(capsuleHalf(radius), radius).setSensor(true));
      capsules.set(radius, capsule);
    }
    return capsule;
  };
  const controller = world.createCharacterController(SKIN);
  controller.enableAutostep(STEP_UP, PERSON_RADIUS, false);
  controller.enableSnapToGround(SNAP_DOWN);
  controller.setApplyImpulsesToDynamicBodies(false);
  return {
    move: (feet: Vec3, delta: Vec3, radius = PERSON_RADIUS) => {
      const body = capsuleOf(radius);
      body.setTranslation({ x: feet.x, y: feet.y + capsuleHalf(radius) + radius + SKIN, z: feet.z });
      controller.computeColliderMovement(body, delta, passThrough);
      const moved = controller.computedMovement();
      const after = { x: feet.x + moved.x, y: feet.y + moved.y, z: feet.z + moved.z };
      // Standing on a roof or a kerb, Rapier holds the feet; anywhere else, the ground does.
      if (controller.computedGrounded() && after.y > GROUND) return { feet: after, grounded: true };
      return onGround(after, feet, delta);
    },
    clearance: (from: Vec3, to: Vec3) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      if (length === 0) return 0;
      const ray = new rapier.Ray(from, {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
        z: (to.z - from.z) / length,
      });
      const wall = world.castRay(ray, length, true, passThrough)?.timeOfImpact ?? length;
      // The ground stops a line going down.
      const ground = to.y < GROUND && from.y >= GROUND ? ((from.y - GROUND) / (from.y - to.y)) * length : length;
      return Math.min(wall, ground);
    },
    dispose: () => {
      world.removeCharacterController(controller);
      world.free();
    },
  };
}
