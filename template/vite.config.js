import { defineConfig } from "vite";

// A plain Vite app. `@superhq/webmotion` resolves from node_modules like any
// other dependency, so there is nothing WebMotion-specific to configure here.
export default defineConfig({
  base: "./",
  server: { open: true },
});
