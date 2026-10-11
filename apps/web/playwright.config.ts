import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The static export served over HTTPS with basic auth, as every local service is; dark mode throughout.
const port = 5193;
const password = (
  process.env.CITYMAP_WEB_PASSWORD ?? readFileSync(join(homedir(), ".secrets/citymap-dev-password"), "utf8")
).trim();

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    httpCredentials: { username: "webber", password },
    colorScheme: "dark",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bun scripts/serve.ts",
    url: `https://127.0.0.1:${port}/`,
    // Ready when it answers at all: without credentials that is a 401.
    ignoreHTTPSErrors: true,
    env: { PORT: String(port), CITYMAP_WEB_PASSWORD: password },
    reuseExistingServer: false,
  },
});
