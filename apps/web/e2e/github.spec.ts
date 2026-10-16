import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

// GitHub answered from fixtures: a repository too large for one answer, read folder by folder while the loading card
// shows, and owners whose repositories are suggested after the slash.

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const API = "https://api.github.com";
const HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "Link, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Resource",
  "x-ratelimit-remaining": "41",
  "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1800),
  "x-ratelimit-resource": "core",
};
/** Folders in the large repository, and files in each. */
const FOLDERS = 40;
const FILES = 60;
/** How long each folder's answer takes, so the read is long enough to watch. */
const FOLDER_MS = 120;

const fulfil = (route: Route, json: unknown, status = 200, headers: Record<string, string> = {}) =>
  route.fulfill({ status, json, headers: { ...HEADERS, ...headers } });

/**
 * A repository of FOLDERS folders of FILES files whose whole tree is too large for one answer. `hold` keeps every
 * folder's answer back, so the card stays up; the count of API requests is kept.
 */
async function largeRepository(page: Page, name: string, hold = false) {
  const asked: string[] = [];
  const folders = Array.from({ length: FOLDERS }, (_, i) => `part${String(i).padStart(2, "0")}`);
  await page.route(`${API}/repos/acme/${name}/**`, async (route) => {
    const url = route.request().url();
    asked.push(url);
    if (url.endsWith("/commits/HEAD")) return fulfil(route, { sha: "c1", commit: { tree: { sha: "root" } } });
    if (url.endsWith("/git/trees/root?recursive=1")) return fulfil(route, { truncated: true, tree: [] });
    if (url.endsWith("/git/trees/root"))
      return fulfil(route, { tree: folders.map((f) => ({ path: f, type: "tree", sha: f })) });
    if (hold) return undefined;
    const folder = /trees\/(part\d+)\?recursive=1$/.exec(url)?.[1] ?? "";
    await new Promise((done) => setTimeout(done, FOLDER_MS));
    return fulfil(route, {
      truncated: false,
      tree: Array.from({ length: FILES }, (_, i) => ({ path: `f${i}.ts`, type: "blob", sha: `${folder}${i}` })),
    });
  });
  await page.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 404, headers: HEADERS }));
  return asked;
}

const card = (page: Page) => page.getByRole("region", { name: "Loading" });

test.beforeEach(async ({ page }) => {
  // Nothing reaches the real GitHub: whatever no fixture answers is unknown.
  await page.route(`${API}/**`, (route) => fulfil(route, { message: "Not Found" }, 404));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
});

