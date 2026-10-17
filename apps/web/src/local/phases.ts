// The phases of opening a local repository, and how the loading card takes them.
import type { Step } from "../load/step";

/** The phases of reading a picked folder; listing it through the folder input comes before, as `LISTING`. */
export type LocalPhase =
  | { readonly phase: "index" }
  | { readonly phase: "folder"; readonly files: number }
  | { readonly phase: "manifests" }
  | { readonly phase: "contents"; readonly done: number; readonly of: number }
  | { readonly phase: "coverage" }
  | { readonly phase: "laying"; readonly files: number }
  | { readonly phase: "drawing" };

/** The status while the browser lists a folder picked through the folder input, before anything is read. */
export const LISTING = "Listing the folder's files…";

/** A phase as the loading card's step. */
export function localStep(phase: LocalPhase): Step {
  switch (phase.phase) {
    case "folder":
      return { phase: "folder", done: phase.files };
    case "contents":
      return { phase: "contents", done: phase.done, of: phase.of };
    case "laying":
      return { phase: "lay", files: phase.files };
    case "drawing":
      return { phase: "draw" };
    default:
      return { phase: phase.phase };
  }
}
