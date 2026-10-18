// Going down into the city: everything a walk needs, loaded once behind the loading card, in order: the physics engine,
// the people and vehicles, the city's walls, then the streets round the landing in the physics engine. After it,
// nothing waits. An engine that does not load stops nothing: the walk goes down, and its cars drive as arcade cars.
import type { Footprint, Walls } from "@citymap/world";
import { log, reasonOf } from "../log";
import type { Garage, GarageOptions } from "./physics/garage";
import type { RaiseWalls, WallOptions } from "./physics/raise";
import type { Spot } from "./physics/streets";

/** Why cars drive as arcade cars: the physics engine did not load, or could not keep up. */
export type ArcadeWhy = "engine" | "slow";

/** What going down gives the walk: its walls, the cars' garage (null for arcade cars), and why arcade, if so. */
export interface Descent {
  readonly walls: Walls;
  readonly garage: Garage | null;
  readonly arcade: ArcadeWhy | null;
}

/** Going down into a city's footprints, landing at a point (metres). */
export type GoDown = (footprints: readonly Footprint[], at: Spot, options: WallOptions) => Promise<Descent>;

/** How to go down: the engine, the models (counting them), the walls, and the garage of the nearby streets. */
export interface Descending {
  readonly loadEngine: () => Promise<unknown>;
  readonly loadModels: (onCount: (done: number, of: number) => void) => Promise<void>;
  readonly raise: RaiseWalls;
  readonly openGarage: (footprints: readonly Footprint[], options: GarageOptions) => Promise<Garage>;
  /** A measuring aid: this many parked cars drive themselves (`?traffic=`). */
  readonly traffic?: number;
}

/** Going down by these means: each phase said to the loading card, a cancel honoured between them. */
export const descent =
  (how: Descending): GoDown =>
  async (footprints, at, options) => {
    const { onStep, signal } = options;
    onStep?.({ phase: "engine" });
    const engine = await how.loadEngine().then(
      () => true,
      (failure: unknown) => {
        log.error("explore/arcade", { reason: "engine", detail: reasonOf(failure) });
        return false;
      },
    );
    signal?.throwIfAborted();
    await how.loadModels((done, of) => onStep?.({ phase: "models", done, of }));
    signal?.throwIfAborted();
    const walls = await how.raise(footprints, options);
    try {
      if (!engine) return { walls, garage: null, arcade: "engine" };
      const garage = await how
        .openGarage(footprints, { ...options, at, traffic: how.traffic ?? 0 })
        .catch((failure: unknown) => {
          if (signal?.aborted) throw failure;
          log.error("explore/arcade", { reason: "engine", detail: reasonOf(failure) });
          return null;
        });
      return { walls, garage, arcade: garage ? null : "engine" };
    } catch (failure) {
      walls.dispose();
      throw failure;
    }
  };

/** What the walk's card says once, when cars fall back to the arcade handling. */
export const ARCADE_WORDS: Readonly<Record<ArcadeWhy, string>> = {
  engine: "Cars drive simply here: the physics engine did not load.",
  slow: "Cars drive simply here: this device could not keep up.",
};
