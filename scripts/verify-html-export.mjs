/**
 * Browser-level export check for the HTML-in-Canvas backend.
 * Write-only in this task. Do not run from the agent.
 */
import { chromium } from "playwright";

const ORIGIN = "http://127.0.0.1:8080";
// Any same-origin page works as a host; we import from /dist directly. Serve the
// repo root: python3 -m http.server 8080
const PAGE = `${ORIGIN}/`;

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => console.log(`  [page:${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));

await page.goto(PAGE, { waitUntil: "networkidle" });

const result = await page.evaluate(async (origin) => {
  const wm = await import(`${origin}/dist/index.js`);
  const html = await import(`${origin}/dist/html-in-canvas/index.js`);
  const { Muxer, ArrayBufferTarget } = await import(
    `${origin}/node_modules/mp4-muxer/build/mp4-muxer.mjs`
  );

  const composition = new wm.Composition({ width: 320, height: 180, fps: 30, durationInFrames: 30 });

  const candidates = ["avc1.640028", "avc1.42001f", "avc1.42e01e"];
  let codec = null;
  for (const c of candidates) {
    const support = await VideoEncoder.isConfigSupported({
      codec: c,
      width: composition.width,
      height: composition.height,
      bitrate: 2_000_000,
      framerate: composition.fps,
    });
    if (support.supported) {
      codec = c;
      break;
    }
  }
  if (!codec) return { error: "no supported H.264 codec in this browser" };

  class HtmlCard {
    mount({ container }) {
      if (!container) throw new Error("missing html container");
      this.root = document.createElement("div");
      this.root.style.cssText = [
        "position:relative",
        "width:100%",
        "height:100%",
        "overflow:hidden",
        "background:linear-gradient(135deg, #0f1320, #182748)",
        "font-family:ui-sans-serif,system-ui,sans-serif",
      ].join(";");
      this.card = document.createElement("div");
      this.card.style.cssText = [
        "position:absolute",
        "left:24px",
        "top:28px",
        "width:180px",
        "padding:18px",
        "border-radius:20px",
        "background:rgba(255,255,255,0.12)",
        "border:1px solid rgba(255,255,255,0.14)",
        "color:white",
      ].join(";");
      this.title = document.createElement("h2");
      this.title.textContent = "HTML";
      this.title.style.cssText = "margin:0 0 8px;font-size:28px;line-height:1;";
      this.body = document.createElement("p");
      this.body.style.cssText = "margin:0;font-size:13px;line-height:1.4;color:rgba(255,255,255,0.78);";
      this.body.textContent = "Rasterized through foreignObject.";
      this.card.append(this.title, this.body);
      this.root.appendChild(this.card);
      container.appendChild(this.root);
    }

    renderFrame({ frame }) {
      const x = wm.interpolate(frame, [0, 29], [0, 90], { extrapolateRight: "clamp" });
      const opacity = wm.interpolate(frame, [0, 10], [0.35, 1], { extrapolateRight: "clamp" });
      this.card.style.transform = `translate3d(${x}px, 0, 0)`;
      this.card.style.opacity = String(opacity);
    }

    destroy() {
      this.root?.remove();
    }
  }

  const runtime = new wm.Runtime({
    composition,
    renderer: new html.HtmlRenderer(composition.width, composition.height, {
      canvas: new OffscreenCanvas(composition.width, composition.height),
    }),
    layers: [new wm.Layer({ component: new HtmlCard() })],
  });

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: composition.width, height: composition.height },
    fastStart: "in-memory",
  });

  let framesReported = 0;
  await wm.exportVideo(runtime, {
    muxer,
    codec,
    bitrate: 2_000_000,
    onProgress: ({ frame }) => {
      framesReported = frame;
    },
  });

  const buf = muxer.target.buffer;
  const bytes = new Uint8Array(buf);
  const magic = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  return { codec, framesReported, byteLength: buf.byteLength, magic };
}, ORIGIN);

await browser.close();

console.log("\nExport result:", JSON.stringify(result, null, 2));

if (result.error) {
  console.error("\nFAILED:", result.error);
  process.exit(1);
}
const ok =
  result.magic === "ftyp" && result.byteLength > 0 && result.framesReported === 30;
console.log(ok ? "\nPASS: real MP4 produced by the HTML backend" : "\nFAIL: checks did not pass");
process.exit(ok ? 0 : 1);
