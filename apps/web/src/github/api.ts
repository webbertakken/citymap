// GitHub's public API, without signing in: JSON answers, and every failure named.
import { CitymapError } from "@citymap/ground-plan";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export const API = "https://api.github.com";

export interface Answer {
  readonly body: unknown;
  readonly headers: Headers;
}

/**
 * GETs an API URL. A 404 is the caller's `notFound`; 403 or 429 with no requests left `github/rate-limited` (detail
 * `reset`, the epoch second it resets); any other failure status `github/failed`; a fetch that throws `github/offline`;
 * an abort rejects with the signal's reason.
 */
export async function getJson(
  fetcher: Fetcher,
  url: string,
  notFound: () => CitymapError,
  signal?: AbortSignal,
): Promise<Answer> {
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Accept: "application/vnd.github+json" }, signal: signal ?? null });
  } catch (error) {
    signal?.throwIfAborted();
    throw new CitymapError("github/offline", `GitHub could not be reached: ${String(error)}`, { url });
  }
  if (response.status === 404) throw notFound();
  if ((response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0);
    throw new CitymapError("github/rate-limited", "GitHub's hourly limit for this browser is reached", { reset });
  }
  if (!response.ok)
    throw new CitymapError("github/failed", `GitHub answered ${response.status}`, { status: response.status });
  return { body: await response.json(), headers: response.headers };
}
