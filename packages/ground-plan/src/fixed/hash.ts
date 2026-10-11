const encoder = new TextEncoder();

/** 32-bit FNV-1a over the key's UTF-8 bytes, unsigned. */
export function fnv1a(key: string): number {
  let h = 0x811c9dc5;
  for (const byte of encoder.encode(key)) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h;
}

/** The seed of a plat key: its hash with pinwheel separators removed, so sub-keys keep their parent's tint. */
export const seedOf = (key: string): number => fnv1a(key.replaceAll(">", ""));

/** A deterministic integer in [0, 1000) from a key. */
export const unitMille = (key: string): number => Math.floor((fnv1a(key) * 1000) / 2 ** 32);

// UTF-16 code units sort surrogates (astral code points) below U+E000 to U+FFFF; shifting both ranges restores
// code point order, which is UTF-8 byte order.
const rank = (unit: number) => (unit >= 0xe000 ? unit - 0x800 : unit >= 0xd800 ? unit + 0x2000 : unit);

/** Byte-wise (UTF-8) order: code point order. The only string comparison the engine uses. */
export function compareKeys(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return rank(x) - rank(y);
  }
  return a.length - b.length;
}
