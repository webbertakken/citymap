// The Web Worker that lays a snapshot off the main thread, and builds its scene there too, so the page answers while a
// large repository is laid; the scene's buffers are handed over without a copy.
import type { Snapshot, Toggle } from "@citymap/ground-plan";
import type { ThemeName } from "@citymap/themes";
import type { Step } from "../load/step";
import type { LiveFacts } from "../measures/live";
import { buffersOf, layHere, throttled } from "./lay";

/** The least time between two progress posts, in milliseconds. */
const POST_MS = 100;

type Request = { snapshot: Snapshot; theme?: ThemeName; toggles?: readonly Toggle[]; facts?: LiveFacts };

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const post = throttled(
    (step: Step) => self.postMessage({ step }, { transfer: [] }),
    POST_MS,
    () => performance.now(),
  );
  const { snapshot, theme, toggles, facts } = event.data;
  // Each step posts as it comes when its phase changes; within a phase, at most one per POST_MS.
  let phase = "";
  const onProgress = (step: Step) => {
    if (step.phase !== phase) {
      post.flush();
      phase = step.phase;
      self.postMessage({ step }, { transfer: [] });
    } else post(step);
  };
  layHere(snapshot, {
    onProgress,
    ...(theme === undefined ? {} : { theme }),
    ...(toggles === undefined ? {} : { toggles }),
    ...(facts === undefined ? {} : { facts }),
  }).then(
    ({ city, measures, scene }) => {
      post.flush();
      self.postMessage({ city, measures, scene }, { transfer: scene ? buffersOf(scene.scene) : [] });
    },
    (error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : String(error) }, { transfer: [] }),
  );
});
