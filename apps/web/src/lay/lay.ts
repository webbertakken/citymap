// Laying a snapshot into a city, with the CLI's default options and the chosen toggles, so the browser lays what
// `citymap --no-history --toggles=…` does.
import {
  DEFAULT_LAND_USES,
  initialState,
  layCity,
  type City,
  type LayProgress,
  type Options,
  type Snapshot,
  type Separation,
  type Toggle,
} from "@citymap/ground-plan";
import type { Measures } from "@citymap/measures";
import { buildScene, type Scene } from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import type { OnStep, Step } from "../load/step";
import { liveMeasures, type LiveFacts } from "../measures/live";

export interface LayOptions {
  /** Ends the lay: the worker is terminated and the promise rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Hears the lay's progress as `lay` steps, then a `draw` step when it builds the scene. */
  readonly onProgress?: OnStep;
  /** The map theme to build the scene in, off the main thread; none builds no scene. */
  readonly theme?: ThemeName;
  /** The layout toggles to lay with; the engine's defaults when absent. */
  readonly toggles?: readonly Toggle[];
  /** The separations to lay with; the engine's defaults when absent. */
  readonly separate?: readonly Separation[];
  /** What the source knows of its files: the city's measures are built from it beside the layout. */
  readonly facts?: LiveFacts;
}

/** A scene built in a theme, ready to draw while that theme is the map's. */
export interface Drawn {
  readonly theme: ThemeName;
  readonly scene: Scene;
}

/** What a lay hands back: the city, its measures when facts were given, and its scene when a theme was. */
export interface Laid {
  readonly city: City;
  readonly measures: Measures | null;
  readonly scene: Drawn | null;
}

export type Lay = (snapshot: Snapshot, options?: LayOptions) => Promise<Laid>;

/** The buffers under a scene's layers, handed to the main thread without a copy. */
export const buffersOf = (scene: Scene): ArrayBuffer[] =>
  [
    ...scene.layers.flatMap((l) => [l.positions.buffer, l.colours.buffer, l.indices.buffer]),
    scene.buildings.positions.buffer,
    scene.buildings.lots.buffer,
    scene.buildings.facades.buffer,
    scene.buildings.indices.buffer,
  ].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);

/** The CLI's defaults, with the toggles and separations chosen (the engine's defaults when none are). */
export const liveOptions = (toggles?: readonly Toggle[], separate?: readonly Separation[]): Options => ({
  densityPct: 50,
  landUses: DEFAULT_LAND_USES,
  order: "centre-out",
  jog: "top-level",
  warp: true,
  loops: true,
  ...(toggles ? { toggles } : {}),
  ...(separate ? { separate } : {}),
});

/** The engine's progress as a step: placing and shaping each fill half the bar; the words count lots placed. */
export const layStep = ({ placed, shaped, lots }: LayProgress): Step => ({
  phase: "lay",
  done: placed + shaped,
  of: 2 * lots,
  count: { done: placed, of: lots },
});

/** `tell`, called at most once per `ms`; `flush` passes on the last call held back, if any. */
export function throttled<T>(tell: (value: T) => void, ms: number, now: () => number) {
  let last = -Infinity;
  let held: { value: T } | null = null;
  const call = (value: T) => {
    if (now() - last >= ms) {
      last = now();
      held = null;
      tell(value);
    } else held = { value };
  };
  call.flush = () => {
    if (held) tell(held.value);
    held = null;
  };
  return call;
}

/** Lays on the calling thread, and builds the scene when given a theme: in the worker, and in tests. */
export const layHere: Lay = async (snapshot, { signal, onProgress, theme, toggles, separate, facts } = {}) => {
  signal?.throwIfAborted();
  const tell = onProgress && ((progress: LayProgress) => onProgress(layStep(progress)));
  const options = liveOptions(toggles, separate);
  const { city, state } = layCity(snapshot, initialState(options), options, tell);
  const measures = facts ? liveMeasures(city, state.plat, snapshot, facts) : null;
  if (theme === undefined) return { city, measures, scene: null };
  onProgress?.({ phase: "draw" });
  return { city, measures, scene: { theme, scene: buildScene(city, THEMES[theme]) } };
};
