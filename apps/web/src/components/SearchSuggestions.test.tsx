import type { City } from "@citymap/ground-plan";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Allowance } from "../github/allowance";
import type { Fetcher } from "../github/api";
import { createSuggester } from "../github/owners";
import { SUGGEST_MS } from "../github/useSuggestions";
import { searchIndex } from "../search/search";
import { SearchBox } from "./SearchBox";
import { city, searchField, square, type } from "./testing/fixtures";

const API = "https://api.github.com";
const ownerUrl = (owner: string) => `${API}/users/${owner}/repos?sort=pushed&per_page=100`;
const repo = (name: string, stars: number, extra: Record<string, unknown> = {}) => ({
  name,
  description: null,
  stargazers_count: stars,
  language: "JavaScript",
  fork: false,
  archived: false,
  ...extra,
});
const FACEBOOK = [
  repo("docs", 3),
  repo("react", 230_400, { description: "The library for web and native user interfaces." }),
  repo("react-native", 120_000, { language: "C++" }),
  repo("create-react-app", 103_000, { archived: true }),
  repo("old-react-fork", 2, { fork: true, language: null }),
  repo("jest", 44_000),
  repo("zstd", 24_000),
  repo("folly", 29_000),
];

/** A stub GitHub: facebook and a large owner answer, anything else is unknown; every URL asked is kept. */
function github(routes: Record<string, () => Response> = {}) {
  const asked: string[] = [];
  const fetcher: Fetcher = async (url) => {
    asked.push(url);
    const route =
      routes[url] ??
      (url === ownerUrl("facebook")
        ? () => new Response(JSON.stringify(FACEBOOK), { headers: { "x-ratelimit-remaining": "58" } })
        : () => new Response("{}", { status: 404 }));
    return route();
  };
  return { fetcher, asked };
}

// A city with five files under a folder named like the owner, so the city matches `acme/` too.
const acme: City = {
  ...city("demo"),
  towns: [
    {
      ...city("demo").towns[0]!,
      lots: Array.from({ length: 5 }, (_, i) => ({
        pts: square(64 * i, 64),
        key: `k${i}`,
        address: `a${i}`,
        vacant: false,
        path: `src/acme/f${i}.ts`,
        use: "source" as const,
        district: 1,
      })),
    },
  ],
};

function renderSearch(
  fetcher: Fetcher,
  allowance: Allowance | null = null,
  onRepository = vi.fn<(n: string) => void>(),
) {
  const suggester = createSuggester(fetcher, () => Date.now());
  render(
    <SearchBox
      index={searchIndex(acme)}
      onPick={() => {}}
      onRepository={onRepository}
      suggester={suggester}
      allowance={allowance}
    />,
  );
  return { onRepository };
}

/** The search URL for a name in the big owner's repositories. */
const query = (q: string) =>
  `${API}/search/repositories?q=${encodeURIComponent(`${q} in:name user:big`)}&sort=stars&per_page=20`;
