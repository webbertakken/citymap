// The main thread's handle on the city's work: it asks for looks and tables, and hears what is made, in order. The
// browser's port talks to the city's worker (`browser.ts`); `herePort` makes everything on the calling thread (jsdom,
// tests, and a worker that failed). Both hold what is made until it is heard, and log every answer with its time.
import { log, reasonOf } from "../log";
import { asked, type Answer, type Ask, type CityWork, type Tasks } from "./work";

/** The city's work, as the viewer sees it while the city is shown. */
export interface CityPort {
  /** Asks for a look (a theme's scenes and a table) or a table alone. */
  readonly ask: (ask: Ask) => void;
  /** Hears every answer, those made before it first, in order. */
  readonly listen: (hear: (answer: Answer) => void) => void;
  /** Ends the work: nothing more is made or heard. Again, it does nothing. */
  readonly end: () => void;
}

/** What an answer answers, as an ask's time is kept by: a theme's scenes, or a table. */
const askKeys = (ask: Ask) =>
  ask.ask === "look"
    ? [`scene ${ask.theme}`, `table ${ask.theme} ${ask.colourBy}`]
    : [`table ${ask.theme} ${ask.colourBy}`];
const answerKey = (answer: Answer) =>
  answer.kind === "scene" ? `scene ${answer.theme}` : `table ${answer.theme} ${answer.colourBy}`;

/**
 * Answers held until heard, each logged with the time since the ask that made it (`viewer/city-scene`,
 * `viewer/city-table`); after `end`, nothing is held or heard.
 */
export function hearing(now: () => number = () => performance.now()) {
  const since = new Map<string, number>();
  const held: Answer[] = [];
  let hear: ((answer: Answer) => void) | null = null;
  let ended = false;
  const started = now();
  return {
    ended: () => ended,
    asked: (ask: Ask) => {
      for (const key of askKeys(ask)) since.set(key, now());
    },
    tell: (answer: Answer) => {
      if (ended) return;
      const ms = Math.round(now() - (since.get(answerKey(answer)) ?? started));
      if (answer.kind === "scene") log.info("viewer/city-scene", { theme: answer.theme, town: answer.town ?? "", ms });
      else log.info("viewer/city-table", { theme: answer.theme, by: answer.colourBy, ms });
      if (hear) hear(answer);
      else held.push(answer);
    },
    listen: (next: (answer: Answer) => void) => {
      if (ended) return;
      hear = next;
      for (const answer of held.splice(0)) next(answer);
    },
    end: () => {
      ended = true;
      hear = null;
      held.length = 0;
    },
  };
}

/** Makes every task in order, telling each answer; one that fails is logged and the rest are still made. */
export function drain(tasks: Tasks, tell: (answer: Answer) => void, stopped: () => boolean): void {
  for (const task of tasks) {
    if (stopped()) return;
    try {
      tell(task.make());
    } catch (failure) {
      log.error("viewer/city-task-failed", { task: task.key, reason: reasonOf(failure) });
    }
  }
}

/** The city's work on the calling thread: what is left of the opening is made at once, and every ask when asked. */
export function herePort(work: CityWork, left: Tasks = [], now?: () => number): CityPort {
  const heard = hearing(now);
  drain(left, heard.tell, heard.ended);
  return {
    ask: (ask) => {
      if (heard.ended()) return;
      heard.asked(ask);
      drain(asked([], work, ask), heard.tell, heard.ended);
    },
    listen: heard.listen,
    end: heard.end,
  };
}
