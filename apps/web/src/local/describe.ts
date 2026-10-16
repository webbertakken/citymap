// A failure to open a local repository in one sentence, naming the folder.
import { MAX_FILES } from "@citymap/ground-plan";
import { LocalError } from "./errors";

const count = (n: string | number | undefined) => Number(n ?? 0).toLocaleString("en-GB");

export function describeLocal(failure: unknown, name: string): string {
  if (!(failure instanceof LocalError))
    return `${name} could not be laid: ${failure instanceof Error ? failure.message : String(failure)}.`;
  const { detail } = failure;
  switch (failure.code) {
    case "local/denied":
      return `The browser did not allow reading ${name}.`;
    case "local/split-index":
      return `${name} has a split index, which is not read here: run "git update-index --no-split-index", then try again.`;
    case "local/sparse-index":
      return `${name} has a sparse index, which is not read here: run "git sparse-checkout reapply --no-sparse-index", then try again.`;
    case "local/index-version":
      return `${name}'s git index is version ${detail.version}; versions 2 to 4 are read.`;
    case "local/index-extension":
      return `${name}'s git index needs its "${detail.name}" extension, which is not read here.`;
    case "local/bad-index":
      return `${name}'s git index could not be read; it may be damaged.`;
    case "local/no-index":
      return `${name} has no git index yet: nothing is checked out or staged.`;
    case "local/outside":
      return `${name} keeps its git data outside the folder (a linked worktree or a submodule): pick the main checkout.`;
    case "local/bad-git-file":
      return `${name}'s .git file does not say where its git data is.`;
    case "local/no-working-tree":
      return `${name} is git's own data, not a working tree: pick the repository's folder.`;
    case "local/vanished":
      return `A file in ${name} changed or vanished while it was read: try again.`;
    case "local/too-large":
      return `${name} holds ${count(detail.files)} files, more than the ${count(MAX_FILES)} a city holds.`;
    case "local/long-path":
      return `${name} holds a path longer than 4,096 bytes.`;
    default:
      return `There are no files to lay in ${name}.`;
  }
}
