// Where a submodule of a GitHub repository lives: its `.gitmodules` url, as a GitHub repository when it is one.
import type { Repository } from "./repository";

/** Why a submodule is laid as its `.gitlink` file rather than read. */
export type GitHubSubmoduleUnread = "no-url" | "host" | "not-found" | "depth";

/** Nesting deeper than this is not followed, as the CLI does not. */
export const SUBMODULE_DEPTH = 8;

const OWNER = /^[A-Za-z0-9-]{1,39}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const ABSOLUTE = /^(?:(?:https?|git|ssh):\/\/(?:[^@/]+@)?(?:www\.)?github\.com\/|git@github\.com:)(.*)$/;

/** Two segments, an owner and a name (`.git` dropped), as a repository; else null. */
function repositoryAt(segments: readonly string[]): Repository | null {
  const [owner, raw, ...rest] = segments;
  if (owner === undefined || raw === undefined || rest.length > 0) return null;
  const name = raw.replace(/\.git$/, "");
  return OWNER.test(owner) && NAME.test(name) && name !== "." && name !== ".." ? { owner, name } : null;
}

/**
 * The GitHub repository a submodule's url names: absolute on github.com (https, http, git, ssh, or scp-like), or
 * relative to its parent's (`../name`, `../../owner/name`). Why not, when it names none.
 */
export function githubRepositoryOf(url: string, parent: Repository): Repository | "no-url" | "host" {
  const trimmed = url.trim();
  if (trimmed === "") return "no-url";
  const absolute = ABSOLUTE.exec(trimmed);
  if (absolute) return repositoryAt(absolute[1]!.replace(/\/+$/, "").split("/")) ?? "host";
  if (!trimmed.startsWith("./") && !trimmed.startsWith("../")) return "host";
  const segments = [parent.owner, parent.name];
  for (const part of trimmed.split("/")) {
    if (part === "..") {
      if (segments.pop() === undefined) return "host";
    } else if (part !== "." && part !== "") segments.push(part);
  }
  return repositoryAt(segments) ?? "host";
}
