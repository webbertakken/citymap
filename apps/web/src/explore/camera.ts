// The follow camera, as pure maths: it orbits a point above the walker's shoulder, turned by the person, and pulls in
// when a wall stands between them so it never looks from inside a building. Metres; headings as the walker's.
import type { Vec3, Walls } from "@citymap/world";

/** Where the camera looks: a heading (as the walker's) and how far down from level, in radians. */
export interface Orbit {
  readonly yaw: number;
  readonly pitch: number;
}

/** How far behind the shoulder the camera sits, and how high above the feet it looks from. */
export const ORBIT_DISTANCE = 4.5;
export const SHOULDER = 1.55;
/** Down at most this far (nearly overhead), up at most this far (from just above the ground). */
export const PITCH_MAX = 1.25;
export const PITCH_MIN = -0.25;
/** Behind a wall, the camera stops this far short of it, but never closer than `NEAREST` to the shoulder. */
export const WALL_GAP = 0.25;
export const NEAREST = 0.4;
/** Radians turned per pixel dragged. */
export const LOOK_SPEED = 0.005;
/** A fresh orbit looks a little down at the walker's back. */
export const START_PITCH = 0.25;

export const behind = (heading: number): Orbit => ({ yaw: heading, pitch: START_PITCH });

/** The orbit after a drag: right turns the view right, down tilts it down. */
export const turned = (orbit: Orbit, dx: number, dy: number): Orbit => ({
  yaw: orbit.yaw - dx * LOOK_SPEED,
  pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, orbit.pitch + dy * LOOK_SPEED)),
});

/** How the camera follows: how far back it sits and how high above the feet it looks from. */
export interface Follow {
  readonly distance: number;
  readonly height: number;
}

export const ON_FOOT: Follow = { distance: ORBIT_DISTANCE, height: SHOULDER };

/** A wall nearer than the full distance by less than this is rounding in the measure, not a wall. */
export const ROUNDING = 1e-6;
/** Coming back out from a wall, the camera eases most of the way in this many seconds; going in, it goes at once. */
export const REACH_EASE = 0.3;

/** Where the camera looks at, and the way it looks. */
function aimOf(feet: Vec3, orbit: Orbit, follow: Follow) {
  const target = { x: feet.x, y: feet.y + follow.height, z: feet.z };
  const look = {
    x: Math.cos(orbit.pitch) * Math.cos(orbit.yaw),
    y: -Math.sin(orbit.pitch),
    z: -Math.cos(orbit.pitch) * Math.sin(orbit.yaw),
  };
  const at = (distance: number) => ({
    x: target.x - look.x * distance,
    y: target.y - look.y * distance,
    z: target.z - look.z * distance,
  });
  return { target, at };
}

/** How far back the camera can sit for feet at a point: its full distance, or short of a wall in the way. */
export function reachOf(feet: Vec3, orbit: Orbit, walls: Walls, follow: Follow = ON_FOOT): number {
  const { target, at } = aimOf(feet, orbit, follow);
  const clear = walls.clearance(target, at(follow.distance));
  return clear < follow.distance - ROUNDING ? Math.max(NEAREST, clear - WALL_GAP) : follow.distance;
}

/** The camera's distance after a frame: in at once to what the walls allow, so it never looks through one; back out
 * gently, so it never pops. */
export const easeReach = (current: number, wanted: number, seconds: number) =>
  wanted <= current ? wanted : wanted + (current - wanted) * Math.exp(-seconds / REACH_EASE);

/** Where the camera is and what it looks at, for feet at a point: as far back as given, else as the walls allow. */
export function cameraOf(
  feet: Vec3,
  orbit: Orbit,
  walls: Walls,
  follow: Follow = ON_FOOT,
  distance = reachOf(feet, orbit, walls, follow),
): { readonly eye: Vec3; readonly target: Vec3 } {
  const { target, at } = aimOf(feet, orbit, follow);
  return { eye: at(distance), target };
}
