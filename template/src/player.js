// The preview shell: a live <w-composition>, a scrub timeline built from the
// scene's own structure, and in-browser MP4 export.
//
// This is a transport written for authoring rather than for watching. The
// chapter strip is a projection of the `label` attributes on your top-level
// <w-sequence> beats, and the lane beneath the track is the <w-audio> clips,
// both read straight off the composition. Nothing here is a track list you
// have to keep in sync; edit the scene and the timeline follows.
//
// You normally never need to touch this file. Author your video in
// src/scene.js.
import "@superhq/webmotion/elements";

const BITRATE = 8_000_000;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const basename = (src) => src.split("/").pop().split("?")[0];

function timecode(frame, fps) {
  const total = frame / fps;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, "0")}.${String(frame % fps).padStart(2, "0")}`;
}

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
  const comp = buildComposition(config, scene);
  const { fps, duration } = config;
  const last = duration - 1;
  const pct = (frame) => (frame / last) * 100;

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

    <div class="stage"><div class="frame"></div></div>

    <div class="timeline">
      <div class="chapters"></div>
      <div class="track" role="slider" tabindex="0" aria-label="Scrub the composition"
           aria-valuemin="0" aria-valuemax="${last}" aria-valuenow="0">
        <div class="track-line"></div>
        <div class="track-played"></div>
        <div class="track-marks"></div>
        <div class="track-head"></div>
      </div>
      <div class="lane"></div>
    </div>

    <div class="controls">
      <button class="play" aria-label="Play or pause">
        <svg class="i-play" viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
          <path fill="currentColor" d="M3 1.5 10.5 6 3 10.5z"/>
        </svg>
        <svg class="i-pause off" viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
          <path fill="currentColor" d="M2 1.5h2.6v9H2zM7.4 1.5H10v9H7.4z"/>
        </svg>
      </button>
      <span class="time"></span>
      <span class="frames"></span>
      <span class="chapter-now"></span>
      <button class="mute" aria-label="Toggle sound">
        <svg class="i-muted" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                d="M2.5 6h2l3-2.5v9L4.5 10h-2zM10.5 6.5l3 3m0-3-3 3"/>
        </svg>
        <svg class="i-sound off" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                d="M2.5 6h2l3-2.5v9L4.5 10h-2zM10.3 5.8a3 3 0 0 1 0 4.4M12.4 4a5.6 5.6 0 0 1 0 8"/>
        </svg>
      </button>
      <button class="full" aria-label="Fullscreen">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                d="M2 6V2.5h3.5M14 6V2.5h-3.5M2 10v3.5h3.5M14 10v3.5h-3.5"/>
        </svg>
      </button>
    </div>

    <div class="result" hidden></div>
  `;

  const $ = (sel) => mountEl.querySelector(sel);
  const stage = $(".stage");
  const track = $(".track");
  const played = $(".track-played");
  const head = $(".track-head");
  const marks = $(".track-marks");
  const chapters = $(".chapters");
  const lane = $(".lane");
  const playBtn = $(".play");
  const muteBtn = $(".mute");
  const timeEl = $(".time");
  const framesEl = $(".frames");
  const chapterNow = $(".chapter-now");
  const exportBtn = $(".export-btn");
  const status = $(".status");
  const progress = $(".progress");
  const progressFill = $(".progress span");
  const result = $(".result");

  $(".spec").textContent =
    `${config.width} × ${config.height} · ${fps} fps · ${duration} frames · ` +
    `${(duration / fps).toFixed(1)}s`;

  $(".frame").appendChild(comp);

  let disposed = false;
  let objectUrl = null;
  let encoding = false;
  let sections = [];

  /* Timeline, drawn from the scene ---------------------------------------- */

  function drawTimeline() {
    // Top-level labelled beats become the chapter strip; the scene is the
    // single source of truth, so this survives any edit to it.
    sections = comp.sections().filter((s) => s.depth === 0);
    if (!sections.length && config.chapters?.length) {
      sections = config.chapters.map((c, i) => ({
        label: c.label,
        from: c.from,
        to: config.chapters[i + 1]?.from ?? duration,
      }));
    }

    chapters.innerHTML = "";
    marks.innerHTML = "";
    for (const s of sections) {
      const cell = document.createElement("button");
      cell.className = "chapter";
      cell.style.left = `${(s.from / duration) * 100}%`;
      cell.style.width = `${((s.to - s.from) / duration) * 100}%`;
      cell.title = `${s.label} · frame ${s.from}`;
      cell.textContent = s.label;
      cell.addEventListener("click", () => seek(s.from));
      chapters.appendChild(cell);

      if (s.from > 0) {
        const tick = document.createElement("i");
        tick.style.left = `${(s.from / duration) * 100}%`;
        marks.appendChild(tick);
      }
    }
    chapters.hidden = sections.length === 0;

    lane.innerHTML = "";
    const clips = comp.audioClips();
    for (const clip of clips) {
      const to = Number.isFinite(clip.endFrame) ? clip.endFrame : duration;
      const bar = document.createElement("span");
      bar.className = "clip";
      bar.style.left = `${(clip.startFrame / duration) * 100}%`;
      bar.style.width = `${((to - clip.startFrame) / duration) * 100}%`;
      bar.textContent = basename(clip.src);
      lane.appendChild(bar);
    }
    lane.hidden = clips.length === 0;
  }

  function paint(frame) {
    played.style.width = `${pct(frame)}%`;
    head.style.left = `${pct(frame)}%`;
    timeEl.textContent = `${timecode(frame, fps)} / ${timecode(last, fps)}`;
    framesEl.textContent = `frame ${String(frame).padStart(3, "0")} / ${last}`;
    track.setAttribute("aria-valuenow", String(frame));
    const here = sections.findLast?.((s) => frame >= s.from) ?? null;
    chapterNow.textContent = here ? here.label : "";
    for (const [i, cell] of [...chapters.children].entries()) {
      cell.classList.toggle("on", sections[i] === here);
    }
  }

  const seek = (frame) => comp.seek(clamp(Math.round(frame), 0, last));

  comp.addEventListener("w-seek", (e) => paint(e.detail.frame));
  // Toggled by class, not by the `hidden` attribute: browsers do not honour
  // `hidden` on elements in the SVG namespace the way they do on HTML ones,
  // so both glyphs render at once.
  const showIcon = (el, on) => el.classList.toggle("off", !on);

  const paintTransport = () => {
    showIcon(playBtn.querySelector(".i-play"), !comp.playing);
    showIcon(playBtn.querySelector(".i-pause"), comp.playing);
    showIcon(muteBtn.querySelector(".i-sound"), !comp.muted);
    showIcon(muteBtn.querySelector(".i-muted"), comp.muted);
  };

  comp.addEventListener("w-play", paintTransport);
  comp.addEventListener("w-pause", paintTransport);
  comp.addEventListener("w-volumechange", paintTransport);

  comp.ready.then(() => {
    if (disposed) return;
    drawTimeline();
    paintTransport();
    paint(comp.currentFrame ?? 0);
  });

  /* Transport -------------------------------------------------------------- */

  playBtn.addEventListener("click", () => (comp.playing ? comp.pause() : comp.play()));
  muteBtn.addEventListener("click", () => {
    comp.muted = !comp.muted;
  });
  $(".full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  });

  // Drag anywhere on the track. Pointer events are bound to the window, so a
  // drag released outside the track still ends rather than latching on.
  let scrubbing = false;
  let resumeAfter = false;

  const frameAt = (clientX) => {
    const r = track.getBoundingClientRect();
    return clamp(Math.round(((clientX - r.left) / (r.width || 1)) * last), 0, last);
  };
  const endScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    if (resumeAfter && !encoding) comp.play();
  };

  track.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    resumeAfter = comp.playing;
    comp.pause();
    seek(frameAt(e.clientX));
    e.preventDefault();
  });
  addEventListener("pointermove", (e) => {
    if (!scrubbing) return;
    if (e.buttons === 0) return endScrub();
    seek(frameAt(e.clientX));
  });
  addEventListener("pointerup", endScrub);
  addEventListener("pointercancel", endScrub);

  const onKey = (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === " ") comp.playing ? comp.pause() : comp.play();
    else if (e.key === "ArrowRight") (comp.pause(), seek(comp.currentFrame + step));
    else if (e.key === "ArrowLeft") (comp.pause(), seek(comp.currentFrame - step));
    else if (e.key === "Home") seek(0);
    else if (e.key === "End") seek(last);
    else if (e.key === "m") comp.muted = !comp.muted;
    else if (e.key === "f") $(".full").click();
    else return;
    e.preventDefault();
  };
  addEventListener("keydown", onKey);

  /* Export ----------------------------------------------------------------- */

  if (typeof VideoEncoder === "undefined") {
    exportBtn.disabled = true;
    exportBtn.textContent = "Export needs Chromium";
  }

  exportBtn.addEventListener("click", async () => {
    comp.pause();
    encoding = true;
    exportBtn.disabled = true;
    exportBtn.textContent = "Encoding";
    result.hidden = true;
    progressFill.style.width = "0%";
    progress.hidden = false;

    const startedAt = performance.now();
    const resumeFrame = comp.currentFrame ?? 0;
    try {
      const blob = await comp.export({
        bitrate: BITRATE,
        onProgress: ({ frame, total }) => {
          if (disposed) return;
          progressFill.style.width = `${(frame / total) * 100}%`;
          // The exporter drives frames itself and fires no w-seek, so move the
          // playhead from here rather than letting the two disagree.
          paint(frame);
          const rate = frame / ((performance.now() - startedAt) / 1000);
          status.textContent = `${frame} / ${total} · ${Math.round(rate)} fps`;
        },
      });
      if (disposed) return;

      const secs = (performance.now() - startedAt) / 1000;
      const rate = Math.round(duration / secs);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);

      status.textContent = "";
      const stats = document.createElement("span");
      stats.textContent =
        `${duration} frames · ${secs.toFixed(1)}s · ${rate} fps · ` +
        `${(rate / fps).toFixed(1)}× realtime`;
      const link = document.createElement("a");
      link.className = "dl";
      link.href = objectUrl;
      link.download = config.downloadName || "video.mp4";
      link.textContent = `Download · ${(blob.size / 1048576).toFixed(1)} MB`;
      result.replaceChildren(stats, link);
      result.hidden = false;
    } catch (err) {
      console.error(err);
      status.textContent = `export failed: ${err.message}`;
    } finally {
      encoding = false;
      if (!disposed) {
        comp.seek(resumeFrame);
        progress.hidden = true;
        exportBtn.disabled = false;
        exportBtn.textContent = "Export MP4";
      }
    }
  });

  return {
    destroy() {
      disposed = true;
      comp.pause();
      removeEventListener("keydown", onKey);
      removeEventListener("pointermove", endScrub);
      removeEventListener("pointerup", endScrub);
      removeEventListener("pointercancel", endScrub);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      mountEl.innerHTML = "";
    },
  };
}
