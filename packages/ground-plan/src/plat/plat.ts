import * as v from "valibot";
import { FORMS, type Form } from "../archetype/forms";
import { ptSchema, townSchema } from "../city/checks";
import type { Town } from "../city/city";
import { ROAD_CLASSES, type RoadClass } from "../constants";
import { CitymapError } from "../errors";
import type { Dir } from "../fixed/direction";
import type { Pt } from "../fixed/polygon";
import type { ShareRecord } from "../tree/tree";
import { canonicalJson } from "./canonical";
import { int, nat, parseJson, validate } from "./schema";

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

export const PLAT_VERSION = 1;

/** The persistent state of a city. */
export interface Plat {
  version: 1;
  /** The land and split setting this plat was laid for: each setting has its own plat. */
  setting: string;
  towns: Record<string, TownPlat>;
  old: Record<string, OldTown[]>;
  rootForms: Record<string, Form>;
}

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

export const emptyPlat = (setting: string): Plat => ({ version: 1, setting, towns: {}, old: {}, rootForms: {} });

const dirSchema = v.strictTuple([int, int]);
const strings = v.array(v.string());

const townPlatSchema = v.strictObject({
  centre: v.nullable(ptSchema),
  area2: nat,
  cap2: nat,
  diameter: nat,
  cuts: v.record(
    v.string(),
    v.strictObject({
      n: dirSchema,
      c: int,
      cls: v.picklist(ROAD_CLASSES),
      left: strings,
      right: strings,
      capLeft: nat,
      capRight: nat,
      river: v.exactOptional(v.literal(true)),
    }),
  ),
  grids: v.record(
    v.string(),
    v.strictObject({
      dir: dirSchema,
      a0: int,
      b0: int,
      rowPitch: nat,
      colPitch: nat,
      span: nat,
      green: v.exactOptional(v.string()),
      high: v.exactOptional(int),
      park: v.nullable(v.strictObject({ n: dirSchema, c: int })),
      slots: v.record(v.string(), v.string()),
    }),
  ),
  shares: v.record(v.string(), v.array(v.strictObject({ key: v.string(), members: strings }))),
  forms: v.record(v.string(), v.picklist(FORMS)),
  radial: v.record(
    v.string(),
    v.strictObject({
      core: v.string(),
      start: int,
      order: strings,
      bounds: v.array(int),
      scaleMille: nat,
      caps: v.record(v.string(), nat),
    }),
  ),
  addresses: v.record(v.string(), v.string()),
});

const platSchema = v.strictObject({
  version: v.literal(PLAT_VERSION),
  setting: v.string(),
  towns: v.record(v.string(), townPlatSchema),
  old: v.record(v.string(), v.array(v.strictObject({ town: townSchema, members: v.record(v.string(), strings) }))),
  rootForms: v.record(v.string(), v.picklist(FORMS)),
});

/** The plat as canonical JSON: sorted keys, integers only, one text per plat. */
export const serialisePlat = (plat: Plat): string => canonicalJson(plat);

/** Parses and validates a serialised plat. */
export function parsePlat(text: string): Plat {
  const value = parseJson(text, "plat/bad-json");
  const version = v.safeParse(v.looseObject({ version: v.number() }), value);
  if (version.success && version.output.version > PLAT_VERSION)
    throw new CitymapError("plat/too-new", `plat version ${version.output.version} is newer than ${PLAT_VERSION}`, {
      version: version.output.version,
    });
  if (!version.success || version.output.version !== PLAT_VERSION)
    throw new CitymapError("plat/bad-version", "the plat's version is not supported");
  return validate(platSchema, value, "plat/bad-shape");
}
