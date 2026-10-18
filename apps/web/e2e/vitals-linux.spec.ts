import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { slowToPhone } from "./phone";

// linux's 75,000 buildings within the vitals' interaction budget on a slowed phone. A phone draws on its graphics
// processor, and software drawing (a headless browser's default) would time the processor instead, so this file asks
// for the machine's own graphics; where none answers, the browser falls back to software.
test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"] } });

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

test("stands linux's buildings and answers within 200 ms on a slowed phone", async ({ page, isMobile }, info) => {
  // linux's city is too large to bundle: a city file laid by the CLI, named by CITYMAP_LINUX_CITY, stands in for it.
  const file = process.env.CITYMAP_LINUX_CITY;
  test.skip(!isMobile || !file, "the phone budget, with linux's city at hand");
  test.setTimeout(240_000);
  await record(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await page.getByRole("button", { name: "More" }).tap();
  await page.getByLabel("City file").setInputFiles(file!);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("linux", { timeout: 120_000 });
  await expect(page.locator(".status")).toContainText("lots", { timeout: 120_000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: await slowToPhone(page) });
  await page.waitForTimeout(1000);
  const before = (await vitals(page)).events.length;
  const started = Date.now();
  await page.getByRole("button", { name: "Buildings" }).tap();
  await page.waitForTimeout(1500);
  const drawn = Date.now() - started;
  const map = page.getByRole("application");
  await map.tap({ position: { x: 200, y: 400 } });
  await map.focus();
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Legend" }).tap();
  await page.getByRole("button", { name: /^Colour by/ }).tap();
  await page.getByRole("radio", { name: "Size" }).tap();
  await page.waitForTimeout(800);
  const memory = await page.evaluate(() => Number(Reflect.get(performance, "memory")?.usedJSHeapSize ?? 0));
  const events = (await vitals(page)).events.slice(before);
  const slowest = events.toSorted((a, b) => b.duration - a.duration)[0];
  const measured = { switchMs: drawn, slowest, heapMb: Math.round(memory / 1e6), events };
  writeFileSync(info.outputPath("linux.json"), JSON.stringify(measured, null, 2));
  info.annotations.push({
    type: "linux",
    description: `switch ${drawn} ms; slowest ${slowest?.name} ${slowest?.target}: ${slowest?.duration} ms; heap ${Math.round(memory / 1e6)} MB`,
  });
  expect(events.filter((e) => e.duration >= 200)).toEqual([]);
});
