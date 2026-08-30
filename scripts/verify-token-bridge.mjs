/**
 * Browser-level check that design tokens survive a standalone layer raster.
 *
 * A layer clone is rasterized without its ancestors, so a custom property
 * declared on the composition element (the usual home for a scene's palette)
 * has nowhere to come from inside the SVG. An unresolvable var() is invalid at
 * computed-value time, which for `color` means inherit — white on a dark
 * scene. This asserts the bridge in prepareClone puts the token back.
 *
 * Run:  node scripts/verify-token-bridge.mjs   (requires a built dist/)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const PORT = 8137;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };

const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><html><body></body></html>");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });

const result = await page.evaluate(async (port) => {
  const { DomRasterizer } = await import(`http://127.0.0.1:${port}/dist/html-in-canvas/index.js`);

  // The palette lives on an ancestor, exactly as a scene declares it.
  const style = document.createElement("style");
  style.textContent = `
    .stage { --gold: #ffd84d; }
    .layer { width: 80px; height: 40px; background: #000; }
    .layer span { color: var(--gold); font: 900 32px system-ui; }
  `;
  document.head.append(style);

  const stage = document.createElement("div");
  stage.className = "stage";
  stage.innerHTML = `<div class="layer"><span>██</span></div>`;
  document.body.append(stage);

  const layer = stage.querySelector(".layer");
  const rasterizer = new DomRasterizer();
  rasterizer.pixelRatio = 1;
  // bleed makes this the standalone-layer path, the one the exporter uses.
  const canvas = await rasterizer.present(
    await rasterizer.rasterizeSnapshot(await rasterizer.snapshot(layer, { bleed: 0 })),
  );

  // Brightest opaque pixel: the glyph interior, past the edges the rasterizer
  // antialiases down toward the black backdrop.
  const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let best = null;
  let bestLum = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 250) continue;
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    const lum = r + g + b;
    if (lum > bestLum) {
      bestLum = lum;
      best = { r, g, b };
    }
  }
  return { pixel: best, size: [canvas.width, canvas.height] };
}, PORT);

await browser.close();
await new Promise((r) => server.close(r));

const near = (a, b) => Math.abs(a - b) <= 12;
const p = result.pixel;
if (!p) {
  console.error("FAIL: no lit pixel found in the raster", result);
  process.exit(1);
}
// #ffd84d, not #ffffff.
if (near(p.r, 0xff) && near(p.g, 0xd8) && near(p.b, 0x4d)) {
  console.log(`ok: token survived the layer raster (rgb ${p.r},${p.g},${p.b})`);
} else {
  console.error(`FAIL: expected ~255,216,77 (--gold), got ${p.r},${p.g},${p.b}`);
  process.exit(1);
}
