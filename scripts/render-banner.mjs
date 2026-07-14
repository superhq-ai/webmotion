// Renders assets/banner.html to assets/banner.png at 2x for the README.
// Usage: node scripts/render-banner.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const html = fileURLToPath(new URL("../assets/banner.html", import.meta.url));
const out = fileURLToPath(new URL("../assets/banner.png", import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 400 },
  deviceScaleFactor: 2,
});
await page.goto(`file://${html}`);
await page.waitForTimeout(250); // let fonts settle
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
