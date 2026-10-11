import { CitymapError } from "../errors";

/** How a division rounds: toward negative infinity, or to nearest with halves toward positive infinity. */
export type Rounding = "floor" | "round";

const requirePositive = (b: number) => {
  if (!(b > 0) || !Number.isSafeInteger(b)) throw new CitymapError("fixed/bad-divisor", `divisor ${b} is not positive`);
};

const bigFloorDiv = (a: bigint, b: bigint): bigint => {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
};

const toSafe = (value: bigint): number => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new CitymapError("fixed/overflow", `result ${value} is outside the safe range`);
  return n;
};

// For safe integers the remainder is exact, and so is the division of a multiple of b by b.
const floorDivSafe = (a: number, b: number): number => {
  const remainder = ((a % b) + b) % b;
  return (a - remainder) / b + 0;
};

/** ⌊a / b⌋ for a positive divisor. */
export function floorDiv(a: number, b: number): number {
  requirePositive(b);
  return floorDivSafe(a, b);
}

/** a / b rounded to nearest, halves toward positive infinity: ⌊(2a + b) / 2b⌋. */
export function roundDiv(a: number, b: number): number {
  requirePositive(b);
  const numerator = 2 * a + b;
  if (Number.isSafeInteger(numerator) && Number.isSafeInteger(2 * b)) return floorDivSafe(numerator, 2 * b);
  return toSafe(bigFloorDiv(2n * BigInt(a) + BigInt(b), 2n * BigInt(b)));
}

/** a × b / c with the named rounding, exact for any safe integers. */
export function mulDiv(a: number, b: number, c: number, rounding: Rounding): number {
  requirePositive(c);
  const product = a * b;
  if (Number.isSafeInteger(product)) return rounding === "floor" ? floorDivSafe(product, c) : roundDiv(product, c);
  const p = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  return toSafe(rounding === "floor" ? bigFloorDiv(p, d) : bigFloorDiv(2n * p + d, 2n * d));
}

/** ⌊√n⌋ for a non-negative safe integer, by Newton iteration on integers. */
export function isqrt(n: number): number {
  if (n < 0) throw new CitymapError("fixed/negative-sqrt", `cannot take the square root of ${n}`);
  if (n < 2) return n;
  const target = BigInt(n);
  let x = BigInt(Math.floor(Math.sqrt(n))) + 1n;
  for (;;) {
    const next = (x + target / x) / 2n;
    if (next >= x) break;
    x = next;
  }
  while (x * x > target) x -= 1n;
  while ((x + 1n) * (x + 1n) <= target) x += 1n;
  return Number(x);
}
