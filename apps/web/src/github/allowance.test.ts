import { describe, expect, it } from "vitest";
import { meter, spent, type Allowance } from "./allowance";

const answering = (headers: Record<string, string>) => async () => new Response("{}", { headers });

describe("meter", () => {
  it("hears the core allowance from GitHub's API answers only", async () => {
    const heard: Allowance[] = [];
    const core = meter(answering({ "x-ratelimit-remaining": "41", "x-ratelimit-reset": "1700000000" }), (a) =>
      heard.push(a),
    );
    await core("https://api.github.com/users/facebook/repos");
    await core("https://raw.githubusercontent.com/o/r/c/package.json");
    await meter(answering({ "x-ratelimit-remaining": "9", "x-ratelimit-resource": "search" }), (a) => heard.push(a))(
      "https://api.github.com/search/repositories?q=x",
    );
    await meter(answering({}), (a) => heard.push(a))("https://api.github.com/users/facebook/repos");
    await meter(answering({ "x-ratelimit-remaining": "3" }), (a) => heard.push(a))("https://api.github.com/x");
    expect(heard).toEqual([
      { remaining: 41, reset: 1_700_000_000 },
      { remaining: 3, reset: 0 },
    ]);
  });
});

describe("spent", () => {
  it("is true only while nothing is left and the reset is still to come", () => {
    expect(spent(null, 0)).toBe(false);
    expect(spent({ remaining: 1, reset: 10 }, 0)).toBe(false);
    expect(spent({ remaining: 0, reset: 10 }, 9_999)).toBe(true);
    expect(spent({ remaining: 0, reset: 10 }, 10_000)).toBe(false);
  });
});
