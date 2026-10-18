// What the pointer is over: in plan view the ground answers; in the Buildings view the first building the view ray
// meets, walking down from the tallest top, else the ground.
import { FLOOR_HEIGHT, LOTS_BASE, buildingAt, pick, type Hit, type PickIndex, type Span } from "@citymap/scene";
import { unproject, type Mode, type View, type Viewport } from "./view";

/** The ray is walked down this far at a time, in street widths: it crosses a third of a lot's frontage per step. */
export const RAY_STEP = 0.1;

/**
 * How tall the buildings stand: the tallest top of the place shown, and every building's floors by its index in the
 * whole city's order (the `building` the pick grid gives each lot).
 */
export interface Heights {
  readonly top: number;
  readonly floors: Uint8Array;
}

/** A building's top, in street widths: its floors on the lots' base. */
export const heightOf = (floors: number): number => LOTS_BASE + floors * FLOOR_HEIGHT;

/** The heights of a place's buildings: its span of the whole city's floors; no building stands at 0. */
export function heightsOf(floors: Uint8Array, { first, count }: Span): Heights {
  let tallest = -1;
  for (let b = first; b < first + count; b++) tallest = Math.max(tallest, floors[b]!);
  return { top: tallest < 0 ? 0 : heightOf(tallest), floors };
}

/** The topmost thing under a screen point. */
export function hitAt(
  index: PickIndex,
  view: View,
  viewport: Viewport,
  screen: { x: number; y: number },
  mode: Mode = "plan",
  heights: Heights | null = null,
): Hit | null {
  if (mode === "buildings" && heights)
    for (let height = heights.top; height > 0; height -= RAY_STEP) {
      const at = unproject(view, viewport, screen, mode, height);
      const building = buildingAt(index, at.x, at.z);
      if (building >= 0 && heightOf(heights.floors[building]!) >= height) return pick(index, at.x, at.z);
    }
  const ground = unproject(view, viewport, screen, mode);
  return pick(index, ground.x, ground.z);
}
