import { Composition, Runtime, Layer, interpolate, Easing } from "@superhq/webmotion";
import { HtmlRenderer } from "@superhq/webmotion/html-in-canvas";

// A product UI mockup rendered entirely from DOM and CSS, then rasterized to
// video through an SVG foreignObject. This is real markup: a prompt composer
// with a typed query, a toolbar, and an upgrade row.
const PROMPT = "create a landing page for my product";
const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// Inline SVG icons. They render inside the foreignObject rasterizer because the
// clone keeps the SVG namespace and currentColor inherits from the icon's span.
const ICON = {
  plus: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  attach: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.33 3.33 0 0 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 0 1-2.36-2.36l8.49-8.48" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>`,
  crown: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 8l4.5 3.2L12 5l5.5 6.2L22 8l-2 11H4L2 8z"/></svg>`,
};
const iconSpan = (svg, color) =>
  `<span style="display:inline-flex;align-items:center;color:${color};">${svg}</span>`;

class PromptComposer {
  mount({ container }) {
    if (!container) throw new Error("PromptComposer requires a DOM container");

    this.root = document.createElement("div");
    this.root.style.cssText = [
      "position:absolute",
      "inset:0",
      "display:grid",
      "place-items:center",
      `font-family:${FONT}`,
      "background:radial-gradient(130% 130% at 50% -10%, #eef0f4 0%, #e4e7ec 55%, #dde0e7 100%)",
    ].join(";");

    this.card = document.createElement("div");
    this.card.style.cssText = [
      "width:912px",
      "background:#ffffff",
      "border-radius:32px",
      "border:1px solid rgba(0,0,0,0.05)",
      "box-shadow:0 50px 100px -30px rgba(20,24,40,0.38), 0 16px 40px -20px rgba(20,24,40,0.20)",
      "overflow:hidden",
    ].join(";");

    // Prompt heading, right aligned like a returning chat.
    const heading = document.createElement("div");
    heading.textContent = "Where should we begin?";
    heading.style.cssText = [
      "padding:34px 40px 8px",
      "text-align:right",
      "font-size:27px",
      "font-weight:600",
      "letter-spacing:-0.01em",
      "color:#1d1d1f",
    ].join(";");

    // The composer input.
    const input = document.createElement("div");
    input.style.cssText = "padding:28px 40px 10px;";

    this.query = document.createElement("div");
    this.query.style.cssText = [
      "font-size:36px",
      "font-weight:500",
      "letter-spacing:-0.015em",
      "color:#1d1d1f",
      "min-height:48px",
      "line-height:1.3",
    ].join(";");

    this.textNode = document.createTextNode("");
    this.caret = document.createElement("span");
    this.caret.style.cssText = [
      "display:inline-block",
      "width:3px",
      "height:36px",
      "margin-left:3px",
      "vertical-align:-5px",
      "background:#0071e3",
    ].join(";");
    this.query.append(this.textNode, this.caret);

    // Toolbar row.
    const toolbar = document.createElement("div");
    toolbar.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:22px",
      "padding:24px 40px 30px",
      "color:#86868b",
      "font-size:20px",
    ].join(";");
    toolbar.innerHTML = `
      ${iconSpan(ICON.plus, "#6e6e73")}
      ${iconSpan(ICON.attach, "#6e6e73")}
      <span style="display:flex;align-items:center;gap:10px;color:#1d1d1f;font-weight:500;">
        ${iconSpan(ICON.send, "#0071e3")} Super Computer
        <span style="background:#e7f0ff;color:#0071e3;font-size:14px;font-weight:600;padding:4px 11px;border-radius:980px;">New</span>
      </span>
    `;

    // Upgrade footer.
    const footer = document.createElement("div");
    footer.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:12px",
      "padding:20px 40px",
      "border-top:1px solid rgba(0,0,0,0.06)",
      "background:#fbfbfd",
      "color:#6e6e73",
      "font-size:18px",
    ].join(";");
    footer.innerHTML = `${iconSpan(ICON.crown, "#c99a2e")} Upgrade to PRO`;

    input.appendChild(this.query);
    this.card.append(heading, input, toolbar, footer);
    this.root.appendChild(this.card);
    container.appendChild(this.root);
  }

  renderFrame({ frame }) {
    // Card settles in.
    const intro = interpolate(frame, [0, 22], [0, 1], { easing: Easing.easeOutCubic, ...clamp });
    const lift = interpolate(frame, [0, 22], [26, 0], { easing: Easing.easeOutCubic, ...clamp });
    const scale = interpolate(frame, [0, 22], [0.96, 1], { easing: Easing.easeOutCubic, ...clamp });
    this.card.style.opacity = String(intro);
    this.card.style.transform = `translate3d(0, ${lift}px, 0) scale(${scale})`;

    // Query types out one character at a time.
    const chars = Math.round(
      interpolate(frame, [24, 96], [0, PROMPT.length], { easing: Easing.linear, ...clamp }),
    );
    this.textNode.textContent = PROMPT.slice(0, chars);

    // Caret blinks on a fixed frame cadence, and hides once typing is done.
    const done = chars >= PROMPT.length;
    const blink = Math.floor(frame / 8) % 2 === 0;
    this.caret.style.opacity = done ? "0" : blink ? "1" : "0";
  }

  destroy() {
    this.root?.remove();
  }
}

export default {
  id: "product-ui",
  kind: "HTML in canvas",
  title: "Product UI",
  blurb: "A real DOM and CSS interface, rasterized to video via foreignObject.",
  downloadName: "webmotion-product.mp4",
  poster: 112,
  chapters: [
    { label: "Compose", from: 0 },
    { label: "Type", from: 24 },
    { label: "Ready", from: 100 },
  ],
  create() {
    const composition = new Composition({
      width: 1280,
      height: 720,
      fps: 30,
      durationInFrames: 150,
    });
    const buildRuntime = (canvas) =>
      new Runtime({
        composition,
        renderer: new HtmlRenderer(composition.width, composition.height, {
          canvas,
          background: "rgba(0,0,0,0)",
        }),
        layers: [new Layer({ name: "composer", component: new PromptComposer() })],
      });
    return { composition, buildRuntime };
  },
};
