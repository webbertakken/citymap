/** Triangle indices fanning a convex polygon of n vertices from its first, which sits at index `base`. */
export function triangulate(n: number, base: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < n - 1; i++) out.push(base, base + i, base + i + 1);
  return out;
}
