// A city file crosses from the city's worker to the main thread in pieces, each parsed in its own short task with a
// yield to input between them, so a large city never holds the page for one long parse: first the head (the city file
// with every town's lots and the measures' lots emptied), then each town's lots and each town's lot measures, in order.
import type { City, Lot, Town } from "@citymap/ground-plan";
import type { CityFile, LotMeasures, Measures } from "@citymap/measures";
import { log } from "../log";
import { yieldToInput } from "../search/slices";

/** The most characters of JSON a piece holds, unless one item is larger: about 4 ms to parse on the workstation. */
export const PIECE_BYTES = 1_000_000;

/** Items' JSON texts joined into pieces of at most `size` characters each (an item larger than that alone). */
function packed(items: readonly string[], size: number): string[][] {
  const pieces: string[][] = [];
  let piece: string[] = [];
  let length = 0;
  for (const item of items) {
    if (piece.length > 0 && length + item.length > size) {
      pieces.push(piece);
      piece = [];
      length = 0;
    }
    piece.push(item);
    length += item.length + 1;
  }
  if (piece.length > 0) pieces.push(piece);
  return pieces;
}

/** A city file as JSON pieces: the head, then the lots by town, then the lot measures by town, each in order. */
export function cityPieces({ city, measures }: CityFile, size = PIECE_BYTES): string[] {
  const head = {
    ...city,
    towns: city.towns.map((town) => ({ ...town, lots: [] })),
    ...(measures
      ? { measures: { ...measures, lots: Object.fromEntries(Object.keys(measures.lots).map((key) => [key, {}])) } }
      : {}),
  };
  const lots = city.towns.flatMap((town, t) =>
    packed(
      town.lots.map((lot) => JSON.stringify(lot)),
      size,
    ).map((items) => `{"lots":${t},"items":[${items.join(",")}]}`),
  );
  const measured = Object.entries(measures?.lots ?? {}).flatMap(([townKey, byKey]) =>
    packed(
      Object.entries(byKey).map(([key, lot]) => `${JSON.stringify(key)}:${JSON.stringify(lot)}`),
      size,
    ).map((items) => `{"measures":${JSON.stringify(townKey)},"items":{${items.join(",")}}}`),
  );
  return [JSON.stringify(head), ...lots, ...measured];
}

/** One piece after the head: a town's lots, or a town's lot measures. */
type Piece =
  | { readonly lots: number; readonly items: readonly Lot[] }
  | { readonly measures: string; readonly items: Readonly<Record<string, LotMeasures>> };

/** The head as parsed, its towns' lots and its measures' lots still to fill. */
type Head = Omit<City, "towns"> & {
  readonly towns: readonly (Omit<Town, "lots"> & { readonly lots: Lot[] })[];
  readonly measures?: Omit<Measures, "lots"> & { readonly lots: Record<string, Record<string, LotMeasures>> };
};

export interface PieceOptions {
  /** Stops between pieces with the signal's reason. */
  readonly signal?: AbortSignal;
  /** How a piece yields; `yieldToInput` unless a test stands in. */
  readonly pause?: () => Promise<void>;
  /** The clock the log is timed by, in milliseconds. */
  readonly now?: () => number;
}

/**
 * The city file the pieces add up to, its keys in the order of the file parsed whole, each piece parsed in a slice of its
 * own. Nothing is validated again: the worker has validated or laid it, and the schemas transform nothing.
 */
export async function cityOfPieces(
  pieces: readonly string[],
  { signal, pause = yieldToInput, now = () => performance.now() }: PieceOptions = {},
): Promise<CityFile> {
  signal?.throwIfAborted();
  const started = now();
  const parsed: Head = JSON.parse(pieces[0]!);
  // One piece a slice, after a yield, never two at once.
  const take = async (next: number): Promise<void> => {
    const piece = pieces[next];
    if (piece === undefined) return;
    await pause();
    signal?.throwIfAborted();
    const taken: Piece = JSON.parse(piece);
    if ("lots" in taken) for (const lot of taken.items) parsed.towns[taken.lots]!.lots.push(lot);
    else {
      const byKey = parsed.measures!.lots[taken.measures]!;
      // Own properties, as JSON.parse makes them: a key like "__proto__" stays a key.
      for (const [key, value] of Object.entries(taken.items))
        Object.defineProperty(byKey, key, { value, writable: true, enumerable: true, configurable: true });
    }
    return take(next + 1);
  };
  await take(1);
  const chars = pieces.reduce((n, piece) => n + piece.length, 0);
  log.info("viewer/city-pieces", { pieces: pieces.length, chars, ms: Math.round(now() - started) });
  const { measures, ...city } = parsed;
  return { city, measures: measures ?? null };
}
