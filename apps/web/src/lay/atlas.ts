// What the viewer holds of the city shown, as its worker answers: the scenes by theme (the whole city's and each
// town's) and the whole city's lot tables by theme and colour. The map draws the look asked for once it is complete,
// and until then the newest complete one, so a new theme or colour changes the map at once when it arrives.
import type { City } from "@citymap/ground-plan";
import type { Scales } from "@citymap/measures";
import { buildingSpans, type ColourBy, type Scene, type Span } from "@citymap/scene";
import type { ThemeName } from "@citymap/themes";
import type { Roofs } from "../view/roofs";
import type { CityPort } from "./port";
import type { Answer, Ask } from "./work";

/** Complete themes kept (each with the whole city's scene and a table): the one drawn, and the newest. */
export const THEMES_KEPT = 2;

/** One theme's answers: its scenes by town key (null for the whole city; a null scene is the whole city's), its tables. */
interface Theme {
  readonly scenes: ReadonlyMap<string | null, Scene | null>;
  readonly tables: ReadonlyMap<ColourBy, Float32Array>;
}

export interface Atlas {
  readonly city: City;
  readonly port: CityPort;
  readonly scales: Scales;
  /** Every building's floors, by its index in the whole city's order. */
  readonly floors: Uint8Array;
  readonly roofs: Roofs;
  readonly spans: ReadonlyMap<string, Span>;
  /** The span of every building: the whole city's. */
  readonly whole: Span;
  /** By theme, in the order each first answered. */
  readonly themes: ReadonlyMap<ThemeName, Theme>;
}

/** What the map draws: a theme and a colour, the whole city's scene in that theme, and the table in that colour. */
export interface Look {
  readonly theme: ThemeName;
  readonly colourBy: ColourBy;
  readonly whole: Scene;
  readonly table: Float32Array;
}

/** A theme with the whole city's scene and a table: one the map can draw. */
const complete = (theme: Theme) => Boolean(theme.scenes.get(null)) && theme.tables.size > 0;

const EMPTY: Theme = { scenes: new Map(), tables: new Map() };

/** A theme's answers with one more. */
function withAnswer(theme: Theme, answer: Answer): Theme {
  return answer.kind === "scene"
    ? { ...theme, scenes: new Map(theme.scenes).set(answer.town, answer.scene) }
    : { ...theme, tables: new Map(theme.tables).set(answer.colourBy, answer.table) };
}

/** The newest table of a theme: the last to arrive. */
const newest = <K, V>(map: ReadonlyMap<K, V>): V => [...map.values()].at(-1)!;

export const Atlas = {
  /** A city just opened, with its opening's answers. */
  open: (opened: {
    readonly city: City;
    readonly port: CityPort;
    readonly scales: Scales;
    readonly floors: Uint8Array;
    readonly roofs: Roofs;
    readonly answers: readonly Answer[];
  }): Atlas =>
    opened.answers.reduce(Atlas.received, {
      city: opened.city,
      port: opened.port,
      scales: opened.scales,
      floors: opened.floors,
      roofs: opened.roofs,
      spans: buildingSpans(opened.city),
      whole: { first: 0, count: opened.floors.length },
      themes: new Map(),
    }),

  /**
   * With one more answer. When it completes its theme, only that theme and the newest other complete one are kept
   * (`THEMES_KEPT`), so the map always has the look it draws and what it is changing to.
   */
  received: (atlas: Atlas, answer: Answer): Atlas => {
    const theme = withAnswer(atlas.themes.get(answer.theme) ?? EMPTY, answer);
    const themes = new Map(atlas.themes).set(answer.theme, theme);
    if (!complete(theme)) return { ...atlas, themes };
    const others = [...themes].filter(([name, t]) => name !== answer.theme && complete(t)).slice(1 - THEMES_KEPT);
    const kept = new Set([answer.theme, ...others.map(([name]) => name)]);
    return { ...atlas, themes: new Map([...themes].filter(([name]) => kept.has(name))) };
  },

  /** The look the map draws: the theme and colour asked for when at hand, else the newest complete theme's newest table. */
  look: (atlas: Atlas, { theme, colourBy }: { theme: ThemeName; colourBy: ColourBy }): Look | null => {
    const asked = atlas.themes.get(theme);
    const [name, drawn] =
      asked && complete(asked) ? [theme, asked] : ([...atlas.themes].findLast(([, t]) => complete(t)) ?? []);
    if (!name || !drawn) return null;
    const table = drawn.tables.get(colourBy);
    return {
      theme: name,
      colourBy: table ? colourBy : [...drawn.tables.keys()].at(-1)!,
      whole: drawn.scenes.get(null)!,
      table: table ?? newest(drawn.tables),
    };
  },

  /** A town's scene in a theme, once made (the whole city's for a city that is that town alone), else null. */
  town: (atlas: Atlas, theme: ThemeName, key: string): Scene | null => {
    const scenes = atlas.themes.get(theme)?.scenes;
    if (!scenes?.has(key)) return null;
    return scenes.get(key) ?? scenes.get(null) ?? null;
  },

  /** The span of the place shown: a town's buildings, or every building of the city (also for a key it does not hold). */
  span: (atlas: Atlas, town: string | null): Span => (town !== null && atlas.spans.get(town)) || atlas.whole,

  /** What to ask the city's work for, so the look asked for comes: its theme's scenes, or its table; null for nothing. */
  wants: (
    atlas: Atlas,
    { theme, colourBy, town }: { theme: ThemeName; colourBy: ColourBy; town: string | null },
  ): Ask | null => {
    const asked = atlas.themes.get(theme);
    if (!asked?.scenes.get(null)) return { ask: "look", theme, colourBy, first: town };
    return asked.tables.has(colourBy) ? null : { ask: "table", theme, colourBy };
  },
} as const;
