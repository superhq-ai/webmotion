// <w-player>: the standard transport for a composition. Wraps a slotted
// <w-composition> (or any PlayableSource assigned to `source`) with play/pause,
// a zoomable scrub timeline (chapter segments from <w-sequence label>, an audio
// lane from <w-audio>), time, volume and mute, fullscreen, and keyboard
// control. All state flows one way: interactions call the source, the source
// reports back through w-* events, events update the UI.

import type { TimelineSection } from "./sections.js";
import type { AudioClip } from "../audio/schedule.js";

export interface PlayerChapter {
  label: string;
  from: number;
}

/**
 * The playback surface the player binds to. <w-composition> and
 * PlaybackController both implement it; anything else that does can be a
 * source too. Sources with a `ready` promise are awaited before binding; ones
 * with numeric `width`/`height` provide the stage's intrinsic size; ones with
 * `sections`/`audioClips` feed the timeline's chapter segments and audio lane.
 */
export interface PlayableSource extends EventTarget {
  fps: number;
  durationInFrames: number;
  readonly currentFrame: number;
  readonly playing: boolean;
  volume: number;
  muted: boolean;
  loop: boolean;
  play(): void;
  pause(): void;
  seek(frame: number): void;
  sections?(): TimelineSection[];
  audioClips?(): AudioClip[];
}

