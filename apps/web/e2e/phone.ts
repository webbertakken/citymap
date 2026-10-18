// A phone's speed, the same on every machine that runs the suite. "Slow the processor fourfold" stands for a mid-range
// phone only on the machine it was set on; a slower machine (a CI runner) slowed fourfold stands for a slower phone.
// So the suite times a fixed piece of work on the machine at hand, as Lighthouse does, and slows it to the phone.
import type { Page } from "@playwright/test";

/** How much slower than the reference machine the phone is: the budgets' "4x slowed phone". */
export const PHONE_SLOWDOWN = 4;
/**
 * The work's median time on the reference machine (the one the budgets were set on), unthrottled, in milliseconds.
 * Measured by `timeWork` in Chromium on a quiet workstation (about 43 ms at a load average under 10; 70 ms when its cores are contended); re-measure
 * there if the work changes.
 */
export const REFERENCE_MS = 43;

/** The slowdown that makes this machine as fast as the phone; never below 1, since a slower machine cannot be sped up. */
export const phoneRate = (measuredMs: number, referenceMs = REFERENCE_MS, slowdown = PHONE_SLOWDOWN) =>
  Math.max(1, (slowdown * referenceMs) / measuredMs);

/** A fixed piece of work (hashing, sorting, object churn), timed in the page; it runs there, so it closes over nothing. */
function work(): number {
  const started = performance.now();
  let hash = 2166136261;
  for (let i = 0; i < 1_600_000; i++) hash = Math.imul(hash ^ (i & 255), 16777619) >>> 0;
  const numbers = Array.from({ length: 240_000 }, (_, i) => (Math.imul(i, 2654435761) >>> 0) % 100_000);
  numbers.sort((a, b) => a - b);
  const joined = numbers
    .slice(0, 80_000)
    .map((n) => ({ n, s: String(n) }))
    .map((o) => o.s)
    .join(",");
  // Used, so no engine can skip the work.
  if (hash + numbers[0]! + joined.length < 0) throw new Error("unreachable");
  return performance.now() - started;
}

/** The work's median time over nine runs after one to warm up, in milliseconds, unthrottled. */
export async function timeWork(page: Page): Promise<number> {
  await page.evaluate(work);
  const runs = await timeRuns(page, 9);
  return runs.toSorted((x, y) => x - y)[4]!;
}

/** The work timed n times, one after another: runs at once would time each other. */
async function timeRuns(page: Page, n: number, done: readonly number[] = []): Promise<number[]> {
  if (n === 0) return [...done];
  return timeRuns(page, n - 1, [...done, await page.evaluate(work)]);
}

/** The slowdown for this machine, timed now and reported with the test, so a budget's margin is read against it. */
export async function slowToPhone(page: Page): Promise<number> {
  const { test } = await import("@playwright/test");
  const measured = await timeWork(page);
  const rate = phoneRate(measured);
  test
    .info()
    .annotations.push({ type: "phone", description: `work ${measured.toFixed(1)} ms, slowed ${rate.toFixed(2)}x` });
  console.log(`e2e/phone work=${measured.toFixed(1)} rate=${rate.toFixed(2)}`);
  return rate;
}

/** Below this many cores, software drawing is too slow to stand for a phone's GPU. */
export const SOFTWARE_DRAWING_CORES = 8;

/**
 * Why this browser cannot time a phone's answers, or null when it can. Without a GPU Chromium draws WebGL in software
 * (SwiftShader) across the processor's cores: a workstation's many cores keep up with a phone's GPU, a 4-core CI runner
 * does not, and no slowing of the main thread corrects for that. The budget then gates where it can be measured: the
 * local run before every merge.
 */
export async function cannotTimeAPhone(page: Page): Promise<string | null> {
  const { renderer, cores } = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "none",
      cores: navigator.hardwareConcurrency,
    };
  });
  const software = /SwiftShader|llvmpipe|Software/i.test(renderer);
  console.log(`e2e/drawing software=${software} cores=${cores}`);
  return software && cores < SOFTWARE_DRAWING_CORES
    ? `software drawing on ${cores} cores cannot stand for a phone's GPU; this budget gates in the local run`
    : null;
}
