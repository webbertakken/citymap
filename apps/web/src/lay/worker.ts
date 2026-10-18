// The Web Worker every opening runs in: it lays a snapshot or reads a city file's text, and builds the scene and the
// pick grid there too, so the page answers while a city opens. The buffers are handed over without a copy; a laid
// city crosses as JSON text, which the main thread parses faster than it would receive the city by structured clone.
import type { Snapshot, Toggle } from "@citymap/ground-plan";
import { pickBuffers } from "@citymap/scene";
import type { ThemeName } from "@citymap/themes";
import type { Step } from "../load/step";
import type { LiveFacts } from "../measures/live";
import { buffersOf, failureOf, layMade, readMade, throttled, wireText, type Made, type OpenOptions } from "./lay";

/** The least time between two progress posts, in milliseconds. */
const POST_MS = 100;

/** What an opening asks of the worker: a snapshot to lay, or a city file's text to read. */
export type Request =
  | {
      readonly job: "lay";
      readonly snapshot: Snapshot;
      readonly theme?: ThemeName;
      readonly toggles?: readonly Toggle[];
      readonly facts?: LiveFacts;
    }
  | { readonly job: "read"; readonly text: string; readonly theme?: ThemeName };

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const post = throttled(
    (step: Step) => self.postMessage({ step }, { transfer: [] }),
    POST_MS,
    () => performance.now(),
  );
  const request = event.data;
  // Each step posts as it comes when its phase changes; within a phase, at most one per POST_MS.
  let phase = "";
  const onProgress = (step: Step) => {
    if (step.phase !== phase) {
      post.flush();
      phase = step.phase;
      self.postMessage({ step }, { transfer: [] });
    } else post(step);
  };
  const options: OpenOptions = { onProgress, ...(request.theme === undefined ? {} : { theme: request.theme }) };
  try {
    const made: Made =
      request.job === "lay"
        ? layMade(request.snapshot, {
            ...options,
            ...(request.toggles === undefined ? {} : { toggles: request.toggles }),
            ...(request.facts === undefined ? {} : { facts: request.facts }),
          })
        : readMade(request.text, options);
    post.flush();
    // A read's text is already on the main thread; a laid city crosses as its city file's text.
    const text = request.job === "lay" ? wireText(made.file) : null;
    self.postMessage(
      { text, scene: made.scene, grid: made.grid },
      { transfer: [...(made.scene ? buffersOf(made.scene.scene) : []), ...pickBuffers(made.grid)] },
    );
  } catch (error) {
    self.postMessage({ error: failureOf(error) }, { transfer: [] });
  }
});
