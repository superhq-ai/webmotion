import { num } from "./parse.js";
import { applyFrame } from "./registry.js";
import { exportComposition, type ExportOptions } from "./export.js";
import { collectAudioClips, type AudioClip } from "../audio/schedule.js";
import { collectSections, type TimelineSection } from "./sections.js";
import { PlaybackController } from "../playback/controller.js";
import { expandTemplates } from "./template.js";

// Base entity. Positions itself absolutely from x/y/width/height and exposes a
// base opacity; animated transforms and opacity are layered on per frame by the
// component system. Subclasses add their own static presentation. Exported so
// optional packages (the three.js entry) can build entities on the same box
// model.
export class WEntity extends HTMLElement {
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

  /** Live rebind: bind-text names the data key that feeds the text. */
  wmBind(data: Record<string, unknown>): void {
    const key = this.getAttribute("bind-text");
    if (key && key in data) this.setAttribute("text", String(data[key]));
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
class WFor extends WInert {}
class WData extends WInert {}
class WIf extends WInert {}

// The composition root. Owns the frame clock, sizes and scales the stage to fit,
// and drives preview, seeking, and MP4 export.
class WComposition extends HTMLElement {
  width = 1280;
  height = 720;
  fps = 30;
  durationInFrames = 150;
  currentFrame = 0;

  // Template data provided from JS, merged over <w-data> declarations (JS
  // wins on name conflicts). Set it before the element connects, or in a
  // script that runs before setup fires; expansion happens once at setup.
  // `declare` keeps the field off the instance so a value assigned before
  // custom-element upgrade survives.
  declare data?: Record<string, unknown>;

  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private stage!: HTMLElement;
  private lastWidth = -1;
  private setupDone = false;
  private controller: PlaybackController | null = null;
  // Values assigned before setup, applied when the controller exists.
  private pendingVolume = 1;
  private pendingMuted = false;
  private pendingLoop: boolean | null = null;

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

    // Re-route values assigned to accessor names before the element upgraded;
    // an own property from that window would shadow the class accessor.
    for (const name of ["volume", "muted", "loop"] as const) {
      if (Object.prototype.hasOwnProperty.call(this, name)) {
        const value = (this as Record<string, unknown>)[name as string];
        delete (this as Record<string, unknown>)[name as string];
        (this as Record<string, unknown>)[name as string] = value;
      }
    }

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

    // Expand <w-for> repetition against <w-data> and the data property. Once,
    // before the first frame; see docs/TEMPLATE.md.
    expandTemplates(this, this.data);

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

    // The shared preview clock. The element is a thin shell over it: frames
    // land through renderFrameAt, state comes back out as re-dispatched w-*
    // events, so listeners bind to the element like any media element.
    const controller = new PlaybackController({
      fps: this.fps,
      durationInFrames: this.durationInFrames,
      renderFrame: (frame) => {
        this.currentFrame = frame;
        this.renderFrameAt(frame);
      },
      collectClips: () => collectAudioClips(this.stage, this.fps, this.durationInFrames),
    });
    controller.loop = this.pendingLoop ?? this.hasAttribute("loop");
    controller.volume = this.pendingVolume;
    controller.muted = this.pendingMuted;
    for (const type of ["w-play", "w-pause", "w-seek", "w-ended", "w-volumechange"]) {
      controller.addEventListener(type, (e) => {
        this.dispatchEvent(new CustomEvent(type, { detail: (e as CustomEvent).detail }));
      });
    }
    this.controller = controller;

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
    // Fill the container width, up or down, like a replaced element. Zoom is
    // the host's concern: size the element (a player UI does) and the stage
    // follows.
    const scale = avail / this.width;
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
    this.controller?.seek(frame);
  }

  play(): void {
    this.controller?.play();
  }

  pause(): void {
    this.controller?.pause();
  }

  get playing(): boolean {
    return this.controller?.playing ?? false;
  }

  /** Preview volume, 0..1. Export mixes are unaffected. */
  get volume(): number {
    return this.controller ? this.controller.volume : this.pendingVolume;
  }

  set volume(value: number) {
    if (this.controller) this.controller.volume = value;
    else this.pendingVolume = value;
  }

  get muted(): boolean {
    return this.controller ? this.controller.muted : this.pendingMuted;
  }

  set muted(value: boolean) {
    if (this.controller) this.controller.muted = value;
    else this.pendingMuted = value;
  }

  /** Labelled <w-sequence> sections in absolute frames, for timeline UIs. */
  sections(): TimelineSection[] {
    return this.setupDone ? collectSections(this.stage, this.durationInFrames) : [];
  }

  /** The <w-audio> clips placed on the timeline, for audio-lane UIs. */
  audioClips(): AudioClip[] {
    return this.setupDone ? collectAudioClips(this.stage, this.fps, this.durationInFrames) : [];
  }

  /** Whether playback wraps at the end; the `loop` attribute seeds it. */
  get loop(): boolean {
    return this.controller ? this.controller.loop : (this.pendingLoop ?? this.hasAttribute("loop"));
  }

  set loop(value: boolean) {
    if (this.controller) this.controller.loop = value;
    else this.pendingLoop = value;
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
    ["w-for", WFor],
    ["w-data", WData],
    ["w-if", WIf],
  ];
  for (const [name, ctor] of defs) {
    if (!customElements.get(name)) customElements.define(name, ctor);
  }
}

export { WComposition };
