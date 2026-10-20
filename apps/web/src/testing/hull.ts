// A closed hull for tests: whether a point lies inside it, judged in a frame of the test's choosing (a machine's own) by
// the hull's surface lying on both sides of the point along each of that frame's three axes. A cabin is near enough
// convex across each axis for that to say whether anything pokes out through its skin or its glass. The triangles are
// bucketed by where they cover, in cells of `CELL` metres, per axis, so a figure's thousands of vertices test quickly.
import { Vector3, type BufferGeometry, type Matrix4 } from "three";

const CELL = 0.05;

type Triangle = readonly [Vector3, Vector3, Vector3];

/** The two axes across one, in order. */
const ACROSS = [
  [1, 2],
  [2, 0],
  [0, 1],
] as const;

const key = (a: number, b: number) => `${Math.floor(a / CELL)},${Math.floor(b / CELL)}`;

export class Hull {
  private readonly cells: Map<string, Triangle[]>[] = [new Map(), new Map(), new Map()];

  /** A hull from meshes' geometry, each brought into the frame by its matrix. */
  constructor(parts: readonly { readonly geometry: BufferGeometry; readonly matrix: Matrix4 }[]) {
    for (const { geometry, matrix } of parts) {
      const position = geometry.getAttribute("position");
      const index = geometry.getIndex();
      const count = index ? index.count : position.count;
      const corner = (i: number) => {
        const v = index ? index.getX(i) : i;
        return new Vector3(position.getX(v), position.getY(v), position.getZ(v)).applyMatrix4(matrix);
      };
      for (let i = 0; i < count; i += 3) this.add([corner(i), corner(i + 1), corner(i + 2)]);
    }
  }

  private add(triangle: Triangle) {
    for (const axis of [0, 1, 2] as const) {
      const [a, b] = ACROSS[axis];
      const values = (k: number) => triangle.map((p) => p.getComponent(k));
      const [lowA, highA] = [Math.min(...values(a)), Math.max(...values(a))];
      const [lowB, highB] = [Math.min(...values(b)), Math.max(...values(b))];
      for (let i = Math.floor(lowA / CELL); i <= Math.floor(highA / CELL); i++)
        for (let j = Math.floor(lowB / CELL); j <= Math.floor(highB / CELL); j++) {
          const at = `${i},${j}`;
          const cell = this.cells[axis]!.get(at) ?? [];
          cell.push(triangle);
          this.cells[axis]!.set(at, cell);
        }
    }
  }

  /** Whether the hull's surface lies on both sides of a point along an axis of the frame. */
  private enclosedAlong(point: Vector3, axis: 0 | 1 | 2) {
    const [a, b] = ACROSS[axis];
    const [pa, pb] = [point.getComponent(a), point.getComponent(b)];
    let below = false;
    let above = false;
    for (const [p, q, r] of this.cells[axis]!.get(key(pa, pb)) ?? []) {
      const d =
        (q.getComponent(b) - r.getComponent(b)) * (p.getComponent(a) - r.getComponent(a)) +
        (r.getComponent(a) - q.getComponent(a)) * (p.getComponent(b) - r.getComponent(b));
      if (Math.abs(d) < 1e-12) continue;
      const u =
        ((q.getComponent(b) - r.getComponent(b)) * (pa - r.getComponent(a)) +
          (r.getComponent(a) - q.getComponent(a)) * (pb - r.getComponent(b))) /
        d;
      const v =
        ((r.getComponent(b) - p.getComponent(b)) * (pa - r.getComponent(a)) +
          (p.getComponent(a) - r.getComponent(a)) * (pb - r.getComponent(b))) /
        d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const height = u * p.getComponent(axis) + v * q.getComponent(axis) + (1 - u - v) * r.getComponent(axis);
      if (height < point.getComponent(axis)) below = true;
      else above = true;
    }
    return below && above;
  }

  /** Whether a point (in the hull's frame) lies inside it. */
  holds(point: Vector3) {
    return this.enclosedAlong(point, 0) && this.enclosedAlong(point, 1) && this.enclosedAlong(point, 2);
  }
}
