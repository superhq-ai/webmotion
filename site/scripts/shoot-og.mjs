// Photograph the link preview cards.
//
//   npm run og
//
// Renders site/src/pages/og.astro and og-github.astro from the built site and
// writes public/og.png and public/og-github.png. Two sizes because the
// platforms disagree: 1200x630 is what Open Graph scrapers crop toward, and
// GitHub asks for 1280x640 on a repository social preview.
//
// The pages are served rather than opened over file://, because the build emits
// root-absolute asset URLs and file:// would fetch the stylesheet from the
// filesystem root and render an unstyled card.
//
// GitHub note: public/og-github.png cannot take effect by being committed.
// GitHub only reads a social preview uploaded through Settings > General >
// Social preview. The file lives in the repo so it is versioned with the design
// it came from, and so re-uploading after a change means grabbing a known file
// rather than rebuilding one from memory.
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "../dist");
const PUBLIC = resolve(here, "../public");

const SHOTS = [
  { page: "og.html", out: "og.png", width: 1200, height: 630 },
  { page: "og-github.html", out: "og-github.png", width: 1280, height: 640 },
];

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
};

function serve(root) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = join(root, path === "/" ? "/index.html" : path);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

if (!existsSync(join(DIST, "og.html"))) {
  console.error("No built site. Run `astro build --root site` first.");
  process.exit(1);
}

const server = await serve(DIST);
const { port } = server.address();
const browser = await chromium.launch();

for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1,
  });
  await page.goto(`http://localhost:${port}/${shot.page}`, { waitUntil: "networkidle" });
  // The card is set in Inter and JetBrains Mono off Google Fonts. Shooting
  // before they land bakes in the fallback stack, which is the one failure here
  // that still produces a perfectly valid looking image.
  await page.evaluate(() => document.fonts.ready);
  const card = page.locator("#og");
  await mkdir(PUBLIC, { recursive: true });
  await writeFile(join(PUBLIC, shot.out), await card.screenshot({ type: "png" }));
  const { width, height } = await card.boundingBox();
  console.log(`${shot.out.padEnd(16)} ${width}x${height}`);
  await page.close();
}

await browser.close();
server.close();
