// The city's walls in Rapier (a physics engine compiled to WebAssembly): a ground plane, every building a convex prism,
// and a capsule the size of a person moved by Rapier's character controller. The engine loads on first use; the walls
// rise in slices, reporting their progress, so the page stays responsive and the loading card can count them.
import type { OnStep } from "../../load/step";
import { log } from "../../log";
import type { Footprint } from "../footprints";
import { METRE } from "../street";
import type { Vec3, Walls } from "../walker";

type Rapier = typeof import("@dimforge/rapier3d-compat");

/** A person as a capsule: 1.7 m tall, 0.6 m across. */
export const CAPSULE_RADIUS = 0.3;
export const CAPSULE_HALF = 0.55;
/** The controller keeps this gap to every wall, in metres. */
export const SKIN = 0.02;
/** Steps up to this high (a kerb, a plinth) are climbed without a jump. */
export const STEP_UP = 0.45;
/** Going down, the feet keep to the ground over drops this small. */
export const SNAP_DOWN = 0.3;
/**
 * The ground's height, in metres: the roads' surface in the scene (0.025 street widths), where people walk; blocks and
 * parks lie a little below it.
 */
export const GROUND = 0.25;
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

/** Twice a footprint's area, in square scene units: zero for a line or a point. */
const area2 = (corners: Footprint["corners"]) =>
  Math.abs(
    corners.reduce((sum, a, i) => {
      const b = corners[(i + 1) % corners.length]!;
      return sum + a.x * b.z - b.x * a.z;
    }, 0),
  );

/** A footprint makes a wall when it encloses ground and stands above it; Rapier's hull of anything less fails. */
export const solid = (footprint: Footprint) =>
  footprint.corners.length >= 3 && area2(footprint.corners) > 1e-9 && footprint.top > 0;

/** Lets the page paint between slices. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

export interface WallOptions {
  readonly onStep?: OnStep;
  readonly signal?: AbortSignal;
}

/** The walls of these buildings, in metres: footprints are in scene units, ten metres to a street width. */
export async function rapierWalls(footprints: readonly Footprint[], options: WallOptions = {}): Promise<Walls> {
  const { onStep, signal } = options;
  const started = performance.now();
  onStep?.({ phase: "engine" });
  const rapier = await loadRapier();
  signal?.throwIfAborted();
  const engineMs = Math.round(performance.now() - started);
  const world = new rapier.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(rapier.ColliderDesc.cuboid(1e5, 1, 1e5).setTranslation(0, GROUND - 1, 0));
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
    points.set([c.x / METRE, 0, c.z / METRE, c.x / METRE, footprint.top / METRE, c.z / METRE], i * 6);
  });
  const hull = rapier.ColliderDesc.convexHull(points);
  if (!hull) return false;
  world.createCollider(hull);
  return true;
}

/** A person in the world: their capsule, moved by the character controller; and rays for the camera. */
function walk(rapier: Rapier, world: InstanceType<Rapier["World"]>): Walls {
  const body = world.createCollider(rapier.ColliderDesc.capsule(CAPSULE_HALF, CAPSULE_RADIUS));
  const controller = world.createCharacterController(SKIN);
  controller.enableAutostep(STEP_UP, CAPSULE_RADIUS, false);
  controller.enableSnapToGround(SNAP_DOWN);
  controller.setApplyImpulsesToDynamicBodies(false);
  const middle = CAPSULE_HALF + CAPSULE_RADIUS + SKIN;
  return {
    move: (feet: Vec3, delta: Vec3) => {
      body.setTranslation({ x: feet.x, y: feet.y + middle, z: feet.z });
      controller.computeColliderMovement(body, delta);
      const moved = controller.computedMovement();
      return {
        feet: { x: feet.x + moved.x, y: feet.y + moved.y, z: feet.z + moved.z },
        grounded: controller.computedGrounded(),
      };
    },
    clearance: (from: Vec3, to: Vec3) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      if (length === 0) return 0;
      const ray = new rapier.Ray(from, {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
        z: (to.z - from.z) / length,
      });
      return world.castRay(ray, length, true, undefined, undefined, body)?.timeOfImpact ?? length;
    },
    dispose: () => {
      world.removeCharacterController(controller);
      world.free();
    },
  };
}
