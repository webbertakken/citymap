import { THEMES } from "@citymap/themes";
import { Box3, LinearSRGBColorSpace, Mesh, MeshStandardMaterial, Vector3, type Group, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { bicycle, car, figure, helicopter, motorbike, paletteOf } from "./procedural";

const p = paletteOf(THEMES["paper-atlas"]);
const sizeOf = (model: Object3D) => new Box3().setFromObject(model).getSize(new Vector3());
const boxOf = (model: Object3D) => new Box3().setFromObject(model);
const centreX = (model: Group, name: string) =>
  new Box3().setFromObject(model.getObjectByName(name)!).getCenter(new Vector3()).x;

describe("procedural models", () => {
  const all = {
    figure: figure(p),
    bicycle: bicycle(p),
    motorbike: motorbike(p),
    car: car(p),
    helicopter: helicopter(p),
  };

  it("stand on the ground, centred on their footprint", () => {
    for (const model of Object.values(all)) {
      expect(boxOf(model).min.y).toBeCloseTo(0, 2);
      expect(Math.abs(boxOf(model).getCenter(new Vector3()).z)).toBeLessThan(0.05);
    }
  });

  it("are built to size in metres", () => {
    expect(sizeOf(all.figure).y).toBeCloseTo(1.76, 1);
    expect(sizeOf(all.bicycle).x).toBeGreaterThan(1.65);
    expect(sizeOf(all.bicycle).x).toBeLessThan(1.85);
    expect(sizeOf(all.motorbike).x).toBeGreaterThan(1.9);
    expect(sizeOf(all.motorbike).x).toBeLessThan(2.3);
    expect(sizeOf(all.car).x).toBeCloseTo(4.2, 1);
    expect(sizeOf(all.car).z).toBeCloseTo(1.76, 1);
    expect(sizeOf(all.helicopter).x).toBeGreaterThan(9);
  });

  it("face +x: front wheels ahead of rear ones, the tail behind", () => {
    for (const model of [all.bicycle, all.motorbike])
      expect(centreX(model, "wheel-front")).toBeGreaterThan(centreX(model, "wheel-rear"));
    expect(centreX(all.car, "wheel-front-left")).toBeGreaterThan(centreX(all.car, "wheel-rear-left"));
    expect(centreX(all.helicopter, "rotor-tail")).toBeLessThan(0);
  });

  it("name the parts that move", () => {
    for (const name of ["leg-left", "leg-right", "arm-left", "arm-right"])
      expect(all.figure.getObjectByName(name)).toBeDefined();
    for (const name of ["steering", "crank", "wheel-front", "wheel-rear"])
      expect(all.bicycle.getObjectByName(name)).toBeDefined();
    for (const name of ["steering", "wheel-front", "wheel-rear"])
      expect(all.motorbike.getObjectByName(name)).toBeDefined();
    for (const name of ["wheel-front-left", "wheel-front-right", "wheel-rear-left", "wheel-rear-right"])
      expect(all.car.getObjectByName(name)).toBeDefined();
    for (const name of ["rotor-main", "rotor-tail"]) expect(all.helicopter.getObjectByName(name)).toBeDefined();
  });

  it("share one material per colour, flat-shaded, taking the theme's hex as the shade shown", () => {
    const materials = new Set<MeshStandardMaterial>();
    all.car.traverse((node) => {
      if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) materials.add(node.material);
    });
    const paint = [...materials].find(
      (m) => m.color.getHexString(LinearSRGBColorSpace) === p.paint(220).slice(1).toLowerCase(),
    );
    expect(paint?.flatShading).toBe(true);
    expect(materials.size).toBeLessThan(10);
  });
});

describe("paletteOf", () => {
  it("paints darker inks and lighter paint on a dark theme", () => {
    const night = paletteOf(THEMES["night-atlas"]);
    expect(night.ink).not.toBe(p.ink);
    expect(night.paint(150)).not.toBe(p.paint(150));
    expect(p.paint(150)).not.toBe(p.paint(25));
  });

  it("dresses a figure in the colour asked for", () => {
    const red = figure(p, p.paint(25));
    const colours = new Set<string>();
    red.traverse((node) => {
      if (node instanceof Mesh && node.material instanceof MeshStandardMaterial)
        colours.add(`#${node.material.color.getHexString(LinearSRGBColorSpace)}`);
    });
    expect(colours).toContain(p.paint(25).toLowerCase());
  });
});
