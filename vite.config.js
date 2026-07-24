import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (p) => fileURLToPath(new URL(p, import.meta.url));

// The website lives in site/ and is built by Astro (`npm run demo`). What is
// left here is the rasterizer bench, a dev harness for measuring the
// html-in-canvas path. Run it with `npm run bench`.
export default defineConfig({
  root: "examples",
  base: "./",
  resolve: {
    alias: [
      {
        find: /^@superhq\/webmotion\/html-in-canvas$/,
        replacement: fromRoot("./dist/html-in-canvas/index.js"),
      },
      { find: /^@superhq\/webmotion\/elements$/, replacement: fromRoot("./dist/elements/index.js") },
      { find: /^@superhq\/webmotion\/three$/, replacement: fromRoot("./dist/three/index.js") },
      { find: /^@superhq\/webmotion\/video$/, replacement: fromRoot("./dist/video/index.js") },
      { find: /^@superhq\/webmotion\/live$/, replacement: fromRoot("./dist/live/index.js") },
      { find: /^@superhq\/webmotion$/, replacement: fromRoot("./dist/index.js") },
    ],
  },
  server: {
    // dist lives outside the examples root, so let Vite serve from the repo root.
    fs: { allow: [fromRoot("./")] },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      input: { bench: fromRoot("./examples/bench.html") },
    },
  },
});
