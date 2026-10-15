// A uniform grid over the plane for "what lies near this box" queries: items by their bounding boxes.
import type { Pt } from "../fixed/polygon";

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The box round some points, grown by `pad` on every side. */
export function boxOf(pts: readonly Pt[], pad = 0): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

/** Items indexed by box; a query returns, in insertion order and once each, every item whose box meets the query's. */
export class Grid {
  private readonly cells = new Map<string, number[]>();
  private readonly boxes: Box[] = [];

  constructor(private readonly cell: number) {}

  /** Adds the next item (numbered from 0) under its box. */
  add(box: Box): void {
    const id = this.boxes.length;
    this.boxes.push(box);
    this.each(box, (key) => {
      const list = this.cells.get(key);
      if (list) list.push(id);
      else this.cells.set(key, [id]);
    });
  }

  /** The items whose boxes meet the box, in insertion order. */
  near(box: Box): number[] {
    const found = new Set<number>();
    this.each(box, (key) => {
      for (const id of this.cells.get(key) ?? []) {
        const b = this.boxes[id]!;
        if (b.x0 <= box.x1 && box.x0 <= b.x1 && b.y0 <= box.y1 && box.y0 <= b.y1) found.add(id);
      }
    });
    return [...found].toSorted((a, b) => a - b);
  }

  private each(box: Box, visit: (key: string) => void): void {
    for (let cx = Math.floor(box.x0 / this.cell); cx <= Math.floor(box.x1 / this.cell); cx++)
      for (let cy = Math.floor(box.y0 / this.cell); cy <= Math.floor(box.y1 / this.cell); cy++) visit(`${cx},${cy}`);
  }
}
