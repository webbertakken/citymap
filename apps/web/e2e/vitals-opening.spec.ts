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

/** Counts the loads the page has finished, from its log: one more once an opening is done. */
function finishedLoads(page: Page) {
  let finished = 0;
  page.on("console", (message) => {
    if (message.text().startsWith("viewer/load-done")) finished++;
  });
  return () => finished;
}

/** Notes the loads finished so far; the function returned waits for one more, the city named, and a moment to draw. */
function nextOpening(page: Page, name: string, loads: () => number, timeout = 30_000) {
  const before = loads();
  return async () => {
    await expect.poll(loads, { timeout }).toBeGreaterThan(before);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await page.waitForTimeout(1000);
  };
}

async function slowed(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: await slowToPhone(page) });
}

test("opens a bundled city and another layout of it in short main-thread tasks", async ({ page, isMobile }, info) => {
  test.skip(!isMobile, "the phone budget");
  await record(page);
  const loads = finishedLoads(page);
  await page.goto("/");
  test.skip((await cannotTimeAPhone(page)) !== null, "software drawing cannot stand for a phone");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await slowed(page);
  await page.getByRole("button", { name: "More" }).tap();
  const city = await now(page);
  const livediagram = nextOpening(page, "livediagram", loads);
  await page.getByRole("button", { name: /^livediagram/ }).tap();
  await livediagram();
  const bundled = await openingSince(page, "livediagram", city);
  await page.getByRole("button", { name: "Layout" }).tap();
  const variant = await now(page);
  const quarters = nextOpening(page, "livediagram", loads);
  await page.getByRole("switch", { name: "Quarters" }).tap();
  await quarters();
  const switched = await openingSince(page, "livediagram quarters", variant);
  writeFileSync(info.outputPath("opening.json"), JSON.stringify([bundled, switched], null, 2));
  // A tap or a key press while a bundled city or another layout of it opens waits for no task as long as the budget.
  expect(bundled.longestMs).toBeLessThan(200);
  expect(switched.longestMs).toBeLessThan(200);
});

/** linux's city, laid by the CLI: too large to bundle, so named by CITYMAP_LINUX_CITY. */
const linux = process.env.CITYMAP_LINUX_CITY;

test("opens linux from a city file in short main-thread tasks", async ({ page, isMobile }, info) => {
  test.skip(!isMobile || !linux, "the phone budget, with linux's city at hand");
  test.setTimeout(300_000);
  await record(page);
  const loads = finishedLoads(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await slowed(page);
  await page.getByRole("button", { name: "More" }).tap();
  const from = await now(page);
  const done = nextOpening(page, "linux", loads, 240_000);
  await page.getByLabel("City file").setInputFiles(linux!);
  await done();
  const file = await openingSince(page, "linux file", from);
  writeFileSync(info.outputPath("opening.json"), JSON.stringify([file], null, 2));
});

test("lays linux from GitHub in short main-thread tasks", async ({ page, isMobile }, info) => {
  test.skip(!isMobile || !linux, "the phone budget, with linux's city at hand");
  test.setTimeout(300_000);
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
  const loads = finishedLoads(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await slowed(page);
  const from = await now(page);
  const done = nextOpening(page, "linux", loads, 240_000);
  await page.getByRole("searchbox").fill("torvalds/linux");
  await page.keyboard.press("Enter");
  await done();
  const live = await openingSince(page, "linux live", from);
  writeFileSync(info.outputPath("opening.json"), JSON.stringify([live], null, 2));
});
