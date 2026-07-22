// The hero player: a composition, a scrub track you can drag anywhere, and an
// export that really runs. Nothing here is a mockup, which is the point.

import { createHero } from "../scenes/hero.js";
import { HERO } from "../scenes/meta.js";

const BITRATE = 6_000_000;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const el = (id) => document.getElementById(id);

export function mountStage() {
  const mount = el("stage-mount");
  if (!mount) return;

  const comp = createHero();
  mount.replaceChildren(comp);

  const track = el("stage-track");
  const played = el("stage-played");
  const encoded = el("stage-encoded");
  const knob = el("stage-knob");
  const playBtn = el("stage-play");
  const time = el("stage-time");
  const readout = el("stage-readout");
  const exportBtn = el("stage-export");
  const result = el("stage-result");

  const last = HERO.duration - 1;
  const clamp = (n) => Math.max(0, Math.min(last, n));

  const muteBtn = el("stage-mute");

  function paintSound() {
    const on = !comp.muted;
    muteBtn?.querySelector(".i-sound")?.classList.toggle("hidden", !on);
    muteBtn?.querySelector(".i-muted")?.classList.toggle("hidden", on);
    muteBtn?.setAttribute("aria-pressed", String(on));
  }

  comp.ready.then(() => {
    // Silent to begin with: the film plays on its own, and a page that starts
    // making noise is a page people close. Unmuting is also the gesture the
    // browser needs before it will let an AudioContext run.
    comp.muted = true;
    paintSound();
    paint(comp.currentFrame ?? 0);
    if (!reduceMotion) observeVisibility();
  });

  muteBtn?.addEventListener("click", () => {
    comp.muted = !comp.muted;
    paintSound();
  });
  comp.addEventListener("w-volumechange", paintSound);

  /* Transport ------------------------------------------------------------- */

  function fmt(frame) {
    const total = frame / HERO.fps;
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const f = frame % HERO.fps;
    return `${m}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
  }

  function paint(frame) {
    const pct = (frame / last) * 100;
    played.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    time.textContent = fmt(frame);
    track.setAttribute("aria-valuenow", String(frame));
    track.setAttribute("aria-valuetext", `frame ${frame} of ${last}`);
    if (!encoding) readout.textContent = `frame ${String(frame).padStart(3, "0")} / ${last}`;
  }

  comp.addEventListener("w-seek", (e) => paint(e.detail.frame));
  comp.addEventListener("w-play", () => playBtn.setAttribute("data-playing", "true"));
  comp.addEventListener("w-pause", () => playBtn.removeAttribute("data-playing"));

  playBtn.addEventListener("click", () => {
    if (comp.playing) {
      comp.pause();
      userPaused = true;
    } else {
      comp.play();
      userPaused = false;
    }
  });

  /* Scrubbing ------------------------------------------------------------- */

  // Drag anywhere on the track. The frame follows the pointer with no
  // debouncing or thumbnail preview, because seeking is already exact.
  let scrubbing = false;
  let resumeAfterScrub = false;

  const frameAt = (clientX) => {
    const r = track.getBoundingClientRect();
    const t = r.width === 0 ? 0 : (clientX - r.left) / r.width;
    return clamp(Math.round(t * last));
  };

  const endScrub = (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    try {
      if (e && track.hasPointerCapture?.(e.pointerId)) track.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    if (resumeAfterScrub && !encoding) comp.play();
  };

  track.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    resumeAfterScrub = comp.playing;
    try {
      track.setPointerCapture(e.pointerId);
    } catch {
      // Capture only retargets events; the window listeners below are what
      // actually guarantee the drag ends, so losing it is survivable.
    }
    comp.pause();
    comp.seek(frameAt(e.clientX));
    e.preventDefault();
  });

  // Bound to the window rather than the track. A drag that leaves the track and
  // is released outside it would otherwise never deliver its pointerup here,
  // leaving `scrubbing` latched on so every later hover seeked the film.
  addEventListener("pointermove", (e) => {
    if (!scrubbing) return;
    // A move with no button held means the release happened somewhere we never
    // heard about. Treat it as the end of the drag rather than following it.
    if (e.buttons === 0) {
      endScrub(e);
      return;
    }
    comp.seek(frameAt(e.clientX));
  });
  addEventListener("pointerup", endScrub);
  addEventListener("pointercancel", endScrub);
  addEventListener("blur", () => endScrub());

  track.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 10 : 1;
    let next = null;
    if (e.key === "ArrowRight") next = comp.currentFrame + step;
    else if (e.key === "ArrowLeft") next = comp.currentFrame - step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === " " || e.key === "Enter") {
      comp.playing ? comp.pause() : comp.play();
      e.preventDefault();
      return;
    }
    if (next === null) return;
    comp.pause();
    userPaused = true;
    comp.seek(clamp(next));
    e.preventDefault();
  });

  /* Export ---------------------------------------------------------------- */

  let encoding = false;
  let objectUrl = null;

  const canEncode = typeof VideoEncoder !== "undefined";
  if (!canEncode) {
    exportBtn.disabled = true;
    exportBtn.textContent = "Export needs Chromium";
  }

  exportBtn.addEventListener("click", async () => {
    if (encoding || !canEncode) return;
    encoding = true;
    comp.pause();
    userPaused = true;
    exportBtn.disabled = true;
    exportBtn.textContent = "Encoding";
    result.textContent = "";
    result.removeAttribute("data-done");
    encoded.style.width = "0%";
    encoded.removeAttribute("hidden");

    const started = performance.now();
    const resumeAt = comp.currentFrame ?? 0;
    try {
      const blob = await comp.export({
        bitrate: BITRATE,
        onProgress: ({ frame, total }) => {
          encoded.style.width = `${(frame / total) * 100}%`;
          // The exporter drives frames itself and fires no w-seek, so move the
          // playhead from here: the frame being encoded is the frame being
          // rendered, and the two markers should not disagree. paint() leaves
          // the readout alone while `encoding` is set.
          paint(frame);
          const fps = frame / ((performance.now() - started) / 1000);
          readout.textContent = `encoding ${frame} / ${total} · ${Math.round(fps)} fps`;
        },
      });

      const secs = (performance.now() - started) / 1000;
      const fps = Math.round(HERO.duration / secs);
      const mb = blob.size / 1048576;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);

      readout.textContent =
        `${HERO.duration} frames · ${secs.toFixed(1)}s · ` +
        `${fps} fps · ${(fps / HERO.fps).toFixed(1)}× realtime`;

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "webmotion-hero.mp4";
      link.textContent = `Download MP4 · ${mb.toFixed(1)} MB`;
      link.className = "text-accent hover:text-accent-hi underline underline-offset-4";
      result.replaceChildren(link);
      result.setAttribute("data-done", "true");
    } catch (err) {
      console.error(err);
      readout.textContent = `export failed: ${err.message}`;
    } finally {
      encoding = false;
      comp.seek(resumeAt);
      encoded.setAttribute("hidden", "");
      exportBtn.disabled = false;
      exportBtn.textContent = "Export MP4";
    }
  });

  /* Only run while on screen ---------------------------------------------- */

  let userPaused = reduceMotion;

  function observeVisibility() {
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userPaused && !encoding && !scrubbing) comp.play();
        else if (!entry.isIntersecting) comp.pause();
      },
      { threshold: 0.25 },
    ).observe(mount);
  }
}
