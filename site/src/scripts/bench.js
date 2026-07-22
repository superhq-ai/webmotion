// Export throughput, measured in the visitor's own browser.
//
// Numbers on a page are worth what the reader's machine says they are, so the
// table ships empty and fills in from a real run: each case builds a
// composition, exports it to MP4, and reports frames per second and the
// multiple of realtime that represents.
import "@superhq/webmotion/elements";
import { createHero } from "../scenes/hero.js";
import { HERO } from "../scenes/meta.js";

const BITRATE = 6_000_000;

// Bars are scaled against this, so the row lengths stay comparable between runs.
const FPS_CEILING = 320;

const CASES = [
  { id: "card-720", label: "Title card", w: 1280, h: 720, frames: 120 },
  { id: "card-1080", label: "Title card", w: 1920, h: 1080, frames: 120 },
  { id: "hero", label: "The film above", w: HERO.width, h: HERO.height, frames: HERO.duration },
];

// A deliberately ordinary scene: a tracked wordmark over a hairline grid, which
// is what most title work actually costs.
const cardScene = (w, h) => `
<style>
  w-composition { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  .b-t { font: 400 ${Math.round(w / 14)}px -apple-system, BlinkMacSystemFont, sans-serif;
         color: #e1e1e1; text-align: center; letter-spacing: 0.06em; }
  .b-g { position: absolute; inset: 0;
         background-image:
           linear-gradient(to right, rgba(255,255,255,0.05) 2px, transparent 2px),
           linear-gradient(to bottom, rgba(255,255,255,0.05) 2px, transparent 2px);
         background-size: ${Math.round(w / 16)}px ${Math.round(w / 16)}px; }
</style>
<w-el x="0" y="0" width="${w}" height="${h}"><div class="b-g"></div></w-el>
<w-text class="b-t" x="0" y="${Math.round(h * 0.42)}" width="${w}">
  WEBMOTION
  <w-animate property="opacity" from="0" to="1" start="0" end="20" easing="easeOutCubic"></w-animate>
  <w-animate property="letter-spacing" from="${Math.round(w / 60)}px" to="2px"
             start="0" end="60" easing="easeOutCubic"></w-animate>
</w-text>`;

function buildCase(c) {
  if (c.id === "hero") {
    const el = createHero();
    el.removeAttribute("loop");
    el.removeAttribute("poster");
    return el;
  }
  const el = document.createElement("w-composition");
  el.setAttribute("width", String(c.w));
  el.setAttribute("height", String(c.h));
  el.setAttribute("fps", "30");
  el.setAttribute("duration", String(c.frames));
  el.setAttribute("background", "#0f0f0f");
  el.innerHTML = cardScene(c.w, c.h);
  return el;
}

export function mountBench() {
  const table = document.getElementById("bench-rows");
  const runBtn = document.getElementById("bench-run");
  const status = document.getElementById("bench-status");
  if (!table || !runBtn) return;

  const rows = new Map();
  for (const c of CASES) {
    const row = document.createElement("div");
    row.className =
      "grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line py-3 " +
      "sm:grid-cols-[minmax(0,1fr)_180px_72px]";
    row.innerHTML = `
      <div class="min-w-0">
        <span class="text-[0.9375rem] text-ink"></span>
        <span class="ml-2 font-mono text-[0.6875rem] text-ink-4"></span>
      </div>
      <div class="relative hidden h-2 bg-chip sm:block">
        <div class="bar absolute inset-y-0 left-0 bg-line-hi transition-[width] duration-500"
             style="width:0%"></div>
      </div>
      <div class="value text-right font-mono text-[0.8125rem] tabular-nums text-ink-4">&mdash;</div>
    `;
    row.querySelector("span").textContent = c.label;
    row.querySelectorAll("span")[1].textContent = `${c.w}×${c.h} · ${c.frames}f`;
    table.appendChild(row);
    rows.set(c.id, row);
  }

  if (typeof VideoEncoder === "undefined") {
    runBtn.disabled = true;
    runBtn.textContent = "Needs Chromium";
    return;
  }

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;

    // Pause the decorative compositions first: this measures export throughput,
    // not export throughput while two other films play in the same tab.
    const paused = [...document.querySelectorAll("w-composition")].filter((c) => c.playing);
    for (const c of paused) c.pause();

    const scratch = document.createElement("div");
    scratch.style.cssText = "position:absolute;left:-9999px;top:0;width:640px";
    document.body.appendChild(scratch);

    try {
      for (const c of CASES) {
        const row = rows.get(c.id);
        row.classList.add("text-accent");
        row.querySelector(".value").textContent = "running";
        if (status) status.textContent = `measuring ${c.label} at ${c.w}×${c.h}…`;

        const el = buildCase(c);
        scratch.replaceChildren(el);
        await el.ready;

        const t0 = performance.now();
        await el.export({ bitrate: BITRATE });
        const secs = (performance.now() - t0) / 1000;
        const fps = c.frames / secs;

        row.querySelector(".bar").style.width =
          `${Math.max(2, Math.min(100, (fps / FPS_CEILING) * 100))}%`;
        row.querySelector(".value").className =
          "value text-right font-mono text-[0.8125rem] tabular-nums text-ink";
        row.querySelector(".value").textContent = `${Math.round(fps)} fps`;
        row.classList.remove("text-accent");

        const meta = row.querySelectorAll("span")[1];
        meta.textContent =
          `${c.w}×${c.h} · ${c.frames}f · ${secs.toFixed(1)}s · ` +
          `${(fps / 30).toFixed(1)}× realtime`;

        scratch.replaceChildren();
      }
      if (status) status.textContent = "measured on this machine, in this browser, just now.";
    } catch (err) {
      console.error(err);
      if (status) status.textContent = `benchmark failed: ${err.message}`;
    } finally {
      scratch.remove();
      for (const c of paused) c.play();
      runBtn.disabled = false;
      runBtn.textContent = "Run again";
    }
  });
}
