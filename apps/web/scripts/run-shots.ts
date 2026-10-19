// Captures the run lab: a stride of the run before and after the gait, ten frames each, in a light and a dark theme,
// side on, to compare frame by frame with Muybridge's "Running at a half-mile gait" (Animal Locomotion, plate 60).
// Usage: bun scripts/run-shots.ts <origin> <out dir> [frames]   (the origin serves the viewer, e.g. a dev server)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [origin, out, count] = process.argv.slice(2);
if (!origin || !out) throw new Error("run-shots/usage: bun scripts/run-shots.ts <origin> <out dir> [frames]");
const FRAMES = Number(count ?? 10);
const THEMES = { dark: "night-atlas", light: "paper-atlas" } as const;

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  colorScheme: "dark",
  viewport: { width: 360, height: 480 },
});
page.on("console", (message) => {
  if (message.type() === "error") console.error(`[run-shots] page: ${message.text()}`);
});

/** One capture of the lab as asked, once its model is in and a few frames drawn. */
async function shoot(query: string, file: string) {
  await page.goto(`${origin}/lab/run?${query}`);
  await page.locator('main[data-ready="true"] canvas').waitFor({ timeout: 60_000 });
  await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
  await page.screenshot({ path: join(out!, file) });
  console.log(`[run-shots] ${file}`);
}

const shots = (["before", "after"] as const).flatMap((gait) =>
  Object.entries(THEMES).flatMap(([scheme, theme]) =>
    Array.from({ length: FRAMES }, (_, i) => ({
      query: `gait=${gait}&phase=${i / FRAMES}&theme=${theme}`,
      file: `${gait}-${scheme}-${String(i).padStart(2, "0")}.png`,
    })),
  ),
);
// One page, one capture after another.
await shots.reduce((done, { query, file }) => done.then(() => shoot(query, file)), Promise.resolve());
await browser.close();
