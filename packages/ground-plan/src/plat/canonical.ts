import { CitymapError } from "../errors";
import { compareKeys } from "../fixed/hash";

const encode = (value: unknown, path: string): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new CitymapError("engine/invariant", `${path || "/"} holds ${value}, not a safe integer`, { path });
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map((v, i) => encode(v, `${path}/${i}`)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => compareKeys(a, b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${encode(v, `${path}/${k}`)}`).join(",")}}`;
  }
  throw new CitymapError("engine/invariant", `${path || "/"} holds a ${typeof value}`, { path });
};

/** JSON with keys sorted by code point at every level, integers only, and a trailing newline: one text per value. */
export const canonicalJson = (value: unknown): string => `${encode(value, "")}\n`;
