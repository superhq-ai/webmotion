import { num } from "./parse.js";
import { applyFrame } from "./registry.js";
import { exportComposition, type ExportOptions } from "./export.js";
import { collectAudioClips } from "../audio/schedule.js";
import { loadClipBuffers, scheduleClips, type ScheduledAudio } from "../audio/engine.js";

// Base entity. Positions itself absolutely from x/y/width/height and exposes a
// base opacity; animated transforms and opacity are layered on per frame by the
// component system. Subclasses add their own static presentation.
class WEntity extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["x", "y", "width", "height", "opacity"];
  }

  connectedCallback(): void {
    if (!this.style.position) this.style.position = "absolute";
    this.applyStatic();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.applyStatic();
  }

  protected applyStatic(): void {
    const x = this.getAttribute("x");
    const y = this.getAttribute("y");
    const w = this.getAttribute("width");
    const h = this.getAttribute("height");
    if (x != null) this.style.left = `${num(x)}px`;
    if (y != null) this.style.top = `${num(y)}px`;
    if (w != null) this.style.width = `${num(w)}px`;
    if (h != null) this.style.height = `${num(h)}px`;
    if (this.hasAttribute("opacity")) this.style.opacity = this.getAttribute("opacity") ?? "1";
  }
}

class WEl extends WEntity {}

class WText extends WEntity {
  static override get observedAttributes(): string[] {
    return [...WEntity.observedAttributes, "text", "font", "color", "align"];
  }

  protected override applyStatic(): void {
    super.applyStatic();
    // Text usually lives in child text nodes and renders as-is. The `text`
    // attribute writes into a dedicated span so element children (inline
    // <w-animate> tweens) survive it.
    const text = this.getAttribute("text");
    if (text != null) {
      let span = this.querySelector<HTMLSpanElement>(":scope > span[data-w-text]");
      if (!span) {
        span = document.createElement("span");
        span.setAttribute("data-w-text", "");
        this.prepend(span);
      }
      span.textContent = text;
    }
    const font = this.getAttribute("font");
    if (font) this.style.font = font;
    const color = this.getAttribute("color");
    if (color) this.style.color = color;
    const align = this.getAttribute("align");
    if (align) this.style.textAlign = align;
  }
}

class WRect extends WEntity {
  static override get observedAttributes(): string[] {
    return [...WEntity.observedAttributes, "fill", "radius"];
  }

  protected override applyStatic(): void {
    super.applyStatic();
    const fill = this.getAttribute("fill");
    if (fill) this.style.background = fill;
    const radius = this.getAttribute("radius");
    if (radius != null) this.style.borderRadius = `${num(radius)}px`;
  }
}

// Timing window. Behaviorless on its own; the frame walk reads from/duration and
// shows or hides it, shifting the frame origin for its descendants.
class WSequence extends HTMLElement {
  connectedCallback(): void {
    this.style.display = this.style.display || "block";
  }
}

// Never rendered: <w-animate> declares one tween, <w-defs>/<w-animation> hold
// named definitions, <w-audio> places a sound clip on the timeline. The frame
// walk reads their attributes and skips their subtrees. See docs/MOTION.md and
// docs/AUDIO.md.
class WInert extends HTMLElement {
  connectedCallback(): void {
    this.style.display = "none";
  }
}
class WAnimate extends WInert {}
class WDefs extends WInert {}
class WAnimation extends WInert {}
class WAudio extends WInert {}

// The composition root. Owns the frame clock, sizes and scales the stage to fit,
// and drives preview, seeking, and MP4 export.
class WComposition extends HTMLElement {
  width = 1280;
  height = 720;
  fps = 30;
  durationInFrames = 150;
  currentFrame = 0;

  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private stage!: HTMLElement;
  private lastWidth = -1;
  private playing = false;
  private rafId = 0;
  private setupDone = false;
  private playToken = 0;
  private audioCtx: AudioContext | null = null;
  private audioHandle: ScheduledAudio | null = null;
  private clock: {
    audioCtx: AudioContext | null;
    t0: number;
    wall0: number;
    baseFrame: number;
  } | null = null;

