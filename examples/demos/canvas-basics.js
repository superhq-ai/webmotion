import { Composition, Runtime, Layer, CanvasRenderer, interpolate, Easing } from "@superhq/webmotion";

// A clean, light title card in the spirit of a product keynote. Everything is a
// pure function of `frame`, so preview and export match exactly.
const BG = "#f5f5f7";
const INK = "#1d1d1f";
const MUTED = "#86868b";
const ACCENT = "#0071e3";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

class TitleCard {
  mount() {}

  renderFrame({ ctx, frame, width, height }) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;

    // Kicker.
    const kicker = interpolate(frame, [6, 22], [0, 1], { easing: Easing.easeOutCubic, ...clamp });
    ctx.save();
    ctx.globalAlpha = kicker;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = '600 22px -apple-system, "SF Pro Display", ui-sans-serif, system-ui, sans-serif';
    ctx.letterSpacing = "7px";
    ctx.fillText("WEBMOTION", cx + 4, height * 0.32);
    ctx.restore();

    // Two-line headline, each line rising and fading in with a stagger.
    const lines = ["Deterministic video,", "rendered in the browser."];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = INK;
    ctx.font = '600 76px -apple-system, "SF Pro Display", ui-sans-serif, system-ui, sans-serif';
    ctx.letterSpacing = "-2px";
    const blockTop = height * 0.46;
    const lineH = 90;
    lines.forEach((line, i) => {
      const start = 16 + i * 9;
      const a = interpolate(frame, [start, start + 22], [0, 1], {
        easing: Easing.easeOutCubic,
        ...clamp,
      });
      const dy = interpolate(frame, [start, start + 22], [44, 0], {
        easing: Easing.easeOutCubic,
        ...clamp,
      });
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillText(line, cx, blockTop + i * lineH + dy);
      ctx.restore();
    });
    ctx.letterSpacing = "0px";

    // Accent rule that wipes in beneath the headline.
    const ruleW = interpolate(frame, [54, 86], [0, 320], { easing: Easing.easeInOutCubic, ...clamp });
    ctx.fillStyle = ACCENT;
    ctx.fillRect(cx - ruleW / 2, blockTop + lineH + 56, ruleW, 5);
  }

  destroy() {}
}

export default {
  id: "title-card",
  kind: "Canvas 2D",
  title: "Title card",
  blurb: "Kinetic typography drawn straight to 2D canvas.",
  downloadName: "webmotion-title.mp4",
  poster: 118,
  chapters: [
    { label: "Hook", from: 0 },
    { label: "Headline", from: 16 },
    { label: "Hold", from: 90 },
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
        renderer: new CanvasRenderer(composition.width, composition.height, { canvas }),
        layers: [new Layer({ name: "title", component: new TitleCard() })],
      });
    return { composition, buildRuntime };
  },
};
