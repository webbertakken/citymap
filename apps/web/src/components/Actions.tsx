"use client";
import type { Hit } from "@citymap/scene";
import { Check, Copy, ExternalLink, Focus } from "lucide-react";
import { useEffect, useState } from "react";
import { offersFor, type Card } from "../card/describe";
import { githubUrl, type GitHubSource } from "../card/github";
import { log, reasonOf } from "../log";

/** How long "Copied" shows after the path is copied, in milliseconds. */
export const COPIED_MS = 1500;

/** Kept in the layout, so it holds its width, but neither seen nor named. */
const HIDDEN = { visibility: "hidden" } as const;

export interface ActionsProps {
  readonly hit: Hit;
  readonly card: Card;
  /** One town is shown alone. */
  readonly focused: boolean;
  /** The repository and commit the city was laid from, when it came from GitHub. */
  readonly github: GitHubSource | null;
  readonly onDrill: (key: string) => void;
  /** Says a failure to the person, in one sentence. */
  readonly onFailure: (message: string) => void;
}

/** What the selection offers: its town alone, its path copied, and its page on GitHub. */
export function Actions({ hit, card, focused, github, onDrill, onFailure }: ActionsProps) {
  const [copied, setCopied] = useState(false);
  const offers = offersFor(hit, card, { focused, github: github !== null });
  const target = card.target;
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      log.info("viewer/copy-path", { kind: card.kind });
      setCopied(true);
    } catch (failure) {
      log.error("viewer/copy-failed", { reason: reasonOf(failure) });
      onFailure("The path could not be copied.");
    }
  };
  if (!offers.town && !offers.copy && !offers.github) return null;
  return (
    <div className="actions">
      {offers.town && (
        <button
          type="button"
          className="action"
          aria-label={`Show only this town: ${hit.town!}`}
          onClick={() => onDrill(hit.townKey!)}
        >
          <Focus size={16} aria-hidden="true" />
          <span>Show only this town</span>
        </button>
      )}
      {offers.copy && target !== null && (
        <button type="button" className="action" onClick={() => void copy(target.path)}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {/* Both words hold the button's width, so it never moves when one shows. */}
          <span className="swap">
            <span data-shown={!copied} style={copied ? HIDDEN : undefined}>
              Copy path
            </span>
            <span data-shown={copied} style={copied ? undefined : HIDDEN}>
              Copied
            </span>
          </span>
        </button>
      )}
      {offers.github && github !== null && target !== null && (
        <a
          className="action"
          href={githubUrl(github, target)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => log.info("viewer/github-open", { kind: card.kind })}
        >
          <ExternalLink size={16} aria-hidden="true" />
          <span>
            Open on GitHub<span className="visually-hidden"> (opens in a new tab)</span>
          </span>
        </a>
      )}
      <output className="visually-hidden">{copied ? "Path copied" : ""}</output>
    </div>
  );
}
