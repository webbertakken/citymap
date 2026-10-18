// Figures and vehicles built from primitives, in metres, flat-shaded in the theme's colours: no assets to fetch.
// Every model faces +x, stands on y = 0 and is centred on its footprint; its parts that move are named.
import { oklch, type Theme } from "@citymap/themes";
import {
  BoxGeometry,
  Color,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from "three";

/** The colours a model is painted in, from a theme: ink for tyres and frames, paint per vehicle, skin, glass. */
export interface Palette {
  readonly ink: string;
  readonly metal: string;
  readonly glass: string;
  readonly skin: string;
  readonly cloth: string;
  readonly trousers: string;
  readonly light: string;
  /** A vehicle's paint by its hue. */
  readonly paint: (hue: number) => string;
}

export const paletteOf = (theme: Theme): Palette =>
  theme.dark
    ? {
        ink: "#15171c",
        metal: "#9aa1ab",
        glass: "#2b3c52",
        skin: oklch(0.72, 0.06, 55),
        cloth: oklch(0.62, 0.12, 250),
        trousers: oklch(0.38, 0.03, 260),
        light: "#fff3c4",
        paint: (hue) => oklch(0.66, 0.13, hue),
      }
    : {
        ink: "#24262c",
        metal: "#b9bec6",
        glass: "#5d7690",
        skin: oklch(0.78, 0.06, 55),
        cloth: oklch(0.58, 0.14, 250),
        trousers: oklch(0.36, 0.03, 260),
        light: "#fff7d6",
        paint: (hue) => oklch(0.6, 0.15, hue),
      };

const materials = new Map<string, MeshStandardMaterial>();
const material = (colour: string, rough = 0.8) => {
  const key = `${colour}/${rough}`;
  let m = materials.get(key);
  if (!m) {
    // The canvas writes colours as they are (no output encoding), so a theme's hex is taken as the shade to show.
    m = new MeshStandardMaterial({
      color: new Color().setStyle(colour, LinearSRGBColorSpace),
      roughness: rough,
      metalness: 0,
      flatShading: true,
    });
    materials.set(key, m);
  }
  return m;
};

const part = (geometry: BufferGeometry, colour: string, at: readonly [number, number, number], rough?: number) => {
  const mesh = new Mesh(geometry, material(colour, rough));
  mesh.position.set(...at);
  return mesh;
};

const UP = new Vector3(0, 1, 0);
/** A round tube from one point to another. */
function tube(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  radius: number,
  colour: string,
) {
  const from = new Vector3(...a);
  const to = new Vector3(...b);
  const length = from.distanceTo(to);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 8), material(colour));
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, to.sub(from).normalize()));
  return mesh;
}

/** A wheel in the x–y plane, turning about z: tyre, rim and spokes, named so it can spin. */
function wheel(radius: number, tyre: number, spokes: number, p: Palette, name: string) {
  const g = new Group();
  g.name = name;
  g.add(new Mesh(new TorusGeometry(radius - tyre, tyre, 8, 28), material(p.ink, 0.95)));
  g.add(new Mesh(new TorusGeometry(radius - tyre * 2.2, tyre * 0.35, 6, 28), material(p.metal, 0.4)));
  for (let k = 0; k < spokes; k++) {
    const angle = (k / spokes) * Math.PI;
    const r = radius - tyre * 2.2;
    g.add(
      tube(
        [-Math.cos(angle) * r, -Math.sin(angle) * r, 0],
        [Math.cos(angle) * r, Math.sin(angle) * r, 0],
        0.004,
        p.metal,
      ),
    );
  }
  g.add(
    new Mesh(new CylinderGeometry(tyre * 0.6, tyre * 0.6, tyre * 2.5, 10).rotateX(Math.PI / 2), material(p.metal, 0.4)),
  );
  return g;
}

/** A side profile (x forward, y up) extruded across the width, centred on z. */
function profile(points: readonly (readonly [number, number])[], width: number, bevel: number) {
  const shape = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  });
  return geometry.translate(0, 0, -(width - 2 * bevel) / 2);
}

/** An empty node marking where a rider meets a vehicle, on the part it moves with. */
function mark(parent: Object3D, name: string, at: readonly [number, number, number]) {
  const node = new Object3D();
  node.name = name;
  node.position.set(...at);
  parent.add(node);
}

