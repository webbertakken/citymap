// The local reader's rejections: a stable code each, apart from the engine's codes, which the Rust CLI mirrors.

export type LocalCode =
  | "local/denied"
  | "local/split-index"
  | "local/sparse-index"
  | "local/index-version"
  | "local/index-extension"
  | "local/bad-index"
  | "local/no-index"
  | "local/outside"
  | "local/bad-git-file"
  | "local/no-working-tree"
  | "local/vanished"
  | "local/too-large"
  | "local/long-path"
  | "local/empty";

/** A named failure to read a local folder, with detail for the log and the sentence. */
export class LocalError extends Error {
  override readonly name = "LocalError";

  constructor(
    readonly code: LocalCode,
    message: string,
    readonly detail: Readonly<Record<string, string | number>> = {},
  ) {
    super(`${code}: ${message}`);
  }
}
