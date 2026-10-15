/** A pure function that remembers its results by key; its memory clears once it holds `limit` keys. Exact, as `fn` is pure. */
export function remembering<K, V>(fn: (key: K) => V, limit: number): (key: K) => V {
  const seen = new Map<K, V>();
  return (key) => {
    if (seen.has(key)) return seen.get(key)!;
    if (seen.size >= limit) seen.clear();
    const value = fn(key);
    seen.set(key, value);
    return value;
  };
}
