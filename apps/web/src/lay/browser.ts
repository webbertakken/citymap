// Lays in a module Web Worker, one per city; the snapshot and city cross by structured clone (maps included).
import type { Step } from "../load/step";
import type { Lay, Laid } from "./lay";

type Message = { readonly step: Step } | Laid | { readonly error: string };

export const layInWorker: Lay = (snapshot, { signal, onProgress, theme, toggles, facts } = {}) =>
  new Promise<Laid>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    // Aborting ends the worker where it is; nothing it was laying arrives.
    const abort = () => {
      worker.terminate();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const end = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    worker.addEventListener("message", (event: MessageEvent<Message>) => {
      const data = event.data;
      if ("step" in data) onProgress?.(data.step);
      else {
        end();
        if ("city" in data) resolve(data);
        else reject(new Error(data.error));
      }
    });
    worker.addEventListener("error", (event) => {
      end();
      reject(new Error(event.message || "the layout worker failed"));
    });
    worker.postMessage({ snapshot, theme, toggles, facts }, { transfer: [] });
  });
