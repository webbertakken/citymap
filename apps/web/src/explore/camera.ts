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

/** Where the camera is and what it looks at, for feet at a point: as far back as the walls allow. */
export function cameraOf(feet: Vec3, orbit: Orbit, walls: Walls): { readonly eye: Vec3; readonly target: Vec3 } {
  const target = { x: feet.x, y: feet.y + SHOULDER, z: feet.z };
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
  const clear = walls.clearance(target, at(ORBIT_DISTANCE));
  const distance = clear < ORBIT_DISTANCE ? Math.max(NEAREST, clear - WALL_GAP) : ORBIT_DISTANCE;
  return { eye: at(distance), target };
}
