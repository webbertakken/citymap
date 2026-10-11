/** The sign of an integer: -1, 0 or 1. */
export function sign(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function uncovered(): number {
  return 1;
}
