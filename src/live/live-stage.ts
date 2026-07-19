// LiveStage: the unbounded, event-driven render target (see docs/LIVE-RFC.md).
// Props are registered templates; trigger() expands one with runtime data and
// mounts it as an independent subtree with its own local timeline over the
// shared ticker. The page itself is the output: no per-frame compositing, no
// canvas, transparent by construction. When nothing is mounted the ticker has
// no subscriber and the stage costs nothing.
import { applyFrame, type FrameContext } from "../elements/registry.js";
import { expandTemplates, resubstituteAttrs, substituteData } from "../elements/template.js";
import { num } from "../elements/parse.js";
import { collectAudioClips } from "../audio/schedule.js";
import { loadClipBuffers, scheduleClips, type ScheduledAudio } from "../audio/engine.js";
import { RafTicker, type Ticker } from "./ticker.js";

export interface LiveStageOptions {
  /** Where prop layers mount. Defaults to a transparent full-viewport div. */
  container?: HTMLElement;
  /** Time source; injectable for tests. */
  ticker?: Ticker;
  /** Called when a prop errors; the prop is already unmounted. */
  onPropError?: (name: string, error: unknown) => void;
}

export interface TriggerOptions {
  /**
   * Re-trigger behavior when the same one-shot prop is already playing:
   * "coalesce" (default) lets it finish, then plays once more with the
   * latest data seen while waiting; "restart" unmounts and replays now.
   */
  mode?: "coalesce" | "restart";
}

interface PropTemplate {
  name: string;
  markup: string;
  fps: number;
  duration: number;
  persistent: boolean;
  width: number;
  height: number;
}

interface Instance {
  template: PropTemplate;
  root: HTMLElement;
  startMs: number;
  data: Record<string, unknown>;
  audio: ScheduledAudio | null;
  /** Runtime-applied effects, keyed by handle. */
  effects: Map<string, RunningEffect>;
}

interface RunningEffect {
  els: HTMLElement[];
  /** Prop frame past which a burst effect unmounts; Infinity for toggles. */
  endFrame: number;
  /** Scheduled fragment audio, stopped with the effect. */
  audio: ScheduledAudio | null;
}

export interface EffectOptions {
  /** Handle for clearEffect; generated when omitted. */
  id?: string;
  /** "burst" runs for `frames` then unmounts; "toggle" stays until cleared. */
  mode?: "burst" | "toggle";
  /** Burst length in prop frames (default 300). */
  frames?: number;
  /** Values substituted into the fragment's {placeholders}. */
  params?: Record<string, unknown>;
  /** Selector for the element non-shader roots mount on (default: the
   *  prop root). Shader-fx roots always wire to the prop's first
   *  w-model regardless. */
  target?: string;
}

interface BindableElement extends HTMLElement {
  wmBind(data: Record<string, unknown>): void;
}

// Runtime data is hostile by assumption (donor names, chat messages).
// Substitution is structurally injection-safe (text nodes and attribute
// strings, never markup), so the remaining risk is absurd length breaking
// layout; cap every string. Depth-limit nested objects while walking.
const MAX_STRING = 300;

