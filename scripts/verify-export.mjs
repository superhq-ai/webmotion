/**
 * Browser-level export check using Playwright and a real MP4 encode.
 */
import { chromium } from "playwright";

const ORIGIN = "http://127.0.0.1:8080";
const PAGE = `${ORIGIN}/examples/`;

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => console.log(`  [page:${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}`));

await page.goto(PAGE, { waitUntil: "networkidle" });

const result = await page.evaluate(async (origin) => {
  const wm = await import(`${origin}/dist/index.js`);
  const { Muxer, ArrayBufferTarget } = await import(
    `${origin}/node_modules/mp4-muxer/build/mp4-muxer.mjs`
  );

  const composition = new wm.Composition({ width: 320, height: 180, fps: 30, durationInFrames: 30 });

  // Headless OpenH264 is usually baseline-only, so try simpler profiles too.
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

  // Simple moving box for the export check.
  class Box {
    mount() {}
    renderFrame({ ctx, frame, width, height }) {
      const x = wm.interpolate(frame, [0, 29], [0, width - 40]);
      ctx.fillStyle = "#101018";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#7c9cff";
      ctx.fillRect(x, height / 2 - 20, 40, 40);
    }
    destroy() {}
  }

  const runtime = new wm.Runtime({
    composition,
    renderer: new wm.CanvasRenderer(composition.width, composition.height, {
      canvas: new OffscreenCanvas(composition.width, composition.height),
    }),
    layers: [new wm.Layer({ component: new Box() })],
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
  // A valid MP4 starts with an "ftyp" box at bytes 4..8.
  const magic = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  return { codec, framesReported, byteLength: buf.byteLength, magic };
}, ORIGIN);

await browser.close();

console.log("\nExport result:", JSON.stringify(result, null, 2));

if (result.error) {
  console.error("\n❌ FAILED:", result.error);
  process.exit(1);
}
const ok =
  result.magic === "ftyp" && result.byteLength > 0 && result.framesReported === 30;
console.log(ok ? "\n✅ PASS: real MP4 produced by the browser pipeline" : "\n❌ FAIL: checks did not pass");
process.exit(ok ? 0 : 1);
