/** A lot's address, read: the neighbourhood folder it was first placed in, and its row, block, side and index there. */
export interface Address {
  /** The folder's path, empty for a town's top folder. */
  readonly folder: string;
  readonly row: number;
  readonly block: number;
  readonly side: number;
  readonly index: number;
}

const SLOT = /^(-?\d+)\.(-?\d+)\.(\d+)\.(\d+)$/;

/**
 * Reads `{key}:{row}.{block}.{side}.{index}`, where the key is the neighbourhood's: a folder's path, or a folder's own
 * lots (`{path}#lots`) beside its subfolders. Null when the address is not of that shape.
 */
export function parseAddress(address: string): Address | null {
  const colon = address.lastIndexOf(":");
  const slot = SLOT.exec(address.slice(colon + 1));
  if (colon < 0 || !slot) return null;
  return {
    folder: address.slice(0, colon).replace(/#lots$/, ""),
    row: Number(slot[1]),
    block: Number(slot[2]),
    side: Number(slot[3]),
    index: Number(slot[4]),
  };
}

/** The folder of a path: everything before its last slash, empty at the top. */
export const folderOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf("/")));
