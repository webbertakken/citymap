"use client";
import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  countWords,
  determinate,
  estimateWords,
  phaseWords,
  spentWords,
  titleWords,
  type Progress,
} from "../load/progress";
import { TICK_MS } from "../load/useLoading";

export interface LoadingCardProps {
  readonly progress: Progress;
  /** False once the load is done and the card only holds: Cancel then has nothing to stop. */
  readonly cancellable: boolean;
  readonly onCancel: () => void;
}

/**
 * Over the free map while something opens: what it is, the phase it is in, one bar across every phase, what has been
 * counted, the time spent and the time left, and Cancel. It floats, so it moves nothing; the status line announces
 * the phase, so the card itself announces nothing.
 */
export function LoadingCard({ progress, cancellable, onCancel }: LoadingCardProps) {
  const phase = useId();
  // The card keeps its own clock, so its ticks re-render the card alone, never the viewer and the map beneath it.
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(performance.now()), TICK_MS);
    return () => clearInterval(tick);
  }, []);
  const words = phaseWords(progress);
  const count = countWords(progress);
  const left = estimateWords(progress, now);
  const percent = Math.round(progress.fraction * 100);
  const sweeping = !determinate(progress) && progress.fraction < 1;
  return (
    <div className="loading-place">
      <section className="glass loading" aria-label="Loading">
        <h2>
          <LoaderCircle size={20} aria-hidden="true" />
          <span>{titleWords(progress)}</span>
        </h2>
        <p id={phase} className="phase">
          {words}
        </p>
        <div className="bar" data-sweep={sweeping}>
          <progress
            value={percent}
            max={100}
            aria-labelledby={phase}
            aria-valuetext={count ? `${words}: ${count}` : `${words}: ${percent} %`}
          />
          {sweeping && <span className="sweep" aria-hidden="true" />}
        </div>
        <p className="count">{count ?? "\u00a0"}</p>
        <div className="foot">
          <p className="time">
            {spentWords(now - progress.started)} spent{left && ` · ${left}`}
          </p>
          {/* Kept in place while hidden, so nothing in the card moves when the load finishes. */}
          <button type="button" className="cancel" onClick={onCancel} disabled={!cancellable} data-held={!cancellable}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
