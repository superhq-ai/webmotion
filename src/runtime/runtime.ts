import { Composition } from "../core/composition.js";
import type { RenderContext } from "../core/component.js";
import { Timeline } from "../core/timeline.js";
import type { Renderer } from "../render/renderer.js";
import { Layer } from "./layer.js";

export interface RuntimeConfig {
  composition: Composition;
  renderer: Renderer;
  layers: Layer[];
  /** DOM container passed to components at mount, for DOM-based backends. */
  container?: HTMLElement;
}

/**
 * Coordinates the timeline, layers, and renderer for one composition.
 */
export class Runtime {
  readonly composition: Composition;
  readonly timeline: Timeline;
  readonly renderer: Renderer;
  private readonly layers: Layer[];
  private readonly container: HTMLElement | undefined;
  private initialized = false;

  constructor(config: RuntimeConfig) {
    this.composition = config.composition;
    this.renderer = config.renderer;
    this.layers = config.layers;
    this.container = config.container;
    this.timeline = new Timeline(config.composition);
  }

  /** Initialize the renderer once, before the first frame. Idempotent. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.renderer.init();
    this.initialized = true;
  }

  /**
   * Render one global frame. This awaits component work before capture.
   */
  async renderFrame(globalFrame: number): Promise<number> {
    await this.init();
    const frame = this.timeline.seek(globalFrame);

    this.renderer.beginFrame(frame);

    for (const layer of this.layers) {
      const state = layer.sequence.resolve(frame);
      if (!state.active) continue;

      if (!layer.isMounted) {
        await layer.component.mount({
          composition: this.composition,
          container: this.container,
        });
        layer.markMounted();
      }

      const base: RenderContext = {
        frame: state.localFrame,
        time: this.composition.frameToSeconds(state.localFrame),
        fps: this.composition.fps,
        width: this.composition.width,
        height: this.composition.height,
        composition: this.composition,
      };
      await layer.component.renderFrame(this.renderer.makeContext(base));
    }

    return frame;
  }

  /** Capture the current surface as a VideoFrame stamped for `globalFrame`. */
  capture(globalFrame: number): VideoFrame | null {
    return this.renderer.capture(
      this.composition.frameToMicros(globalFrame),
      this.composition.frameDurationMicros,
    );
  }

  /** Tear down every mounted component and the renderer. */
  async destroy(): Promise<void> {
    for (const layer of this.layers) {
      if (layer.isMounted) await layer.component.destroy();
    }
    this.renderer.destroy();
  }
}
