// The city's walls from citymap's own world: no engine to load, every building a prism in a grid, raised at once.
import { cityWalls, solid, type Footprint, type Walls } from "@citymap/world";
import { log } from "../../log";
import { breathe, type WallOptions } from "./raise";

/** The bespoke walls of these buildings, after one breath for the loading card to say so. */
export async function bespokeWalls(footprints: readonly Footprint[], options: WallOptions = {}): Promise<Walls> {
  const { onStep, signal } = options;
  const started = performance.now();
  onStep?.({ phase: "walls", done: 0, of: footprints.length });
  await breathe();
  signal?.throwIfAborted();
  const walls = cityWalls(footprints);
  onStep?.({ phase: "walls", done: footprints.length, of: footprints.length });
  log.info("explore/walls", {
    engine: "bespoke",
    buildings: footprints.length,
    skipped: footprints.filter((f) => !solid(f)).length,
    ms: Math.round(performance.now() - started),
  });
  return walls;
}
