// The suggestions for what is typed in the search: once it reads `owner/`, that owner's public repositories, asked of
// GitHub once per owner after the text rests, then ranked against what follows the slash as it is typed.
import { CitymapError } from "@citymap/ground-plan";
import { useEffect, useEffectEvent, useState } from "react";
import { log, reasonOf } from "../log";
import { spent, type Allowance } from "./allowance";
import { suggestionFailure, type OwnerRepositories, type Suggester } from "./owners";
import { ownerQuery, rankRepositories, type GitHubRepository } from "./suggest";

/** How long the text rests before GitHub is asked, in milliseconds. */
export const SUGGEST_MS = 250;

export type Suggestions =
  | { readonly state: "idle" }
  | { readonly state: "asking"; readonly owner: string }
  | {
      readonly state: "ready";
      readonly owner: string;
      readonly prefix: string;
      readonly repos: readonly GitHubRepository[];
    }
  | { readonly state: "failed"; readonly owner: string; readonly message: string };

type Answer =
  | { readonly owner: string; readonly list: OwnerRepositories }
  | { readonly owner: string; readonly message: string };

interface Found {
  readonly owner: string;
  readonly prefix: string;
  readonly repos: readonly GitHubRepository[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const holds = (repos: readonly GitHubRepository[], prefix: string) =>
  repos.some((r) => r.name.toLowerCase().includes(prefix.toLowerCase()));

export function useSuggestions(suggester: Suggester | null, allowance: Allowance | null, text: string): Suggestions {
  const query = suggester ? ownerQuery(text) : null;
  const owner = query?.owner ?? null;
  const prefix = query?.prefix ?? "";
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  // While the allowance is spent, nothing is asked: the line says when it resets.
  const limitLine = useEffectEvent((): string | null =>
    allowance !== null && spent(allowance, Date.now())
      ? suggestionFailure(new CitymapError("github/rate-limited", "spent", { reset: allowance.reset }), "")
      : null,
  );

  // The owner's first page: from the tab's cache at once, else asked once the text rests.
  useEffect(() => {
    if (owner === null || suggester === null) return () => {};
    let live = true;
    const kept = suggester.cached(owner);
    const ask = () => {
      if (kept) {
        log.info("viewer/suggest-cached", { owner });
        setAnswer({ owner, list: kept });
        return;
      }
      const limit = limitLine();
      if (limit !== null) {
        log.error("viewer/suggest-failed", { owner, reason: "github/rate-limited" });
        setAnswer({ owner, message: limit });
        return;
      }
      const started = performance.now();
      suggester.ownerRepositories(owner).then(
        (list) => {
          log.info("viewer/suggest", {
            owner,
            repos: list.repos.length,
            more: String(list.more),
            ms: Math.round(performance.now() - started),
          });
          if (live) setAnswer({ owner, list });
        },
        (failure: unknown) => {
          log.error("viewer/suggest-failed", { owner, reason: reasonOf(failure) });
          if (live) setAnswer({ owner, message: suggestionFailure(failure, owner) });
        },
      );
    };
    const timer = setTimeout(ask, kept ? 0 : SUGGEST_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [owner, suggester]);

  const current = answer !== null && owner !== null && same(answer.owner, owner) ? answer : null;
  const list = current && "list" in current ? current.list : null;
  // A name past the first page of an owner with more is looked up with the search instead.
  const searching = list !== null && list.more && prefix !== "" && !holds(list.repos, prefix);
  useEffect(() => {
    if (!searching || owner === null || suggester === null) return () => {};
    let live = true;
    const timer = setTimeout(() => {
      suggester.searchRepositories(owner, prefix).then(
        (repos) => {
          log.info("viewer/suggest-search", { owner, prefix, repos: repos.length });
          if (live) setFound({ owner, prefix, repos });
        },
        (failure: unknown) => log.error("viewer/suggest-failed", { owner, prefix, reason: reasonOf(failure) }),
      );
    }, SUGGEST_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [searching, owner, prefix, suggester]);

  if (owner === null) return { state: "idle" };
  if (current === null) return { state: "asking", owner };
  if ("message" in current) return { state: "failed", owner, message: current.message };
  const extra = found && same(found.owner, owner) && same(found.prefix, prefix) ? found.repos : [];
  const known = new Set(current.list.repos.map((r) => r.name));
  const repos = rankRepositories([...current.list.repos, ...extra.filter((r) => !known.has(r.name))], prefix);
  return { state: "ready", owner: current.owner, prefix, repos };
}
