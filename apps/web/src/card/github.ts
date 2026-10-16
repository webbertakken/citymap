// Where a file or folder of a city laid from GitHub lives on GitHub, at the commit the city was laid from.
import type { Target } from "./describe";

/** A GitHub repository and the commit a city was laid from. */
export interface GitHubSource {
  readonly owner: string;
  readonly name: string;
  readonly commit: string;
}

/** `https://github.com/{owner}/{name}/{blob|tree}/{commit}/{path}`, each segment encoded; the root for an empty path. */
export function githubUrl(source: GitHubSource, target: Target): string {
  const base = `https://github.com/${source.owner}/${source.name}/${target.type}/${source.commit}`;
  return target.path === "" ? base : `${base}/${target.path.split("/").map(encodeURIComponent).join("/")}`;
}
