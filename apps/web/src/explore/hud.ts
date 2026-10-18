// What the HUD shows of each ride, in words: the bicycle's speed, gear and cadence; the motorbike's and the car's speed,
// gear and engine; an arcade car's speed alone; the helicopter's altitude, climb, speed and rotor. Whether a rider's foot
// is down, and whether the rider is down; whether the helicopter has landed, and on what it is over. Pure.
import { GROUND } from "@citymap/world";
import { hudOf } from "./bicycle";
import { heliHud } from "./helicopter";
import { motoHud, RPM_SHOWN } from "./motorbike";
import type { Rooftop } from "./rooftops";
import type { Vehicle } from "./vehicles";
import { turnBetween } from "./walker";

/**
 * A ride's HUD: its name for a screen reader, its rows of a term and a value, a foot down or up, and a fall; flying,
 * whether what lies under it is a roof or the street, whether it stands on it, its heading in whole degrees (0 to 359,
 * anticlockwise from above, as headings grow), and whether its rotor has room to land there.
 */
export interface RideHud {
  readonly label: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly foot: "down" | "up" | null;
  readonly fallen: boolean;
  readonly flight: {
    readonly over: "roof" | "street";
    readonly landed: boolean;
    readonly heading: number;
    readonly room: boolean;
    /** The nearest roof with room: metres off, and degrees off the nose (positive to the left). */
    readonly landing: { readonly distance: number; readonly bearing: number } | null;
  } | null;
}

/**
 * What lies below a helicopter: the height of the roof or street under it, whether its rotor has room to land there,
 * and the nearest marked roof.
 */
export interface Below {
  readonly under: number;
  readonly room: boolean;
  readonly landing: Rooftop | null;
}

/** Nothing below but the open street. */
export const OPEN: Below = { under: GROUND, room: true, landing: null };

/** Something under a helicopter higher than the street by more than this is a roof, in metres. */
const ROOF_ABOVE = 0.01;

const number = (n: number) => n.toLocaleString("en-GB");
const speedRow = (speed: number) => ["Speed", `${Math.round(Math.abs(speed) * 3.6)} km/h`] as const;

/** A climb as the HUD says it: signed, to the tenth, with a true minus. */
const climbOf = (climb: number) => `${climb > 0 ? "+" : climb < 0 ? "−" : ""}${Math.abs(climb).toFixed(1)} m/s`;

/**
 * The HUD of a vehicle being ridden; a car's engine is read only on Rapier (`engine`); a helicopter's height is above
 * the street, and what lies below it is `below`.
 */
export function hudOfRide(vehicle: Vehicle, engine: boolean, { under, room, landing }: Below = OPEN): RideHud {
  if (vehicle.kind === "helicopter") {
    const hud = heliHud(vehicle.heli, vehicle.feet.y - GROUND);
    const over = under > GROUND + ROOF_ABOVE ? "roof" : "street";
    return {
      label: "Altitude, climb, speed and rotor",
      rows: [
        ["Altitude", `${hud.altitude} m`],
        ["Climb", climbOf(hud.climb)],
        ["Speed", `${hud.speed} km/h`],
        ["Rotor", `${hud.rotor} %`],
        ["Below", `${over === "roof" ? "Roof" : "Street"}${room ? "" : ", no room"}`],
      ],
      foot: null,
      fallen: false,
      flight: {
        over,
        landed: vehicle.heli.grounded,
        heading: ((Math.round((vehicle.heading * 180) / Math.PI) % 360) + 360) % 360,
        room,
        landing: landing && {
          distance: Math.round(landing.distance),
          bearing: Math.round(
            (turnBetween(vehicle.heading, Math.atan2(-(landing.at.z - vehicle.feet.z), landing.at.x - vehicle.feet.x)) *
              180) /
              Math.PI,
          ),
        },
      },
    };
  }
  if (vehicle.kind === "bicycle") {
    const hud = hudOf(vehicle.cycle, vehicle.speed);
    return {
      label: "Speed, gear and cadence",
      rows: [speedRow(vehicle.speed), ["Gear", `${hud.gear} of ${hud.gears}`], ["Cadence", `${hud.cadence} rpm`]],
      foot: vehicle.cycle.footDown ? "down" : "up",
      fallen: vehicle.cycle.fall !== null,
      flight: null,
    };
  }
  if (vehicle.kind === "motorbike") {
    const hud = motoHud(vehicle.moto, vehicle.speed);
    return {
      label: "Speed, gear and engine",
      rows: [speedRow(vehicle.speed), ["Gear", `${hud.gear} of ${hud.gears}`], ["Engine", `${number(hud.rpm)} rpm`]],
      foot: vehicle.moto.footDown ? "down" : "up",
      fallen: vehicle.moto.fall !== null,
      flight: null,
    };
  }
  if (!engine) return { label: "Speed", rows: [speedRow(vehicle.speed)], foot: null, fallen: false, flight: null };
  const rpm = Math.round(vehicle.rpm / RPM_SHOWN) * RPM_SHOWN;
  return {
    label: "Speed, gear and engine",
    rows: [
      speedRow(vehicle.speed),
      ["Gear", vehicle.gear < 0 ? "R" : String(vehicle.gear + 1)],
      ["Engine", `${number(rpm)} rpm`],
    ],
    foot: null,
    fallen: false,
    flight: null,
  };
}
