// One load at a time, as the loading card sees it: its progress, whether the card shows, and how to end it.
import { useCallback, useEffect, useRef, useState } from "react";
import { log } from "../log";
import { advance, finish, phaseWords, startProgress, type Progress, type Source } from "./progress";
import type { Step } from "./step";

/** A load shows its card only once it has taken this long, in milliseconds. */
export const SHOW_AFTER_MS = 300;
/** Once shown, the card stays at least this long, so it never flickers. */
export const HOLD_MS = 400;
/** The card's clock ticks this often, for the time spent and the time left (the card keeps it). */
export const TICK_MS = 250;

/** A load in flight: its signal, and how it reports, ends or fails. */
export interface Job {
  readonly signal: AbortSignal;
  readonly step: (step: Step) => void;
  /** The load is done: the bar fills, and the card goes once it has shown for `HOLD_MS`. */
  readonly done: () => void;
  /** The load failed: the card goes at once. */
  readonly failed: () => void;
}

export interface Loading {
  /** The load in flight, or null. */
  readonly progress: Progress | null;
  /** True while the card shows. */
  readonly shown: boolean;
  /** True while the load the card shows is still running; a finished load holds its card but cannot be cancelled. */
  readonly cancellable: boolean;
  /** Begins a load, aborting any load in flight. */
  readonly begin: (source: Source, name: string) => Job;
  /** Stops the load in flight: its requests abort, and nothing it was opening arrives. */
  readonly cancel: () => void;
}

interface Current {
  readonly controller: AbortController;
  progress: Progress;
  shownAt: number | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  finished: boolean;
}

const fields = (progress: Progress, now: number) => ({
  source: progress.source,
  name: progress.name,
  phase: progress.phase,
  ms: Math.round(now - progress.started),
});

export function useLoading(): Loading {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [shown, setShown] = useState(false);
  const [running, setRunning] = useState(false);
  const current = useRef<Current | null>(null);

  // Ends the load the card shows, if it is still the current one.
  const clear = useCallback((load: Current) => {
    if (current.current !== load) return;
    clearTimeout(load.timer);
    current.current = null;
    setProgress(null);
    setShown(false);
    setRunning(false);
  }, []);

  // Ends the load in flight: by the person, or replaced by the next one.
  const end = useCallback(
    (why: "cancel" | "replaced") => {
      const load = current.current;
      // A finished load is only holding its card: there is nothing left to cancel.
      if (!load || load.finished) return;
      log.info("viewer/load-cancelled", { ...fields(load.progress, performance.now()), why });
      load.controller.abort();
      clear(load);
    },
    [clear],
  );
  const cancel = useCallback(() => end("cancel"), [end]);

  const begin = useCallback(
    (source: Source, name: string): Job => {
      end("replaced");
      const started = performance.now();
      const load: Current = {
        controller: new AbortController(),
        progress: startProgress(source, name, started),
        shownAt: null,
        timer: undefined,
        finished: false,
      };
      current.current = load;
      setProgress(load.progress);
      setRunning(true);
      log.info("viewer/load-phase", fields(load.progress, started));
      load.timer = setTimeout(() => {
        load.shownAt = performance.now();
        setShown(true);
      }, SHOW_AFTER_MS);
      return {
        signal: load.controller.signal,
        step: (step) => {
          if (current.current !== load) return;
          const next = advance(load.progress, step);
          if (next.phase !== load.progress.phase) log.info("viewer/load-phase", fields(next, performance.now()));
          load.progress = next;
          setProgress(next);
        },
        done: () => {
          if (current.current !== load) return;
          const ended = performance.now();
          log.info("viewer/load-done", { source, name, ms: Math.round(ended - started) });
          load.progress = finish(load.progress);
          load.finished = true;
          setRunning(false);
          setProgress(load.progress);
          clearTimeout(load.timer);
          const left = load.shownAt === null ? 0 : load.shownAt + HOLD_MS - ended;
          if (left <= 0) clear(load);
          else load.timer = setTimeout(() => clear(load), left);
        },
        failed: () => clear(load),
      };
    },
    [clear, end],
  );

  // Leaving the page ends whatever was loading.
  useEffect(
    () => () => {
      current.current?.controller.abort();
      clearTimeout(current.current?.timer);
      current.current = null;
    },
    [],
  );

  return { progress, shown, cancellable: shown && running, begin, cancel };
}

/** The status line's words for a load: "{name}: {phase}". */
export const loadingStatus = (progress: Progress) => {
  const words = phaseWords(progress);
  return `${progress.name}: ${words.charAt(0).toLowerCase()}${words.slice(1)}…`;
};
