// Suggesting an owner's public repositories once a person has typed `owner/`: what they typed, and the ranking.
import { compareKeys } from "@citymap/ground-plan";

/** An owner and the start of a repository's name, as typed after `owner/`. */
export interface OwnerQuery {
  readonly owner: string;
  readonly prefix: string;
}

/** A public repository as the suggestions show it. */
export interface GitHubRepository {
  readonly name: string;
  readonly description: string | null;
  readonly stars: number;
  readonly language: string | null;
  readonly fork: boolean;
  readonly archived: boolean;
}

const URL_PREFIX = /^(https?:\/\/)?(www\.)?github\.com\//;
const QUERY = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{0,100})$/;
const OWNER_ONLY = /^([A-Za-z0-9-]{1,39})$/;

/** The owner and the name's start a text names: `owner/`, `owner/prefix`, or a GitHub URL up to them; else null. */
export function ownerQuery(text: string): OwnerQuery | null {
  const trimmed = text.trim();
  const rest = trimmed.replace(URL_PREFIX, "");
  const typed = QUERY.exec(rest);
  if (typed) return { owner: typed[1]!, prefix: typed[2]! };
  // A URL that stops at the owner names the owner alone.
  const owner = rest !== trimmed ? OWNER_ONLY.exec(rest) : null;
  return owner ? { owner: owner[1]!, prefix: "" } : null;
}

/** Names that start with the prefix, then names that contain it, case-insensitively; each by stars, then by name. */
export function rankRepositories(repos: readonly GitHubRepository[], prefix: string): GitHubRepository[] {
  const p = prefix.toLowerCase();
  const rankOf = (repo: GitHubRepository) => {
    const name = repo.name.toLowerCase();
    return name.startsWith(p) ? 0 : name.includes(p) ? 1 : -1;
  };
  return repos
    .map((repo) => ({ repo, rank: rankOf(repo) }))
    .filter((r) => r.rank >= 0)
    .toSorted((a, b) => a.rank - b.rank || b.repo.stars - a.repo.stars || compareKeys(a.repo.name, b.repo.name))
    .map((r) => r.repo);
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const textOrNull = (value: unknown) => (typeof value === "string" ? value : null);

/** GitHub's repositories (a list, as the owner's list or the search's items), leaving out any of another shape. */
export function repositoriesOf(value: unknown): GitHubRepository[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): GitHubRepository[] => {
    const name = field(entry, "name");
    const stars = field(entry, "stargazers_count");
    if (typeof name !== "string" || typeof stars !== "number") return [];
    return [
      {
        name,
        description: textOrNull(field(entry, "description")),
        stars,
        language: textOrNull(field(entry, "language")),
        fork: field(entry, "fork") === true,
        archived: field(entry, "archived") === true,
      },
    ];
  });
}
