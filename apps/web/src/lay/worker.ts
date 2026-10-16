// The Web Worker that lays a snapshot off the main thread, so the page answers while a large repository is laid.
import type { Snapshot, Toggle } from "@citymap/ground-plan";
import { layHere } from "./lay";

self.addEventListener("message", (event: MessageEvent<{ snapshot: Snapshot; toggles: readonly Toggle[] }>) => {
  layHere(event.data.snapshot, event.data.toggles).then(
    (city) => self.postMessage({ city }, { transfer: [] }),
    (error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : String(error) }, { transfer: [] }),
  );
});
