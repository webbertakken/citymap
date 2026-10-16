import { expect, test, type Page } from "@playwright/test";

// Core Web Vitals as the viewer spec sets them: the largest paint is text painted before the scene loads, nothing
// shifts, and every interaction answers within 200 ms on a phone (here with its processor slowed fourfold).

interface Vitals {
  readonly paints: { readonly tag: string; readonly url: string; readonly time: number }[];
  shift: number;
  readonly events: { readonly name: string; readonly target: string; readonly duration: number }[];
}

/** Starts recording paints, shifts and event timings before the page's own scripts run. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const seen: Vitals = { paints: [], shift: 0, events: [] };
    Reflect.set(window, "__vitals", seen);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const element: unknown = Reflect.get(e, "element");
        const tag = element instanceof Element ? element.tagName : "";
        seen.paints.push({
          tag,
          url: String(Reflect.get(e, "url")),
          time: Number(Reflect.get(e, "renderTime")) || e.startTime,
        });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (!Reflect.get(e, "hadRecentInput")) seen.shift += Number(Reflect.get(e, "value"));
    }).observe({ type: "layout-shift", buffered: true });
    // Event timings from 16 ms up (the default is 104 ms), so the budget sees every slow-ish answer.
    const events: PerformanceObserverInit & { durationThreshold: number } = {
      type: "event",
      buffered: true,
      durationThreshold: 16,
    };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!Reflect.get(e, "interactionId")) continue;
        const target: unknown = Reflect.get(e, "target");
        const label = target instanceof Element ? (target.getAttribute("aria-label") ?? target.textContent ?? "") : "";
        seen.events.push({ name: e.name, target: label.slice(0, 40), duration: e.duration });
      }
    }).observe(events);
  });
}

const vitals = (page: Page): Promise<Vitals> => page.evaluate(() => Reflect.get(window, "__vitals"));

test("paints text as its largest content before the scene, and shifts nothing as cities load", async ({ page }) => {
  await record(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await page.waitForTimeout(500);
  const { paints } = await vitals(page);
  // The first largest paint is text of a card (or the search's placeholder, drawn inside the field, so it names no
  // element); never an image. A town's label may outgrow it once drawn.
  expect(["P", "H1", "H2", "SPAN", ""]).toContain(paints[0]?.tag);
  expect(paints[0]?.url).toBe("");
  expect(paints.at(-1)!.time).toBeLessThan(2500);
  // A city chosen from More is an input: its shifts are the person's own. Wait past the input window.
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: /^livediagram/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("livediagram");
  await page.waitForTimeout(800);
  expect((await vitals(page)).shift).toBe(0);
});

test("answers every interaction within 200 ms on a slowed phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the phone budget");
  await record(page);
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: /^livediagram/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("livediagram");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const map = page.getByRole("application");
  const box = (await map.boundingBox())!;
  await map.tap({ position: { x: box.width / 2, y: box.height / 2 } });
  await map.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  await page.keyboard.press("-");
  await page.keyboard.press("0");
  // Another layout: the variant loads while the page answers.
  await page.getByRole("button", { name: "Layout" }).tap();
  await page.getByRole("switch", { name: "Quarters" }).tap();
  await expect(page.getByRole("switch", { name: "Quarters" })).toBeChecked();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox").tap();
  await page.keyboard.type("palette");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Details", exact: true }).tap();
  await page.getByRole("region", { name: "Towns" }).getByRole("button", { name: "apps/live", exact: true }).tap();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button").tap();
  await page.waitForTimeout(500);
  const { events } = await vitals(page);
  expect(events.length).toBeGreaterThan(0);
  // The slowest answer, in the report, so the margin under the budget stays visible.
  const slowest = events.toSorted((a, b) => b.duration - a.duration)[0]!;
  test
    .info()
    .annotations.push({ type: "slowest", description: `${slowest.name} ${slowest.target}: ${slowest.duration} ms` });
  expect(events.filter((e) => e.duration >= 200)).toEqual([]);
});

test("shifts nothing as the loading card comes, and answers its Cancel within 200 ms", async ({ page, isMobile }) => {
  await record(page);
  // A repository whose tree never answers, opened from the address, so the card comes without any input.
  const headers = { "access-control-allow-origin": "*" };
  await page.route("https://api.github.com/**", (route) =>
    route.request().url().endsWith("/commits/HEAD")
      ? route.fulfill({ json: { sha: "c1", commit: { tree: { sha: "t1" } } }, headers })
      : undefined,
  );
  await page.goto("/?repo=acme/slow");
  const card = page.getByRole("region", { name: "Loading" });
  await expect(card).toBeVisible();
  await page.waitForTimeout(800);
  expect((await vitals(page)).shift).toBe(0);
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toHaveCount(0);
  await page.waitForTimeout(500);
  const { events } = await vitals(page);
  expect(events.length).toBeGreaterThan(0);
  expect(events.filter((e) => e.duration >= 200)).toEqual([]);
});
