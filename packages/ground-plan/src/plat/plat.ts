import { FORMS, type Form } from "../archetype/forms";
import { ROAD_CLASSES, ptCheck, townCheck } from "../city/checks";
import type { Town } from "../city/city";
import type { RoadClass } from "../constants";
import { CitymapError } from "../errors";
import type { Dir } from "../fixed/direction";
import type { Pt } from "../fixed/polygon";
import type { ShareRecord } from "../tree/tree";
import { canonicalJson } from "./canonical";
import { array, int, literal, nat, nullable, object, oneOf, optional, record, ShapeError, str, type Check } from "./validate";

/** A remembered cut: its line, its class, the items on each side, and each side's land cap before it must move. */
export interface CutRecord {
  n: Dir;
  c: number;
  cls: RoadClass;
  left: string[];
  right: string[];
  capLeft: number;
  capRight: number;
  /** A twin's cut: a river with bridges instead of a road. */
  river?: true;
}

/** A remembered radial layout: core item, start angle step, ring order, sector bounds, core scale (‰) and caps. */
export interface RadialRecord {
  core: string;
  start: number;
  order: string[];
  bounds: number[];
  scaleMille: number;
  caps: Record<string, number>;
}

/** A remembered neighbourhood grid: direction, origin, pitches, lot class, green, high street, park line, slots. */
export interface GridRecord {
  dir: Dir;
  a0: number;
  b0: number;
  rowPitch: number;
  colPitch: number;
  span: number;
  green?: string;
  high?: number;
  park: { n: Dir; c: number } | null;
  slots: Record<string, string>;
}

/** Everything the layout remembers about one town between commits. */
export interface TownPlat {
  centre: Pt | null;
  area2: number;
  cap2: number;
  diameter: number;
  cuts: Record<string, CutRecord>;
  grids: Record<string, GridRecord>;
  shares: Record<string, ShareRecord[]>;
  forms: Record<string, Form>;
  radial: Record<string, RadialRecord>;
  addresses: Record<string, string>;
}

export interface OldTown {
  town: Town;
  /** Per lot key, the identities whose life keeps the lot lit. */
  members: Record<string, string[]>;
}

/** The persistent state of a city. */
export interface Plat {
  version: 1;
  landKey: string;
  towns: Record<string, TownPlat>;
  old: Record<string, OldTown[]>;
  rootForms: Record<string, Form>;
}

export const PLAT_VERSION = 1;

export const emptyTownPlat = (): TownPlat => ({
  centre: null,
  area2: 0,
  cap2: 0,
  diameter: 0,
  cuts: {},
  grids: {},
  shares: {},
  forms: {},
  radial: {},
  addresses: {},
});

export const emptyPlat = (landKey: string): Plat => ({ version: 1, landKey, towns: {}, old: {}, rootForms: {} });

const dirCheck: Check<Dir> = (v, p) => {
  const pair = array(int)(v, p);
  if (pair.length !== 2) throw new ShapeError(p, "a pair of integers");
  return [pair[0] as number, pair[1] as number];
};
const strings = array(str);

const townPlatCheck: Check<TownPlat> = object({
  centre: nullable(ptCheck),
  area2: nat,
  cap2: nat,
  diameter: nat,
  cuts: record(
    object({
      n: dirCheck,
      c: int,
      cls: oneOf(ROAD_CLASSES),
      left: strings,
      right: strings,
      capLeft: nat,
      capRight: nat,
      river: optional(literal(true)),
    }),
  ),
  grids: record(
    object({
      dir: dirCheck,
      a0: int,
      b0: int,
      rowPitch: nat,
      colPitch: nat,
      span: nat,
      green: optional(str),
      high: optional(int),
      park: nullable(object({ n: dirCheck, c: int })),
      slots: record(str),
    }),
  ),
  shares: record(array(object({ key: str, members: strings }))),
  forms: record(oneOf(FORMS)),
  radial: record(
    object({ core: str, start: int, order: strings, bounds: array(int), scaleMille: nat, caps: record(nat) }),
  ),
  addresses: record(str),
});

const platCheck: Check<Plat> = object({
  version: literal(1),
  landKey: str,
  towns: record(townPlatCheck),
  old: record(array(object({ town: townCheck, members: record(strings) }))),
  rootForms: record(oneOf(FORMS)),
});

/** The plat as canonical JSON: sorted keys, integers only, one text per plat. */
export const serialisePlat = (plat: Plat): string => canonicalJson(plat);

/** Parses and validates a serialised plat. */
export function parsePlat(text: string): Plat {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new CitymapError("plat/bad-json", "the plat is not JSON", { reason: String(error) });
  }
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > PLAT_VERSION)
    throw new CitymapError("plat/too-new", `plat version ${version} is newer than ${PLAT_VERSION}`, { version });
  if (version !== PLAT_VERSION)
    throw new CitymapError("plat/bad-version", `plat version ${String(version)} is not supported`, { version });
  try {
    return platCheck(value, "");
  } catch (error) {
    // The validators throw nothing but shape errors.
    const shape = error as ShapeError;
    throw new CitymapError("plat/bad-shape", shape.message, { pointer: shape.pointer, expected: shape.expected });
  }
}
