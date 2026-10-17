// What the pointer is over: in plan view the ground answers; in the Buildings view the first building the view ray
// meets, walking down from the tallest top, else the ground.
import { pick, type Hit, type PickIndex } from "@citymap/scene";
import { unproject, type Mode, type View, type Viewport } from "./view";

/** The ray is walked down this far at a time, in street widths: it crosses a third of a lot's frontage per step. */
export const RAY_STEP = 0.1;

/** How tall the buildings stand: the tallest top, and each lot's own top (null for a lot without a building). */
export interface Heights {
  readonly top: number;
  readonly of: (townKey: string, key: string) => number | null;
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
      const hit = pick(index, at.x, at.z);
      if (hit?.kind === "lot" && (heights.of(hit.townKey, hit.key) ?? 0) >= height) return hit;
    }
  const ground = unproject(view, viewport, screen, mode);
  return pick(index, ground.x, ground.z);
}
