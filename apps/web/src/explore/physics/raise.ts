// Raising a city's walls: any physics engine takes the buildings' footprints and gives the walls a walk moves in,
// reporting its progress to the loading card and stopping when the walk is cancelled.
import type { Footprint, Walls } from "@citymap/world";
import type { OnStep } from "../../load/step";

export interface WallOptions {
  readonly onStep?: OnStep;
  readonly signal?: AbortSignal;
}

export type RaiseWalls = (footprints: readonly Footprint[], options: WallOptions) => Promise<Walls>;

/** Lets the page paint between slices of work. */
export const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));
