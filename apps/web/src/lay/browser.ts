// Opens in a module Web Worker, one per opening: the snapshot or text crosses by structured clone (maps included),
// the scene and the pick grid come back transferred, and a laid city as text the main thread parses once.
import type { PickGrid } from "@citymap/scene";
import type { Step } from "../load/step";
import { log } from "../log";
import {
  errorOf,
  laidOf,
  layHere,
  readHere,
  trustedCityFile,
  type Drawn,
  type Failure,
  type Laid,
  type Lay,
  type OpenOptions,
  type Read,
} from "./lay";
import type { Request } from "./worker";

type Answer =
  | { readonly step: Step }
  | { readonly text: string | null; readonly scene: Drawn | null; readonly grid: PickGrid }
  | { readonly error: Failure };

/** Asks a fresh worker for one opening; `text` is the city file's text when the main thread already holds it. */
const inWorker = (request: Request, { signal, onProgress }: OpenOptions, text: string | null) =>
  new Promise<Laid>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const asked = performance.now();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    // Aborting ends the worker where it is; nothing it was making arrives.
    const abort = () => {
      worker.terminate();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const end = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    worker.addEventListener("message", (event: MessageEvent<Answer>) => {
      const answer = event.data;
      if ("step" in answer) {
        onProgress?.(answer.step);
        return;
      }
      end();
      log.info("viewer/worker", { job: request.job, ms: Math.round(performance.now() - asked) });
      if ("error" in answer) {
        reject(errorOf(answer.error));
        return;
      }
      const city = answer.text ?? text;
      if (city === null) {
        reject(new Error("the layout worker answered without a city"));
        return;
      }
      resolve(laidOf({ file: trustedCityFile(city), scene: answer.scene, grid: answer.grid }));
    });
    worker.addEventListener("error", (event) => {
      end();
      reject(new Error(event.message || "the layout worker failed"));
    });
    worker.postMessage(request, { transfer: [] });
  });

/** Where module workers exist (every browser the viewer serves), they lay; elsewhere (jsdom) the main thread does. */
const workers = typeof Worker === "function";

export const layInWorker: Lay = workers
  ? (snapshot, { toggles, facts, ...options } = {}) =>
      inWorker(
        {
          job: "lay",
          snapshot,
          ...(options.theme === undefined ? {} : { theme: options.theme }),
          ...(toggles === undefined ? {} : { toggles }),
          ...(facts === undefined ? {} : { facts }),
        },
        options,
        null,
      )
  : layHere;

export const readInWorker: Read = workers
  ? (text, options = {}) =>
      inWorker({ job: "read", text, ...(options.theme === undefined ? {} : { theme: options.theme }) }, options, text)
  : readHere;
