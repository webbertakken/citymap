// A git index (`.git/index`) decoded into the paths git tracks: versions 2 to 4, either object format. The layout is
// git's own (Documentation/gitformat-index.txt); every read is bounds-checked, as the bytes come from the folder.
import { LocalError } from "./errors";

export interface IndexListing {
  readonly version: 2 | 3 | 4;
  /** Tracked paths in the index's order, each once; submodules left out. */
  readonly paths: readonly string[];
  /** Each path's size in bytes as git last saw it in the working tree (the stat data's 32 bits), in the same order. */
  readonly sizes: readonly number[];
  /** The submodules' paths (gitlinks), in the index's order, each once. */
  readonly gitlinks: readonly string[];
}

const SIGNATURE = 0x44_49_52_43; // "DIRC"
/** Stat data before the object id: ctime, mtime, dev, ino, mode, uid, gid, size; 32 bits each but the times' 64. */
const STAT_BYTES = 40;
const MODE_AT = 24;
/** The stat data's file size: the last of its 32-bit words. */
const SIZE_AT = 36;
const EXTENDED = 0x40_00;
const MODE_TYPE = 0o170_000;
const SUBMODULE = 0o160_000;
const SPARSE_FOLDER = 0o040_000;

const damaged = (reason: string, at: number): never => {
  throw new LocalError("local/bad-index", `the git index is damaged (${reason} at byte ${at})`, { reason, at });
};

/** The tracked paths of an index whose object ids are `idBytes` long (20 for SHA-1, 32 for SHA-256). */
export function readIndex(bytes: Uint8Array, idBytes: number): IndexListing {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Entries and extensions end where the trailing checksum begins.
  const end = bytes.length - idBytes;
  if (end < 12 || view.getUint32(0) !== SIGNATURE) damaged("header", 0);
  const version = view.getUint32(4);
  if (version !== 2 && version !== 3 && version !== 4)
    throw new LocalError("local/index-version", `the git index is version ${version}`, { version });
  const count = view.getUint32(8);
  const decoder = new TextDecoder();
  const seen = new Set<string>();
  const paths: string[] = [];
  const sizes: number[] = [];
  const gitlinks: string[] = [];
  let previous: Uint8Array = new Uint8Array(0);
  let at = 12;
  /** A byte before the checksum. */
  const byteAt = (i: number, start: number): number => (i < end ? bytes[i]! : damaged("entry", start));
  for (let i = 0; i < count; i++) {
    const start = at;
    const fixed = STAT_BYTES + idBytes + 2;
    if (start + fixed > end) damaged("entry", start);
    const mode = view.getUint32(start + MODE_AT);
    const size = view.getUint32(start + SIZE_AT);
    const flags = view.getUint16(start + STAT_BYTES + idBytes);
    at = start + fixed;
    if (flags & EXTENDED) {
      if (version === 2) damaged("extended", start);
      at += 2;
    }
    let path: Uint8Array;
    if (version === 4) {
      // The bytes to drop from the end of the previous path, as git's offset varint, then the rest of this one.
      let byte = byteAt(at++, start);
      let strip = byte & 127;
      while (byte & 128) {
        byte = byteAt(at++, start);
        strip = ((strip + 1) << 7) | (byte & 127);
      }
      const zero = bytes.indexOf(0, at);
      if (strip > previous.length || zero < 0 || zero >= end) damaged("entry", start);
      const kept = previous.length - strip;
      path = new Uint8Array(kept + zero - at);
      path.set(previous.subarray(0, kept));
      path.set(bytes.subarray(at, zero), kept);
      at = zero + 1;
    } else {
      // The flags' 12-bit length says only "4,095 or more" for long paths, so the path ends at its zero byte.
      const zero = bytes.indexOf(0, at);
      if (zero < 0 || zero >= end) damaged("entry", start);
      path = bytes.subarray(at, zero);
      // Padded with one to eight zero bytes to a multiple of eight from the entry's start.
      at = start + ((fixed + (flags & EXTENDED ? 2 : 0) + path.length + 8) & ~7);
      if (at > end) damaged("entry", start);
    }
    previous = path;
    const type = mode & MODE_TYPE;
    if (type === SPARSE_FOLDER)
      throw new LocalError("local/sparse-index", "the git index is sparse: folders stand for their files");
    const text = decoder.decode(path);
    if (seen.has(text)) continue;
    seen.add(text);
    if (type === SUBMODULE) gitlinks.push(text);
    else {
      paths.push(text);
      sizes.push(size);
    }
  }
  while (at + 8 <= end) {
    const name = String.fromCharCode(...bytes.subarray(at, at + 4));
    const size = view.getUint32(at + 4);
    if (at + 8 + size > end) damaged("extension", at);
    if (name === "link")
      throw new LocalError("local/split-index", "the git index is split: its entries live in a shared index");
    if (name === "sdir")
      throw new LocalError("local/sparse-index", "the git index is sparse: folders stand for their files");
    // Upper case first: optional, and safe to pass over; anything else must be understood to use the index.
    if (!(name[0]! >= "A" && name[0]! <= "Z"))
      throw new LocalError("local/index-extension", `the git index needs its ${name} extension`, { name });
    at += 8 + size;
  }
  if (at !== end) damaged("trailer", at);
  return { version, paths, sizes, gitlinks };
}
