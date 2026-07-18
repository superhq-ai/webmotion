// Optional three.js entry. Importing it registers <w-model> and <w-light>
// alongside the core elements; three is an optional peer dependency, so
// applications that never import "@superhq/webmotion/three" pay nothing for
// it.
import "../elements/index.js";
import { registerInertTag } from "../elements/registry.js";
import { defineModelElement } from "./model-element.js";
import { defineMaterialTextElement } from "./material-text.js";
import { defineShaderFxElement } from "./shader-fx.js";

registerInertTag("W-LIGHT");
registerInertTag("W-MATERIAL-TEXT");
registerInertTag("W-SHADER-FX");

export { WModel, clipTimeAt, defineModelElement } from "./model-element.js";
export { WMaterialText, fitLines, defineMaterialTextElement } from "./material-text.js";
export {
  WShaderFx,
  defineShaderFxElement,
  registerShaderEffect,
  type ShaderEffectContext,
  type ShaderEffectInstance,
  type ShaderEffectFactory,
} from "./shader-fx.js";
export { configureModelLoaders } from "./loaders.js";
export { clearModelCache } from "./model-cache.js";
export { buildPreset, resolveToneMapping, type PresetName } from "./lighting.js";

// <w-light> holds lighting declarations for its parent <w-model>; it never
// renders as DOM.
class WLight extends HTMLElement {
  connectedCallback(): void {
    this.style.display = "none";
  }
}

export function defineLightElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-light")) customElements.define("w-light", WLight);
}

defineModelElement();
defineLightElement();
defineMaterialTextElement();
defineShaderFxElement();