/** A person 1.75 m tall, standing; legs and arms are named to swing. */
export function figure(p: Palette, cloth = p.cloth): Group {
  const g = new Group();
  g.name = "figure";
  for (const side of [-1, 1]) {
    const leg = new Group();
    leg.name = side < 0 ? "leg-left" : "leg-right";
    leg.position.set(0, 0.88, side * 0.1);
    leg.add(part(new CapsuleGeometry(0.075, 0.68, 4, 8), p.trousers, [0, -0.42, 0]));
    leg.add(part(new BoxGeometry(0.24, 0.08, 0.11), p.ink, [0.05, -0.84, 0]));
    g.add(leg);
    const arm = new Group();
    arm.name = side < 0 ? "arm-left" : "arm-right";
    arm.position.set(0, 1.42, side * 0.24);
    arm.add(part(new CapsuleGeometry(0.055, 0.5, 4, 8), cloth, [0, -0.3, 0]));
    arm.add(part(new SphereGeometry(0.055, 8, 6), p.skin, [0, -0.6, 0]));
    g.add(arm);
  }
  g.add(part(new CapsuleGeometry(0.17, 0.42, 4, 10).scale(0.75, 1, 1.2), cloth, [0, 1.2, 0]));
  g.add(part(new SphereGeometry(0.115, 12, 10), p.skin, [0, 1.62, 0]));
  g.add(part(new SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), p.trousers, [-0.01, 1.64, 0]));
  return g;
}

/**
 * A city bicycle: 700c wheels, a diamond frame, cranks and chainring named to turn, handlebars to steer; its saddle,
 * grips and pedals marked for its rider.
 */
export function bicycle(p: Palette): Group {
  const g = new Group();
  g.name = "bicycle";
  const paint = p.paint(150);
  const r = 0.34;
  const rear: [number, number, number] = [-0.5, r, 0];
  const front: [number, number, number] = [0.55, r, 0];
  const bracket: [number, number, number] = [-0.06, 0.29, 0];
  const seat: [number, number, number] = [-0.2, 0.86, 0];
  const headTop: [number, number, number] = [0.4, 0.92, 0];
  const headLow: [number, number, number] = [0.44, 0.76, 0];
  const back = wheel(r, 0.018, 16, p, "wheel-rear");
  back.position.set(...rear);
  g.add(back);
  for (const [a, b] of [
    [seat, bracket],
    [seat, headTop],
    [bracket, headLow],
    [headTop, headLow],
  ] as const)
    g.add(tube(a, b, 0.019, paint));
  for (const side of [-0.05, 0.05]) {
    g.add(tube([rear[0], rear[1], side], [seat[0], seat[1] - 0.05, 0], 0.011, paint));
    g.add(tube([rear[0], rear[1], side], [bracket[0], bracket[1], side * 0.6], 0.012, paint));
  }
  // The fork, stem and bars turn together about the head tube.
  const steer = new Group();
  steer.name = "steering";
  steer.position.set(...headLow);
  const wheelFront = wheel(r, 0.018, 16, p, "wheel-front");
  wheelFront.position.set(front[0] - headLow[0], front[1] - headLow[1], 0);
  steer.add(wheelFront);
  for (const side of [-0.05, 0.05])
    steer.add(tube([0, 0, side * 0.5], [front[0] - headLow[0], front[1] - headLow[1], side], 0.012, paint));
  steer.add(tube([-0.04, 0.16, 0], [0.04, 0.3, 0], 0.014, p.metal));
  steer.add(tube([0.02, 0.3, -0.27], [0.02, 0.3, 0.27], 0.012, p.metal));
  for (const side of [-0.25, 0.25])
    steer.add(part(new CylinderGeometry(0.017, 0.017, 0.1, 8).rotateX(Math.PI / 2), p.ink, [0.02, 0.3, side]));
  mark(steer, "grip-left", [0.02, 0.3, -0.25]);
  mark(steer, "grip-right", [0.02, 0.3, 0.25]);
  g.add(steer);
  mark(g, "saddle", [seat[0] - 0.02, seat[1] + 0.17, 0]);
  g.add(tube([seat[0], seat[1], 0], [seat[0] - 0.02, seat[1] + 0.12, 0], 0.013, p.metal));
  g.add(
    part(
      profile(
        [
          [-0.13, 0],
          [0.12, 0.01],
          [0.13, 0.03],
          [-0.12, 0.05],
        ],
        0.13,
        0.015,
      ),
      p.ink,
      [seat[0] - 0.02, seat[1] + 0.12, 0],
    ),
  );
  const crank = new Group();
  crank.name = "crank";
  crank.position.set(...bracket);
  crank.add(new Mesh(new TorusGeometry(0.095, 0.008, 6, 24), material(p.metal, 0.4)).translateZ(0.06));
  for (const side of [1, -1]) {
    crank.add(tube([0, 0, side * 0.07], [0, -side * 0.17, side * 0.07], 0.012, p.metal));
    crank.add(part(new BoxGeometry(0.09, 0.02, 0.1), p.ink, [0, -side * 0.17, side * 0.13]));
    mark(crank, side > 0 ? "pedal-right" : "pedal-left", [0, -side * 0.17, side * 0.13]);
  }
  g.add(crank);
  g.add(tube([bracket[0], bracket[1], 0.06], [rear[0], rear[1], 0.06], 0.004, p.ink));
  g.add(part(new BoxGeometry(0.05, 0.05, 0.08), p.light, [0.6, 0.66, 0], 0.3));
  return g;
}

