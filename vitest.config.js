import { defineConfig } from "vitest/config";

// Kept separate from vite.config.js (which drives the examples app and roots
// itself in examples/). Vitest prefers this file, so unit tests keep running
// from the repo root against the core sources.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