const settle = () => act(() => vi.advanceTimersByTimeAsync(SUGGEST_MS));
const choices = () => within(screen.getByRole("list", { name: "Matches" })).getAllByRole("button");
const names = () => choices().map((b) => b.querySelector(".option-text > span")?.textContent);
const summary = () => document.querySelector(".summary")?.textContent;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SearchBox suggestions", () => {
  it("suggests an owner's repositories after the slash, asking GitHub once while the name is typed", async () => {
    const { fetcher, asked } = github();
    renderSearch(fetcher, { remaining: 58, reset: 0 });
    for (const text of ["f", "fa", "facebook", "facebook/"]) type(text);
    expect(summary()).toContain("Asking GitHub for facebook's repositories…");
    await settle();
    expect(asked).toEqual([ownerUrl("facebook")]);
    expect(screen.getByText("On GitHub").getAttribute("role")).toBe("presentation");
    // By stars when nothing follows the slash; seven at most.
    expect(names()).toEqual([
      "GitHub repository facebook/react",
      "GitHub repository facebook/react-native",
      "GitHub repository facebook/create-react-app",
      "GitHub repository facebook/jest",
      "GitHub repository facebook/folly",
      "GitHub repository facebook/zstd",
      "GitHub repository facebook/docs",
    ]);
    expect(summary()).toBe("8 of facebook's repositories match · 58 GitHub requests left this hour");
    for (const text of ["facebook/r", "facebook/re", "facebook/REA"]) type(text);
    await settle();
    expect(asked).toHaveLength(1);
    expect(names()).toEqual([
      "GitHub repository facebook/react",
      "GitHub repository facebook/react-native",
      "GitHub repository facebook/create-react-app",
      "GitHub repository facebook/old-react-fork",
      "Lay facebook/REA from GitHub",
    ]);
    const react = choices()[0]!;
    expect(react.querySelector("mark")?.textContent).toBe("rea");
    expect(react.textContent).toContain("The library for web and native user interfaces.");
    expect(react.textContent).toContain("★ 230.4k230.4k stars · JavaScript");
    expect(react.querySelector("small span[aria-hidden]")?.textContent).toBe("★ 230.4k");
    expect(choices()[2]!.textContent).toContain("archived");
    expect(choices()[3]!.textContent).toMatch(/2 stars · fork$/);
    expect(
      screen.getByRole("button", {
        name: /^GitHub repository facebook\/react The library .* 230.4k stars · JavaScript$/,
      }),
    ).toBe(react);
  });

  it("keeps three of the city's places beside them, and picks one by keyboard to lay it", async () => {
    const { fetcher } = github({
      [ownerUrl("acme")]: () => new Response(JSON.stringify([repo("widgets", 9), repo("gadgets", 4)])),
    });
    const { onRepository } = renderSearch(fetcher);
    type("acme/");
    await settle();
    expect(names()).toEqual([
      "File f0.ts",
      "File f1.ts",
      "File f2.ts",
      "GitHub repository acme/widgets",
      "GitHub repository acme/gadgets",
    ]);
    expect(summary()).toMatch(/^5 matches; the first 3 are shown, type more to narrow them\. 2 of acme's/);
    type("acme/widgets");
    await settle();
    // The typed name is a suggestion, so it is not offered twice.
    expect(names().filter((n) => n?.includes("widgets"))).toEqual(["GitHub repository acme/widgets"]);
    fireEvent.keyDown(searchField(), { key: "ArrowDown" });
    await act(() => vi.advanceTimersByTimeAsync(20));
    fireEvent.click(choices()[0]!);
    expect(onRepository).toHaveBeenCalledWith("acme/widgets");
    expect(vi.mocked(console.info).mock.calls.map(([l]) => String(l))).toContain(
      "viewer/suggest-pick repo=acme/widgets",
    );
  });

  it("uses the kept answer for the same owner, and searches for a name past the first page", async () => {
    const search = `${API}/search/repositories?q=${encodeURIComponent("zst in:name user:big")}&sort=stars&per_page=20`;
    const { fetcher, asked } = github({
      [ownerUrl("big")]: () =>
        new Response(JSON.stringify([repo("alpha", 1)]), { headers: { link: '<https://x>; rel="next"' } }),
      [search]: () => new Response(JSON.stringify({ items: [repo("zstd", 24_000), repo("alpha", 1)] })),
    });
    renderSearch(fetcher);
    type("big/");
    await settle();
    type("big/al");
    await settle();
    expect(asked).toEqual([ownerUrl("big")]);
    type("big/zst");
    expect(names()).toEqual(["Lay big/zst from GitHub"]);
    await settle();
    await settle();
    expect(asked).toEqual([ownerUrl("big"), search]);
    expect(names()).toEqual(["GitHub repository big/zstd", "Lay big/zst from GitHub"]);
    type("");
    type("big/");
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(asked).toHaveLength(2);
    expect(vi.mocked(console.info).mock.calls.map(([l]) => String(l))).toContain("viewer/suggest-cached owner=big");
  });

  it("says in one line when the owner is unknown, keeping the offer to lay the typed name", async () => {
    const { fetcher } = github();
    renderSearch(fetcher);
    type("nobody/x");
    await settle();
    expect(summary()).toBe("No GitHub user or organisation named nobody");
    expect(names()).toEqual(["Lay nobody/x from GitHub"]);
    expect(vi.mocked(console.error).mock.calls.map(([l]) => String(l))).toContain(
      "viewer/suggest-failed owner=nobody reason=github/not-found",
    );
  });

  it("says when the hourly limit is reached, and asks nothing while it is spent", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const limited = github({
      [ownerUrl("facebook")]: () =>
        new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": `${reset}` } }),
    });
    renderSearch(limited.fetcher);
    type("facebook/");
    await settle();
    expect(summary()).toMatch(/^GitHub's hourly limit is reached; it resets at \d\d:\d\d$/);
    cleanup();
    const quiet = github();
    renderSearch(quiet.fetcher, { remaining: 0, reset });
    type("facebook/");
    await settle();
    expect(quiet.asked).toEqual([]);
    expect(summary()).toMatch(/^GitHub's hourly limit is reached; it resets at \d\d:\d\d · 0 GitHub requests left/);
  });

  it("drops answers that come after the text moved on, and a search that fails", async () => {
    const late: Record<string, (r: Response) => void> = {};
    const { fetcher } = github({
      [ownerUrl("big")]: () =>
        new Response(JSON.stringify([repo("alpha", 1)]), { headers: { link: '<https://x>; rel="next"' } }),
      [query("q")]: () => new Response("{}", { status: 500 }),
    });
    const slow: Fetcher = (url, init) =>
      url === ownerUrl("slow") || url === ownerUrl("lost") || url === query("z")
        ? new Promise((done) => (late[url] = done))
        : fetcher(url, init);
    renderSearch(slow);
    type("slow/");
    await settle();
    type("lost/");
    await settle();
    type("big/z");
    await settle();
    await settle();
    type("big/q");
    late[ownerUrl("slow")]!(new Response(JSON.stringify([repo("late", 1)])));
    late[ownerUrl("lost")]!(new Response("{}", { status: 404 }));
    late[query("z")]!(new Response(JSON.stringify({ items: [repo("zed", 1)] })));
    await settle();
    await settle();
    expect(names()).toEqual(["Lay big/q from GitHub"]);
    expect(summary()).toBe("None of big's repositories match");
    expect(vi.mocked(console.error).mock.calls.map(([l]) => String(l))).toContain(
      "viewer/suggest-failed owner=big prefix=q reason=github/failed",
    );
    // An owner typed and gone before the text rests asks nothing.
    type("gone/");
    type("");
    await settle();
  });

  it("suggests nothing without a suggester", () => {
    render(<SearchBox index={searchIndex(acme)} onPick={() => {}} onRepository={() => {}} />);
    type("facebook/");
    expect(screen.queryByText("On GitHub")).toBeNull();
    expect(summary()).toBe("No folders or files match");
  });

  it("asks nothing for a path that starts with one of the city's folders", async () => {
    const { fetcher, asked } = github();
    renderSearch(fetcher);
    type("src/acme");
    await settle();
    expect(asked).toEqual([]);
    expect(screen.queryByText("On GitHub")).toBeNull();
  });
});