/** A naked motorbike: fat tyres, tank, seat, engine block and exhaust; the fork named to steer; its seat, grips and pegs marked. */
export function motorbike(p: Palette): Group {
  const g = new Group();
  g.name = "motorbike";
  const paint = p.paint(25);
  const r = 0.31;
  const back = wheel(r, 0.065, 6, p, "wheel-rear");
  back.position.set(-0.7, r, 0);
  g.add(back);
  g.add(
    part(
      profile(
        [
          [-0.3, 0],
          [0.32, 0],
          [0.26, 0.2],
          [-0.24, 0.24],
        ],
        0.3,
        0.03,
      ),
      paint,
      [0.12, 0.78, 0],
      0.35,
    ),
  );
  g.add(
    part(
      profile(
        [
          [-0.55, 0],
          [0.0, 0],
          [0.0, 0.08],
          [-0.6, 0.12],
        ],
        0.26,
        0.02,
      ),
      p.ink,
      [-0.12, 0.84, 0],
    ),
  );
  g.add(part(new BoxGeometry(0.42, 0.34, 0.3), p.metal, [0.0, 0.5, 0], 0.5));
  g.add(part(new CylinderGeometry(0.11, 0.13, 0.3, 10), p.ink, [0.02, 0.32, 0]));
  g.add(tube([0.2, 0.42, 0.17], [-0.75, 0.48, 0.2], 0.04, p.metal));
  g.add(part(new CylinderGeometry(0.06, 0.05, 0.3, 10).rotateZ(Math.PI / 2 - 0.15), p.metal, [-0.8, 0.5, 0.2], 0.3));
  for (const side of [-0.07, 0.07]) g.add(tube([-0.7, r, side * 1.4], [-0.1, 0.62, side * 1.6], 0.025, p.ink));
  g.add(tube([-0.45, 0.62, 0.12], [-0.6, 0.86, 0.12], 0.03, p.light));
  const steer = new Group();
  steer.name = "steering";
  steer.position.set(0.46, 1.0, 0);
  const wheelFront = wheel(r, 0.06, 6, p, "wheel-front");
  wheelFront.position.set(0.28, r - 1.0, 0);
  steer.add(wheelFront);
  for (const side of [-0.09, 0.09]) steer.add(tube([0, 0, side], [0.28, r - 1.0, side], 0.024, p.metal));
  steer.add(tube([-0.06, 0.1, -0.36], [-0.06, 0.1, 0.36], 0.016, p.ink));
  mark(steer, "grip-left", [-0.06, 0.1, -0.33]);
  mark(steer, "grip-right", [-0.06, 0.1, 0.33]);
  mark(g, "saddle", [-0.35, 0.94, 0]);
  mark(g, "peg-left", [0, 0.3, -0.2]);
  mark(g, "peg-right", [0, 0.3, 0.2]);
  steer.add(part(new CylinderGeometry(0.09, 0.09, 0.08, 14).rotateZ(Math.PI / 2), p.ink, [0.1, -0.06, 0]));
  steer.add(part(new CylinderGeometry(0.075, 0.075, 0.02, 14).rotateZ(Math.PI / 2), p.light, [0.15, -0.06, 0], 0.2));
  steer.add(
    part(
      profile(
        [
          [-0.05, 0],
          [0.22, 0],
          [0.18, 0.05],
          [-0.1, 0.06],
        ],
        0.2,
        0.01,
      ),
      paint,
      [0.28, r - 1.0 + 0.36, 0],
    ),
  );
  g.add(steer);
  return g;
}

