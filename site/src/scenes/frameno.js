// A frame readout as a WebMotion component: the element's text is the local
// frame index, zero padded. Usage: frameno="pad: 3".
//
// It exists to make the determinism claim self-evident. The number a visitor
// reads is drawn by the scene, not printed by the page chrome around it, so
// dragging the scrubber to frame 137 and seeing 137 burned into the picture is
// the proof rather than an illustration of it.
import { registerComponent, parseProps, num } from "@superhq/webmotion/elements";

let registered = false;

export function registerFrameNo() {
  if (registered) return;
  registered = true;
  registerComponent("frameno", {
    parse(value) {
      const p = parseProps(value);
      return { pad: num(p.pad, 3), prefix: p.prefix ?? "", suffix: p.suffix ?? "" };
    },
    render(el, d, ctx) {
      el.textContent = d.prefix + String(ctx.frame).padStart(d.pad, "0") + d.suffix;
    },
  });
}
