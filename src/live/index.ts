// Live rendering entry: an unbounded, event-driven render target for overlay
// pages (OBS browser sources and similar). Import registers <w-prop> as an
// inert template holder; the same prop markup exports through the normal
// bounded pipeline. Design: docs/LIVE-RFC.md.
import "../elements/index.js";
import { registerInertTag } from "../elements/registry.js";

export { LiveStage, type LiveStageOptions, type TriggerOptions } from "./live-stage.js";
export { RafTicker, ManualTicker, type Ticker } from "./ticker.js";

// <w-prop> holds a prop template; it never renders where it is declared.
class WProp extends HTMLElement {
  connectedCallback(): void {
    this.style.display = "none";
  }
}

export function definePropElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("w-prop")) customElements.define("w-prop", WProp);
}

registerInertTag("W-PROP");
definePropElement();
