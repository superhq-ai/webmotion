/**
 * WebMotion exports.
 * Rendering is frame-based and deterministic.
 */

// Core types.
export { Composition, type CompositionConfig } from "./core/composition.js";
export { Timeline } from "./core/timeline.js";
export {
  Sequence,
  type SequenceConfig,
  type SequenceState,
} from "./core/sequence.js";
export {
  type WebMotionComponent,
  type RenderContext,
  type MountContext,
} from "./core/component.js";

// Animation helpers.
export {
  interpolate,
  type InterpolateOptions,
  type ExtrapolateMode,
} from "./animation/interpolate.js";
export * as Easing from "./animation/easing.js";
export { type EasingFunction } from "./animation/easing.js";

// Runtime orchestration.
export { Runtime, type RuntimeConfig } from "./runtime/runtime.js";
export { Layer, type LayerConfig } from "./runtime/layer.js";

// Preview playback: the one clock for pacing, audio, volume, and loop state.
export { PlaybackController, type PlaybackMedia } from "./playback/controller.js";

// Renderers.
export { type Renderer } from "./render/renderer.js";
export { NullRenderer } from "./render/null-renderer.js";
export {
  CanvasRenderer,
  type CanvasRenderContext,
  type CanvasRendererOptions,
  type Canvas2DContext,
} from "./render/canvas-renderer.js";

// Export.
export {
  FrameEncoder,
  type EncoderConfig,
  type VideoMuxer,
} from "./export/encoder.js";
export {
  exportVideo,
  type ExportOptions,
  type ExportProgress,
} from "./export/exporter.js";
