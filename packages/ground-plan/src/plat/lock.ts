import * as v from "valibot";
import { canonicalJson } from "./canonical";
import { parsePlat, type Plat } from "./plat";
import { nat, parseJson, validate } from "./schema";

/** A committed lockfile: the plat as folded up to a commit, which a later fold resumes from. */
export interface Lockfile {
  readonly commit: string;
  readonly index: number;
  readonly plat: Plat;
}

const lockSchema = v.strictObject({
  commit: v.pipe(v.string(), v.regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/)),
  index: nat,
  plat: v.unknown(),
});

export const serialiseLock = (lock: Lockfile): string => canonicalJson(lock);

/** Parses a lockfile; its plat is validated as any plat is. */
export function parseLock(text: string): Lockfile {
  const { commit, index, plat } = validate(lockSchema, parseJson(text, "lock/bad-json"), "lock/bad-shape");
  return { commit, index, plat: parsePlat(JSON.stringify(plat)) };
}
