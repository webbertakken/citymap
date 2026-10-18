import { GROUND } from "@citymap/world";
import { describe, expect, it } from "vitest";
import { resting } from "./bicycle";
import { started, parkedHeli } from "./helicopter";
import { OPEN, hudOfRide } from "./hud";
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
      flight: null,
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
      flight: null,
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
    expect(hudOfRide(car, false)).toEqual({
      label: "Speed",
      rows: [["Speed", "11 km/h"]],
      foot: null,
      fallen: false,
      flight: null,
    });
  });

  it("says the helicopter's altitude above what lies under it, its climb, speed and rotor, and what lies under it", () => {
    const flying = {
      ...standing("h", "helicopter", { x: 0, y: GROUND + 42.4, z: 0 }, 0),
      heli: { ...started(parkedHeli()), grounded: false, rotor: 0.874, velocity: { x: 10, y: -2.46, z: 0 } },
    };
    expect(hudOfRide(flying, true, { ...OPEN, under: GROUND + 20 })).toEqual({
      label: "Altitude, climb, speed and rotor",
      rows: [
        ["Altitude", "22 m"],
        ["Climb", "−2.5 m/s"],
        ["Speed", "36 km/h"],
        ["Rotor", "87 %"],
        ["Below", "Roof"],
      ],
      foot: null,
      fallen: false,
      flight: { over: "roof", landed: false, heading: 0, room: true, landing: null },
    });
    // A taller building within the rotor's reach: no room to land.
    expect(hudOfRide(flying, true, { ...OPEN, under: GROUND + 20, room: false }).rows[4]).toEqual([
      "Below",
      "Roof, no room",
    ]);
    expect(hudOfRide(flying, true, { ...OPEN, room: false }).rows[4]).toEqual(["Below", "Street, no room"]);
    expect(hudOfRide(flying, true, { ...OPEN, room: false }).flight?.room).toBe(false);
    // Over the street, its height above the street.
    expect(hudOfRide(flying, true, OPEN).rows[0]).toEqual(["Altitude", "42 m"]);
    const climbing = { ...flying, heli: { ...flying.heli, velocity: { x: 0, y: 3, z: 0 } } };
    expect(hudOfRide(climbing, true, OPEN).rows[1]).toEqual(["Climb", "+3.0 m/s"]);
    expect(hudOfRide(climbing, true, OPEN).flight).toEqual({
      over: "street",
      landed: false,
      heading: 0,
      room: true,
      landing: null,
    });
    // The nearest roof with room 30 m ahead and 40 m to the left (north, facing east): 50 m, 53° to the left.
    const marked = { lot: 1, at: { x: 30, y: 10, z: -40 }, distance: 50 };
    expect(hudOfRide(climbing, true, { ...OPEN, landing: marked }).flight?.landing).toEqual({
      distance: 50,
      bearing: 53,
    });
    expect(hudOfRide({ ...climbing, heading: -Math.PI / 2 }, true).flight?.heading).toBe(270);
    expect(hudOfRide({ ...climbing, heading: 4 * Math.PI + 0.5 }, true).flight?.heading).toBe(29);
    const landed = { ...standing("h", "helicopter", { x: 0, y: GROUND, z: 0 }, 0) };
    expect(hudOfRide(landed, true, OPEN)).toMatchObject({ flight: { over: "street", landed: true } });
    expect(hudOfRide(landed, true, OPEN).rows[1]).toEqual(["Climb", "0.0 m/s"]);
  });
});
