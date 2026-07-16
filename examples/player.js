import { exportVideo, PlaybackController } from "@superhq/webmotion";
import "@superhq/webmotion/elements";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

const BITRATE = 8_000_000;

// Pick an H.264 profile the browser's encoder actually supports.
async function negotiateCodec(composition) {
  if (typeof VideoEncoder === "undefined") return null;
  const candidates = ["avc1.640028", "avc1.42001f", "avc1.42e01e"];
  for (const codec of candidates) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: composition.width,
      height: composition.height,
      bitrate: BITRATE,
      framerate: composition.fps,
    });
    if (support.supported) return codec;
  }
  return null;
}

// Build the demo shell around a <w-player>: header with export, the standard
// transport (play, chaptered scrubber, volume, zoom, keyboard), and the source
// panel. Returns a handle with destroy() for teardown when switching demos.
export function mountPlayer(mountEl, demo) {
  const created = demo.create();
  const { composition } = created;

  mountEl.innerHTML = `
    <header class="demo-head">
      <div class="demo-title">
        <h2>${demo.title}</h2>
        <p>${demo.blurb}</p>
      </div>
      <div class="demo-actions">
        <span class="status"></span>
        <button class="export-btn">Export MP4</button>
      </div>
    </header>

    <w-player class="stage"></w-player>

    ${demo.source ? `<details class="source"><summary>View the HTML</summary><pre><code></code></pre></details>` : ""}
  `;

  if (demo.source) {
    // textContent, so the markup shows as code instead of being parsed. Shiki
    // replaces it with a highlighted version when the panel first opens.
    mountEl.querySelector(".source code").textContent = demo.source;
    const panel = mountEl.querySelector(".source");
    let highlighted = false;
    panel.addEventListener("toggle", async () => {
      if (!panel.open || highlighted) return;
      highlighted = true;
      try {
        const { codeToHtml } = await import("shiki/bundle/web");
        const html = await codeToHtml(demo.source.trim(), {
          lang: "html",
          theme: "github-light",
        });
        if (!disposed) panel.querySelector("pre").outerHTML = html;
      } catch (err) {
        console.warn("source highlighting unavailable", err);
      }
    });
  }

  const player = mountEl.querySelector("w-player");
  const exportBtn = mountEl.querySelector(".export-btn");
  const status = mountEl.querySelector(".status");

  // A demo is either element-backed (a live <w-composition>; the player binds
  // to it directly) or canvas-backed (a runtime renders into a canvas, driven
  // by the shared PlaybackController).
  let controller = null;
  let previewRuntime = null;
  if (created.element) {
    created.element.classList.add("stage-element");
    player.appendChild(created.element);
  } else {
    const canvas = document.createElement("canvas");
    canvas.className = "stage-canvas";
    canvas.width = composition.width;
    canvas.height = composition.height;
    player.appendChild(canvas);
    previewRuntime = created.buildRuntime(canvas);
    controller = new PlaybackController({
      fps: composition.fps,
      durationInFrames: composition.durationInFrames,
      renderFrame: (frame) => previewRuntime.renderFrame(frame),
    });
    player.source = controller;
  }
  if (demo.chapters) player.chapters = demo.chapters;

  let disposed = false;
  let objectUrl = null;

  // Encode the composition to an MP4 Blob. Element-backed demos own their whole
  // export pipeline; canvas demos get a fresh runtime and offscreen canvas so
  // export does not disturb preview.
  async function encode(onProgress) {
    if (created.element) {
      return created.element.export({ bitrate: BITRATE, onProgress });
    }

    const codec = await negotiateCodec(composition);
    if (!codec) throw new Error("No supported H.264 encoder in this browser");

    const runtime = created.buildRuntime(
      new OffscreenCanvas(composition.width, composition.height),
    );
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width: composition.width, height: composition.height },
      fastStart: "in-memory",
    });

    try {
      await exportVideo(runtime, { muxer, codec, bitrate: BITRATE, onProgress });
      return new Blob([muxer.target.buffer], { type: "video/mp4" });
    } finally {
      runtime.destroy();
    }
  }

  exportBtn.addEventListener("click", async () => {
    player.source?.pause();
    exportBtn.disabled = true;
    status.textContent = "Encoding...";

    try {
      const blob = await encode(({ frame, total }) => {
        if (!disposed) status.textContent = `Encoding ${Math.round((frame / total) * 100)}%`;
      });
      if (disposed) return;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      const kb = Math.round(blob.size / 1024);
      status.innerHTML = `<a class="dl" href="${objectUrl}" download="${demo.downloadName}">Download MP4 (${kb} KB)</a>`;
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
      player.source?.pause();
      controller?.destroy();
      previewRuntime?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      mountEl.innerHTML = "";
    },
  };
}
