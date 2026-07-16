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

  mountEl.innerHTML = `
    <header class="bar">
      <div class="brand">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4.5 20L7.5 4M10.5 20L13.5 4M16.5 20L19.5 4"
                stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </svg>
        <span>WebMotion</span>
      </div>
      <div class="actions">
        <span class="status"></span>
        <button class="export-btn">Export MP4</button>
      </div>
    </header>

    <w-player class="stage"></w-player>
  `;

  const player = mountEl.querySelector("w-player");
  const exportBtn = mountEl.querySelector(".export-btn");
  const status = mountEl.querySelector(".status");

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

  exportBtn.addEventListener("click", async () => {
    element.pause();
    exportBtn.disabled = true;
    status.textContent = "Encoding...";
    try {
      const blob = await element.export({
        bitrate: BITRATE,
        onProgress: ({ frame, total }) => {
          if (!disposed) status.textContent = `Encoding ${Math.round((frame / total) * 100)}%`;
        },
      });
      if (disposed) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      const kb = Math.round(blob.size / 1024);
      status.innerHTML = `<a class="dl" href="${objectUrl}" download="${config.downloadName || "video.mp4"}">Download MP4 (${kb} KB)</a>`;
    } catch (err) {
      console.error(err);
      status.textContent = `Export failed: ${err.message}`;
    } finally {
      if (!disposed) exportBtn.disabled = false;
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