/** A small hatchback, 4.1 m long: body and cabin from side profiles, glass all round, four wheels named to spin. */
export function car(p: Palette, hue = 220): Group {
  const g = new Group();
  g.name = "car";
  const paint = p.paint(hue);
  const width = 1.76;
  g.add(
    part(
      profile(
        [
          [-2.0, 0.28],
          [2.0, 0.28],
          [2.06, 0.55],
          [1.95, 0.82],
          [0.9, 0.92],
          [-1.95, 0.95],
          [-2.05, 0.7],
        ],
        width,
        0.06,
      ),
      paint,
      [0, 0, 0],
      0.4,
    ),
  );
  g.add(
    part(
      profile(
        [
          [-1.75, 0.9],
          [0.75, 0.9],
          [0.05, 1.42],
          [-1.6, 1.45],
        ],
        width - 0.12,
        0.05,
      ),
      p.glass,
      [0, 0, 0],
      0.15,
    ),
  );
  g.add(
    part(
      profile(
        [
          [-1.68, 1.42],
          [0.08, 1.42],
          [0.0, 1.5],
          [-1.6, 1.5],
        ],
        width - 0.14,
        0.04,
      ),
      paint,
      [0, 0, 0],
      0.4,
    ),
  );
  for (const pillar of [-0.35]) g.add(part(new BoxGeometry(0.1, 0.5, width - 0.06), paint, [pillar, 1.17, 0], 0.4));
  for (const [x, z] of [
    [1.32, 1],
    [1.32, -1],
    [-1.28, 1],
    [-1.28, -1],
  ] as const) {
    const w = new Group();
    w.name = `wheel-${x > 0 ? "front" : "rear"}-${z > 0 ? "right" : "left"}`;
    w.position.set(x, 0.31, z * (width / 2 - 0.08));
    w.add(new Mesh(new CylinderGeometry(0.31, 0.31, 0.2, 18).rotateX(Math.PI / 2), material(p.ink, 0.95)));
    w.add(new Mesh(new CylinderGeometry(0.19, 0.19, 0.205, 10).rotateX(Math.PI / 2), material(p.metal, 0.4)));
    g.add(w);
  }
  for (const z of [-0.6, 0.6]) {
    g.add(part(new BoxGeometry(0.04, 0.1, 0.32), p.light, [2.05, 0.68, z], 0.2));
    g.add(part(new BoxGeometry(0.04, 0.1, 0.28), oklch(0.55, 0.2, 25), [-2.04, 0.78, z], 0.3));
  }
  g.add(part(new BoxGeometry(0.06, 0.16, width - 0.2), p.ink, [2.06, 0.38, 0]));
  g.add(part(new BoxGeometry(0.06, 0.16, width - 0.2), p.ink, [-2.05, 0.38, 0]));
  return g;
}

/** A light helicopter, 9 m rotor to tail: rounded cabin, tail boom, skids; main and tail rotors named to spin. */
export function helicopter(p: Palette): Group {
  const g = new Group();
  g.name = "helicopter";
  const paint = p.paint(55);
  g.add(part(new SphereGeometry(1, 16, 12).scale(1.65, 1.05, 0.95), paint, [0.2, 1.5, 0], 0.4));
  g.add(
    part(
      new SphereGeometry(1, 16, 12, 0, Math.PI, 0, Math.PI / 1.7)
        .scale(1.2, 0.95, 0.9)
        .rotateY(Math.PI / 2)
        .rotateZ(-0.35),
      p.glass,
      [0.75, 1.6, 0],
      0.1,
    ),
  );
  g.add(part(new CylinderGeometry(0.16, 0.3, 4.2, 10).rotateZ(Math.PI / 2), paint, [-3.3, 1.75, 0], 0.4));
  g.add(
    part(
      profile(
        [
          [-0.5, 0],
          [0.15, 0],
          [-0.1, 1.0],
          [-0.55, 1.05],
        ],
        0.08,
        0.01,
      ),
      paint,
      [-5.0, 1.75, 0],
      0.4,
    ),
  );
  g.add(part(new BoxGeometry(0.8, 0.05, 1.2), paint, [-4.6, 1.75, 0], 0.4));
  g.add(part(new BoxGeometry(0.7, 0.35, 0.6), p.ink, [-0.1, 2.55, 0]));
  for (const z of [-0.85, 0.85]) {
    g.add(tube([-1.3, 0.045, z], [1.4, 0.045, z], 0.045, p.ink));
    g.add(tube([1.4, 0.045, z], [1.65, 0.22, z], 0.045, p.ink));
    g.add(tube([0.8, 0.045, z], [0.6, 0.95, z * 0.5], 0.04, p.ink));
    g.add(tube([-0.7, 0.045, z], [-0.6, 0.95, z * 0.5], 0.04, p.ink));
  }
  const rotor = new Group();
  rotor.name = "rotor-main";
  rotor.position.set(-0.1, 2.85, 0);
  rotor.add(part(new CylinderGeometry(0.08, 0.1, 0.25, 8), p.metal, [0, -0.1, 0], 0.4));
  for (let k = 0; k < 3; k++) {
    const blade = part(new BoxGeometry(4.6, 0.04, 0.28), p.ink, [2.35, 0, 0]);
    const arm = new Group();
    arm.rotation.y = (k / 3) * Math.PI * 2;
    arm.add(blade);
    rotor.add(arm);
  }
  g.add(rotor);
  const tail = new Group();
  tail.name = "rotor-tail";
  tail.position.set(-5.05, 2.35, 0.1);
  tail.add(part(new BoxGeometry(0.12, 1.3, 0.03), p.ink, [0, 0, 0]));
  tail.add(part(new BoxGeometry(0.12, 1.3, 0.03).rotateZ(Math.PI / 2), p.ink, [0, 0, 0]));
  g.add(tail);
  return g;
}
