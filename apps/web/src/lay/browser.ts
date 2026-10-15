// Lays in a module Web Worker, one per city; the snapshot and city cross by structured clone (maps included).
import type { City } from "@citymap/ground-plan";
import type { Lay } from "./lay";

export const layInWorker: Lay = (snapshot) =>
  new Promise<City>((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<{ city?: City; error?: string }>) => {
      worker.terminate();
      if (event.data.city) resolve(event.data.city);
      else reject(new Error(event.data.error ?? "the layout worker failed"));
    });
    worker.addEventListener("error", (event) => {
      worker.terminate();
      reject(new Error(event.message || "the layout worker failed"));
    });
    worker.postMessage(snapshot, { transfer: [] });
  });
