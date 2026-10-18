import { describe, expect, it } from "vitest";
import { resting } from "./bicycle";
import { hudOfRide } from "./hud";
import { parkedMoto } from "./motorbike";
import { standing } from "./vehicles";

const at = { x: 0, y: 0, z: 0 };

describe("the HUD of a ride", () => {
  it("says the bicycle's speed, gear and cadence, and its rider's foot and fall", () => {
    const bicycle = { ...standing("b", "bicycle", at, 0), speed: 5, cycle: { ...resting(3), footDown: false } };
    expect(hudOfRide(bicycle, true)).toEqual({
      label: "Speed, gear and cadence",
      rows: [
        ["Speed", "18 km/h"],
        ["Gear", "4 of 7"],
        ["Cadence", "0 rpm"],
      ],
      foot: "up",
      fallen: false,
    });
    const down = { ...bicycle, cycle: { ...resting(), fall: { time: 0, side: 1, cause: "hit", speed: 4 } } } as const;
    expect(hudOfRide(down, true)).toMatchObject({ foot: "down", fallen: true });
  });

  it("says the motorbike's speed, gear of five and engine, to the hundred", () => {
    const moto = { ...standing("m", "motorbike", at, 0), speed: 20, moto: { ...parkedMoto(), gear: 2, rpm: 4321 } };
    expect(hudOfRide(moto, true)).toEqual({
      label: "Speed, gear and engine",
      rows: [
        ["Speed", "72 km/h"],
        ["Gear", "3 of 5"],
        ["Engine", "4,300 rpm"],
      ],
      foot: "down",
      fallen: false,
    });
    const thrown = {
      ...moto,
      moto: { ...parkedMoto(), footDown: false, fall: { time: 0, side: -1, cause: "grip", speed: 9 } },
    } as const;
    expect(hudOfRide(thrown, true)).toMatchObject({ foot: "up", fallen: true });
  });

  it("says a car's speed, gear (R backing up) and engine on Rapier, and an arcade car's speed alone", () => {
    const car = { ...standing("c", "car", at, 0), speed: -3, gear: -1, rpm: 2260 };
    expect(hudOfRide(car, true).rows).toEqual([
      ["Speed", "11 km/h"],
      ["Gear", "R"],
      ["Engine", "2,300 rpm"],
    ]);
    expect(hudOfRide({ ...car, gear: 1 }, true).rows[1]).toEqual(["Gear", "2"]);
    expect(hudOfRide(car, false)).toEqual({ label: "Speed", rows: [["Speed", "11 km/h"]], foot: null, fallen: false });
  });
});
