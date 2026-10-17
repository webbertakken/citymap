import { CitymapError, type ErrorCode } from "../errors";
import { compareKeys } from "../fixed/hash";

/** One file of a commit's tree. */
export interface FileEntry {
  readonly path: string;
  /** `${pathAtBirth}@${birthIndex}`, carried through exact renames. */
  readonly identity: string;
  /** Birth index of the identity. */
  readonly firstSeen: number;
}

/** One commit's tree, the engine's only input. */
export interface Snapshot {
  readonly repository: string;
  readonly commit: string;
  readonly index: number;
  readonly files: readonly FileEntry[];
  readonly folderFirstSeen: ReadonlyMap<string, number>;
  /** Member folders declared by the root workspace manifests, when the history reader read them; sorted. */
  readonly workspaces?: readonly string[];
  /** The submodules' folders (gitlinks), read or not, when the tree holds any; sorted. */
  readonly submodules?: readonly string[];
}

export const MAX_FILES = 2_000_000;
/** The longest path, in UTF-8 bytes; it also bounds a path's depth (2,048 folders). */
export const MAX_PATH_BYTES = 4096;
const COMMIT = /^([0-9a-f]{40}|[0-9a-f]{64}|worktree)$/;
const encoder = new TextEncoder();

const reject = (code: ErrorCode, message: string, detail: Record<string, unknown> = {}): never => {
  throw new CitymapError(code, message, detail);
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const validPath = (path: string) =>
  path.length > 0 &&
  !path.includes("\u0000") &&
  encoder.encode(path).length <= MAX_PATH_BYTES &&
  path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");

function parseFile(value: unknown, at: number): FileEntry {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.identity !== "string" ||
    !isIndex(value.firstSeen)
  )
    return reject("snapshot/bad-shape", `file ${at} needs a path, an identity and a firstSeen index`, { at });
  if (!validPath(value.path)) return reject("snapshot/bad-path", `file ${at} has a bad path`, { at });
  return { path: value.path, identity: value.identity, firstSeen: value.firstSeen };
}

/** Validates untrusted input as a snapshot, or rejects it with a named code. */
export function parseSnapshot(input: unknown): Snapshot {
  if (!isRecord(input)) return reject("snapshot/bad-shape", "a snapshot is an object");
  const { repository, commit, index, files, folderFirstSeen, workspaces, submodules } = input;
  if (typeof repository !== "string" || repository.length === 0)
    return reject("snapshot/bad-shape", "a snapshot names its repository");
  if (typeof commit !== "string" || !COMMIT.test(commit))
    return reject("snapshot/bad-shape", "a snapshot's commit is a hex id or worktree");
  if (!isIndex(index)) return reject("snapshot/bad-index", "a snapshot's index is a non-negative integer");
  if (!Array.isArray(files)) return reject("snapshot/bad-shape", "a snapshot's files are an array");
  if (files.length > MAX_FILES)
    return reject("snapshot/too-large", `a snapshot holds at most ${MAX_FILES} files`, { files: files.length });
  const folders = new Map<string, number>();
  if (!isRecord(folderFirstSeen))
    return reject("snapshot/bad-shape", "a snapshot's folderFirstSeen maps folders to indices");
  for (const [folder, born] of Object.entries(folderFirstSeen)) {
    if (!isIndex(born)) return reject("snapshot/bad-shape", "a snapshot's folderFirstSeen maps folders to indices");
    folders.set(folder, born);
  }
  const parsed = files.map(parseFile);
  for (let i = 1; i < parsed.length; i++) {
    const order = compareKeys(parsed[i - 1]!.path, parsed[i]!.path);
    if (order === 0) reject("snapshot/duplicate-path", `file ${i} repeats a path`, { at: i });
    if (order > 0) reject("snapshot/not-sorted", `file ${i} is out of order`, { at: i });
  }
  if (
    workspaces !== undefined &&
    !(Array.isArray(workspaces) && workspaces.every((w): w is string => typeof w === "string" && validPath(w)))
  )
    return reject("snapshot/bad-shape", "a snapshot's workspaces are folder paths");
  if (
    submodules !== undefined &&
    !(Array.isArray(submodules) && submodules.every((m): m is string => typeof m === "string" && validPath(m)))
  )
    return reject("snapshot/bad-shape", "a snapshot's submodules are folder paths");
  return {
    repository,
    commit,
    index,
    ...(workspaces === undefined ? {} : { workspaces: workspaces.toSorted(compareKeys) }),
    ...(submodules === undefined ? {} : { submodules: submodules.toSorted(compareKeys) }),
    files: parsed,
    folderFirstSeen: folders,
  };
}
