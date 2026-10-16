// What a loading source reports as it goes: the phase it is in, and how far, where that can be counted.

/** Every phase a load passes through, across its sources. */
export type Phase = "commit" | "tree" | "manifests" | "lay" | "download" | "parse" | "draw";

/** One report: the phase, `done` of `of` in the phase's unit where known, and the API requests so far. */
export interface Step {
  readonly phase: Phase;
  readonly done?: number;
  readonly of?: number;
  readonly requests?: number;
}

/** Hears each step of a load. */
export type OnStep = (step: Step) => void;
