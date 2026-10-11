// Dimensions of the ground plan in fixed units (64 per u); provenance in the blueprint's DEFAULTS.md.

/** Road classes, smallest first. */
export type RoadClass = "lane" | "street" | "collector" | "avenue" | "boulevard" | "highway";

export const ROAD_WIDTH: Readonly<Record<RoadClass, number>> = {
  lane: 40,
  street: 64,
  collector: 96,
  avenue: 144,
  boulevard: 208,
  highway: 176,
};

/** One local street width. */
export const U = 64;
export const BLOCK_SHORT = 6 * U;
export const BLOCK_LONG = 12 * U;
/** Lot frontage unit, 0.5 u. */
export const MODULE = 32;
export const PAVEMENT = 12;
/** Land of one lot: one module of frontage, half a block deep. */
export const LOT_AREA = MODULE * (BLOCK_SHORT / 2);
/** Half a street plus pavement round a neighbourhood's land. */
export const MARGIN = U / 2 + PAVEMENT;
/** A folder under this many blocks of land flattens into one neighbourhood. */
export const FLATTEN_BLOCKS = 9;
export const FLATTEN_LIMIT = FLATTEN_BLOCKS * (BLOCK_SHORT + U) * (BLOCK_LONG + U);