const ZOOM_STEP = 1.6;
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>`;
const SOUND_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MUTED_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const FULL_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

const STYLE = `
  :host {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    font-family: inherit;
    font-size: 12.5px;
    outline: none;
  }
  :host(:fullscreen) { background: var(--w-player-fullscreen-bg, #000); }
  /* Fullscreen sits on black, so the bar switches to its own light-on-dark
     scheme. Declared on .bar directly: values set here beat the page theme
     inherited through the host, which is tuned for the page background. */
  :host(:fullscreen) .bar {
    --w-player-accent: #f5f5f7;
    --w-player-accent-contrast: #111;
    --w-player-line: rgba(255, 255, 255, 0.18);
    --w-player-chip: rgba(255, 255, 255, 0.14);
    --w-player-chip-active: rgba(255, 255, 255, 0.34);
    --w-player-audio: rgba(255, 255, 255, 0.1);
    --w-player-audio-line: rgba(255, 255, 255, 0.28);
    color: #f5f5f7;
    background: #000;
  }
  .viewport {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: flex;
  }
  .shell { flex: none; margin: auto; width: 100%; }
  ::slotted(*) { display: block; width: 100%; }
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-top: 1px solid var(--w-player-line, rgba(128, 128, 128, 0.25));
  }
  button {
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    border-radius: 6px;
    width: 28px;
    height: 28px;
  }
  button:hover:not(:disabled) { background: var(--w-player-chip, rgba(128, 128, 128, 0.15)); }
  button:disabled { opacity: 0.35; cursor: default; }
  .play {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    /* System-color fallbacks, not currentColor: the button sets its own color,
       so currentColor here would read the icon color and paint tone on tone. */
    background: var(--w-player-accent, CanvasText);
    color: var(--w-player-accent-contrast, Canvas);
  }
  .play:hover:not(:disabled) { background: var(--w-player-accent, CanvasText); opacity: 0.85; }
  .time {
    flex: none;
    display: flex;
    gap: 5px;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
  .time .cur { opacity: 1; font-weight: 500; }

  /* The timeline scrolls horizontally when zoomed in; the inner element grows
     past the viewport and the playhead is followed while playing. */
  .track {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }
  .inner { position: relative; width: 100%; min-width: 100%; }
  .segments { display: flex; gap: 4px; }
  .segment {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
    height: 26px;
    padding: 0 8px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    overflow: hidden;
    background: var(--w-player-chip, rgba(128, 128, 128, 0.15));
    opacity: 0.75;
    font-size: 11px;
    font-weight: 500;
  }
  .segment.active { background: var(--w-player-chip-active, rgba(128, 128, 128, 0.35)); opacity: 1; }
  .segment span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* No labels: the segments collapse into a plain progress track. */
  .segments.plain .segment { height: 8px; padding: 0; border-radius: 980px; }
  /* Overlay lanes: sub-sections and parallel labels at their true windows,
     one row per set of non-overlapping sections. */
  .subrow { position: relative; height: 18px; margin-top: 4px; }
  .sub {
    position: absolute;
    top: 0;
    bottom: 0;
    width: auto;
    height: auto;
    min-width: 3px;
    padding: 0 7px;
    display: flex;
    align-items: center;
    overflow: hidden;
    border-radius: 5px;
    background: var(--w-player-chip, rgba(128, 128, 128, 0.15));
    opacity: 0.75;
    font-size: 10.5px;
    font-weight: 500;
  }
  .sub.active { background: var(--w-player-chip-active, rgba(128, 128, 128, 0.35)); opacity: 1; }
  .sub span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lane { position: relative; height: 16px; margin-top: 4px; }
  .clip {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    padding: 0 6px;
    overflow: hidden;
    border-radius: 4px;
    background: var(--w-player-audio, rgba(128, 128, 128, 0.18));
    border: 1px solid var(--w-player-audio-line, rgba(128, 128, 128, 0.35));
    font-size: 10px;
    white-space: nowrap;
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    top: -2px;
    bottom: -2px;
    left: 0;
    width: 2px;
    border-radius: 1px;
    background: var(--w-player-accent, currentColor);
    pointer-events: none;
  }
  .seek {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .sound { flex: none; display: flex; align-items: center; gap: 4px; }
  .vol { width: 64px; margin: 0; accent-color: var(--w-player-accent, currentColor); }
  .zoomctl { flex: none; display: flex; align-items: center; gap: 2px; }
  .zoomctl button { width: 22px; height: 22px; font-size: 14px; }
  .zoom-level {
    min-width: 36px;
    text-align: center;
    font-size: 11px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }
`;

function formatTime(frame: number, fps: number): string {
  const total = Math.round(frame / fps);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const basename = (src: string): string => src.split("/").pop()?.split("?")[0] ?? src;

// Greedy interval packing: sort by start (longer first on ties), place each
// item in the first row it does not overlap. Overlapping items stack into as
// many rows as the scene actually needs; a scene with no overlap packs into
// one.
function packLanes<T extends { from: number; to: number }>(items: T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.from - b.from || b.to - a.to);
  const rows: Array<{ end: number; items: T[] }> = [];
  for (const item of sorted) {
    const row = rows.find((r) => r.end <= item.from);
    if (row) {
      row.items.push(item);
      row.end = item.to;
    } else {
      rows.push({ end: item.to, items: [item] });
    }
  }
  return rows.map((r) => r.items);
}

export class WPlayer extends HTMLElement {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;

  private boundSource: PlayableSource | null = null;
  private sourceAbort: AbortController | null = null;
  private explicitSource: PlayableSource | null = null;
  private chapterList: PlayerChapter[] = [];
  private autoChapters: PlayerChapter[] = [];
  private overlaySections: TimelineSection[] = [];
  private zoomValue = 1;
  private stageWidth = 1280;
  private stageHeight = 720;
  private scrubbing = false;
  private wasPlayingBeforeScrub = false;

  private viewport!: HTMLElement;
  private shell!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private timeCur!: HTMLElement;
  private timeDur!: HTMLElement;
  private trackEl!: HTMLElement;
  private innerEl!: HTMLElement;
  private segmentsEl!: HTMLElement;
  private sublanesEl!: HTMLElement;
  private lanesEl!: HTMLElement;
  private playheadEl!: HTMLElement;
  private seekInput!: HTMLInputElement;
  private volInput!: HTMLInputElement;
  private zoomInBtn!: HTMLButtonElement;
  private zoomOutBtn!: HTMLButtonElement;
  private zoomLevelEl!: HTMLElement;

  constructor() {
    super();
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <div class="viewport" part="viewport">
        <div class="shell" part="shell"><slot></slot></div>
      </div>
      <div class="bar" part="bar">
        <button class="play" part="play-button" aria-label="Play">${PLAY_ICON}</button>
        <div class="time" part="time"><span class="cur">0:00</span><span>/</span><span class="dur">0:00</span></div>
        <div class="track" part="track">
          <div class="inner">
            <div class="segments"></div>
            <div class="sublanes"></div>
            <div class="lanes"></div>
            <div class="playhead"></div>
            <input class="seek" type="range" min="0" max="0" step="1" value="0" aria-label="Seek" />
          </div>
        </div>
        <div class="sound" part="sound">
          <button class="mute" part="mute-button" aria-label="Mute">${SOUND_ICON}</button>
          <input class="vol" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume" />
        </div>
        <div class="zoomctl" part="zoom">
          <button class="zoom-out" aria-label="Zoom timeline out">&minus;</button>
          <span class="zoom-level">1.0&times;</span>
          <button class="zoom-in" aria-label="Zoom timeline in">+</button>
        </div>
        <button class="full" part="fullscreen-button" aria-label="Fullscreen">${FULL_ICON}</button>
      </div>
    `;

    this.viewport = root.querySelector(".viewport") as HTMLElement;
    this.shell = root.querySelector(".shell") as HTMLElement;
    this.playBtn = root.querySelector(".play") as HTMLButtonElement;
    this.muteBtn = root.querySelector(".mute") as HTMLButtonElement;
    this.timeCur = root.querySelector(".cur") as HTMLElement;
    this.timeDur = root.querySelector(".dur") as HTMLElement;
    this.trackEl = root.querySelector(".track") as HTMLElement;
    this.innerEl = root.querySelector(".inner") as HTMLElement;
    this.segmentsEl = root.querySelector(".segments") as HTMLElement;
    this.sublanesEl = root.querySelector(".sublanes") as HTMLElement;
    this.lanesEl = root.querySelector(".lanes") as HTMLElement;
    this.playheadEl = root.querySelector(".playhead") as HTMLElement;
    this.seekInput = root.querySelector(".seek") as HTMLInputElement;
    this.volInput = root.querySelector(".vol") as HTMLInputElement;
    this.zoomInBtn = root.querySelector(".zoom-in") as HTMLButtonElement;
    this.zoomOutBtn = root.querySelector(".zoom-out") as HTMLButtonElement;
    this.zoomLevelEl = root.querySelector(".zoom-level") as HTMLElement;

    this.wireControls(root);
    this.timelineZoom = 1; // paint the initial zoom state (level text, buttons)
  }

  connectedCallback(): void {
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.fitShell()).observe(this.viewport);
    }
    // Slot assignment usually triggers binding; scan once after the parser
    // has produced children in case the content was there all along.
    const scan = (): void => {
      if (this.explicitSource || this.boundSource) return;
      const composition = this.querySelector("w-composition");
      if (composition) void this.bind(composition as unknown as PlayableSource);
    };
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(scan);
    else setTimeout(scan, 0);
  }

  /** The bound playback surface, or null before one is found. */
  get source(): PlayableSource | null {
    return this.boundSource;
  }

  /**
   * Bind an explicit source (a PlaybackController driving slotted canvas
   * markup). Without an assignment, the first slotted <w-composition> binds
   * automatically.
   */
  set source(source: PlayableSource | null) {
    this.explicitSource = source;
    if (source) void this.bind(source);
  }

  get chapters(): PlayerChapter[] {
    return this.chapterList.length ? this.chapterList : this.autoChapters;
  }

  /**
   * Chapter segments shown in the scrubber, [{ label, from }] in frames.
   * Without an assignment, labelled <w-sequence> sections from the source
   * are used.
   */
  set chapters(list: PlayerChapter[]) {
    this.chapterList = Array.isArray(list) ? [...list].sort((a, b) => a.from - b.from) : [];
    this.renderSegments();
  }

  /** Timeline zoom factor, 1 (whole video) to 12. The track scrolls past 1. */
  get timelineZoom(): number {
    return this.zoomValue;
  }

  set timelineZoom(value: number) {
    this.zoomValue = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(value) || 1));
    this.innerEl.style.width = `${this.zoomValue * 100}%`;
    this.zoomLevelEl.textContent = `${this.zoomValue.toFixed(1)}×`;
    this.zoomOutBtn.disabled = this.zoomValue <= ZOOM_MIN + 1e-6;
    this.zoomInBtn.disabled = this.zoomValue >= ZOOM_MAX - 1e-6;
    if (this.boundSource) this.followPlayhead(this.boundSource.currentFrame);
  }

  private wireControls(root: ShadowRoot): void {
    this.playBtn.addEventListener("click", () => this.togglePlay());
    this.viewport.addEventListener("click", () => this.togglePlay());

    this.seekInput.addEventListener("input", () => {
      const source = this.boundSource;
      if (!source) return;
      if (!this.scrubbing) {
        this.scrubbing = true;
        this.wasPlayingBeforeScrub = source.playing;
        if (this.wasPlayingBeforeScrub) source.pause();
      }
      source.seek(Number(this.seekInput.value));
    });
    this.seekInput.addEventListener("change", () => {
      if (this.scrubbing && this.wasPlayingBeforeScrub) this.boundSource?.play();
      this.scrubbing = false;
      this.wasPlayingBeforeScrub = false;
    });

    this.muteBtn.addEventListener("click", () => {
      const source = this.boundSource;
      if (source) source.muted = !source.muted;
    });
    this.volInput.addEventListener("input", () => {
      const source = this.boundSource;
      if (!source) return;
      const value = Number(this.volInput.value);
      source.volume = value;
      if (value > 0 && source.muted) source.muted = false;
    });

    this.zoomInBtn.addEventListener("click", () => {
      this.timelineZoom = this.zoomValue * ZOOM_STEP;
    });
    this.zoomOutBtn.addEventListener("click", () => {
      this.timelineZoom = this.zoomValue / ZOOM_STEP;
    });

    const fullBtn = root.querySelector(".full") as HTMLButtonElement;
    fullBtn.addEventListener("click", () => this.toggleFullscreen());

    this.addEventListener("keydown", (e) => this.onKeydown(e));

    const slot = root.querySelector("slot") as HTMLSlotElement;
    slot.addEventListener("slotchange", () => {
      if (this.explicitSource) return;
      const composition = this.findSlottedComposition(slot);
      if (composition && composition !== this.boundSource) void this.bind(composition);
    });
  }

  private findSlottedComposition(slot: HTMLSlotElement): PlayableSource | null {
    for (const el of slot.assignedElements()) {
      const hit = el.matches("w-composition") ? el : el.querySelector("w-composition");
      if (hit) return hit as unknown as PlayableSource;
    }
    return null;
  }

  private async bind(source: PlayableSource): Promise<void> {
    if (this.boundSource === source) return;
    this.sourceAbort?.abort();
    this.sourceAbort = null;
    this.boundSource = source;

    const readyable = source as { ready?: Promise<void> };
    if (readyable.ready) await readyable.ready;
    if (this.boundSource !== source) return; // superseded while waiting

    const sized = source as unknown as { width?: number; height?: number };
    if (typeof sized.width === "number" && typeof sized.height === "number") {
      this.stageWidth = sized.width;
      this.stageHeight = sized.height;
    } else {
      const canvas = this.querySelector("canvas");
      if (canvas) {
        this.stageWidth = canvas.width;
        this.stageHeight = canvas.height;
      }
    }

    const abort = new AbortController();
    this.sourceAbort = abort;
    const on = (type: string, handler: (detail: never) => void): void => {
      source.addEventListener(
        type,
        (e) => handler((e as CustomEvent).detail as never),
        { signal: abort.signal },
      );
    };
    on("w-seek", (detail: { frame: number }) => this.updateTransport(detail.frame));
    on("w-play", () => this.reflectPlaying(true));
    on("w-pause", () => this.reflectPlaying(false));
    on("w-volumechange", (detail: { volume: number; muted: boolean }) =>
      this.reflectVolume(detail.volume, detail.muted),
    );

    const lastFrame = Math.max(0, source.durationInFrames - 1);
    this.seekInput.max = String(lastFrame);
    this.timeDur.textContent = formatTime(lastFrame, source.fps);
    this.deriveMarks(source.sections?.() ?? []);
    this.renderSegments();
    this.renderOverlays();
    this.renderAudioLanes(source.audioClips?.() ?? []);
    this.reflectPlaying(source.playing);
    this.reflectVolume(source.volume, source.muted);
    this.fitShell();
    // Paint the current frame so controller-driven stages show something
    // before the first play, and sync the transport either way.
    source.seek(source.currentFrame);
    this.resolveReady();
  }

  private togglePlay(): void {
    const source = this.boundSource;
    if (!source) return;
    if (source.playing) source.pause();
    else source.play();
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement === this) void document.exitFullscreen?.();
    else void this.requestFullscreen?.();
  }

  private onKeydown(e: KeyboardEvent): void {
    const target = e.composedPath()[0];
    if (
      target instanceof HTMLElement &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        target.isContentEditable)
    ) {
      return;
    }
    const source = this.boundSource;
    if (!source) return;

    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case " ":
      case "k":
        this.togglePlay();
        break;
      case "ArrowLeft":
        source.seek(source.currentFrame - step);
        break;
      case "ArrowRight":
        source.seek(source.currentFrame + step);
        break;
      case "Home":
        source.seek(0);
        break;
      case "End":
        source.seek(source.durationInFrames - 1);
        break;
      case "m":
        source.muted = !source.muted;
        break;
      case "f":
        this.toggleFullscreen();
        break;
      case "-":
      case "_":
        this.timelineZoom = this.zoomValue / ZOOM_STEP;
        break;
      case "+":
      case "=":
        this.timelineZoom = this.zoomValue * ZOOM_STEP;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private framePct(frame: number): number {
    const lastFrame = Math.max(1, (this.boundSource?.durationInFrames ?? 1) - 1);
    return Math.max(0, Math.min(100, (frame / lastFrame) * 100));
  }

  // Keep the playhead on screen while playing a zoomed-in timeline. Nudge only
  // as far as the near edge, so the view then glides under a playhead pinned
  // at the margin instead of lurching half a screen on every crossing.
  private followPlayhead(frame: number): void {
    if (this.zoomValue <= 1) return;
    const x = (this.framePct(frame) / 100) * this.innerEl.clientWidth;
    const margin = 40;
    if (x < this.trackEl.scrollLeft + margin) {
      this.trackEl.scrollLeft = x - margin;
    } else if (x > this.trackEl.scrollLeft + this.trackEl.clientWidth - margin) {
      this.trackEl.scrollLeft = x - this.trackEl.clientWidth + margin;
    }
  }

  private updateTransport(frame: number): void {
    const source = this.boundSource;
    if (!source) return;
    this.seekInput.value = String(frame);
    this.playheadEl.style.left = `${this.framePct(frame)}%`;
    this.timeCur.textContent = formatTime(frame, source.fps);
    for (const el of this.innerEl.querySelectorAll<HTMLElement>(".segment, .sub")) {
      const from = Number(el.dataset.from);
      const to = Number(el.dataset.to);
      el.classList.toggle("active", frame >= from && frame < to);
    }
    this.followPlayhead(frame);
  }

  private reflectPlaying(playing: boolean): void {
    this.playBtn.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    this.playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  private reflectVolume(volume: number, muted: boolean): void {
    this.muteBtn.innerHTML = muted || volume === 0 ? MUTED_ICON : SOUND_ICON;
    this.muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    this.volInput.value = String(muted ? 0 : volume);
  }

  // Split the scene's labelled sections into the chapter rail and the overlay
  // lanes. Nesting decides: depth 0 sections are consecutive chapters, so the
  // rail cuts each segment at the next label's start (beat windows may butt,
  // overlap for a crossfade, or run unbounded). A label nested inside a
  // labelled sequence is a sub-section of that chapter and renders on an
  // overlay lane at its true window.
  private deriveMarks(sections: TimelineSection[]): void {
    // The first chapter stretches back to 0 so the rail reads full.
    this.autoChapters = sections
      .filter((s) => s.depth === 0)
      .map((section, i) => ({ label: section.label, from: i === 0 ? 0 : section.from }));
    this.overlaySections = sections.filter((s) => s.depth > 0);
  }

  // The scrubber: one segment per chapter sized by its span, or a single
  // unlabeled segment without chapters. Clicking a segment seeks to its start.
  private renderSegments(): void {
    const source = this.boundSource;
    if (!source) return;
    const duration = source.durationInFrames;
    const chapters = this.chapters.length ? this.chapters : [{ label: "", from: 0 }];
    this.segmentsEl.classList.toggle("plain", !chapters.some((c) => c.label));

    this.segmentsEl.replaceChildren(
      ...chapters.map((chapter, i) => {
        const to = chapters[i + 1]?.from ?? duration;
        const span = Math.max(1, to - chapter.from);
        const el = document.createElement("button");
        el.className = "segment";
        el.style.flexGrow = String(span);
        el.dataset.from = String(chapter.from);
        el.dataset.to = String(to);
        el.tabIndex = -1;
        if (chapter.label) {
          const label = document.createElement("span");
          label.textContent = chapter.label;
          el.appendChild(label);
        }
        el.setAttribute("aria-label", chapter.label || "Seek");
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.boundSource?.seek(chapter.from);
        });
        return el;
      }),
    );
    this.updateTransport(source.currentFrame);
  }

  // Overlay lanes: nested labels at their true windows, packed so overlapping
  // sections stack into extra rows. Clicking one seeks to its start.
  private renderOverlays(): void {
    const source = this.boundSource;
    if (!source) return;
    const duration = source.durationInFrames;
    this.sublanesEl.replaceChildren(
      ...packLanes(this.overlaySections).map((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "subrow";
        for (const section of row) {
          const el = document.createElement("button");
          el.className = "sub";
          el.style.left = `${(section.from / duration) * 100}%`;
          el.style.width = `${(Math.max(1, section.to - section.from) / duration) * 100}%`;
          el.dataset.from = String(section.from);
          el.dataset.to = String(section.to);
          el.tabIndex = -1;
          const label = document.createElement("span");
          label.textContent = section.label;
          el.appendChild(label);
          el.setAttribute("aria-label", section.label);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            this.boundSource?.seek(section.from);
          });
          rowEl.appendChild(el);
        }
        return rowEl;
      }),
    );
  }

  // Audio lanes: one block per <w-audio> clip at its timeline position, so
  // sound is visible while scrubbing. Overlapping clips (a music bed under
  // effects) pack into separate lanes. Purely informational.
  private renderAudioLanes(clips: AudioClip[]): void {
    const source = this.boundSource;
    if (!source) return;
    const duration = source.durationInFrames;
    const spans = clips
      .map((clip) => ({
        from: Math.max(0, clip.startFrame),
        to: Math.min(duration, clip.endFrame),
        src: clip.src,
      }))
      .filter((span) => span.to > span.from);
    this.lanesEl.replaceChildren(
      ...packLanes(spans).map((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = "lane";
        for (const span of row) {
          const el = document.createElement("div");
          el.className = "clip";
          el.style.left = `${(span.from / duration) * 100}%`;
          el.style.width = `${(Math.max(1, span.to - span.from) / duration) * 100}%`;
          el.textContent = basename(span.src);
          el.title = span.src;
          rowEl.appendChild(el);
        }
        return rowEl;
      }),
    );
  }

  // Fit: the shell takes the largest width whose stage still fits the
  // viewport's height, replicating object-fit: contain. With no height
  // constraint from the host this settles at full width.
  private fitShell(): void {
    const cs = getComputedStyle(this.viewport);
    const availW =
      this.viewport.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH =
      this.viewport.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (availW <= 0) return;
    const byHeight = availH > 0 ? (availH * this.stageWidth) / this.stageHeight : availW;
    this.shell.style.width = `${Math.max(0, Math.floor(Math.min(availW, byHeight)))}px`;
  }
}

export function definePlayer(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-player")) customElements.define("w-player", WPlayer);
}
