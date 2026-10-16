import { CitymapError } from "@citymap/ground-plan";
import { describe, expect, it } from "vitest";
import type { Fetcher } from "./api";
import { OWNER_TTL_MS, createSuggester, suggestionFailure } from "./owners";

const API = "https://api.github.com";
const OWNER = `${API}/users/facebook/repos?sort=pushed&per_page=100`;
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers });
const entry = (name: string, stars = 1) => ({
  name,
  description: null,
  stargazers_count: stars,
  language: null,
  fork: false,
  archived: false,
});

/** A stub GitHub: answers by URL, counting what is asked. */
function github(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const fetcher: Fetcher = async (url) => {
    asked.push(url);
    return (routes[url] ?? (() => json({ message: "Not Found" }, 404)))();
  };
  return { fetcher, asked };
}

describe("createSuggester", () => {
  it("asks once per owner, whatever the case, and keeps the answer ten minutes", async () => {
    const { fetcher, asked } = github({ [OWNER]: () => json([entry("react", 230)]) });
    let now = 0;
    const suggester = createSuggester(fetcher, () => now);
    expect(suggester.cached("facebook")).toBeNull();
    const [a, b] = await Promise.all([
      suggester.ownerRepositories("facebook"),
      suggester.ownerRepositories("Facebook"),
    ]);
    expect(a).toEqual({ repos: [expect.objectContaining({ name: "react", stars: 230 })], more: false });
    expect(b).toBe(a);
    expect(suggester.cached("FACEBOOK")).toBe(a);
    now = OWNER_TTL_MS - 1;
    await suggester.ownerRepositories("facebook");
    expect(asked).toHaveLength(1);
    now = OWNER_TTL_MS;
    expect(suggester.cached("facebook")).toBeNull();
    await suggester.ownerRepositories("facebook");
    expect(asked).toEqual([OWNER, OWNER]);
  });

  it("knows when an owner has more than one answer holds", async () => {
    const { fetcher } = github({
      [OWNER]: () => json([entry("react")], 200, { link: `<${API}/user/69631/repos?page=2>; rel="next"` }),
    });
    expect((await createSuggester(fetcher, () => 0).ownerRepositories("facebook")).more).toBe(true);
  });

  it("searches an owner's repositories by name, kept per owner and prefix", async () => {
    const search = `${API}/search/repositories?q=${encodeURIComponent("zst in:name user:facebook")}&sort=stars&per_page=20`;
    const { fetcher, asked } = github({ [search]: () => json({ items: [entry("zstd", 20)] }) });
    const suggester = createSuggester(fetcher, () => 0);
    expect((await suggester.searchRepositories("facebook", "zst")).map((r) => r.name)).toEqual(["zstd"]);
    await suggester.searchRepositories("Facebook", "zst");
    expect(asked).toEqual([search]);
    expect(suggester.cachedSearch("facebook", "zst")?.map((r) => r.name)).toEqual(["zstd"]);
    expect(suggester.cachedSearch("facebook", "zs")).toBeNull();
  });

  it("names an unknown owner, and asks again after a failure", async () => {
    const { fetcher, asked } = github({});
    const suggester = createSuggester(fetcher, () => 0);
    await expect(suggester.ownerRepositories("nobody")).rejects.toMatchObject({
      code: "github/not-found",
      detail: { owner: "nobody" },
    });
    await expect(suggester.ownerRepositories("nobody")).rejects.toThrow("github/not-found");
    expect(asked).toHaveLength(2);
    expect(suggester.cached("nobody")).toBeNull();
    await expect(suggester.searchRepositories("nobody", "x")).rejects.toThrow("github/not-found");
  });
});

describe("suggestionFailure", () => {
  it("says each failure in one line", () => {
    expect(suggestionFailure(new CitymapError("github/not-found", "x"), "x")).toBe(
      "No GitHub user or organisation named x",
    );
    const reset = Date.UTC(2026, 0, 1, 14, 5) / 1000;
    expect(suggestionFailure(new CitymapError("github/rate-limited", "x", { reset }), "x")).toMatch(
      /^GitHub's hourly limit is reached; it resets at \d\d:\d\d$/,
    );
    expect(suggestionFailure(new CitymapError("github/offline", "x"), "x")).toBe("GitHub could not be reached");
    expect(suggestionFailure(new CitymapError("github/failed", "x", { status: 502 }), "x")).toBe("GitHub answered 502");
    expect(suggestionFailure(new Error("odd"), "x")).toBe("GitHub's answer could not be read");
  });
});
