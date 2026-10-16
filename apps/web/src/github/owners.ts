// An owner's public repositories, asked of GitHub once per owner and kept a while, so typing a name after `owner/`
// costs one request of the hourly allowance; a name past the first page is looked up with the repository search.
import { CitymapError } from "@citymap/ground-plan";
import { API, getJson, type Fetcher } from "./api";
import { repositoriesOf, type GitHubRepository } from "./suggest";

/** How long an owner's answer is kept, in milliseconds. */
export const OWNER_TTL_MS = 10 * 60 * 1000;

/** The first page of an owner's repositories (most recently pushed first), and whether there are more. */
export interface OwnerRepositories {
  readonly repos: readonly GitHubRepository[];
  readonly more: boolean;
}

export interface Suggester {
  /** The owner's first page, asked once and kept `OWNER_TTL_MS`; the same request in flight is shared. */
  readonly ownerRepositories: (owner: string) => Promise<OwnerRepositories>;
  /** The owner's kept answer, or null when there is none to use. */
  readonly cached: (owner: string) => OwnerRepositories | null;
  /** The owner's repositories whose names hold the prefix, by GitHub's search; kept like the owner's answer. */
  readonly searchRepositories: (owner: string, prefix: string) => Promise<readonly GitHubRepository[]>;
  readonly cachedSearch: (owner: string, prefix: string) => readonly GitHubRepository[] | null;
}

interface Kept<T> {
  readonly at: number;
  readonly answer: Promise<T>;
  value: T | null;
}

const unknownOwner = (owner: string) => () =>
  new CitymapError("github/not-found", `No GitHub user or organisation named ${owner}`, { owner });

/** True for a failure that is an answer: no such owner. It is kept like one, so it is not asked again. */
const isAnswer = (failure: unknown) => failure instanceof CitymapError && failure.code === "github/not-found";

/** Answers by key: fresh while kept `OWNER_TTL_MS`, shared while asked; a failure is forgotten unless it is an answer. */
function memo<T>(now: () => number) {
  const kept = new Map<string, Kept<T>>();
  const fresh = (key: string) => {
    const known = kept.get(key);
    return known && now() - known.at < OWNER_TTL_MS ? known : null;
  };
  return {
    remember: (key: string, ask: () => Promise<T>): Promise<T> => {
      const known = fresh(key);
      if (known) return known.answer;
      const entry: Kept<T> = { at: now(), answer: ask(), value: null };
      kept.set(key, entry);
      entry.answer.then(
        (value) => (entry.value = value),
        (failure: unknown) => !isAnswer(failure) && kept.get(key) === entry && kept.delete(key),
      );
      return entry.answer;
    },
    recall: (key: string): T | null => fresh(key)?.value ?? null,
  };
}

const ownerKey = (owner: string) => owner.toLowerCase();
const searchKey = (owner: string, prefix: string) => `${owner.toLowerCase()}/${prefix.toLowerCase()}`;

export function createSuggester(fetcher: Fetcher, now: () => number): Suggester {
  const owners = memo<OwnerRepositories>(now);
  const searches = memo<readonly GitHubRepository[]>(now);
  return {
    ownerRepositories: (owner) =>
      owners.remember(ownerKey(owner), async () => {
        const url = `${API}/users/${owner}/repos?sort=pushed&per_page=100`;
        const { body, headers } = await getJson(fetcher, url, unknownOwner(owner));
        return { repos: repositoriesOf(body), more: /rel="next"/.test(headers.get("link") ?? "") };
      }),
    cached: (owner) => owners.recall(ownerKey(owner)),
    searchRepositories: (owner, prefix) =>
      searches.remember(searchKey(owner, prefix), async () => {
        const q = encodeURIComponent(`${prefix} in:name user:${owner}`);
        const url = `${API}/search/repositories?q=${q}&sort=stars&per_page=20`;
        const { body } = await getJson(fetcher, url, unknownOwner(owner));
        return repositoriesOf(Reflect.get(Object(body), "items"));
      }),
    cachedSearch: (owner, prefix) => searches.recall(searchKey(owner, prefix)),
  };
}

/** A suggestion's failure in one line. */
export function suggestionFailure(failure: unknown, owner: string): string {
  if (!(failure instanceof CitymapError)) return "GitHub's answer could not be read";
  switch (failure.code) {
    case "github/not-found":
      return `No GitHub user or organisation named ${owner}`;
    case "github/rate-limited": {
      const reset = new Date(Number(failure.detail.reset) * 1000).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `GitHub's hourly limit is reached; it resets at ${reset}`;
    }
    case "github/offline":
      return "GitHub could not be reached";
    default:
      return `GitHub answered ${String(failure.detail.status)}`;
  }
}
