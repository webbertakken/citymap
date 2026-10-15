// The Web Worker that lays a snapshot off the main thread, so the page answers while a large repository is laid.
import type { Snapshot } from "@citymap/ground-plan";
import { layHere } from "./lay";

self.addEventListener("message", (event: MessageEvent<Snapshot>) => {
  layHere(event.data).then(
    (city) => self.postMessage({ city }, { transfer: [] }),
    (error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : String(error) }, { transfer: [] }),
  );
});
