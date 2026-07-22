// A thin shell around <w-player>, WebMotion's standard transport: live
// preview, play/pause, a zoomable scrub timeline (section labels come from
// `label` on <w-sequence>, audio clips show on a lane), volume and mute,
// fullscreen, keyboard control, and in-browser MP4 export. You normally never
// need to touch this file; author your video in src/scene.js.
import "@superhq/webmotion/elements";

const BITRATE = 8_000_000;

function buildComposition(config, scene) {
  const el = document.createElement("w-composition");
  el.setAttribute("width", String(config.width));
  el.setAttribute("height", String(config.height));
  el.setAttribute("fps", String(config.fps));
  el.setAttribute("duration", String(config.duration));
  if (config.background) el.setAttribute("background", config.background);
  el.innerHTML = scene;
  return el;
}

// Mount the player into `mountEl`. Returns a handle with destroy() for teardown
// (used by hot-module reload so editing the scene rebuilds cleanly).
export function mountPlayer(mountEl, config, scene) {
  const element = buildComposition(config, scene);
  const seconds = (config.duration / config.fps).toFixed(1);

  mountEl.innerHTML = `
    <header class="bar">
      <div class="brand">
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path d="M4.5 20L7.5 4M10.5 20L13.5 4M16.5 20L19.5 4"
                stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        </svg>
        <span>WebMotion</span>
      </div>
      <span class="spec"></span>
      <div class="actions">
        <span class="status"></span>
        <button class="export-btn">Export MP4</button>
      </div>
    </header>

    <div class="progress" hidden><span></span></div>

    <w-player class="stage"></w-player>

    <div class="result" hidden></div>
  `;

  mountEl.querySelector(".spec").textContent =
    `${config.width} × ${config.height} · ${config.fps} fps · ` +
    `${config.duration} frames · ${seconds}s`;

  const player = mountEl.querySelector("w-player");
  const exportBtn = mountEl.querySelector(".export-btn");
  const status = mountEl.querySelector(".status");
  const progress = mountEl.querySelector(".progress");
  const progressFill = mountEl.querySelector(".progress span");
  const result = mountEl.querySelector(".result");

  element.classList.add("stage-element");
  player.appendChild(element);

  // Sequence labels win; config.chapters only fills in when the scene has none.
  if (config.chapters?.length) {
    player.ready.then(() => {
      if (!player.chapters.length) player.chapters = config.chapters;
    });
  }

  let disposed = false;
  let objectUrl = null;

  if (typeof VideoEncoder === "undefined") {
    exportBtn.disabled = true;
    exportBtn.textContent = "Export needs Chromium";
  }

  exportBtn.addEventListener("click", async () => {
    element.pause();
    exportBtn.disabled = true;
    exportBtn.textContent = "Encoding";
    result.hidden = true;
    progressFill.style.width = "0%";
    progress.hidden = false;

    // Timed so the report is what this machine actually managed, rather than a
    // spinner that says nothing.
    const started = performance.now();
    try {
      const blob = await element.export({
        bitrate: BITRATE,
        onProgress: ({ frame, total }) => {
          if (disposed) return;
          progressFill.style.width = `${(frame / total) * 100}%`;
          const fps = frame / ((performance.now() - started) / 1000);
          status.textContent = `${frame} / ${total} · ${Math.round(fps)} fps`;
        },
      });
      if (disposed) return;

      const secs = (performance.now() - started) / 1000;
      const fps = Math.round(config.duration / secs);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);

      status.textContent = "";
      result.innerHTML = "";
      const stats = document.createElement("span");
      stats.textContent =
        `${config.duration} frames · ${secs.toFixed(1)}s · ${fps} fps · ` +
        `${(fps / config.fps).toFixed(1)}× realtime`;
      const link = document.createElement("a");
      link.className = "dl";
      link.href = objectUrl;
      link.download = config.downloadName || "video.mp4";
      link.textContent = `Download · ${(blob.size / 1048576).toFixed(1)} MB`;
      result.append(stats, link);
      result.hidden = false;
    } catch (err) {
      console.error(err);
      status.textContent = `export failed: ${err.message}`;
    } finally {
      if (!disposed) {
        progress.hidden = true;
        exportBtn.disabled = false;
        exportBtn.textContent = "Export MP4";
      }
    }
  });

  return {
    destroy() {
      disposed = true;
      element.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      mountEl.innerHTML = "";
    },
  };
}