  constructor() {
    super();
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  connectedCallback(): void {
    // Defer until the parser has produced our children.
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => this.setup());
    } else {
      setTimeout(() => this.setup(), 0);
    }
  }

  private setup(): void {
    if (this.setupDone) return;
    this.setupDone = true;

    this.width = num(this.getAttribute("width"), 1280);
    this.height = num(this.getAttribute("height"), 720);
    this.fps = num(this.getAttribute("fps"), 30);
    this.durationInFrames = num(this.getAttribute("duration"), 150);

    // Optionally instantiate scene markup from a <template>.
    const tplSel = this.getAttribute("template");
    if (tplSel) {
      const tpl = document.querySelector(tplSel);
      if (tpl instanceof HTMLTemplateElement) this.appendChild(tpl.content.cloneNode(true));
    }

    // Move authored children into a fixed-size stage that we scale to fit.
    this.stage = document.createElement("div");
    while (this.firstChild) this.stage.appendChild(this.firstChild);
    this.appendChild(this.stage);

    this.style.display = "block";
    this.style.position = "relative";
    this.style.overflow = "hidden";
    this.style.width = "100%";
    this.layoutStage();

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.layoutStage()).observe(this);
    }

    this.seek(num(this.getAttribute("poster"), 0));
    this.resolveReady();
    if (this.hasAttribute("autoplay")) this.play();
  }

  private layoutStage(): void {
    const avail = this.clientWidth;
    if (avail === this.lastWidth || avail === 0) {
      if (avail === 0) return;
    }
    this.lastWidth = avail;
    const scale = Math.min(1, avail / this.width);
    const bg = this.getAttribute("background") ?? "transparent";
    this.stage.style.cssText =
      `position:absolute;top:0;left:0;width:${this.width}px;height:${this.height}px;` +
      `transform:scale(${scale});transform-origin:top left;overflow:hidden;background:${bg};`;
    this.style.height = `${Math.round(this.height * scale)}px`;
  }

  renderFrameAt(globalFrame: number): void {
    applyFrame(this.stage, {
      frame: globalFrame,
      globalFrame,
      fps: this.fps,
      width: this.width,
      height: this.height,
    });
  }

  seek(frame: number): void {
    const clamped = Math.max(0, Math.min(this.durationInFrames - 1, Math.round(frame)));
    this.currentFrame = clamped;
    this.renderFrameAt(clamped);
    this.dispatchEvent(new CustomEvent("w-seek", { detail: { frame: clamped } }));
    // Scrubbing while playing restarts playback (and its audio) from here.
    if (this.playing && clamped !== this.playbackFrame()) {
      this.stopPlayback();
      void this.startPlayback(clamped);
    }
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    const startFrame = this.currentFrame >= this.durationInFrames - 1 ? 0 : this.currentFrame;
    void this.startPlayback(startFrame);
  }

  pause(): void {
    this.playing = false;
    this.stopPlayback();
  }

  // The frame the running playback clock currently points at, or -1 when the
  // clock has not started.
  private playbackFrame(): number {
    if (!this.clock) return -1;
    const elapsed = this.clock.audioCtx
      ? Math.max(0, this.clock.audioCtx.currentTime - this.clock.t0)
      : (performance.now() - this.clock.wall0) / 1000;
    return this.clock.baseFrame + Math.floor(elapsed * this.fps);
  }

  // Preview playback. The clock paces which frame index is shown; each frame
  // is still a pure function of its index, so output stays deterministic.
  // With audio present, the audio clock is authoritative.
  private async startPlayback(startFrame: number): Promise<void> {
    const token = ++this.playToken;
    const clips = collectAudioClips(this.stage, this.fps, this.durationInFrames);

    let audioCtx: AudioContext | null = null;
    let handle: ScheduledAudio | null = null;
    let t0 = 0;
    if (clips.length > 0 && typeof AudioContext !== "undefined") {
      this.audioCtx ??= new AudioContext();
      audioCtx = this.audioCtx;
      if (audioCtx.state === "suspended") {
        // Needs a user gesture; if resume fails we play silent on wall clock.
        try {
          await audioCtx.resume();
        } catch {
          audioCtx = null;
        }
      }
      if (audioCtx && audioCtx.state === "running") {
        const buffers = await loadClipBuffers(audioCtx, clips);
        if (!this.playing || token !== this.playToken) return;
        t0 = audioCtx.currentTime + 0.05;
        handle = scheduleClips(audioCtx, clips, buffers, this.fps, startFrame, t0);
      } else {
        audioCtx = null;
      }
    }
    if (!this.playing || token !== this.playToken) {
      handle?.stop();
      return;
    }

    this.audioHandle = handle;
    this.clock = { audioCtx, t0, wall0: performance.now(), baseFrame: startFrame };

    const tick = (): void => {
      if (!this.playing || token !== this.playToken) return;
      const f = this.playbackFrame();
      if (f >= this.durationInFrames) {
        // Loop: restart clock and audio from the top.
        this.stopPlayback();
        void this.startPlayback(0);
        return;
      }
      if (f !== this.currentFrame) {
        this.currentFrame = f;
        this.renderFrameAt(f);
        this.dispatchEvent(new CustomEvent("w-seek", { detail: { frame: f } }));
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopPlayback(): void {
    this.playToken++;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.audioHandle?.stop();
    this.audioHandle = null;
    this.clock = null;
  }

  async export(options: ExportOptions = {}): Promise<Blob> {
    const wasPlaying = this.playing;
    this.pause();
    try {
      return await exportComposition(
        {
          width: this.width,
          height: this.height,
          fps: this.fps,
          durationInFrames: this.durationInFrames,
          stage: this.stage,
          renderFrameAt: (f) => this.renderFrameAt(f),
        },
        options,
      );
    } finally {
      this.lastWidth = -1;
      this.layoutStage();
      this.seek(this.currentFrame);
      if (wasPlaying) this.play();
    }
  }
}

export function defineElements(): void {
  if (typeof customElements === "undefined") return;
  const defs: [string, CustomElementConstructor][] = [
    ["w-composition", WComposition],
    ["w-sequence", WSequence],
    ["w-el", WEl],
    ["w-text", WText],
    ["w-rect", WRect],
    ["w-animate", WAnimate],
    ["w-defs", WDefs],
    ["w-animation", WAnimation],
    ["w-audio", WAudio],
  ];
  for (const [name, ctor] of defs) {
    if (!customElements.get(name)) customElements.define(name, ctor);
  }
}

export { WComposition };
