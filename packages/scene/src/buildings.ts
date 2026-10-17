// Every lot's building as one mesh: a roof and a wall per edge, each vertex knowing its lot, whether it stands at the
// foot or the top, and where along its wall it lies. Heights, colours and lit windows come from the lot table, a float
// texture the shader reads, so the plan and the Buildings view share the mesh and a new colour rewrites one texture.
import { UNIT, type LandUse, type Pt } from "@citymap/ground-plan";
import { triangulate } from "./triangulate";

/** One building's lot: its town, its key, its folder's tint seed and its land use. */
export interface LotRef {
  readonly town: string;
  readonly key: string;
  readonly district: number;
  readonly use: LandUse;
}

export interface Buildings {
  /** Three floats per vertex: x, the ring (0 at the foot, 1 at the top), z. */
  readonly positions: Float32Array;
  /** One float per vertex: its lot's index in `order`. */
  readonly lots: Float32Array;
  /** Two floats per vertex: the distance along its wall and the wall's length, in street widths; −1 and −1 on a roof. */
  readonly facades: Float32Array;
  readonly indices: Uint32Array;
  readonly order: readonly LotRef[];
}

/** A floor's height, in street widths: twelve floors are three street widths, a lot's depth. */
export const FLOOR_HEIGHT = 0.25;
/** A window's column, along a wall, in street widths: two across a lot's half-street frontage. */
export const WINDOW_PITCH = 0.25;
/** The lot table's width in texels; its rows hold the rest. */
export const DATA_COLUMNS = 1024;
/** Floats per lot in the lot table: floors, lit share, packed colour, flags. */
export const LOT_FLOATS = 4;
/** The lot table's flag for a building of unknown size: its roof is hatched. */
export const UNKNOWN_SIZE = 1;

/** Grows the buildings' arrays, one lot at a time. */
export class BuildingsBuilder {
  private readonly positions: number[] = [];
  private readonly lots: number[] = [];
  private readonly facades: number[] = [];
  private readonly indices: number[] = [];
  private readonly order: LotRef[] = [];

  private vertex(p: Pt, ring: 0 | 1, lot: number, along: number, length: number) {
    this.positions.push(p.x / UNIT, ring, 0 - p.y / UNIT);
    this.lots.push(lot);
    this.facades.push(along, length);
  }

  /** A lot's roof and walls, its polygon in fixed units. */
  add(pts: readonly Pt[], ref: LotRef) {
    if (pts.length < 3) return;
    const lot = this.order.length;
    this.order.push(ref);
    const roof = this.positions.length / 3;
    for (const p of pts) this.vertex(p, 1, lot, -1, -1);
    this.indices.push(...triangulate(pts.length, roof));
    pts.forEach((a, k) => {
      const b = pts[(k + 1) % pts.length]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y) / UNIT;
      const base = this.positions.length / 3;
      this.vertex(a, 0, lot, 0, length);
      this.vertex(b, 0, lot, length, length);
      this.vertex(b, 1, lot, length, length);
      this.vertex(a, 1, lot, 0, length);
      this.indices.push(...triangulate(4, base));
    });
  }

  done(): Buildings {
    return {
      positions: Float32Array.from(this.positions),
      lots: Float32Array.from(this.lots),
      facades: Float32Array.from(this.facades),
      indices: Uint32Array.from(this.indices),
      order: this.order,
    };
  }
}

/** What the lot table says of one building. */
export interface LotLook {
  readonly floors: number;
  /** The lit share of its windows, from 0 to 1; −1 when not known. */
  readonly lit: number;
  /** Its colour, `#rrggbb`. */
  readonly colour: string;
  readonly unknownSize: boolean;
}

/** A colour packed into one float, exactly: `r · 65536 + g · 256 + b`. */
export const packColour = (hex: string) => Number.parseInt(hex.slice(1, 7), 16);

/** The lot table: four floats per lot, in rows of `DATA_COLUMNS`, padded to whole rows. */
export function lotTable(order: readonly LotRef[], lookOf: (ref: LotRef) => LotLook): Float32Array {
  const rows = Math.max(1, Math.ceil(order.length / DATA_COLUMNS));
  const table = new Float32Array(rows * DATA_COLUMNS * LOT_FLOATS);
  order.forEach((ref, i) => {
    const look = lookOf(ref);
    table.set([look.floors, look.lit, packColour(look.colour), look.unknownSize ? UNKNOWN_SIZE : 0], i * LOT_FLOATS);
  });
  return table;
}