function sanitizeData(data: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      out[key] = value.length > MAX_STRING ? value.slice(0, MAX_STRING - 1) + "…" : value;
    } else if (value != null && typeof value === "object" && depth < 4) {
      if (Array.isArray(value)) {
        out[key] = value.map((v) =>
          typeof v === "string" && v.length > MAX_STRING
            ? v.slice(0, MAX_STRING - 1) + "…"
            : v,
        );
      } else {
        out[key] = sanitizeData(value as Record<string, unknown>, depth + 1);
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

interface ReleasableElement extends HTMLElement {
  wmRelease(): void;
}

export class LiveStage {
  private readonly containerEl: HTMLElement;
  private readonly createdContainer: boolean;
  private readonly ticker: Ticker;
  private readonly onPropError: ((name: string, error: unknown) => void) | undefined;
  private readonly templates = new Map<string, PropTemplate>();
  private readonly instances = new Map<string, Instance>();
  private readonly pending = new Map<string, Record<string, unknown>>();
  // One AudioContext for the whole stage (browsers cap concurrent contexts);
  // decoded buffers cache per context inside the audio engine.
  private audioCtx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private unsubscribe: (() => void) | null = null;
  private disposed = false;
  private effectSeq = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: LiveStageOptions = {}) {
    this.ticker = options.ticker ?? new RafTicker();
    this.onPropError = options.onPropError;
    if (options.container) {
      this.containerEl = options.container;
      this.createdContainer = false;
    } else {
      this.containerEl = document.createElement("div");
      this.containerEl.style.cssText =
        "position:fixed;inset:0;overflow:hidden;pointer-events:none;background:transparent;";
      document.body.appendChild(this.containerEl);
      this.createdContainer = true;
    }
    // OBS sources get resized at arbitrary moments; mounted props rescale in
    // place without remounting or losing state.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        for (const instance of this.instances.values()) {
          this.layoutLayer(instance.root, instance.template);
        }
      });
      this.resizeObserver.observe(this.containerEl);
    }
  }

  get container(): HTMLElement {
    return this.containerEl;
  }

  /**
   * Register a prop template: a <w-prop> element, its outerHTML, or any
   * markup string wrapped in one. Timing attributes live on <w-prop>:
   * fps (default 30), duration (frames; required unless persistent),
   * width/height (design box, scaled to fit the container).
   */
  registerProp(name: string, template: string | HTMLElement): void {
    const holder = document.createElement("div");
    if (typeof template === "string") holder.innerHTML = template;
    else holder.appendChild(template.cloneNode(true));
    const el = holder.querySelector("w-prop") ?? holder;
    // In-page templates must wrap their markup in a native <template> so
    // custom elements inside stay inert until triggered; without it, a
    // w-model in the template would load and mutate itself in place.
    // Detached string registration has no such problem either way.
    const inner = el.querySelector(":scope > template");
    const markup = inner instanceof HTMLTemplateElement
      ? (() => {
          const div = document.createElement("div");
          div.appendChild(inner.content.cloneNode(true));
          return div.innerHTML;
        })()
      : el.innerHTML;
    this.templates.set(name, {
      name,
      markup,
      fps: num(el instanceof HTMLElement ? el.getAttribute("fps") : null, 30),
      duration: num(el instanceof HTMLElement ? el.getAttribute("duration") : null, 0),
      persistent: el instanceof HTMLElement && el.hasAttribute("persistent"),
      width: num(el instanceof HTMLElement ? el.getAttribute("width") : null, 1920),
      height: num(el instanceof HTMLElement ? el.getAttribute("height") : null, 1080),
    });
  }

  /** Fetch a prop fragment (same format as inline registration). */
  async registerPropUrl(name: string, url: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LiveStage: failed to fetch prop ${name}: ${res.status}`);
    this.registerProp(name, await res.text());
  }

  /**
   * Load every asset a prop needs before any trigger: mount a hidden
   * expanded copy, wait for wmReady across the subtree, apply one frame so
   * shaders compile and textures upload, decode audio, then unmount.
   *
   * Props whose assets depend on trigger data (a per-variant voice clip via
   * a placeholder src) pass representative datasets in `samples`; each
   * dataset is expanded and warmed.
   */
  async preload(
    names?: string[],
    samples?: Record<string, Record<string, unknown>[] | Record<string, unknown>>,
  ): Promise<void> {
    const targets = names ?? [...this.templates.keys()];
    await Promise.all(
      targets.map(async (name) => {
        const template = this.templates.get(name);
        if (!template) return;
        const raw = samples?.[name];
        const datasets = Array.isArray(raw) ? raw : [raw ?? {}];
        for (const data of datasets) {
          const layer = this.buildLayer(template, data);
          layer.style.opacity = "0";
          this.containerEl.appendChild(layer);
          try {
            await this.settleReady(layer);
            applyFrame(layer, this.frameContext(template, 0));
            const clips = collectAudioClips(layer, template.fps, this.durationOf(template));
            if (clips.length > 0) {
              const decoded = await loadClipBuffers(this.ensureAudioContext(), clips);
              for (const [src, buf] of decoded) this.buffers.set(src, buf);
            }
          } catch (e) {
            console.warn("[webmotion] preload failed for prop", name, e);
          } finally {
            this.unmountSubtree(layer);
          }
        }
      }),
    );
  }

  /** Start a prop with runtime data. */
  trigger(name: string, data: Record<string, unknown> = {}, options: TriggerOptions = {}): void {
    if (this.disposed) return;
    const template = this.templates.get(name);
    if (!template) {
      console.warn("[webmotion] trigger for unregistered prop", name);
      return;
    }

    const running = this.instances.get(name);
    if (running) {
      if ((options.mode ?? "coalesce") === "restart") {
        // Restart replays from frame 0 for one-shots and remounts persistent
        // props (their entrance animation runs again with the new data).
        this.teardown(name);
      } else if (template.persistent) {
        this.update(name, data);
        return;
      } else {
        // Depth-1 queue: latest data wins, plays when the current run ends.
        this.pending.set(name, data);
        return;
      }
    }

    this.mount(template, data);
  }

  /** Refresh a mounted persistent prop's data without remounting: attribute
   *  placeholders re-resolve in place (position, bound colors), then
   *  bind-text elements rebind. Entrance animations do not replay, which is
   *  what makes live position changes smooth instead of a remount storm. */
  update(name: string, data: Record<string, unknown>): void {
    const instance = this.instances.get(name);
    if (!instance) return;
    Object.assign(instance.data, data);
    try {
      resubstituteAttrs(instance.root, instance.data);
    } catch (e) {
      this.fail(name, e);
      return;
    }
    const all = [instance.root, ...instance.root.querySelectorAll<HTMLElement>("*")];
    for (const el of all) {
      const bind = (el as Partial<BindableElement>).wmBind;
      if (typeof bind === "function") {
        try {
          bind.call(el, instance.data);
        } catch (e) {
          this.fail(name, e);
          return;
        }
      }
    }
  }

  /**
   * Mount an effect fragment onto a running prop: w-shader-fx roots wire
   * into the target model's live scene, w-animate roots join its tween
   * sampling. Tween frames in the fragment are authored relative to the
   * effect's own start; they are offset onto the prop's clock at apply.
   * Returns a handle for clearEffect, or null when the prop is not
   * mounted or the fragment has nothing to mount.
   */
  applyEffect(name: string, fragment: string, options: EffectOptions = {}): string | null {
    const instance = this.instances.get(name);
    if (!instance) return null;
    const holder = document.createElement("div");
    holder.innerHTML = fragment;
    substituteData(holder, sanitizeData(options.params ?? {}));

    const startFrame =
      ((this.ticker.now() - instance.startMs) / 1000) * instance.template.fps;
    for (const tween of Array.from(holder.querySelectorAll("w-animate"))) {
      const from = num(tween.getAttribute("start"), 0);
      const to = num(tween.getAttribute("end"), 0);
      tween.setAttribute("start", String(from + startFrame));
      tween.setAttribute("end", String(to + startFrame));
    }
    // Fragment audio is authored effect-relative like the tweens and
    // shifted onto the prop clock the same way.
    for (const audioEl of Array.from(holder.querySelectorAll("w-audio"))) {
      audioEl.setAttribute("from", String(num(audioEl.getAttribute("from"), 0) + startFrame));
    }
    const clips = collectAudioClips(
      holder,
      instance.template.fps,
      this.durationOf(instance.template),
    );

    const target = options.target
      ? (instance.root.querySelector<HTMLElement>(options.target) ?? instance.root)
      : instance.root;
    const model = target.tagName === "W-MODEL"
      ? target
      : instance.root.querySelector<HTMLElement>("w-model");
    const mounted: HTMLElement[] = [];
    for (const el of Array.from(holder.children)) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.tagName === "W-SHADER-FX") {
        const adopt = (model as { wmAdoptFx?: (el: HTMLElement) => boolean } | null)?.wmAdoptFx;
        if (!model || typeof adopt !== "function") continue;
        model.appendChild(el);
        if (!adopt.call(model, el)) {
          el.remove();
          continue;
        }
      } else {
        target.appendChild(el);
      }
      mounted.push(el);
    }
    if (mounted.length === 0) return null;

    const id = options.id ?? `fx-${++this.effectSeq}`;
    this.clearEffect(name, id); // a re-applied handle replaces its run
    const frames = options.frames ?? 300;
    const entry: RunningEffect = {
      els: mounted,
      endFrame: (options.mode ?? "burst") === "burst" ? startFrame + frames : Infinity,
      audio: null,
    };
    instance.effects.set(id, entry);
    this.startClipAudio(instance, clips, (audio) => {
      // The effect may already be gone by the time a late decode lands.
      if (instance.effects.get(id) === entry) entry.audio = audio;
      else audio.stop();
    });
    return id;
  }

  /** Unmount a runtime effect by handle, or every effect on the prop. */
  clearEffect(name: string, id?: string): void {
    const instance = this.instances.get(name);
    if (!instance) return;
    const targets = id ? [id] : [...instance.effects.keys()];
    for (const key of targets) {
      const effect = instance.effects.get(key);
      if (!effect) continue;
      instance.effects.delete(key);
      effect.audio?.stop();
      for (const el of effect.els) {
        const host = el.parentElement as { wmDropFx?: (el: HTMLElement) => void } | null;
        if (el.tagName === "W-SHADER-FX" && typeof host?.wmDropFx === "function") {
          host.wmDropFx(el);
          el.remove();
        } else {
          this.unmountSubtree(el);
        }
      }
    }
  }

  /** True while the named prop (or any prop) is mounted. */
  active(name?: string): boolean {
    return name ? this.instances.has(name) : this.instances.size > 0;
  }

  /**
   * Remove a mounted prop immediately (a persistent goal bar concluding, a
   * scene change). Also clears any coalesced re-trigger waiting behind it.
   */
  dismiss(name: string): void {
    this.pending.delete(name);
    this.teardown(name);
  }

  dispose(): void {
    this.disposed = true;
    for (const name of [...this.instances.keys()]) this.teardown(name);
    this.pending.clear();
    this.resizeObserver?.disconnect();
    if (this.createdContainer) this.containerEl.remove();
  }

  private mount(template: PropTemplate, data: Record<string, unknown>): void {
    let layer: HTMLElement;
    try {
      layer = this.buildLayer(template, data);
    } catch (e) {
      this.onPropError?.(template.name, e);
      console.warn("[webmotion] prop failed to build", template.name, e);
      return;
    }
    this.containerEl.appendChild(layer);

    const instance: Instance = {
      template,
      root: layer,
      startMs: this.ticker.now(),
      data: { ...data },
      audio: null,
      effects: new Map(),
    };
    this.instances.set(template.name, instance);
    this.startAudio(instance);

    // First frame immediately: a trigger must not wait for the next tick.
    this.applyInstanceFrame(instance, this.ticker.now());
    this.ensureTicking();
  }

  private ensureTicking(): void {
    if (this.unsubscribe || this.instances.size === 0) return;
    this.unsubscribe = this.ticker.subscribe((nowMs) => this.onTick(nowMs));
  }

  private onTick(nowMs: number): void {
    for (const instance of [...this.instances.values()]) {
      this.applyInstanceFrame(instance, nowMs);
    }
    if (this.instances.size === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private applyInstanceFrame(instance: Instance, nowMs: number): void {
    const { template } = instance;
    const frame = ((nowMs - instance.startMs) / 1000) * template.fps;

    for (const [id, effect] of instance.effects) {
      if (frame >= effect.endFrame) this.clearEffect(template.name, id);
    }

    if (!template.persistent && template.duration > 0 && frame >= template.duration) {
      const name = template.name;
      this.teardown(name);
      const queued = this.pending.get(name);
      if (queued !== undefined) {
        this.pending.delete(name);
        this.mount(template, queued);
      }
      return;
    }

    try {
      applyFrame(instance.root, this.frameContext(template, frame));
    } catch (e) {
      this.fail(template.name, e);
    }
  }

  // Fail to nothing: the prop disappears, the stage and other props survive.
  private fail(name: string, error: unknown): void {
    this.teardown(name);
    this.pending.delete(name);
    this.onPropError?.(name, error);
    console.warn("[webmotion] prop errored and was removed", name, error);
  }

  private teardown(name: string): void {
    const instance = this.instances.get(name);
    if (!instance) return;
    this.instances.delete(name);
    instance.audio?.stop();
    for (const effect of instance.effects.values()) effect.audio?.stop();
    this.unmountSubtree(instance.root);
    if (this.instances.size === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private unmountSubtree(root: HTMLElement): void {
    for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
      const release = (el as Partial<ReleasableElement>).wmRelease;
      if (typeof release === "function") {
        try {
          release.call(el);
        } catch {
          // Teardown must never throw.
        }
      }
    }
    root.remove();
  }

  private buildLayer(template: PropTemplate, data: Record<string, unknown>): HTMLElement {
    const layer = document.createElement("div");
    layer.setAttribute("data-w-prop", template.name);
    layer.style.cssText =
      `position:absolute;top:0;left:0;width:${template.width}px;height:${template.height}px;` +
      `transform-origin:top left;overflow:hidden;pointer-events:none;background:transparent;`;
    layer.innerHTML = template.markup;
    const safe = sanitizeData(data);
    expandTemplates(layer, safe);
    substituteData(layer, safe);
    this.layoutLayer(layer, template);
    return layer;
  }

  private layoutLayer(layer: HTMLElement, template: PropTemplate): void {
    const availW = this.containerEl.clientWidth || template.width;
    const scale = availW / template.width;
    layer.style.transform = `scale(${scale})`;
  }

  private frameContext(template: PropTemplate, frame: number): FrameContext {
    return {
      frame,
      globalFrame: frame,
      fps: template.fps,
      width: template.width,
      height: template.height,
    };
  }

  private durationOf(template: PropTemplate): number {
    return template.duration > 0 ? template.duration : Number.MAX_SAFE_INTEGER;
  }

  private async settleReady(root: HTMLElement): Promise<void> {
    const readies: Promise<void>[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      const ready = (el as { wmReady?: unknown }).wmReady;
      if (ready instanceof Promise) readies.push(ready as Promise<void>);
    }
    await Promise.all(readies);
  }

  private startAudio(instance: Instance): void {
    const clips = collectAudioClips(
      instance.root,
      instance.template.fps,
      this.durationOf(instance.template),
    );
    this.startClipAudio(instance, clips, (audio) => {
      instance.audio = audio;
    });
  }

  /** Schedule clips against the prop clock, decoding late if the sources
   *  were not preloaded. Late audio beats no audio; preload() avoids the
   *  decode path. */
  private startClipAudio(
    instance: Instance,
    clips: ReturnType<typeof collectAudioClips>,
    assign: (audio: ScheduledAudio) => void,
  ): void {
    if (clips.length === 0 || typeof AudioContext === "undefined") return;
    const { template } = instance;
    try {
      const ctx = this.ensureAudioContext();
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const schedule = () => {
        const elapsed = ((this.ticker.now() - instance.startMs) / 1000) * template.fps;
        assign(scheduleClips(ctx, clips, this.buffers, template.fps, elapsed, ctx.currentTime));
      };
      const missing = clips.some((c) => !this.buffers.has(c.src));
      if (!missing) {
        schedule();
        return;
      }
      void loadClipBuffers(ctx, clips).then((decoded) => {
        for (const [src, buf] of decoded) this.buffers.set(src, buf);
        if (!this.instances.has(template.name)) return;
        schedule();
      });
    } catch (e) {
      console.warn("[webmotion] prop audio failed to start", template.name, e);
    }
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    return this.audioCtx;
  }
}
