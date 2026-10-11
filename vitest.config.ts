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
