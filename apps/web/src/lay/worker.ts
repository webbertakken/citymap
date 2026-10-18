// The city's worker: an opening lays a snapshot or reads a city file's text here, and makes its first look (a lot table
// and the whole city's scene) with its pick grid, so the page answers while a city opens. It then stays with the city
// while it is shown, making every town's scene ahead and whatever the viewer asks for, one task per macrotask, so a
// newer ask is heard between two. Buffers are handed over without a copy; the city crosses as JSON pieces, which the
// main thread parses one per task, faster than it would receive the city by structured clone and never in one long task.
import type { Snapshot, Toggle } from "@citymap/ground-plan";
import { pickBuffers, type ColourBy } from "@citymap/scene";
import type { ThemeName } from "@citymap/themes";
import type { Step } from "../load/step";
import type { LiveFacts } from "../measures/live";
import { roofBuffers } from "../view/roofs";
import { failureOf, layMade, readMade, throttled, type Made, type OpenOptions } from "./lay";
import { cityPieces } from "./pieces";
import { answerBuffers, asked, type Ask, type CityWork, type Tasks } from "./work";

/** The least time between two progress posts, in milliseconds. */
const POST_MS = 100;

/** The look an opening makes first. */
interface First {
  readonly theme: ThemeName;
  readonly colourBy: ColourBy;
  readonly town: string | null;
}

/** What the viewer asks of the worker: an opening (a snapshot to lay, or a city file's text to read), then asks. */
export type Request =
  | (First & {
      readonly job: "lay";
      readonly snapshot: Snapshot;
      readonly toggles?: readonly Toggle[];
      readonly facts?: LiveFacts;
    })
  | (First & { readonly job: "read"; readonly text: string })
  | Ask;

// What the worker keeps of its city once open, and what it has still to make.
let work: CityWork | null = null;
let tasks: Tasks = [];
let pumping = false;

/** Makes the next task and posts its answer, then schedules the one after. */
function pump() {
  pumping = false;
  const [task, ...rest] = tasks;
  if (!task) return;
  tasks = rest;
  try {
    const answer = task.make();
    self.postMessage({ answer }, { transfer: answerBuffers(answer) });
  } catch (error) {
    self.postMessage({ failed: { task: task.key, error: failureOf(error) } }, { transfer: [] });
  }
  schedule();
}

/** One task per macrotask, so an ask posted meanwhile is heard before the next. */
function schedule() {
  if (pumping || tasks.length === 0) return;
  pumping = true;
  setTimeout(pump, 0);
}

/** Opens the city: posts the steps as they come, then the city, its grid, floors, scales and first answers. */
function open(request: Exclude<Request, Ask>) {
  const post = throttled(
    (step: Step) => self.postMessage({ step }, { transfer: [] }),
    POST_MS,
    () => performance.now(),
  );
  // Each step posts as it comes when its phase changes; within a phase, at most one per POST_MS.
  let phase = "";
  const onProgress = (step: Step) => {
    if (step.phase !== phase) {
      post.flush();
      phase = step.phase;
      self.postMessage({ step }, { transfer: [] });
    } else post(step);
  };
  const options: OpenOptions = { onProgress, theme: request.theme, colourBy: request.colourBy, town: request.town };
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
    work = made.work;
    tasks = made.tasks;
    const { file, floors, roofs, buildings } = made.work;
    const opened = { pieces: cityPieces(file), grid: made.grid, floors, roofs, scales: buildings.scales };
    // The roofs are not made again, so their buffers go; the floors are copied, being small.
    self.postMessage(
      { opened: { ...opened, answers: made.answers } },
      { transfer: [...pickBuffers(made.grid), ...roofBuffers(roofs), ...made.answers.flatMap(answerBuffers)] },
    );
    schedule();
  } catch (error) {
    self.postMessage({ error: failureOf(error) }, { transfer: [] });
  }
}

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  if ("ask" in request) {
    if (!work) return;
    tasks = asked(tasks, work, request);
    schedule();
    return;
  }
  open(request);
});
