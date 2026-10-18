import { readFileSync, writeFileSync } from "node:fs";
import { parseCityFile } from "@citymap/measures";
import { expect, test, type Page } from "@playwright/test";
import { cannotTimeAPhone, slowToPhone } from "./phone";

// The main thread while a city opens on a slowed phone: its longest task is how long a tap or a key press landing
// meanwhile may wait. Measured for a bundled city, another layout of it, and linux from a city file and from GitHub.

/** A long task: where it started and how long it held the main thread, in milliseconds. */
interface Task {
  readonly start: number;
  readonly duration: number;
}

/** What an opening cost the main thread: its longest task, and the time beyond 50 ms of every task (blocking time). */
interface Opening {
  readonly name: string;
  readonly longestMs: number;
  readonly blockingMs: number;
  readonly tasks: number;
}

/** Starts recording long tasks before the page's own scripts run. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const tasks: Task[] = [];
    Reflect.set(window, "__tasks", tasks);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: true });
  });
}

const now = (page: Page) => page.evaluate(() => performance.now());

/** The long tasks that started from `from` on, summed up as an opening. */
async function openingSince(page: Page, name: string, from: number): Promise<Opening> {
  const recorded: Task[] = await page.evaluate(() => Reflect.get(window, "__tasks"));
  const tasks = recorded.filter((t) => t.start >= from);
  const opening = {
    name,
    longestMs: Math.round(Math.max(0, ...tasks.map((t) => t.duration))),
    blockingMs: Math.round(tasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)),
    tasks: tasks.length,
  };
  console.log(`e2e/opening name=${name} longest=${opening.longestMs} blocking=${opening.blockingMs}`);
  test.info().annotations.push({
    type: "opening",
    description: `${name}: longest task ${opening.longestMs} ms, blocking ${opening.blockingMs} ms`,
  });
  return opening;
}

/** Waits until the city named is shown and nothing more is on its way, then a moment for the map to draw. */
async function opened(page: Page, name: string, timeout = 30_000) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { timeout });
  await expect(page.getByRole("region", { name: "Loading" })).toHaveCount(0, { timeout });
  await expect(page.locator(".status")).toContainText("lots", { timeout });
  await page.waitForTimeout(1000);
}

async function slowed(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: await slowToPhone(page) });
}

test("opens a bundled city and another layout of it in short main-thread tasks", async ({ page, isMobile }, info) => {
  test.skip(!isMobile, "the phone budget");
  await record(page);
  await page.goto("/");
  test.skip((await cannotTimeAPhone(page)) !== null, "software drawing cannot stand for a phone");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await slowed(page);
  await page.getByRole("button", { name: "More" }).tap();
  const city = await now(page);
  await page.getByRole("button", { name: /^livediagram/ }).tap();
  await opened(page, "livediagram");
  const bundled = await openingSince(page, "livediagram", city);
  await page.getByRole("button", { name: "Layout" }).tap();
  const variant = await now(page);
  await page.getByRole("switch", { name: "Quarters" }).tap();
  await expect(page.getByRole("switch", { name: "Quarters" })).toBeChecked();
  await expect(page.locator(".status")).not.toContainText("…");
  await opened(page, "livediagram");
  const switched = await openingSince(page, "livediagram quarters", variant);
  writeFileSync(info.outputPath("opening.json"), JSON.stringify([bundled, switched], null, 2));
});

/** linux's city, laid by the CLI: too large to bundle, so named by CITYMAP_LINUX_CITY. */
const linux = process.env.CITYMAP_LINUX_CITY;

test("opens linux from a city file in short main-thread tasks", async ({ page, isMobile }, info) => {
  test.skip(!isMobile || !linux, "the phone budget, with linux's city at hand");
  test.setTimeout(300_000);
  await record(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await slowed(page);
  await page.getByRole("button", { name: "More" }).tap();
  const from = await now(page);
  await page.getByLabel("City file").setInputFiles(linux!);
  await opened(page, "linux", 240_000);
  const file = await openingSince(page, "linux file", from);
  writeFileSync(info.outputPath("opening.json"), JSON.stringify([file], null, 2));
});

test("lays linux from GitHub in short main-thread tasks", async ({ page, isMobile }, info) => {
  test.skip(!isMobile || !linux, "the phone budget, with linux's city at hand");
  test.setTimeout(1_500_000);
  // linux's tree, as GitHub would answer it: every file the city file holds a lot for.
  const { city } = parseCityFile(readFileSync(linux!, "utf8"));
  const tree = city.towns.flatMap((t) =>
    t.lots.filter((l) => !l.vacant).map((l, i) => ({ path: l.path, type: "blob", sha: `s${i}`, size: 1000 })),
  );
  const headers = { "access-control-allow-origin": "*" };
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/commits/HEAD"))
      return route.fulfill({ json: { sha: "c1", commit: { tree: { sha: "t1" } } }, headers });
    if (url.includes("/git/trees/t1")) return route.fulfill({ json: { truncated: false, tree }, headers });
    return route.fulfill({ status: 404, json: { message: "Not Found" }, headers });
  });
  await page.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 404, headers }));
  await record(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await slowed(page);
  const from = await now(page);
  await page.getByRole("searchbox").fill("torvalds/linux");
  await page.keyboard.press("Enter");
  await opened(page, "linux", 1_400_000);
  const live = await openingSince(page, "linux live", from);
  writeFileSync(info.outputPath("opening.json"), JSON.stringify([live], null, 2));
});
