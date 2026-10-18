import { defineConfig } from "vitest/config";

/** Every workspace is its own project; a workspace may add its own `vitest.config.ts` (the web app's environment). */
const PROJECTS = ["packages/*", "apps/*", "scripts"];

/** Source counted by coverage, by extension so fixtures beside the code are never parsed as code. */
const COVERAGE_INCLUDE = ["{packages,apps}/*/src/**/*.{ts,tsx}", "scripts/*/**/*.ts"];

/** Tests, declarations, fixtures, and wiring-only entry points, proved by running them. */
const COVERAGE_EXCLUDE = [
  "**/*.{test,spec}.{ts,tsx}",
  "**/*.d.ts",
  "scripts/*.ts",
  // Test fixtures, and the CLI's wiring-only entry point (proved by running it).
  "**/testing/**",
  "apps/cli/src/bin.ts",
  // WebGL and the Next.js entry points cannot run in jsdom; the end-to-end suite proves them in a browser.
  "apps/web/src/components/CityCanvas.tsx",
  "apps/web/src/components/CityMeshes.tsx",
  "apps/web/src/components/ExploreCanvas.tsx",
  // The research labs draw with WebGL; they are proved by their captures and leave at fold-back.
  "apps/web/src/explore/lab/**",
  // Web Workers cannot run in jsdom; the end-to-end suite proves them, and tests lay through `layHere`.
  "apps/web/src/lay/browser.ts",
  "apps/web/src/lay/worker.ts",
  "apps/web/src/app/**",
];

export default defineConfig({
  test: {
    projects: PROJECTS,
    coverage: {
      provider: "v8",
      include: COVERAGE_INCLUDE,
      exclude: COVERAGE_EXCLUDE,
      reporter: ["text-summary", ["text", { skipFull: true }], ["lcov", { projectRoot: import.meta.dirname }]],
      thresholds: { 100: true },
    },
  },
});
