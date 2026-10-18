// A fixed pool of things drawn (models, signs), each slot given to one of what is wanted: a slot stays on what it
// holds while that stays wanted, so nothing is rebuilt as the walker moves; freed slots go to newcomers in order.

/** The slots after a choice: each keeps its id while wanted, else takes the next wanted id not yet held, else null. */
export function assignPool(slots: readonly (string | null)[], wanted: readonly string[]): (string | null)[] {
  const want = new Set(wanted);
  const kept = slots.map((id) => (id !== null && want.has(id) ? id : null));
  const held = new Set(kept);
  const newcomers = wanted.filter((id) => !held.has(id));
  return kept.map((id) => id ?? newcomers.shift() ?? null);
}
