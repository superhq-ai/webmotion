// The preview shell: a live <w-composition>, a scrub timeline built from the
// scene's own structure, and in-browser MP4 export.
//
// The timeline is a projection of the scene, not a track list you maintain.
// The chapter strip is the `label` on your top-level <w-sequence> beats and the
// lane beneath it is your <w-audio> clips, both read off the composition, so
// they follow whatever you edit.
//
// You normally never need to touch this file. Author your video in
// src/scene.js.
import "@superhq/webmotion/elements";

const BITRATE = 8_000_000;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const basename = (src) => src.split("/").pop().split("?")[0];

function timecode(frame, fps) {
  const total = frame / fps;
  return (
    `${Math.floor(total / 60)}:` +
    `${String(Math.floor(total % 60)).padStart(2, "0")}.` +
    `${String(frame % fps).padStart(2, "0")}`
  );
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
      <span class="brand">
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path d="M4.5 20L7.5 4M10.5 20L13.5 4M16.5 20L19.5 4"
                stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        </svg>
        WebMotion
      </span>
    </header>

    <div class="frame"><div class="fit"></div></div>

    <div class="chapters"></div>

    <div class="track" role="slider" tabindex="0" aria-label="Scrub the composition"
         aria-valuemin="0" aria-valuemax="${last}" aria-valuenow="0">
      <div class="played"></div>
      <div class="encoded" hidden></div>
      <div class="marks"></div>
      <div class="knob"></div>
    </div>

    <div class="lane"></div>

    <div class="controls">
      <button class="play" aria-label="Play or pause">
        <svg class="i-play" viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
          <path fill="currentColor" d="M3 1.5 10.5 6 3 10.5z"/>
        </svg>
        <svg class="i-pause off" viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
          <path fill="currentColor" d="M2 1.5h2.6v9H2zM7.4 1.5H10v9H7.4z"/>
        </svg>
      </button>
      <button class="mute" aria-label="Toggle sound">
        <svg class="i-sound" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                d="M2.5 6h2l3-2.5v9L4.5 10h-2zM10.3 5.8a3 3 0 0 1 0 4.4M12.4 4a5.6 5.6 0 0 1 0 8"/>
        </svg>
        <svg class="i-muted off" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                d="M2.5 6h2l3-2.5v9L4.5 10h-2zM10.5 6.5l3 3m0-3-3 3"/>
        </svg>
      </button>
      <span class="time"></span>
      <span class="readout"></span>
      <button class="full" aria-label="Fullscreen">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"
                d="M2 6V2.5h3.5M14 6V2.5h-3.5M2 10v3.5h3.5M14 10v3.5h-3.5"/>
        </svg>
      </button>
      <button class="export-btn">Export MP4</button>
    </div>

    <div class="result" hidden></div>
  `;

  const $ = (sel) => mountEl.querySelector(sel);
  const frameEl = $(".frame");
  const fitEl = $(".fit");
  const frame = $(".frame");
  const track = $(".track");
  const played = $(".played");
  const encoded = $(".encoded");
  const knob = $(".knob");
  const marks = $(".marks");
  const chapters = $(".chapters");
  const lane = $(".lane");
  const playBtn = $(".play");
  const muteBtn = $(".mute");
  const exportBtn = $(".export-btn");
  const readout = $(".readout");
  const result = $(".result");

  fitEl.appendChild(comp);

  let disposed = false;
  let objectUrl = null;
  let encoding = false;
  let sections = [];

  /* Fit ------------------------------------------------------------------- */

  // Sized here rather than in css. The composition writes its own height from
  // whatever width it is given, so a max-height on the wrapper does not hold it
  // back: the only reliable lever is the width, worked out from the space that
  // is actually left.
  const ratio = config.width / config.height;

  function fit() {
    const box = frameEl.getBoundingClientRect();
    let w = box.width;
    if (w / ratio > box.height) w = box.height * ratio;
    fitEl.style.width = `${Math.floor(w)}px`;
  }

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  ro?.observe(frameEl);
  addEventListener("resize", fit);
  fit();

  /* Timeline, drawn from the scene ----------------------------------------- */

  // Beats are allowed to overlap: a scene commonly runs one out under the next.
  // Two slabs on one row would just collide and read as a rendering fault, so
  // each block takes the first row it fits on and the lane grows to suit. With
  // nothing overlapping this is a single row, which is the usual case.
  const ROW_H = 17;

  function layoutRows(blocks, laneEl) {
    const ends = [];
    for (const b of blocks) {
      let row = ends.findIndex((end) => b.from >= end);
      if (row === -1) row = ends.push(b.to) - 1;
      else ends[row] = b.to;
      b.el.style.top = `${3 + row * ROW_H}px`;
    }
    laneEl.style.height = `${Math.max(1, ends.length) * ROW_H + 3}px`;
  }

  function drawTimeline() {
    sections = comp.sections().filter((s) => s.depth === 0);
    if (!sections.length && config.chapters?.length) {
      sections = config.chapters.map((c, i) => ({
        label: c.label,
        from: c.from,
        to: config.chapters[i + 1]?.from ?? duration,
      }));
    }

    chapters.replaceChildren();
    marks.replaceChildren();
    const chapterBlocks = [];
    for (const s of sections) {
      const cell = document.createElement("button");
      cell.className = "chapter";
      cell.style.left = `${(s.from / duration) * 100}%`;
      // Two pixels short of its span, so neighbouring slabs sit apart.
      cell.style.width = `calc(${((s.to - s.from) / duration) * 100}% - 2px)`;
      cell.title = `${s.label} · frame ${s.from}`;
      cell.textContent = s.label;
      cell.addEventListener("click", () => seek(s.from));
      chapters.appendChild(cell);
      chapterBlocks.push({ from: s.from, to: s.to, el: cell });

      if (s.from > 0) {
        const tick = document.createElement("i");
        tick.style.left = `${(s.from / duration) * 100}%`;
        marks.appendChild(tick);
      }
    }
    chapters.hidden = sections.length === 0;
    layoutRows(chapterBlocks, chapters);

    const clips = comp.audioClips();
    lane.replaceChildren();
    const clipBlocks = [];
    for (const clip of clips) {
      const to = Number.isFinite(clip.endFrame) ? clip.endFrame : duration;
      const bar = document.createElement("span");
      bar.className = "clip";
      bar.style.left = `${(clip.startFrame / duration) * 100}%`;
      bar.style.width = `calc(${((to - clip.startFrame) / duration) * 100}% - 2px)`;
      bar.textContent = basename(clip.src);
      lane.appendChild(bar);
      clipBlocks.push({ from: clip.startFrame, to, el: bar });
    }
    lane.hidden = clips.length === 0;
    layoutRows(clipBlocks, lane);
  }

  function paint(f) {
    played.style.width = `${pct(f)}%`;
    knob.style.left = `${pct(f)}%`;
    $(".time").textContent = `${timecode(f, fps)} / ${timecode(last, fps)}`;
    $(".readout").textContent = `frame ${String(f).padStart(3, "0")} / ${last}`;
    track.setAttribute("aria-valuenow", String(f));

    // Which beat we are in is shown by the chapter strip lighting up; saying it
    // again in the control row would just be the same word twice.
    let here = null;
    for (const s of sections) if (f >= s.from) here = s;
    for (const [i, cell] of [...chapters.children].entries()) {
      cell.classList.toggle("on", sections[i] === here);
    }
  }

  // Icons swap by class: browsers do not honour the hidden attribute on
  // elements in the svg namespace, so both glyphs would render at once.
  function paintTransport() {
    playBtn.querySelector(".i-play").classList.toggle("off", comp.playing);
    playBtn.querySelector(".i-pause").classList.toggle("off", !comp.playing);
    muteBtn.querySelector(".i-sound").classList.toggle("off", comp.muted);
    muteBtn.querySelector(".i-muted").classList.toggle("off", !comp.muted);
  }

  const seek = (f) => comp.seek(clamp(Math.round(f), 0, last));

  comp.addEventListener("w-seek", (e) => paint(e.detail.frame));
  comp.addEventListener("w-play", paintTransport);
  comp.addEventListener("w-pause", paintTransport);
  comp.addEventListener("w-volumechange", paintTransport);

  comp.ready.then(() => {
    if (disposed) return;
    drawTimeline();
    paintTransport();
    paint(comp.currentFrame ?? 0);
    fit();
  });

  /* Transport -------------------------------------------------------------- */

  playBtn.addEventListener("click", () => (comp.playing ? comp.pause() : comp.play()));
  muteBtn.addEventListener("click", () => {
    comp.muted = !comp.muted;
  });
  // The whole player goes fullscreen, not just the picture. Fullscreening the
  // frame alone leaves the timeline and the controls outside the fullscreen
  // element, so they simply are not on screen to be used.
  $(".full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else mountEl.requestFullscreen?.();
  });

  // The picture has to be re-fitted on the way in and out.
  const onFullscreen = () => requestAnimationFrame(fit);
  document.addEventListener("fullscreenchange", onFullscreen);

  // Pointer handlers live on the window: a drag released off the track would
  // otherwise never end, leaving every later hover seeking the film.
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
  const onMove = (e) => {
    if (!scrubbing) return;
    if (e.buttons === 0) return endScrub();
    seek(frameAt(e.clientX));
  };

  track.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    resumeAfter = comp.playing;
    comp.pause();
    seek(frameAt(e.clientX));
    e.preventDefault();
  });
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", endScrub);
  addEventListener("pointercancel", endScrub);

  const onKey = (e) => {
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

  /* Export ------------------------------------------------------------------ */

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
    encoded.style.width = "0%";
    encoded.hidden = false;

    const startedAt = performance.now();
    const resumeFrame = comp.currentFrame ?? 0;
    try {
      const blob = await comp.export({
        bitrate: BITRATE,
        onProgress: ({ frame: f, total }) => {
          if (disposed) return;
          encoded.style.width = `${(f / total) * 100}%`;
          // The exporter drives frames itself and fires no w-seek, so move the
          // playhead from here rather than letting the two disagree.
          paint(f);
          const rate = f / ((performance.now() - startedAt) / 1000);
          readout.textContent = `${f} / ${total} · ${Math.round(rate)} fps`;
        },
      });
      if (disposed) return;

      const secs = (performance.now() - startedAt) / 1000;
      const rate = Math.round(duration / secs);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);

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
      readout.textContent = `export failed: ${err.message}`;
    } finally {
      encoding = false;
      if (!disposed) {
        comp.seek(resumeFrame);
        encoded.hidden = true;
        exportBtn.disabled = false;
        exportBtn.textContent = "Export MP4";
      }
    }
  });

  return {
    destroy() {
      disposed = true;
      comp.pause();
      ro?.disconnect();
      removeEventListener("resize", fit);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", endScrub);
      removeEventListener("pointercancel", endScrub);
      removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      mountEl.innerHTML = "";
    },
  };
}
