// The Web Worker that lays a snapshot off the main thread, so the page answers while a large repository is laid.
import type { Snapshot } from "@citymap/ground-plan";
import type { Step } from "../load/step";
import { layHere, throttled } from "./lay";

/** The least time between two progress posts, in milliseconds. */
const POST_MS = 100;

self.addEventListener("message", (event: MessageEvent<Snapshot>) => {
  const post = throttled(
    (step: Step) => self.postMessage({ step }, { transfer: [] }),
    POST_MS,
    () => performance.now(),
  );
  layHere(event.data, { onProgress: post }).then(
    (city) => {
      post.flush();
      self.postMessage({ city }, { transfer: [] });
    },
    (error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : String(error) }, { transfer: [] }),
  );
});
