// What the pointer is over.
import { pick, type Hit, type PickIndex } from "@citymap/scene";
import { unproject, type View, type Viewport } from "./view";

/** The topmost thing under a screen point: in plan view a lot's top lies over its footprint, so the ground answers. */
export function hitAt(index: PickIndex, view: View, viewport: Viewport, screen: { x: number; y: number }): Hit | null {
  const ground = unproject(view, viewport, screen);
  return pick(index, ground.x, ground.z);
}
