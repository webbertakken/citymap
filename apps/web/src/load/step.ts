// What a loading source reports as it goes: the phase it is in, and how far, where that can be counted.

/** Every phase a load passes through, across its sources. */
export type Phase =
  | "commit"
  | "tree"
  | "index"
  | "folder"
  | "manifests"
  | "contents"
  | "coverage"
  | "lay"
  | "download"
  | "parse"
  | "draw"
  | "engine"
  | "models"
  | "walls"
  | "streets";

/**
 * One report: the phase, `done` of `of` in the phase's unit where known, and the API requests so far. `count` is what the
 * words count when it differs from the bar's measure (lots placed, while the bar counts placing and shaping).
 */
export interface Step {
  readonly phase: Phase;
  readonly done?: number;
  readonly of?: number;
  readonly count?: { readonly done: number; readonly of: number };
  readonly requests?: number;
  /** The files a lay lays, for its words; kept from the step that brings it. */
  readonly files?: number;
}

/** Hears each step of a load. */
export type OnStep = (step: Step) => void;
