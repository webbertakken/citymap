import { describe, expect, it } from "vitest";
import { ownerQuery, rankRepositories, repositoriesOf, type GitHubRepository } from "./suggest";

const repo = (name: string, stars = 0, extra: Partial<GitHubRepository> = {}): GitHubRepository => ({
  name,
  description: null,
  stars,
  language: null,
  fork: false,
  archived: false,
  ...extra,
});

describe("ownerQuery", () => {
  it("reads an owner, a slash and the start of a name, as typed or as a URL", () => {
    expect(ownerQuery("facebook/")).toEqual({ owner: "facebook", prefix: "" });
    expect(ownerQuery("  facebook/Rea ")).toEqual({ owner: "facebook", prefix: "Rea" });
    expect(ownerQuery("https://github.com/torvalds/li")).toEqual({ owner: "torvalds", prefix: "li" });
    expect(ownerQuery("github.com/vercel/next.js")).toEqual({ owner: "vercel", prefix: "next.js" });
    // A URL up to the owner names the owner, slash or not.
    expect(ownerQuery("https://www.github.com/facebook")).toEqual({ owner: "facebook", prefix: "" });
  });

  it("is null for anything else: no slash, a path past the name, or names GitHub never allows", () => {
    for (const text of ["facebook", "", "/react", "a/b/c", "face book/", "facebook/re act", `${"o".repeat(40)}/`])
      expect(ownerQuery(text)).toBeNull();
  });
});

describe("rankRepositories", () => {
  const repos = [repo("docs", 5), repo("react-native", 120), repo("react", 230), repo("create-react-app", 100)];

  it("puts names that start with the prefix first, then those that contain it, each by stars", () => {
    expect(rankRepositories(repos, "REA").map((r) => r.name)).toEqual(["react", "react-native", "create-react-app"]);
  });

  it("keeps them all by stars for no prefix, and breaks ties by name", () => {
    expect(rankRepositories([...repos, repo("alpha", 5)], "").map((r) => r.name)).toEqual([
      "react",
      "react-native",
      "create-react-app",
      "alpha",
      "docs",
    ]);
  });
});

describe("repositoriesOf", () => {
  it("reads GitHub's repositories, leaving out any entry of another shape", () => {
    const answer = [
      {
        name: "react",
        description: "The library for web and native user interfaces.",
        stargazers_count: 230_000,
        language: "JavaScript",
        fork: false,
        archived: false,
      },
      { name: "old", description: null, stargazers_count: 1, language: null, fork: true, archived: true },
      { name: 3 },
      null,
    ];
    expect(repositoriesOf(answer)).toEqual([
      repo("react", 230_000, {
        description: "The library for web and native user interfaces.",
        language: "JavaScript",
      }),
      repo("old", 1, { fork: true, archived: true }),
    ]);
    expect(repositoriesOf({ items: "no" })).toEqual([]);
  });
});
