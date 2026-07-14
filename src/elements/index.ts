// Declarative, A-Frame inspired authoring for WebMotion. Import this module to
// register the custom elements (<wm-composition>, <wm-sequence>, <wm-text>,
// <wm-rect>, <wm-el>) and the built-in `animate` component. Scenes can be
// authored directly or held inert in a <template> and instantiated via the
// composition's `template` attribute. Everything renders as a pure function of
// frame and exports to MP4 through the html-in-canvas backend.
import { defineElements } from "./elements.js";

export { defineElements, WmComposition } from "./elements.js";
export {
  registerComponent,
  setAnimatedProp,
  type ComponentDef,
  type FrameContext,
} from "./registry.js";
export { exportComposition, type ExportTarget, type ExportOptions } from "./export.js";
export { parseProps, num, splitUnit, resolveEasing } from "./parse.js";

// Auto register on import, the way A-Frame defines its elements on load.
defineElements();
