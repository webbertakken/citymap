"use client";
import { LoaderCircle } from "lucide-react";
import { useId } from "react";
import { countWords, determinate, estimateWords, phaseWords, spentWords, type Progress } from "../load/progress";

export interface LoadingCardProps {
  readonly progress: Progress;
  /** The card's clock, `performance.now()` at its last tick. */
  readonly now: number;
  readonly onCancel: () => void;
}

/**
 * Over the free map while something opens: what it is, the phase it is in, one bar across every phase, what has been
 * counted, the time spent and the time left, and Cancel. It floats, so it moves nothing; the status line announces
 * the phase, so the card itself announces nothing.
 */
export function LoadingCard({ progress, now, onCancel }: LoadingCardProps) {
  const phase = useId();
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
          <span>Opening {progress.name}</span>
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
          <button type="button" className="cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
