import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (p) => fileURLToPath(new URL(p, import.meta.url));

// The examples app imports the library by its published names and Vite resolves
// them to the built output in dist. Run `npm run build` first (the demo script
// does this for you) so these files exist.
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
      { find: /^@superhq\/webmotion\/live$/, replacement: fromRoot("./dist/live/index.js") },
      { find: /^@superhq\/webmotion$/, replacement: fromRoot("./dist/index.js") },
    ],
  },
  server: {
    open: true,
    // dist lives outside the examples root, so let Vite serve from the repo root.
    fs: { allow: [fromRoot("./")] },
  },
  build: { outDir: "build", emptyOutDir: true },
});
