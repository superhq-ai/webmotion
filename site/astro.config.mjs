import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

const fromSite = (p) => fileURLToPath(new URL(p, import.meta.url));

// Served from the root of webmotion.superhq.ai. SITE_BASE is here so the site
// can still be built for a subpath (a project Pages URL, a preview deploy)
// without editing this file.
const base = process.env.SITE_BASE ?? "/";

export default defineConfig({
  base,
  outDir: "./dist",
  // Scene assets are referenced with relative `assets/...` URLs, so pages stay
  // at the site root rather than nesting into directories.
  build: { format: "file" },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: [
        {
          find: /^@superhq\/webmotion\/html-in-canvas$/,
          replacement: fromSite("../dist/html-in-canvas/index.js"),
        },
        { find: /^@superhq\/webmotion\/elements$/, replacement: fromSite("../dist/elements/index.js") },
        { find: /^@superhq\/webmotion\/three$/, replacement: fromSite("../dist/three/index.js") },
        { find: /^@superhq\/webmotion\/live$/, replacement: fromSite("../dist/live/index.js") },
        { find: /^@superhq\/webmotion$/, replacement: fromSite("../dist/index.js") },
      ],
    },
    // dist and examples live outside the site root.
    server: { fs: { allow: [fromSite("../")] } },
  },
});
