// Captures the heli lab: the helicopter on the ground and in flight, from the front, side, above and behind, and close on
// its cabin, in a light and a dark theme, as PNGs, so its glass and its pilot can be compared before and after a change.
// Usage: bun scripts/heli-shots.ts <origin> <out dir> [marks]   (the origin serves the viewer, e.g. a dev server)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [origin, out, marks] = process.argv.slice(2);
if (!origin || !out) throw new Error("heli-shots/usage: bun scripts/heli-shots.ts <origin> <out dir> [marks]");

const POSES = ["ground", "flight"] as const;
const VIEWS = ["front", "side", "above", "behind", "cabin"] as const;
const THEMES = { dark: "night-atlas", light: "paper-atlas" } as const;

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  colorScheme: "dark",
  viewport: { width: 800, height: 600 },
});
page.on("console", (message) => {
  if (message.type() === "error") console.error(`[heli-shots] page: ${message.text()}`);
});

/** One capture of the lab as asked, once its models are in and a few frames drawn. */
async function shoot(query: string, file: string) {
  await page.goto(`${origin}/lab/heli?${query}`);
  await page.locator('main[data-ready="true"] canvas').waitFor({ timeout: 60_000 });
  await page.evaluate(() => new Promise((done) => setTimeout(done, 400)));
  await page.screenshot({ path: join(out!, file) });
  console.log(`[heli-shots] ${file}`);
}

const shots = POSES.flatMap((pose) =>
  VIEWS.flatMap((view) =>
    Object.entries(THEMES).map(([scheme, theme]) => ({
      query: `pose=${pose}&view=${view}&theme=${theme}${marks === "marks" ? "&marks=1" : ""}`,
      file: `${pose}-${view}-${scheme}.png`,
    })),
  ),
);
// One page, one capture after another.
await shots.reduce((done, { query, file }) => done.then(() => shoot(query, file)), Promise.resolve());
await browser.close();
