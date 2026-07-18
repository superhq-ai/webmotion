// Export stress benchmark: S scenes, each with a background, a title, and N
// tweened images (slide + scale + rotate + fade). Measures export wall time,
// rasterizer stage timings via __WM_PROFILE, and JS heap growth.
import "@superhq/webmotion/elements";

const params = new URLSearchParams(location.search);
const SCENES = num(params.get("scenes"), 4);
const IMGS = num(params.get("imgs"), 12);
const SCENE_FRAMES = num(params.get("sceneframes"), 150);
const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const DURATION = SCENES * SCENE_FRAMES;

const IMAGES = [
  "assets/aurora.webp",
  "assets/hero-orb.webp",
  "assets/horizon.webp",
  "assets/light-ribbons.webp",
  "assets/mesh.webp",
  "assets/reel/celebrate.png",
  "assets/reel/duel.png",
  "assets/reel/striker.png",
];

function num(v, d) {
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function sceneMarkup(s) {
  const from = s * SCENE_FRAMES;
  const fadeIn = 20;
  const fadeOut = 20;
  let out = `<w-sequence from="${from}" duration="${SCENE_FRAMES}" label="scene ${s}">`;
  out += `<w-rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="hsl(${(s * 47) % 360}, 30%, 12%)">
    <w-animate property="opacity" from="0" to="1" start="0" end="${fadeIn}"></w-animate>
  </w-rect>`;
  out += `<w-text x="80" y="60" width="1120" height="80" font="700 54px ui-monospace, monospace" color="#f2f2f0" text="Scene ${s}: stress case">
    <w-animate property="y" from="-40" to="0" start="0" end="${fadeIn}" easing="ease-out"></w-animate>
    <w-animate property="opacity" from="0" to="1" start="0" end="${fadeIn}"></w-animate>
    <w-animate property="opacity" from="1" to="0" start="${SCENE_FRAMES - fadeOut}" end="${SCENE_FRAMES}"></w-animate>
  </w-text>`;
  for (let i = 0; i < IMGS; i++) {
    const img = IMAGES[(s * IMGS + i) % IMAGES.length];
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 90 + col * 290;
    const y = 170 + row * 180;
    const drift = (i % 2 === 0 ? 1 : -1) * (30 + (i % 5) * 10);
    out += `<w-el x="${x}" y="${y}" width="240" height="150">
      <img src="${img}" width="240" height="150" style="object-fit:cover;border-radius:10px;display:block;" />
      <w-animate property="x" from="${-drift}" to="${drift}" start="0" end="${SCENE_FRAMES}"></w-animate>
      <w-animate property="y" from="20" to="0" start="0" end="${fadeIn + 10}" easing="ease-out"></w-animate>
      <w-animate property="scale" from="0.85" to="1" start="0" end="${fadeIn + 10}" easing="ease-out"></w-animate>
      <w-animate property="rotate" from="${i % 3 === 0 ? -4 : 0}" to="${i % 3 === 0 ? 3 : 0}" start="0" end="${SCENE_FRAMES}"></w-animate>
      <w-animate property="opacity" from="0" to="1" start="${i}" end="${fadeIn + i}"></w-animate>
      <w-animate property="opacity" from="1" to="0" start="${SCENE_FRAMES - fadeOut}" end="${SCENE_FRAMES}"></w-animate>
    </w-el>`;
  }
  out += `</w-sequence>`;
  return out;
}

async function main() {
  const status = document.getElementById("status");
  const holder = document.getElementById("holder");

  const comp = document.createElement("w-composition");
  comp.setAttribute("width", String(WIDTH));
  comp.setAttribute("height", String(HEIGHT));
  comp.setAttribute("fps", String(FPS));
  comp.setAttribute("duration", String(DURATION));
  comp.innerHTML = Array.from({ length: SCENES }, (_, s) => sceneMarkup(s)).join("");
  holder.appendChild(comp);
  await comp.ready;

  // Let images decode before timing anything.
  await Promise.all(
    Array.from(comp.querySelectorAll("img")).map((img) =>
      img.decode ? img.decode().catch(() => {}) : Promise.resolve(),
    ),
  );

  status.textContent = `composition ready: ${SCENES} scenes x ${IMGS} images, ${DURATION} frames`;
  if (!params.has("run")) {
    status.textContent += " (add ?run=1 to start)";
    return;
  }

  window.__WM_PROFILE = true;
  const memSamples = [];
  const sampleMem = () => {
    if (performance.memory) {
      memSamples.push(Math.round(performance.memory.usedJSHeapSize / 1048576));
    }
  };
  sampleMem();
  const memTimer = setInterval(sampleMem, 1000);

  const t0 = performance.now();
  let lastFrame = 0;
  let error = null;
  let blobSize = 0;
  try {
    const blob = await comp.export({
      onProgress: ({ frame, total }) => {
        lastFrame = frame;
        if (frame % 30 === 0) status.textContent = `exporting ${frame}/${total}`;
      },
    });
    blobSize = blob.size;
    // Expose the mp4 for retrieval by automation: base64 in 1MB slices.
    const buf = new Uint8Array(await blob.arrayBuffer());
    let b64 = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      b64 += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    }
    window.__MP4_B64 = btoa(b64);
  } catch (e) {
    error = String(e && e.message ? e.message : e);
  }
  const wallMs = Math.round(performance.now() - t0);
  clearInterval(memTimer);
  sampleMem();

  const profile = {};
  for (const [stage, v] of Object.entries(window.__wmProfile ?? {})) {
    profile[stage] = { totalMs: Math.round(v.total), count: v.count, avgMs: +(v.total / v.count).toFixed(2) };
  }

  const result = {
    config: { scenes: SCENES, imgs: IMGS, sceneFrames: SCENE_FRAMES, fps: FPS, frames: DURATION },
    wallMs,
    framesDone: lastFrame,
    msPerFrame: +(wallMs / Math.max(1, lastFrame)).toFixed(1),
    exportFps: +((lastFrame / wallMs) * 1000).toFixed(2),
    blobBytes: blobSize,
    heapMB: { start: memSamples[0] ?? null, peak: memSamples.length ? Math.max(...memSamples) : null, samples: memSamples },
    profile,
    error,
  };
  window.__BENCH_RESULT = result;
  status.textContent = error ? `FAILED after ${wallMs}ms` : `done in ${wallMs}ms`;
  document.getElementById("result").textContent = JSON.stringify(result, null, 2);
}

main();
