import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

// The web app's own project: React components render in jsdom; the WebGL canvas is replaced in tests.
export default defineProject({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // The end-to-end helpers hold pure decisions too, tested beside them.
    include: ["src/**/*.test.{ts,tsx}", "e2e/**/*.test.ts"],
    setupFiles: ["src/testing/setup.ts"],
  },
});
