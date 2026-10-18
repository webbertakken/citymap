// What the crosshair is on: a building's roof or wall, or one of its windows, worked out exactly as the building shader
// draws them, so the window read is the window seen. A window is a file: a lot of several files gives each a band of
// its floors, in its files' order. Metres.
import { FLOOR_HEIGHT, LOTS_BASE, WINDOW_PITCH } from "@citymap/scene";
import type { BuildingHit } from "@citymap/world";
import type { CardRow } from "../card/describe";
import { METRE } from "./street";

/** A building's look, from the lot table: its floors, and the lit share of its windows (−1 when not known). */
export interface Look {
  readonly floors: number;
  readonly lit: number;
}

export type Sight =
  | { readonly kind: "building"; readonly lot: number }
  | {
      readonly kind: "window";
      readonly lot: number;
      /** From 1 at the bottom. */
      readonly floor: number;
      readonly floors: number;
      /** Which of the building's files the window is, from 0. */
      readonly file: number;
      /** Whether it is lit; null when how tested the building is is not known. */
      readonly lit: boolean | null;
    };

/** The shader's measures in metres: where floors start, a floor's height, a window column's width. */
export const BASE = LOTS_BASE / METRE;
export const FLOOR = FLOOR_HEIGHT / METRE;
export const PITCH = WINDOW_PITCH / METRE;
/** A window fills its floor from this share of the floor to that, and its column's middle half. */
const WINDOW_LOW = 0.3;
const WINDOW_HIGH = 0.8;
const WINDOW_SIDE = 0.25;

/** The shader's lighting rule: of the windows in order, a share `lit` lit, evenly spread. */
const litAt = (k: number, lit: number) => Math.floor((k + 1) * lit + 1e-4) > Math.floor(k * lit + 1e-4);

/** What a hit is: a window when it falls on one, else the building. `files` is how many files the building holds. */
export function sightOf(hit: BuildingHit, look: Look, files: number): Sight {
  if (hit.face.kind === "roof") return { kind: "building", lot: hit.lot };
  const height = (hit.at.y - BASE) / FLOOR;
  const row = Math.floor(height);
  const columns = Math.max(1, Math.floor(hit.face.length / PITCH));
  const across = hit.face.along / (hit.face.length / columns);
  const column = Math.min(columns - 1, Math.floor(across));
  const up = height - row;
  const side = across - Math.floor(across);
  const onWindow =
    row >= 0 &&
    row < look.floors &&
    up > WINDOW_LOW &&
    up < WINDOW_HIGH &&
    side > WINDOW_SIDE &&
    side < 1 - WINDOW_SIDE;
  if (!onWindow) return { kind: "building", lot: hit.lot };
  const shared = Math.max(1, files);
  return {
    kind: "window",
    lot: hit.lot,
    floor: row + 1,
    floors: look.floors,
    file: Math.min(shared - 1, Math.floor((row * shared) / look.floors)),
    lit: look.lit < 0 ? null : litAt(row * columns + column, look.lit),
  };
}

/** A window's facts for its card: its floor, its share of a shared building, and what its light says. */
export function windowRows(sight: Extract<Sight, { kind: "window" }>, files: number): CardRow[] {
  const rows: CardRow[] = [{ label: "Window", value: `Floor ${sight.floor} of ${sight.floors}` }];
  if (files > 1)
    rows.push({
      label: "Shared",
      value: `File ${sight.file + 1} of ${files}`,
      note: "Each file has a share of the floors",
    });
  rows.push(
    sight.lit === null
      ? { label: "Light", value: "Not known", note: "How tested this file is is not known" }
      : sight.lit
        ? { label: "Light", value: "Lit", note: "Lit windows are the share of the file its tests reach" }
        : { label: "Light", value: "Dark", note: "Dark windows are the share of the file its tests do not reach" },
  );
  return rows;
}
