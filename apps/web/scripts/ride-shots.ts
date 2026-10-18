// Captures the ride lab: each ride, pose and view, in a light and a dark theme, and the bicycle's wheel turning frame by
// frame, as PNGs, so how the rider meets the machine can be compared before and after a change.
// Usage: bun scripts/ride-shots.ts <origin> <out dir> [wheel]   (the origin serves the viewer, e.g. a dev server)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [origin, out, only] = process.argv.slice(2);
if (!origin || !out) throw new Error("ride-shots/usage: bun scripts/ride-shots.ts <origin> <out dir> [wheel]");

const RIDES = ["bicycle", "motorbike"] as const;
const POSES = ["parked", "stopped", "riding", "steering"] as const;
const VIEWS = ["side", "front", "above", "behind"] as const;
const THEMES = { dark: "night-atlas", light: "paper-atlas" } as const;
/** The wheel's turn in frames: an eighth of a metre each, a little over a full turn of the bicycle's 0.337 m wheel. */
const WHEEL_FRAMES = 18;
const WHEEL_STEP = 0.125;

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  colorScheme: "dark",
  viewport: { width: 800, height: 600 },
});
page.on("console", (message) => {
  if (message.type() === "error") console.error(`[ride-shots] page: ${message.text()}`);
});

/** One capture of the lab as asked, once its models are in and a few frames drawn. */
async function shoot(query: string, file: string) {
  await page.goto(`${origin}/lab/ride?${query}`);
  await page.locator('main[data-ready="true"] canvas').waitFor({ timeout: 60_000 });
  await page.evaluate(() => new Promise((done) => setTimeout(done, 400)));
  await page.screenshot({ path: join(out!, file) });
  console.log(`[ride-shots] ${file}`);
}

/** Every capture asked for: the wheel's frames, or each ride, pose, view and theme. */
const shots =
  only === "wheel"
    ? Array.from({ length: WHEEL_FRAMES }, (_, i) => ({
        query: `ride=bicycle&pose=parked&view=behind&theme=night-atlas&rolled=${i * WHEEL_STEP}`,
        file: `wheel-${String(i).padStart(2, "0")}.png`,
      }))
    : RIDES.flatMap((ride) =>
        POSES.flatMap((pose) =>
          VIEWS.flatMap((view) =>
            Object.entries(THEMES).map(([scheme, theme]) => ({
              query: `ride=${ride}&pose=${pose}&view=${view}&theme=${theme}`,
              file: `${ride}-${pose}-${view}-${scheme}.png`,
            })),
          ),
        ),
      );
// One page, one capture after another.
await shots.reduce((done, { query, file }) => done.then(() => shoot(query, file)), Promise.resolve());
await browser.close();
