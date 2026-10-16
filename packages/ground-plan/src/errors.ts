/** Every rejection the engine makes, by its stable code. */
export type ErrorCode =
  | "fixed/bad-divisor"
  | "fixed/overflow"
  | "fixed/negative-sqrt"
  | "fixed/zero-direction"
  | "fixed/warp-folds"
  | "snapshot/bad-shape"
  | "snapshot/not-sorted"
  | "snapshot/duplicate-path"
  | "snapshot/bad-path"
  | "snapshot/too-large"
  | "snapshot/bad-index"
  | "plat/bad-json"
  | "plat/bad-version"
  | "plat/too-new"
  | "plat/bad-shape"
  | "city/bad-json"
  | "city/bad-shape"
  | "city/too-large"
  | "plat/setting-mismatch"
  | "history/not-a-repo"
  | "history/git-failed"
  | "history/parse"
  | "history/bad-schedule"
  | "cli/usage"
  | "lock/bad-json"
  | "lock/bad-shape"
  | "github/bad-name"
  | "github/not-found"
  | "github/rate-limited"
  | "github/failed"
  | "github/offline"
  | "engine/invariant";

/** The only error the engine throws: a stable code, a message, and structured detail for logs. */
export class CitymapError extends Error {
  override readonly name = "CitymapError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly detail: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${message}`);
  }
}
