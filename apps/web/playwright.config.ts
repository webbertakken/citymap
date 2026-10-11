import { defineConfig, devices } from "@playwright/test";

// The static export served over HTTPS on loopback; dark mode throughout.
const port = 5193;

export default defineConfig({
  testDir: "e2e",
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
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bun scripts/serve.ts",
    url: `https://127.0.0.1:${port}/`,
    ignoreHTTPSErrors: true,
    env: { PORT: String(port) },
    reuseExistingServer: false,
  },
});
