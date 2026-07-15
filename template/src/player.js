// A small player around one <w-composition>: live preview, a zoomable scrub
// timeline with section labels and an audio lane, play/pause, and in-browser
// MP4 export. You normally never need to touch this file; author your video in
// src/scene.js. The composition is the source of truth; the transport just seeks
// it and follows w-seek events.
import "@superhq/webmotion/elements";

const BITRATE = 8_000_000;
const ZOOM_STEP = 1.6;
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>`;

// Elements the frame walk never descends into (definitions, macros, tweens).
// <w-audio> is inert too but we read it explicitly for the audio lane.
const INERT = new Set(["W-DEFS", "W-ANIMATION", "W-ANIMATE", "W-FOR", "W-DATA", "W-IF"]);

const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

function formatTime(frame, fps) {
  const total = Math.round(frame / fps);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Walk the authored markup the way the frame clock does, resolving sequence
// timing, to collect labelled sections (for the chapter track) and audio clips
// (for the audio lane) in absolute composition frames. Mirrors the library's
// own audio timing (see collectAudioClips in the WebMotion source).
function scanTimeline(root, durationInFrames) {
  const sections = [];
  const audio = [];

  function walk(container, base, windowEnd) {
    for (const child of container.children) {
      const tag = child.tagName;
      if (tag === "W-SEQUENCE") {
        const from = base + num(child.getAttribute("from"), 0);
        const durAttr = child.getAttribute("duration");
        const to = durAttr == null ? windowEnd : Math.min(windowEnd, from + num(durAttr, 0));
        const label = child.getAttribute("label");
        if (label) sections.push({ label, from, to });
        walk(child, from, to);
        continue;
      }
      if (tag === "W-AUDIO") {
        const src = child.getAttribute("src");
        if (src) {
          const from = base + num(child.getAttribute("from"), 0);
          const durAttr = child.getAttribute("duration");
          const to = durAttr == null ? windowEnd : Math.min(windowEnd, from + num(durAttr, 0));
          if (to > from) audio.push({ src, from, to });
        }
        continue;
      }
      if (INERT.has(tag)) continue;
      walk(child, base, windowEnd);
    }
  }

  walk(root, 0, durationInFrames);
  return { sections, audio };
}

// Turn section boundaries (or config chapters) into contiguous track segments.
// Sections' start frames are the boundaries; the first segment always starts at
// 0 so the track reads full. No labels yields one plain full-length segment.
function resolveChapters(sections, configChapters, durationInFrames) {
  let marks;
  if (sections.length) {
    marks = [...sections].sort((a, b) => a.from - b.from).map((s) => ({ label: s.label, from: s.from }));
  } else if (configChapters && configChapters.length) {
    marks = configChapters.map((c) => ({ label: c.label ?? "", from: c.from ?? 0 }));
  } else {
    marks = [{ label: "", from: 0 }];
  }
  marks[0].from = 0; // the track fills from the start regardless of the first cue
  return marks.map((ch, i) => {
    const to = i < marks.length - 1 ? marks[i + 1].from : durationInFrames;
    return { label: ch.label, from: ch.from, to, span: Math.max(1, to - ch.from) };
  });
}

const basename = (src) => src.split("/").pop().split("?")[0];

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
  const { fps, width, height } = config;
  const durationInFrames = config.duration;
  const lastFrame = durationInFrames - 1;

  // Scan the authored markup now, before connect: hand-written section labels
  // and audio clips are already in the light DOM.
  const { sections, audio } = scanTimeline(element, durationInFrames);
  const chapters = resolveChapters(sections, config.chapters, durationInFrames);
  const labelled = chapters.some((ch) => ch.label);

  const pct = (frame) =>
    lastFrame > 0 ? Math.max(0, Math.min(100, (frame / lastFrame) * 100)) : 0;

  const chapterMarkup = chapters
    .map(
      (ch, i) =>
        `<button class="chapter${labelled ? "" : " chapter--plain"}" style="flex-grow:${ch.span}" data-index="${i}" tabindex="-1">
          <span class="chapter-label">${ch.label}</span>
        </button>`,
    )
    .join("");

  const audioMarkup = audio.length
    ? `<div class="audio-lane">${audio
        .map(
          (clip) =>
            `<div class="audio-clip" style="left:${pct(clip.from)}%;width:${pct(clip.to) - pct(clip.from)}%">
              <span class="audio-name">${basename(clip.src)}</span>
            </div>`,
        )
        .join("")}</div>`
    : "";

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

    <div class="stage-frame"><div class="stage-shell"></div></div>

    <div class="controls">
      <button class="play-btn" aria-label="Play">${PLAY_ICON}</button>
      <div class="time"><span class="time-cur">0:00</span><span class="time-sep">/</span><span class="time-dur">${formatTime(lastFrame, fps)}</span></div>
      <div class="timeline-scroll">
        <div class="timeline-inner">
          <div class="track${labelled ? "" : " track--plain"}">
            <div class="chapters">${chapterMarkup}</div>
            ${audioMarkup}
          </div>
          <div class="playhead"></div>
          <input class="seek" type="range" min="0" max="${lastFrame}" step="1" value="0" aria-label="Seek" />
        </div>
      </div>
      <div class="zoom">
        <button class="zoom-btn zoom-out" aria-label="Zoom out">&minus;</button>
        <span class="zoom-level">1.0&times;</span>
        <button class="zoom-btn zoom-in" aria-label="Zoom in">+</button>
      </div>
    </div>
  `;

  const shell = mountEl.querySelector(".stage-shell");
  const frameEl = shell.parentElement;
  const seek = mountEl.querySelector(".seek");
  const playBtn = mountEl.querySelector(".play-btn");
  const exportBtn = mountEl.querySelector(".export-btn");
  const status = mountEl.querySelector(".status");
  const playhead = mountEl.querySelector(".playhead");
  const timeCur = mountEl.querySelector(".time-cur");
  const scroll = mountEl.querySelector(".timeline-scroll");
  const inner = mountEl.querySelector(".timeline-inner");
  const zoomLevel = mountEl.querySelector(".zoom-level");
  const zoomIn = mountEl.querySelector(".zoom-in");
  const zoomOut = mountEl.querySelector(".zoom-out");
  const chapterEls = [...mountEl.querySelectorAll(".chapter")];

  // The element scales itself to its own width, so the shell's width decides the
  // stage size. Sized in JS: deriving width from height via aspect-ratio inside a
  // flex item is not portable (WebKit resolves it to zero).
  element.classList.add("stage-element");
  shell.appendChild(element);
  const fitShell = () => {
    const cs = getComputedStyle(frameEl);
    const availW = frameEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = frameEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const w = Math.min(availW, (availH * width) / height);
    shell.style.width = `${Math.max(0, Math.floor(w))}px`;
  };
  fitShell();
  const shellObserver = new ResizeObserver(fitShell);
  shellObserver.observe(frameEl);

  let disposed = false;
  let playing = false;
  let zoom = 1;
  let objectUrl = null;

  // Zoom widens the timeline past its viewport and lets it scroll horizontally,
  // so long videos stay scrubbable frame by frame.
  function applyZoom() {
    inner.style.width = `${zoom * 100}%`;
    zoomLevel.textContent = `${zoom.toFixed(1)}×`;
    zoomOut.disabled = zoom <= ZOOM_MIN + 1e-6;
    zoomIn.disabled = zoom >= ZOOM_MAX - 1e-6;
    followPlayhead(Number(seek.value));
  }

  // Keep the playhead on screen while playing a zoomed-in timeline. Nudge only
  // as far as the near edge, so the view then glides under a playhead pinned at
  // the margin instead of lurching half a screen on every crossing.
  function followPlayhead(frame) {
    if (zoom <= 1) return;
    const x = (pct(frame) / 100) * inner.clientWidth;
    const margin = 40;
    if (x < scroll.scrollLeft + margin) {
      scroll.scrollLeft = x - margin;
    } else if (x > scroll.scrollLeft + scroll.clientWidth - margin) {
      scroll.scrollLeft = x - scroll.clientWidth + margin;
    }
  }

  function updateTransport(frame) {
    seek.value = String(frame);
    playhead.style.left = `${pct(frame)}%`;
    timeCur.textContent = formatTime(frame, fps);
    for (const el of chapterEls) {
      const ch = chapters[Number(el.dataset.index)];
      el.classList.toggle("active", frame >= ch.from && frame < ch.to);
    }
    followPlayhead(frame);
  }

  async function drawFrame(frame) {
    if (disposed) return;
    await element.ready; // setup is deferred one frame after connect
    if (disposed) return;
    element.seek(frame);
    updateTransport(frame);
  }

  function setPlaying(next) {
    playing = next;
    playBtn.innerHTML = next ? PAUSE_ICON : PLAY_ICON;
    playBtn.setAttribute("aria-label", next ? "Pause" : "Play");
    playBtn.classList.toggle("is-playing", next);
  }

  function stop() {
    element.pause();
    setPlaying(false);
  }

  // The composition drives its own playback clock (audio-aware) and loops at the
  // end; the transport just follows along through w-seek events.
  element.addEventListener("w-seek", (e) => {
    if (!disposed) updateTransport(e.detail.frame);
  });

  seek.addEventListener("input", () => {
    stop();
    drawFrame(Number(seek.value));
  });

  playBtn.addEventListener("click", async () => {
    await element.ready;
    if (playing) {
      stop();
      return;
    }
    if (Number(seek.value) >= lastFrame) element.seek(0);
    element.play();
    setPlaying(true);
  });

  zoomIn.addEventListener("click", () => {
    zoom = Math.min(ZOOM_MAX, zoom * ZOOM_STEP);
    applyZoom();
  });
  zoomOut.addEventListener("click", () => {
    zoom = Math.max(ZOOM_MIN, zoom / ZOOM_STEP);
    applyZoom();
  });

  exportBtn.addEventListener("click", async () => {
    stop();
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

  applyZoom();
  drawFrame(0);

  return {
    destroy() {
      disposed = true;
      element.pause();
      shellObserver.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      mountEl.innerHTML = "";
    },
  };
}