test("shows a large repository's progress over the dimmed map, and Cancel keeps the last city", async ({
  page,
}, info) => {
  await largeRepository(page, "large", true);
  await page.getByRole("searchbox").fill("acme/large");
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("heading")).toHaveText("Opening acme/large");
  await expect(card(page).getByRole("progressbar", { name: "Reading the file tree" })).toBeVisible();
  await expect(card(page)).toContainText(`1 of ${FOLDERS + 1} folders · 3 requests`);
  await expect(page.locator(".status")).toHaveText("acme/large: reading the file tree…");
  await expect(page.locator("main")).toHaveAttribute("data-loading", "true");
  // Dimmed once its 150 ms transition ends.
  await expect.poll(() => page.locator(".map").evaluate((m) => getComputedStyle(m).opacity)).toBe("0.45");
  // The card sits in the free map, clear of every other card.
  const box = (await card(page).boundingBox())!;
  const others = await Promise.all([".card-title", ".search", ".controls"].map((s) => page.locator(s).boundingBox()));
  for (const other of others.map((o) => o!))
    expect(box.y >= other.y + other.height || box.x >= other.x + other.width || other.x >= box.x + box.width).toBe(
      true,
    );
  await page.screenshot({ path: info.outputPath("loading.png") });
  await card(page).getByRole("button", { name: "Cancel" }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await expect(page.locator(".status")).toContainText("lots");
  await expect(page.locator(".notice")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("reads a large repository folder by folder to the end, counting as it goes", async ({ page }) => {
  const asked = await largeRepository(page, "whole");
  await page.getByRole("searchbox").fill("acme/whole");
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  // The count climbs; the bar never falls.
  const values: number[] = [];
  await expect
    .poll(
      async () => {
        const value = Number(
          await card(page)
            .getByRole("progressbar")
            .getAttribute("value")
            .catch(() => "100"),
        );
        values.push(value);
        return value;
      },
      { intervals: [100] },
    )
    .toBeGreaterThan(30);
  expect(values).toEqual(values.toSorted((a, b) => a - b));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("whole", { timeout: 30_000 });
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator(".status")).toHaveText(/towns · [\d,]+ lots · single state, not folded$/);
  // The commit, the truncated whole, the root's own folders, then each folder once.
  expect(asked).toHaveLength(3 + FOLDERS);
});

test("cancels with Escape from the map", async ({ page, isMobile }) => {
  test.skip(isMobile, "a keyboard journey");
  await largeRepository(page, "escaped", true);
  await page.getByRole("searchbox").fill("acme/escaped");
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  await page.getByRole("application").focus();
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
});

/** An owner's repositories, answered once per request, each request counted. */
async function owner(page: Page, name: string, answer: (route: Route) => Promise<void>) {
  const asked: string[] = [];
  await page.route(`${API}/users/${name}/repos?**`, async (route) => {
    asked.push(route.request().url());
    await answer(route);
  });
  return asked;
}

const REPOS = [
  {
    name: "react",
    description: "The library for web and native user interfaces.",
    stars: 243_000,
    language: "JavaScript",
  },
  {
    name: "react-native",
    description: "A framework for building native applications using React",
    stars: 124_000,
    language: "C++",
  },
  {
    name: "create-react-app",
    description: "Set up a modern web app by running one command.",
    stars: 103_000,
    language: "JavaScript",
    archived: true,
  },
  { name: "jest", description: "Delightful JavaScript Testing.", stars: 45_000, language: "TypeScript" },
  {
    name: "docusaurus",
    description: "Easy to maintain open source documentation websites.",
    stars: 62_000,
    language: "TypeScript",
  },
  { name: "react-fork", description: null, stars: 3, language: null, fork: true },
].map((r) => ({
  name: r.name,
  description: r.description,
  stargazers_count: r.stars,
  language: r.language,
  fork: r.fork ?? false,
  archived: r.archived ?? false,
}));

test("suggests an owner's repositories after the slash for one request, and lays one picked by keyboard", async ({
  page,
}, info) => {
  const asked = await owner(page, "facebook", (route) => fulfil(route, REPOS));
  await page.route(`${API}/repos/facebook/react/**`, (route) => {
    const url = route.request().url();
    if (url.endsWith("/commits/HEAD")) return fulfil(route, { sha: "c2", commit: { tree: { sha: "t2" } } });
    return fulfil(route, {
      truncated: false,
      tree: Array.from({ length: 30 }, (_, i) => ({ path: `packages/react/f${i}.js`, type: "blob", sha: `r${i}` })),
    });
  });
  const field = page.getByRole("searchbox");
  await field.pressSequentially("facebook/rea", { delay: 40 });
  const matches = page.getByRole("list", { name: "On GitHub" });
  await expect(matches).toBeVisible();
  await expect(page.locator(".summary")).toHaveText(
    "4 of facebook's repositories match · 41 GitHub requests left this hour",
  );
  const buttons = matches.getByRole("button");
  await expect(buttons.first()).toHaveAccessibleName(/^GitHub repository facebook\/react The library/);
  await expect(buttons.first().locator("mark")).toHaveText("rea");
  await page.screenshot({ path: info.outputPath("suggestions.png") });
  // Typing the name cost one request for the owner.
  expect(asked).toHaveLength(1);
  await page.keyboard.press("ArrowDown");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("react");
  await expect(page).toHaveURL(/\?repo=facebook\/react$/);
});

test("says in one line when the owner is unknown or the hourly limit is reached", async ({ page }) => {
  await owner(page, "nobody", (route) => fulfil(route, { message: "Not Found" }, 404));
  const reset = Math.floor(Date.now() / 1000) + 900;
  await owner(page, "limited", (route) =>
    fulfil(route, { message: "API rate limit exceeded" }, 403, {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(reset),
    }),
  );
  const field = page.getByRole("searchbox");
  await field.fill("nobody/x");
  await expect(page.locator(".summary")).toHaveText(/^No GitHub user or organisation named nobody/);
  await expect(page.getByRole("button", { name: /^Lay nobody\/x from GitHub/ })).toBeVisible();
  await field.fill("limited/");
  await expect(page.locator(".summary")).toHaveText(/^GitHub's hourly limit is reached; it resets at \d\d:\d\d/);
});

/** Axe with the loading card up and with the suggestions open. */
async function axeWhileLoadingAndSuggesting(page: Page) {
  const violations = async () =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
  await largeRepository(page, "axe", true);
  await owner(page, "facebook", (route) => fulfil(route, REPOS));
  await page.getByRole("searchbox").fill("acme/axe");
  await page.keyboard.press("Enter");
  await expect(card(page)).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.getByRole("searchbox").fill("facebook/");
  await expect(page.getByRole("list", { name: "On GitHub" })).toBeVisible();
  expect(await violations()).toEqual([]);
}

test("passes axe with the card and the suggestions open, dark", async ({ page }) => {
  await axeWhileLoadingAndSuggesting(page);
});

test.describe("in a light system scheme", () => {
  test.use({ colorScheme: "light" });

  test("passes axe with the card and the suggestions open, light", async ({ page }, info) => {
    await axeWhileLoadingAndSuggesting(page);
    await page.screenshot({ path: info.outputPath("loading-light.png") });
  });
});
