import {
  Composition,
  Runtime,
  Layer,
  Sequence,
  CanvasRenderer,
  interpolate,
  Easing,
  exportVideo,
} from "webmotion";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

// Composition.
// 6 seconds at 30fps, 16:9. Everything below is a pure function of `frame`.
const composition = new Composition({
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 180,
});

// Components.
// Components render from `frame` only, which keeps preview and export aligned.

/** Background with a shifting hue and a subtle vignette. */
class Background {
  mount() {}
  renderFrame({ ctx, frame, width, height }) {
    const hue = interpolate(frame, [0, 180], [220, 320]); // animate hue over time
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, `hsl(${hue}, 55%, 14%)`);
    g.addColorStop(1, `hsl(${hue + 40}, 60%, 8%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  destroy() {}
}

/** Title that slides up and fades in, then holds. */
class Title {
  constructor(text) {
    this.text = text;
  }
  mount() {}
  renderFrame({ ctx, frame, width, height }) {
    // `frame` is local to this sequence and starts at 0 when it appears.
    const opacity = interpolate(frame, [0, 20], [0, 1], {
      easing: Easing.easeOutCubic,
      extrapolateRight: "clamp",
    });
    const y = interpolate(frame, [0, 20], [40, 0], {
      easing: Easing.easeOutCubic,
      extrapolateRight: "clamp",
    });
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 84px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.text, width / 2, height / 2 + y);
    ctx.restore();
  }
  destroy() {}
}

/** Progress bar that fills across the composition. */
class ProgressBar {
  mount() {}
  renderFrame({ ctx, frame, width, height, composition }) {
    const p = interpolate(frame, [0, composition.durationInFrames - 1], [0, 1], {
      extrapolateRight: "clamp",
    });
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, height - 8, width, 8);
    ctx.fillStyle = "#7c9cff";
    ctx.fillRect(0, height - 8, width * p, 8);
  }
  destroy() {}
}

// Build the scene.
function buildRuntime(canvas) {
  const renderer = new CanvasRenderer(composition.width, composition.height, { canvas });
  const layers = [
    new Layer({ name: "bg", component: new Background() }),
    new Layer({
      name: "title",
      component: new Title("WebMotion"),
      sequence: new Sequence({ from: 20, durationInFrames: 140 }),
    }),
    new Layer({ name: "progress", component: new ProgressBar() }),
  ];
  return new Runtime({ composition, renderer, layers });
}

// Preview.
const canvas = document.getElementById("stage");
canvas.width = composition.width;
canvas.height = composition.height;

const scrub = document.getElementById("scrub");
scrub.max = String(composition.durationInFrames - 1);

const status = document.getElementById("status");
const playBtn = document.getElementById("play");
const exportBtn = document.getElementById("export");

// Preview uses the same runtime as export.
const preview = buildRuntime(canvas);
let playing = false;
let rafFrame = 0;

async function drawFrame(frame) {
  await preview.renderFrame(frame);
  scrub.value = String(frame);
}

scrub.addEventListener("input", () => {
  playing = false;
  playBtn.textContent = "Play";
  drawFrame(Number(scrub.value));
});

function tick() {
  if (!playing) return;
  drawFrame(rafFrame);
  rafFrame = (rafFrame + 1) % composition.durationInFrames;
  requestAnimationFrame(tick);
}

playBtn.addEventListener("click", () => {
  playing = !playing;
  playBtn.textContent = playing ? "Pause" : "Play";
  if (playing) {
    rafFrame = Number(scrub.value);
    tick();
  }
});

// Export.

/** Pick an H.264 profile the browser's encoder actually supports. */
async function negotiateCodec() {
  const candidates = ["avc1.640028", "avc1.42001f", "avc1.42e01e"];
  for (const codec of candidates) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: composition.width,
      height: composition.height,
      bitrate: 8_000_000,
      framerate: composition.fps,
    });
    if (support.supported) return codec;
  }
  return null;
}

exportBtn.addEventListener("click", async () => {
  playing = false;
  playBtn.textContent = "Play";
  exportBtn.disabled = true;
  status.textContent = "Encoding…";

  const codec = await negotiateCodec();
  if (!codec) {
    status.textContent = "This browser's WebCodecs has no supported H.264 encoder.";
    exportBtn.disabled = false;
    return;
  }

  // Use a separate runtime and offscreen canvas so export does not depend on preview.
  const runtime = buildRuntime(new OffscreenCanvas(composition.width, composition.height));

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: composition.width, height: composition.height },
    fastStart: "in-memory",
  });

  try {
    await exportVideo(runtime, {
      muxer,
      codec,
      bitrate: 8_000_000,
      onProgress: ({ frame, total }) => {
        status.textContent = `Encoding… ${frame}/${total}`;
      },
    });

    const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const kb = Math.round(blob.size / 1024);
    status.innerHTML = `Done (${kb} KB). <a class="dl" href="${url}" download="webmotion.mp4">Download webmotion.mp4</a>`;
  } catch (err) {
    console.error(err);
    status.textContent = `Export failed: ${err.message}`;
  } finally {
    exportBtn.disabled = false;
  }
});

// Draw the first frame on load.
drawFrame(0);
