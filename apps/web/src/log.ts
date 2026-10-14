// The viewer's log: one line per decision point or failure, fingerprinted by its first token (`viewer/<event>`).
import { CitymapError } from "@citymap/ground-plan";

export type Fields = Readonly<Record<string, string | number>>;

/** `code key=value …`, a value with spaces or quotes quoted as JSON. */
export const logLine = (code: string, fields: Fields = {}): string =>
  [code, ...Object.entries(fields).map(([k, v]) => `${k}=${/[\s"]/.test(String(v)) ? JSON.stringify(v) : v}`)].join(
    " ",
  );

/** Why something failed, as a log value: the engine's code, else the error's text. */
export const reasonOf = (failure: unknown): string =>
  failure instanceof CitymapError ? failure.code : String(failure);

export const log = {
  info: (code: string, fields?: Fields) => console.info(logLine(code, fields)),
  error: (code: string, fields?: Fields) => console.error(logLine(code, fields)),
};
