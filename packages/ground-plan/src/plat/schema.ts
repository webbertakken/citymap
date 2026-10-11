import * as v from "valibot";
import { CitymapError, type ErrorCode } from "../errors";

/** A safe integer, and a non-negative one. */
export const int = v.pipe(v.number(), v.safeInteger());
export const nat = v.pipe(v.number(), v.safeInteger(), v.minValue(0));

/** The JSON pointer of an issue's path. */
const pointerOf = (issue: v.BaseIssue<unknown>) =>
  `/${(issue.path ?? []).map((item) => String(item.key)).join("/")}`;

/** Parses untrusted input against a schema, or rejects it with the given code and the pointer of the first fault. */
export function validate<S extends v.GenericSchema>(schema: S, input: unknown, code: ErrorCode): v.InferOutput<S> {
  const result = v.safeParse(schema, input);
  if (result.success) return result.output;
  const [issue] = result.issues;
  const pointer = pointerOf(issue);
  throw new CitymapError(code, `${pointer}: ${issue.message}`, { pointer, expected: issue.expected ?? "" });
}

/** Parses JSON text, or rejects it with the given code. */
export function parseJson(text: string, code: ErrorCode): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CitymapError(code, "the text is not JSON", { reason: String(error) });
  }
}
