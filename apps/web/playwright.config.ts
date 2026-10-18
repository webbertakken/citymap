import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The bundled cities are built, not committed; without them every journey would fail for the same, unclear reason.
if (!existsSync(join(import.meta.dirname, "public/cities/index.json")))
  throw new Error("e2e/no-cities: run `bun run bundle` first; the bundled cities are built, not committed");

// The static export served over HTTPS on loopback; dark mode throughout.
// The port the export is served on: 5193, or CITYMAP_E2E_PORT when another checkout runs its suite at once.
const port = Number(process.env.CITYMAP_E2E_PORT ?? 5193);
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } };
const phone = devices["Pixel 7"];

export default defineConfig({
  testDir: "e2e",
  // Journeys are specs; a `.test.ts` beside them is a Vitest unit test of a helper.
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    colorScheme: "dark",
    trace: "retain-on-failure",
  },
  // The vitals are timed on their own, once the journeys are done, so other tests drawing at once never skew them.
  projects: [
    { name: "desktop", testIgnore: /vitals/, use: desktop },
    { name: "phone", testIgnore: /vitals/, use: phone },
    { name: "vitals-desktop", testMatch: /vitals/, dependencies: ["desktop", "phone"], use: desktop },
    { name: "vitals-phone", testMatch: /vitals/, dependencies: ["desktop", "phone"], use: phone },
  ],
  webServer: {
    command: "bun scripts/serve.ts",
    url: `https://127.0.0.1:${port}/`,
    ignoreHTTPSErrors: true,
    env: { PORT: String(port) },
    reuseExistingServer: false,
  },
});
