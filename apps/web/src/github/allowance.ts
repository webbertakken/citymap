// GitHub's hourly allowance for this browser, shared by laying and the suggestions: read from every API answer.
import { API, type Fetcher } from "./api";

/** The requests left this hour, and the epoch second the allowance resets. */
export interface Allowance {
  readonly remaining: number;
  readonly reset: number;
}

/**
 * The fetcher, telling `onAllowance` what each API answer says is left. Only the core allowance counts (answers of
 * another resource, such as search, say nothing of it); raw files and bundled cities pass through untouched.
 */
export const meter =
  (fetcher: Fetcher, onAllowance: (allowance: Allowance) => void): Fetcher =>
  async (url, init) => {
    const response = await fetcher(url, init);
    const remaining = response.headers.get("x-ratelimit-remaining");
    const resource = response.headers.get("x-ratelimit-resource") ?? "core";
    if (url.startsWith(`${API}/`) && remaining !== null && resource === "core")
      onAllowance({ remaining: Number(remaining), reset: Number(response.headers.get("x-ratelimit-reset") ?? 0) });
    return response;
  };

/** True while the allowance is spent and has not yet reset. */
export const spent = (allowance: Allowance | null, now: number) =>
  allowance !== null && allowance.remaining === 0 && allowance.reset * 1000 > now;
