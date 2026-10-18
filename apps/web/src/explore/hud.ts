// What the HUD shows of each ride, in words: the bicycle's speed, gear and cadence; the motorbike's and the car's speed,
// gear and engine; an arcade car's speed alone. Whether a rider's foot is down, and whether the rider is down. Pure.
import { hudOf } from "./bicycle";
import { motoHud, RPM_SHOWN } from "./motorbike";
import type { Vehicle } from "./vehicles";

/** A ride's HUD: its name for a screen reader, its rows of a term and a value, a foot down or up, and a fall. */
export interface RideHud {
  readonly label: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly foot: "down" | "up" | null;
  readonly fallen: boolean;
}

const number = (n: number) => n.toLocaleString("en-GB");
const speedRow = (speed: number) => ["Speed", `${Math.round(Math.abs(speed) * 3.6)} km/h`] as const;

/** The HUD of a vehicle being ridden; a car's engine is read only on Rapier (`engine`). */
export function hudOfRide(vehicle: Vehicle, engine: boolean): RideHud {
  if (vehicle.kind === "bicycle") {
    const hud = hudOf(vehicle.cycle, vehicle.speed);
    return {
      label: "Speed, gear and cadence",
      rows: [speedRow(vehicle.speed), ["Gear", `${hud.gear} of ${hud.gears}`], ["Cadence", `${hud.cadence} rpm`]],
      foot: vehicle.cycle.footDown ? "down" : "up",
      fallen: vehicle.cycle.fall !== null,
    };
  }
  if (vehicle.kind === "motorbike") {
    const hud = motoHud(vehicle.moto, vehicle.speed);
    return {
      label: "Speed, gear and engine",
      rows: [speedRow(vehicle.speed), ["Gear", `${hud.gear} of ${hud.gears}`], ["Engine", `${number(hud.rpm)} rpm`]],
      foot: vehicle.moto.footDown ? "down" : "up",
      fallen: vehicle.moto.fall !== null,
    };
  }
  if (!engine) return { label: "Speed", rows: [speedRow(vehicle.speed)], foot: null, fallen: false };
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
  };
}
