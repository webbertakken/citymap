// The free camera: it flies anywhere, through anything, where it looks. Metres and seconds; a look is the camera's
// orbit (yaw as the walker's heading, pitch down from level).
import type { Vec3 } from "@citymap/world";
import type { Orbit } from "./camera";

/** Where the free camera is, which way it looks, and how fast it flies, in metres a second. */
export interface Flyer {
  readonly at: Vec3;
  readonly speed: number;
}

/** What the person asks of the free camera: forward and right (−1 to 1, as walking), and up (−1 to 1). */
export interface Flight {
  readonly forward: number;
  readonly right: number;
  readonly up: number;
}

/** A fresh free camera flies at this speed; the wheel takes it from `SLOWEST` to `FASTEST`, a `GEAR` a step. */
export const FLY_SPEED = 20;
export const SLOWEST_FLIGHT = 2;
export const FASTEST_FLIGHT = 300;
export const GEAR = 1.25;

/** The way a look points: forward along it, including down by its pitch. */
export const lookAlong = (orbit: Orbit): Vec3 => ({
  x: Math.cos(orbit.pitch) * Math.cos(orbit.yaw),
  y: -Math.sin(orbit.pitch),
  z: -Math.cos(orbit.pitch) * Math.sin(orbit.yaw),
});

/** One step of `dt` seconds: forward along the look, right square to it on the level, up straight up. */
export function stepFlyer(flyer: Flyer, flight: Flight, orbit: Orbit, dt: number): Flyer {
  const ahead = lookAlong(orbit);
  const right = { x: Math.sin(orbit.yaw), z: Math.cos(orbit.yaw) };
  const step = flyer.speed * dt;
  return {
    ...flyer,
    at: {
      x: flyer.at.x + (ahead.x * flight.forward + right.x * flight.right) * step,
      y: flyer.at.y + (ahead.y * flight.forward + flight.up) * step,
      z: flyer.at.z + (ahead.z * flight.forward + right.z * flight.right) * step,
    },
  };
}

/** The free camera's speed after so many wheel steps (positive faster), within its limits. */
export const geared = (flyer: Flyer, steps: number): Flyer => ({
  ...flyer,
  speed: Math.max(SLOWEST_FLIGHT, Math.min(FASTEST_FLIGHT, flyer.speed * GEAR ** steps)),
});

/** Where the free camera is and what it looks at: a point ahead along its look. */
export function flyingCamera(flyer: Flyer, orbit: Orbit): { readonly eye: Vec3; readonly target: Vec3 } {
  const ahead = lookAlong(orbit);
  return { eye: flyer.at, target: { x: flyer.at.x + ahead.x, y: flyer.at.y + ahead.y, z: flyer.at.z + ahead.z } };
}
