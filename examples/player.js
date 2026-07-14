import { exportVideo } from "@superhq/webmotion";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

const BITRATE = 8_000_000;

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>`;

function formatTime(frame, fps) {
  const total = Math.round(frame / fps);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

// Normalize a demo's chapters into contiguous segments across the timeline. A
// demo with no chapters gets a single full-length segment.
function resolveChapters(demo, durationInFrames) {
  const raw =
    demo.chapters && demo.chapters.length ? demo.chapters : [{ label: demo.title, from: 0 }];
  return raw.map((ch, i) => {
    const from = ch.from ?? 0;
    const to = i < raw.length - 1 ? raw[i + 1].from : durationInFrames;
    return { label: ch.label, from, to, span: Math.max(1, to - from) };
  });
}

// Build the player UI for one demo inside `mountEl` and wire preview, scrubbing,
// playback, and MP4 export. Returns a handle with destroy() for teardown when
// the user switches demos.
export function mountPlayer(mountEl, demo) {
  const created = demo.create();
  const { composition } = created;
  const lastFrame = composition.durationInFrames - 1;
  const chapters = resolveChapters(demo, composition.durationInFrames);
  // A representative frame to show on load, so the preview is never blank.
  const posterFrame = Math.min(lastFrame, demo.poster ?? Math.round(lastFrame * 0.7));

  const chapterMarkup = chapters
    .map(
      (ch, i) =>
        `<button class="chapter" data-from="${ch.from}" style="flex-grow:${ch.span}" data-index="${i}">
          <span class="chapter-label">${ch.label}</span>
        </button>`,
    )
    .join("");

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

    <div class="stage-frame">
      <canvas class="stage"></canvas>
    </div>

    <div class="controls">
      <button class="play-btn" aria-label="Play">${PLAY_ICON}</button>
      <div class="time"><span class="time-cur">0:00</span><span class="time-sep">/</span><span class="time-dur">${formatTime(lastFrame, composition.fps)}</span></div>
      <div class="track">
        <div class="chapters">${chapterMarkup}</div>
        <div class="playhead"></div>
        <input class="seek" type="range" min="0" max="${lastFrame}" step="1" value="0"
               aria-label="Seek" />
      </div>
    </div>

    ${demo.source ? `<details class="source"><summary>View the HTML</summary><pre><code></code></pre></details>` : ""}
  `;

  if (demo.source) {
    // textContent, so the markup shows as code instead of being parsed.
    mountEl.querySelector(".source code").textContent = demo.source;
  }

  const stageHost = mountEl.querySelector(".stage");
  const seek = mountEl.querySelector(".seek");
  const playBtn = mountEl.querySelector(".play-btn");
  const exportBtn = mountEl.querySelector(".export-btn");
  const status = mountEl.querySelector(".status");
  const playhead = mountEl.querySelector(".playhead");
  const timeCur = mountEl.querySelector(".time-cur");
  const chapterEls = [...mountEl.querySelectorAll(".chapter")];

  // A demo is either canvas-backed (buildRuntime renders into the stage canvas)
  // or element-backed (a live <w-composition>; the DOM itself is the preview and
  // rasterization only happens on export).
  let preview;
  if (created.element) {
    const el = created.element;
    el.classList.add("stage-element");
    // The element scales itself to its own width, so the shell's width decides
    // the stage size. Sized in JS: deriving width from height via aspect-ratio
    // inside a flex item is not portable (WebKit resolves it to zero).
    const shell = document.createElement("div");
    shell.className = "stage-shell";
    shell.appendChild(el);
    stageHost.replaceWith(shell);

    const frameEl = shell.parentElement;
    const fitShell = () => {
      const cs = getComputedStyle(frameEl);
      const availW = frameEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = frameEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const w = Math.min(availW, (availH * composition.width) / composition.height);
      shell.style.width = `${Math.max(0, Math.floor(w))}px`;
    };
    fitShell();
    const shellObserver = new ResizeObserver(fitShell);
    shellObserver.observe(frameEl);

    preview = {
      // Setup is deferred to a frame after connect, so wait before seeking.
      renderFrame: async (frame) => {
        await el.ready;
        el.seek(frame);
      },
      destroy: () => {
        shellObserver.disconnect();
        shell.remove();
      },
    };
  } else {
    stageHost.width = composition.width;
    stageHost.height = composition.height;
    stageHost.style.aspectRatio = `${composition.width} / ${composition.height}`;
    preview = created.buildRuntime(stageHost);
  }

  let disposed = false;
  let playing = false;
  let rafId = 0;
  let rafFrame = 0;
  let objectUrl = null;

  function updateTransport(frame) {
    const pct = lastFrame > 0 ? (frame / lastFrame) * 100 : 0;
    seek.value = String(frame);
    playhead.style.left = `${pct}%`;
    timeCur.textContent = formatTime(frame, composition.fps);
    for (const el of chapterEls) {
      const i = Number(el.dataset.index);
      const ch = chapters[i];
      el.classList.toggle("active", frame >= ch.from && frame < ch.to);
    }
  }

  async function drawFrame(frame) {
    if (disposed) return;
    await preview.renderFrame(frame);
    if (disposed) return;
    updateTransport(frame);
  }

  function setPlaying(next) {
    playing = next;
    playBtn.innerHTML = next ? PAUSE_ICON : PLAY_ICON;
    playBtn.setAttribute("aria-label", next ? "Pause" : "Play");
    playBtn.classList.toggle("is-playing", next);
  }

  function stop() {
    setPlaying(false);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // Render one frame fully before scheduling the next. Rasterization is async
  // (the HTML backend awaits an SVG image load), so firing frames without
  // awaiting would let a new frame's clear run before the previous draw lands.
  async function tick() {
    if (!playing || disposed) return;
    try {
      await drawFrame(rafFrame);
    } catch (err) {
      console.error(err);
    }
    if (!playing || disposed) return;
    rafFrame = rafFrame >= lastFrame ? 0 : rafFrame + 1;
    rafId = requestAnimationFrame(tick);
  }

  seek.addEventListener("input", () => {
    stop();
    drawFrame(Number(seek.value));
  });

  playBtn.addEventListener("click", () => {
    if (playing) {
      stop();
      return;
    }
    setPlaying(true);
    rafFrame = Number(seek.value) >= lastFrame ? 0 : Number(seek.value);
    tick();
  });

  for (const el of chapterEls) {
    el.addEventListener("click", () => {
      stop();
      drawFrame(Number(el.dataset.from));
    });
  }

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
    stop();
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

  // Show a representative poster frame on load, not a blank first frame.
  drawFrame(posterFrame);

  return {
    destroy() {
      disposed = true;
      stop();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      preview.destroy();
      mountEl.innerHTML = "";
    },
  };
}
