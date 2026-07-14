import type { RenderContext } from "../core/component.js";
import type { Renderer } from "./renderer.js";

/**
 * Renderer used in tests and headless environments.
 */
export class NullRenderer implements Renderer {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  async init(): Promise<void> {}
  beginFrame(_globalFrame: number): void {}
  makeContext(base: RenderContext): RenderContext {
    return base;
  }
  capture(): VideoFrame | null {
    return null;
  }
  destroy(): void {}
}
