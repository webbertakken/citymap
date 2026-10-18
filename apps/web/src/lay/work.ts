// What the city's worker keeps while its city is shown, and what it makes from it when asked: each place's scene in a
// theme (the whole city's, then every town's, made ahead), and the whole city's lot table in a colour and a theme.
// Every answer is one task, so the worker makes one at a time and hears a newer ask between two.
import type { City } from "@citymap/ground-plan";
import type { CityFile } from "@citymap/measures";
import {
  buildScene,
  buildingSpans,
  focusOn,
  lotRefs,
  type ColourBy,
  type LotRef,
  type Scene,
  type Span,
} from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import { cityBuildings, cityFloors, colourFor, tableFor, type CityBuildings } from "../view/buildings";
import { cityRoofs, type Roofs } from "../view/roofs";

/** Everything the work keeps of its city: the file, every building, their refs, floors, roofs and each town's span. */
export interface CityWork {
  readonly file: CityFile;
  readonly buildings: CityBuildings;
  readonly refs: readonly LotRef[];
  readonly floors: Uint8Array<ArrayBuffer>;
  readonly roofs: Roofs;
  readonly spans: ReadonlyMap<string, Span>;
}

/** Asks for the city's scenes in a theme (the town `first` before the other towns) and its lot table in a colour. */
export interface LookAsk {
  readonly ask: "look";
  readonly theme: ThemeName;
  readonly colourBy: ColourBy;
  readonly first: string | null;
}

/** Asks for the whole city's lot table alone, in a colour and a theme. */
export interface TableAsk {
  readonly ask: "table";
  readonly theme: ThemeName;
  readonly colourBy: ColourBy;
}

export type Ask = LookAsk | TableAsk;

/** One thing made: a place's scene in a theme (`town` null for the whole city), or the whole city's lot table. */
export type Answer =
  | {
      readonly kind: "scene";
      readonly theme: ThemeName;
      readonly town: string | null;
      /** Null for the town of a city of one town without highways: its scene is the whole city's, answered before. */
      readonly scene: Scene | null;
    }
  | {
      readonly kind: "table";
      readonly theme: ThemeName;
      readonly colourBy: ColourBy;
      readonly table: Float32Array<ArrayBuffer>;
    };

/** One answer still to make, under a key that names what it makes. */
export interface Task {
  readonly key: string;
  readonly make: () => Answer;
}

/** The answers still to make, in order. */
export type Tasks = readonly Task[];

/** What the work keeps of a city file, made once. */
export function cityWork(file: CityFile): CityWork {
  const buildings = cityBuildings(file.measures);
  const refs = lotRefs(file.city);
  return {
    file,
    buildings,
    refs,
    floors: cityFloors(refs, buildings),
    roofs: cityRoofs(file.city, buildings),
    spans: buildingSpans(file.city),
  };
}

/** True when a town alone is the city itself: its only town, without highways. */
const alone = (city: City) => city.towns.length === 1 && city.highways.length === 0;

const tableTask = (work: CityWork, theme: ThemeName, wanted: ColourBy): Task => {
  const colourBy = colourFor(wanted, work.file.measures);
  return {
    key: `table ${theme} ${colourBy}`,
    make: () => ({
      kind: "table",
      theme,
      colourBy,
      table: tableFor(work.refs, work.buildings, colourBy, THEMES[theme]),
    }),
  };
};

const sceneTask = (work: CityWork, theme: ThemeName, town: string | null): Task => ({
  key: `scene ${theme} ${town ?? ""}`,
  make: () => {
    const { city } = work.file;
    if (town === null) return { kind: "scene", theme, town, scene: buildScene(city, THEMES[theme]) };
    return { kind: "scene", theme, town, scene: alone(city) ? null : buildScene(focusOn(city, town), THEMES[theme]) };
  },
});

/** The towns in the order their scenes are made: `first` (when the city has it), then the largest first. */
function townOrder(city: City, first: string | null): string[] {
  const largest = city.towns.toSorted((a, b) => b.stats.lots - a.stats.lots).map((t) => t.key);
  return first !== null && largest.includes(first) ? [first, ...largest.filter((k) => k !== first)] : largest;
}

/** The tasks of a look: its table, the whole city's scene, then every town's. */
const lookTasks = (work: CityWork, { theme, colourBy, first }: LookAsk): Task[] => [
  tableTask(work, theme, colourBy),
  sceneTask(work, theme, null),
  ...townOrder(work.file.city, first).map((key) => sceneTask(work, theme, key)),
];

const isTable = (task: Task) => task.key.startsWith("table ");

/**
 * The queue after an ask: a table goes first; a look follows every table still to make, and drops every scene an older
 * look has not made yet. No key waits twice.
 */
export function asked(tasks: Tasks, work: CityWork, ask: Ask): Tasks {
  if (ask.ask === "table") {
    const task = tableTask(work, ask.theme, ask.colourBy);
    return [task, ...tasks.filter((t) => t.key !== task.key)];
  }
  const look = lookTasks(work, ask);
  const keys = new Set(look.map((t) => t.key));
  return [...tasks.filter((t) => isTable(t) && !keys.has(t.key)), ...look];
}

/** An opening's own answers, made at once (the table, the whole city's scene, the town `first`), and the rest to make. */
export function opening(work: CityWork, ask: LookAsk): { readonly answers: Answer[]; readonly tasks: Tasks } {
  const tasks = asked([], work, ask);
  const now = ask.first !== null && work.spans.has(ask.first) ? 3 : 2;
  return { answers: tasks.slice(0, now).map((task) => task.make()), tasks: tasks.slice(now) };
}

/** The buffers under a scene's layers and buildings, handed over without a copy. */
export const buffersOf = (scene: Scene): ArrayBuffer[] =>
  [
    ...scene.layers.flatMap((l) => [l.positions.buffer, l.colours.buffer, l.indices.buffer]),
    scene.buildings.positions.buffer,
    scene.buildings.lots.buffer,
    scene.buildings.facades.buffer,
    scene.buildings.indices.buffer,
  ].filter((b): b is ArrayBuffer => b instanceof ArrayBuffer);

/** The buffers under an answer, handed over without a copy. */
export const answerBuffers = (answer: Answer): ArrayBuffer[] =>
  answer.kind === "table" ? [answer.table.buffer] : answer.scene ? buffersOf(answer.scene) : [];
