import type { Composition } from "./composition.js";

/**
 * Data a component needs to render one frame.
 */
export interface RenderContext {
  /**
   * Component-local frame number. Starts at 0 when the sequence becomes active.
   */
  readonly frame: number;
  /** Local presentation time in seconds (`frame / fps`). */
  readonly time: number;
  /** Frames per second of the composition. */
  readonly fps: number;
  /** Output width in pixels. */
  readonly width: number;
  /** Output height in pixels. */
  readonly height: number;
  /** The composition this render belongs to. */
  readonly composition: Composition;
}

/**
 * Component contract shared by all backends.
 */
export interface WebMotionComponent {
  mount(context: MountContext): void | Promise<void>;
  renderFrame(context: RenderContext): void | Promise<void>;
  destroy(): void | Promise<void>;
}

/**
 * Context passed to `mount`.
 */
export interface MountContext {
  readonly composition: Composition;
  /**
   * Container for DOM-based backends. Undefined for headless backends.
   */
  readonly container?: HTMLElement;
}
