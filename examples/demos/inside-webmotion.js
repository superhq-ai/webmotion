import { Composition, Runtime, Layer, interpolate, Easing } from "@superhq/webmotion";
import { HtmlRenderer } from "@superhq/webmotion/html-in-canvas";

// A self referential demo: the WebMotion editor UI, composed as a video by
// WebMotion. The outer chrome is our own app (brand, tabs, timeline, transport),
// and the inner stage plays a mini title card. Every value is a function of
// `frame`, including the playhead sweep and the clock.
const FONT = "-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";
const FPS = 30;
const DURATION = 150;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

const MARK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const PAUSE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>`;

const INNER_CHAPTERS = [
  { label: "Hook", from: 0 },
  { label: "Headline", from: 16 },
  { label: "Hold", from: 90 },
];

function formatTime(frame) {
  const s = Math.round(frame / FPS);
  return `0:${String(s).padStart(2, "0")}`;
}

function el(tag, cssText, html) {
  const node = document.createElement(tag);
  node.style.cssText = cssText;
  if (html != null) node.innerHTML = html;
  return node;
}

class WebMotionInWebMotion {
  mount({ container }) {
    if (!container) throw new Error("WebMotionInWebMotion requires a DOM container");

    this.root = el(
      "div",
      `position:absolute;inset:0;display:grid;place-items:center;font-family:${FONT};` +
        `background:radial-gradient(130% 130% at 50% -10%, #f6f7f9 0%, #e9ebef 60%, #e2e4ea 100%);`,
    );

    // The app window.
    this.win = el(
      "div",
      "width:1080px;background:#ffffff;border-radius:22px;border:1px solid rgba(0,0,0,0.06);" +
        "box-shadow:0 50px 100px -30px rgba(20,24,40,0.34), 0 16px 40px -20px rgba(20,24,40,0.18);" +
        "overflow:hidden;",
    );

    // Top bar: brand + tabs.
    const topbar = el(
      "div",
      "display:flex;align-items:center;gap:22px;padding:16px 24px;border-bottom:1px solid rgba(0,0,0,0.07);",
    );
    const brand = el(
      "div",
      "display:flex;align-items:center;gap:9px;font-weight:600;font-size:17px;color:#1d1d1f;letter-spacing:-0.01em;",
      `<span style="display:inline-flex;color:#1d1d1f;">${MARK}</span><span>WebMotion</span>`,
    );
    const tabs = el(
      "div",
      "display:flex;gap:4px;padding:4px;background:rgba(0,0,0,0.05);border-radius:980px;font-size:13px;font-weight:500;",
      `<span style="padding:6px 15px;border-radius:980px;background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,0.1);">Title card</span>` +
        `<span style="padding:6px 15px;border-radius:980px;color:#6e6e73;">Product UI</span>`,
    );
    topbar.append(brand, tabs);

    // Body.
    const body = el("div", "display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 40px 26px;");

    const head = el("div", "text-align:center;");
    head.append(
      el("div", "font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#1d1d1f;", "Title card"),
      el("div", "margin-top:3px;font-size:13px;color:#6e6e73;", "Kinetic typography drawn straight to 2D canvas."),
    );

    // Inner video stage with a mini title card scene.
    this.stage = el(
      "div",
      "position:relative;width:600px;height:338px;border-radius:14px;border:1px solid rgba(0,0,0,0.07);" +
        "background:#f5f5f7;box-shadow:0 14px 34px -18px rgba(20,24,40,0.22);overflow:hidden;" +
        "display:flex;flex-direction:column;align-items:center;justify-content:center;",
    );
    this.innerKicker = el(
      "div",
      "font-size:12px;font-weight:600;letter-spacing:5px;color:#86868b;margin-bottom:14px;",
      "WEBMOTION",
    );
    this.innerHeadline = el(
      "div",
      "font-size:38px;font-weight:600;letter-spacing:-1.5px;color:#1d1d1f;line-height:1;text-align:center;",
      "Deterministic video,",
    );
    this.innerRule = el("div", "margin-top:16px;height:4px;width:0;background:#0071e3;border-radius:2px;");
    this.stage.append(this.innerKicker, this.innerHeadline, this.innerRule);

    // Chapter timeline.
    const timeline = el("div", "position:relative;width:600px;padding-top:12px;");
    const chapters = el("div", "display:flex;gap:6px;");
    this.chapterEls = INNER_CHAPTERS.map((ch, i) => {
      const span = i < INNER_CHAPTERS.length - 1 ? INNER_CHAPTERS[i + 1].from - ch.from : DURATION - ch.from;
      const node = el(
        "div",
        `flex-grow:${span};flex-basis:0;height:44px;border-radius:10px;background:#ececee;` +
          "color:#6e6e73;font-size:12px;font-weight:500;display:flex;align-items:flex-end;padding:8px 10px;",
        ch.label,
      );
      return node;
    });
    chapters.append(...this.chapterEls);
    this.playhead = el(
      "div",
      "position:absolute;top:12px;bottom:0;width:0;border-left:1.5px solid #1d1d1f;",
    );
    this.timeBubble = el(
      "div",
      "position:absolute;top:-2px;left:50%;transform:translate(-50%,-100%);background:#1d1d1f;color:#fff;" +
        "font-size:10px;font-weight:600;padding:2px 6px;border-radius:980px;",
      "0:00",
    );
    this.playhead.appendChild(this.timeBubble);
    timeline.append(chapters, this.playhead);

    // Transport.
    const transport = el("div", "display:flex;align-items:center;gap:14px;width:600px;");
    const playBtn = el(
      "div",
      "width:40px;height:40px;border-radius:50%;background:#1d1d1f;color:#fff;display:flex;align-items:center;justify-content:center;",
      PAUSE,
    );
    this.transportTime = el(
      "div",
      "font-size:14px;color:#1d1d1f;font-weight:500;",
      `0:00 <span style="color:#86868b;font-weight:400;">/ 0:05</span>`,
    );
    const spacer = el("div", "flex:1;");
    const exportBtn = el(
      "div",
      "border:1px solid rgba(0,0,0,0.14);background:#fff;color:#1d1d1f;font-size:13px;font-weight:500;" +
        "padding:8px 15px;border-radius:980px;",
      "Export MP4",
    );
    transport.append(playBtn, this.transportTime, spacer, exportBtn);

    body.append(head, this.stage, timeline, transport);
    this.win.append(topbar, body);
    this.root.appendChild(this.win);
    container.appendChild(this.root);
  }

  renderFrame({ frame }) {
    // Whole window settles in at the start.
    const intro = interpolate(frame, [0, 18], [0, 1], { easing: Easing.easeOutCubic, ...clamp });
    const lift = interpolate(frame, [0, 18], [24, 0], { easing: Easing.easeOutCubic, ...clamp });
    this.win.style.opacity = String(intro);
    this.win.style.transform = `translate3d(0, ${lift}px, 0)`;

    // Inner title card animates like the real Title card demo.
    const kick = interpolate(frame, [6, 22], [0, 1], { easing: Easing.easeOutCubic, ...clamp });
    this.innerKicker.style.opacity = String(kick);
    const hl = interpolate(frame, [16, 40], [0, 1], { easing: Easing.easeOutCubic, ...clamp });
    const hlY = interpolate(frame, [16, 40], [26, 0], { easing: Easing.easeOutCubic, ...clamp });
    this.innerHeadline.style.opacity = String(hl);
    this.innerHeadline.style.transform = `translate3d(0, ${hlY}px, 0)`;
    const ruleW = interpolate(frame, [42, 78], [0, 200], { easing: Easing.easeInOutCubic, ...clamp });
    this.innerRule.style.width = `${ruleW}px`;

    // Playhead sweeps the timeline, clock counts up, active chapter highlights.
    const last = DURATION - 1;
    const pct = (frame / last) * 100;
    this.playhead.style.left = `${pct}%`;
    const t = formatTime(frame);
    this.timeBubble.textContent = t;
    this.transportTime.innerHTML = `${t} <span style="color:#86868b;font-weight:400;">/ 0:05</span>`;
    this.chapterEls.forEach((node, i) => {
      const ch = INNER_CHAPTERS[i];
      const to = i < INNER_CHAPTERS.length - 1 ? INNER_CHAPTERS[i + 1].from : DURATION;
      const active = frame >= ch.from && frame < to;
      node.style.background = active ? "#dcdce0" : "#ececee";
      node.style.color = active ? "#1d1d1f" : "#6e6e73";
    });
  }

  destroy() {
    this.root?.remove();
  }
}

export default {
  id: "inside-webmotion",
  title: "Inception",
  blurb: "The WebMotion editor, composed as a video by WebMotion itself.",
  downloadName: "webmotion-inception.mp4",
  poster: 96,
  chapters: [
    { label: "Open", from: 0 },
    { label: "Play", from: 18 },
    { label: "Loop", from: 96 },
  ],
  create() {
    const composition = new Composition({ width: 1280, height: 720, fps: FPS, durationInFrames: DURATION });
    const buildRuntime = (canvas) =>
      new Runtime({
        composition,
        renderer: new HtmlRenderer(composition.width, composition.height, {
          canvas,
          background: "rgba(0,0,0,0)",
        }),
        layers: [new Layer({ name: "app", component: new WebMotionInWebMotion() })],
      });
    return { composition, buildRuntime };
  },
};
