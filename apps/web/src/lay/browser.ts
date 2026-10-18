// Opens in a module Web Worker, one per opening, which stays with its city while it is shown: the snapshot or text
// crosses by structured clone (maps included), the city comes back as JSON pieces the main thread parses one per task,
// and every scene, table and the pick grid with their buffers transferred. The port asks the worker for looks and tables; if the worker
// fails once the city is open, the calling thread takes its work over, so the map still changes.
import type { CityFile, Scales } from "@citymap/measures";
import type { PickGrid } from "@citymap/scene";
import type { Step } from "../load/step";
import { log, reasonOf } from "../log";
import type { Roofs } from "../view/roofs";
import {
  errorOf,
  laidOf,
  layHere,
  readHere,
  type Failure,
  type Laid,
  type Lay,
  type OpenOptions,
  type Read,
} from "./lay";
import { cityOfPieces } from "./pieces";
import { drain, hearing, type CityPort } from "./port";
import { asked, cityWork, type Answer, type Ask } from "./work";
import type { Request } from "./worker";

type Message =
  | { readonly step: Step }
  | {
      readonly opened: {
        readonly pieces: readonly string[];
        readonly grid: PickGrid;
        readonly floors: Uint8Array;
        readonly roofs: Roofs;
        readonly scales: Scales;
        readonly answers: readonly Answer[];
      };
    }
  | { readonly answer: Answer }
  | { readonly failed: { readonly task: string; readonly error: Failure } }
  | { readonly error: Failure };

/** Opens in a fresh worker. */
const inWorker = (request: Exclude<Request, Ask>, { signal, onProgress }: OpenOptions) =>
  new Promise<Laid>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const started = performance.now();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const heard = hearing();
    // What was asked last, so the calling thread can make it again if the worker fails; the opening's look at first.
    let lastLook: Ask = { ask: "look", theme: request.theme, colourBy: request.colourBy, first: request.town };
    let lastTable: Ask | null = null;
    // Once open: the city file, and the calling thread's work if the worker failed.
    let file: CityFile | null = null;
    let here: ReturnType<typeof cityWork> | null = null;
    const makeHere = (ask: Ask) => drain(asked([], here!, ask), heard.tell, heard.ended);
    const port: CityPort = {
      ask: (ask) => {
        if (heard.ended()) return;
        heard.asked(ask);
        if (ask.ask === "look") lastLook = ask;
        else lastTable = ask;
        if (here) makeHere(ask);
        else worker.postMessage(ask, { transfer: [] });
      },
      listen: heard.listen,
      end: () => {
        heard.end();
        worker.terminate();
      },
    };
    // Aborting before the city is open ends the worker where it is; nothing it was making arrives.
    const abort = () => {
      worker.terminate();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const fail = (error: Error) => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      reject(error);
    };
    worker.addEventListener("message", (event: MessageEvent<Message>) => {
      const message = event.data;
      if ("step" in message) onProgress?.(message.step);
      else if ("answer" in message) heard.tell(message.answer);
      else if ("failed" in message)
        log.error("viewer/city-task-failed", {
          task: message.failed.task,
          reason: reasonOf(errorOf(message.failed.error)),
        });
      else if ("error" in message) fail(errorOf(message.error));
      else {
        log.info("viewer/worker", { job: request.job, ms: Math.round(performance.now() - started) });
        const { opened } = message;
        // The city is taken in piece by piece, between inputs; the signal still ends the opening meanwhile.
        cityOfPieces(opened.pieces, signal ? { signal } : {}).then(
          (taken) => {
            signal?.removeEventListener("abort", abort);
            file = taken;
            resolve(laidOf(taken, opened, port));
          },
          (failure: unknown) => {
            port.end();
            fail(failure instanceof Error ? failure : new Error(String(failure)));
          },
        );
      }
    });
    worker.addEventListener("error", (event) => {
      const reason = event.message || "the city's worker failed";
      if (!file) {
        fail(new Error(reason));
        return;
      }
      // Once the city is open, the calling thread makes what was asked last, and everything asked from now on.
      log.error("viewer/city-worker-failed", { reason });
      worker.terminate();
      here = cityWork(file);
      makeHere(lastLook);
      if (lastTable) makeHere(lastTable);
    });
    worker.postMessage(request, { transfer: [] });
  });

/** Where module workers exist (every browser the viewer serves), they open; elsewhere (jsdom) the main thread does. */
const workers = typeof Worker === "function";

/** The look an opening makes first, as the worker is asked for it. */
const firstOf = ({ theme, colourBy = "folder", town = null }: OpenOptions) => ({ theme, colourBy, town });

export const layInWorker: Lay = workers
  ? (snapshot, { toggles, facts, ...options }) =>
      inWorker(
        {
          job: "lay",
          snapshot,
          ...firstOf(options),
          ...(toggles === undefined ? {} : { toggles }),
          ...(facts === undefined ? {} : { facts }),
        },
        options,
      )
  : layHere;

export const readInWorker: Read = workers
  ? (text, options) => inWorker({ job: "read", text, ...firstOf(options) }, options)
  : readHere;
