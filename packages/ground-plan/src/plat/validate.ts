// A small structural validator: each check returns the value typed, or throws with the JSON pointer of the fault.

export class ShapeError extends Error {
  constructor(
    readonly pointer: string,
    readonly expected: string,
  ) {
    super(`${pointer || "/"}: expected ${expected}`);
  }
}

export type Check<T> = (value: unknown, pointer: string) => T;

const fail = (pointer: string, expected: string): never => {
  throw new ShapeError(pointer, expected);
};

export const int: Check<number> = (v, p) => (Number.isSafeInteger(v) ? (v as number) : fail(p, "an integer"));
export const nat: Check<number> = (v, p) => (int(v, p) >= 0 ? (v as number) : fail(p, "a non-negative integer"));
export const str: Check<string> = (v, p) => (typeof v === "string" ? v : fail(p, "a string"));
export const bool: Check<boolean> = (v, p) => (typeof v === "boolean" ? v : fail(p, "a boolean"));

export const oneOf =
  <T extends string>(options: readonly T[]): Check<T> =>
  (v, p) =>
    options.includes(v as T) ? (v as T) : fail(p, `one of ${options.join(", ")}`);

export const literal =
  <T extends string | number | boolean>(expected: T): Check<T> =>
  (v, p) =>
    v === expected ? expected : fail(p, JSON.stringify(expected));

export const array =
  <T>(item: Check<T>): Check<T[]> =>
  (v, p) =>
    Array.isArray(v) ? v.map((x, i) => item(x, `${p}/${i}`)) : fail(p, "an array");

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const record =
  <T>(value: Check<T>): Check<Record<string, T>> =>
  (v, p) => {
    if (!isObject(v)) return fail(p, "an object");
    const out: Record<string, T> = {};
    for (const [k, x] of Object.entries(v)) out[k] = value(x, `${p}/${k}`);
    return out;
  };

export const nullable =
  <T>(check: Check<T>): Check<T | null> =>
  (v, p) =>
    v === null ? null : check(v, p);

type Shape = Record<string, Check<unknown>>;
type Optional<T> = Check<T> & { readonly optional: true };
type Out<S extends Shape> = {
  -readonly [K in keyof S as S[K] extends Optional<unknown> ? never : K]: S[K] extends Check<infer T> ? T : never;
} & {
  -readonly [K in keyof S as S[K] extends Optional<unknown> ? K : never]?: S[K] extends Check<infer T> ? T : never;
};

export const optional = <T>(check: Check<T>): Optional<T> =>
  Object.assign((v: unknown, p: string) => check(v, p), { optional: true as const });

/** An object with exactly these properties (optional ones may be absent); unknown properties are rejected. */
export const object =
  <S extends Shape>(shape: S): Check<Out<S>> =>
  (v, p) => {
    if (!isObject(v)) return fail(p, "an object");
    for (const k of Object.keys(v)) if (!(k in shape)) fail(`${p}/${k}`, "no such property");
    const out: Record<string, unknown> = {};
    for (const [k, check] of Object.entries(shape)) {
      if (v[k] === undefined && (check as Partial<Optional<unknown>>).optional) continue;
      out[k] = check(v[k], `${p}/${k}`);
    }
    return out as Out<S>;
  };
