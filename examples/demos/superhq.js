// A launch film for SuperHQ (superhq.ai): terminal-dark, monospace, matching
// the site. Copy is taken from the live homepage. Includes a deterministic
// typewriter component for the install line.
import "@superhq/webmotion/elements";
import { registerComponent, parseProps, num } from "@superhq/webmotion/elements";
import { registerCount } from "./lib/count.js";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION = 620;

registerCount();

// Reveal text one character per tick between start and end; the cursor blink
// is derived from the frame, so it exports identically every time.
registerComponent("type", {
  parse(value) {
    const p = parseProps(value);
    return { text: p.text ?? "", start: num(p.start, 0), end: num(p.end, 0) };
  },
  render(el, d, ctx) {
    const span = Math.max(1, d.end - d.start);
    const t = Math.max(0, Math.min(1, (ctx.frame - d.start) / span));
    const chars = Math.round(t * d.text.length);
    const cursor = t < 1 ? (ctx.frame % 16 < 8 ? "▌" : " ") : "";
    el.textContent = d.text.slice(0, chars) + cursor;
  },
});

const SCENE = `
<style>
  w-composition {
    font-family: 'SF Mono', ui-monospace, Menlo, monospace;
    color: #f2f2f0;
  }
  .kicker  { font-size: 17px; font-weight: 500; text-align: center; letter-spacing: 0.34em;
             color: rgba(242,242,240,0.5); }
  .h1      { font-size: 64px; font-weight: 700; text-align: center; letter-spacing: -0.02em; }
  .h2      { font-size: 46px; font-weight: 700; text-align: center; letter-spacing: -0.02em; }
  .sub     { font-size: 22px; text-align: center; color: rgba(242,242,240,0.55); }
  .line    { font-size: 34px; font-weight: 500; text-align: center; }
  .url     { font-size: 22px; text-align: center; color: rgba(242,242,240,0.5); }

  .agent   { font-size: 24px; font-weight: 600; line-height: 96px; text-align: center;
             background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
             border-radius: 14px; }

  .win { width: 100%; height: 100%; border-radius: 14px; overflow: hidden;
         background: #101012; border: 1px solid rgba(255,255,255,0.14); font-size: 15px; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 13px 16px;
         border-bottom: 1px solid rgba(255,255,255,0.09);
         color: rgba(242,242,240,0.5); font-size: 13px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.16); }
  .ws  { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 10px;
         background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
  .repo  { font-weight: 600; }
  .agent-tag { color: rgba(242,242,240,0.5); flex: 1; }
  .vm { font-size: 11px; color: rgba(242,242,240,0.4); letter-spacing: 0.08em; }
  .pill { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
          text-transform: uppercase; letter-spacing: 0.08em; }
  .pill.run    { background: rgba(125,216,178,0.16); color: #8fd8b8; }
  .pill.review { background: rgba(240,200,135,0.16); color: #f0c987; }
  .pill.merged { background: rgba(125,184,232,0.16); color: #7db8e8; }

  .term { width: 100%; height: 100%; border-radius: 14px; background: #0d0d0f;
          border: 1px solid rgba(255,255,255,0.14); padding: 26px 30px;
          font-size: 24px; text-align: left; color: #d9e8d9; }
  .prompt { color: rgba(242,242,240,0.4); }

  .px { border-radius: 3px; }
  .h2-l    { font-size: 46px; font-weight: 700; letter-spacing: -0.02em; }
  .line-l  { font-size: 30px; font-weight: 500; }
  .url-l   { font-size: 21px; color: rgba(242,242,240,0.5); }
  .shot  { border-radius: 12px; border: 1px solid rgba(255,255,255,0.18);
           background: url('assets/superhq/screenshot.webp') center/cover no-repeat; }
  .phone { border-radius: 32px; border: 1px solid rgba(255,255,255,0.2);
           background: url('assets/superhq/remote-agent.jpeg') top/cover no-repeat; }
</style>

<w-defs>
  <w-animation name="beat-in">
    <w-animate property="opacity" from="0"  to="1" start="0" end="16" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="26" to="0" start="0" end="16" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="pop-in">
    <w-animate property="opacity" from="0"    to="1" start="0" end="14" easing="easeOutCubic"></w-animate>
    <w-animate property="scale"   from="0.94" to="1" start="0" end="14" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="panel-up">
    <w-animate property="opacity" from="0"  to="1" start="0" end="20" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="56" to="0" start="0" end="24" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<w-audio src="assets/orbit-score.m4a" gain="0.75">
  <w-animate property="gain" from="0.75" to="0" start="580" end="620"></w-animate>
</w-audio>
<w-sequence from="202"><w-audio src="assets/whoosh.m4a" gain="0.35"></w-audio></w-sequence>
<w-sequence from="552"><w-audio src="assets/whoosh.m4a" gain="0.3"></w-audio></w-sequence>

<w-rect x="0" y="0" width="1280" height="720" fill="#0a0a0c"></w-rect>

<!-- Beat 1: the headline, verbatim from the site -->
<w-sequence from="12" duration="84">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="72" end="84" easing="easeInCubic"></w-animate>
    <w-text class="kicker" motion="beat-in" x="0" y="252" width="1280">SUPERHQ</w-text>
    <w-data name="headline">["Run AI coding agents", "in real sandboxes."]</w-data>
    <w-for each="headline" as="line">
      <w-sequence from="{8 + i * 10}">
        <w-text class="h1" motion="beat-in" x="0" y="{300 + i * 82}" width="1280">{line}</w-text>
      </w-sequence>
    </w-for>
  </w-el>
</w-sequence>

<!-- Beat 2: the agents, each in its own microVM -->
<w-sequence from="96" duration="110">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="98" end="110" easing="easeInCubic"></w-animate>
    <w-text class="h2" motion="beat-in" x="0" y="208" width="1280">Each in its own microVM.</w-text>
    <w-data name="agents">["Claude Code", "OpenAI Codex", "Pi"]</w-data>
    <w-for each="agents" as="agent">
      <w-sequence from="{14 + i * 9}">
        <w-text class="agent" motion="pop-in" x="{212 + i * 300}" y="330" width="256" height="96">{agent}</w-text>
      </w-sequence>
    </w-for>
    <w-sequence from="46">
      <w-text class="sub" motion="beat-in" x="0" y="486" width="1280">Isolated from your machine. Yours to review.</w-text>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Beat 3: the real app -->
<w-sequence from="206" duration="150">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="138" end="150" easing="easeInCubic"></w-animate>
    <w-text class="h2" motion="beat-in" x="0" y="50" width="1280">See every agent at a glance.</w-text>

    <w-sequence from="12">
      <w-el class="shot" motion="panel-up" x="240" y="130" width="800" height="533">
        <w-animate property="scale" from="1.04" to="1" start="0" end="138" easing="easeOutSine"></w-animate>
      </w-el>
    </w-sequence>

    <w-sequence from="44">
      <w-text class="sub" motion="beat-in" x="0" y="680" width="1280">Then review and merge their changes.</w-text>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Beat 4: remote, with the real phone UI -->
<w-sequence from="356" duration="120">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="108" end="120" easing="easeInCubic"></w-animate>

    <w-text class="h2-l" motion="beat-in" x="120" y="176" width="640">Check in from<br/>anywhere.</w-text>
    <w-data name="remote">["Pair once with a QR.", "Review diffs from your phone.", "Reply to agents on the go."]</w-data>
    <w-for each="remote" as="line">
      <w-sequence from="{18 + i * 26}">
        <w-text class="line-l" motion="beat-in" x="120" y="{344 + i * 58}" width="640">{line}</w-text>
      </w-sequence>
    </w-for>
    <w-sequence from="94">
      <w-text class="url-l" motion="beat-in" x="120" y="546" width="640">remote.superhq.ai</w-text>
    </w-sequence>

    <w-sequence from="10">
      <w-el class="phone" x="866" y="84" width="256" height="556">
        <w-animate property="opacity" from="0"  to="1" start="0" end="18" easing="easeOutCubic"></w-animate>
        <w-animate property="x"       from="70" to="0" start="0" end="22" easing="easeOutCubic"></w-animate>
      </w-el>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Beat 5: the install line, typed -->
<w-sequence from="476" duration="80">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="68" end="80" easing="easeInCubic"></w-animate>
    <w-el motion="pop-in" x="240" y="304" width="800" height="112">
      <div class="term"><span class="prompt">$ </span><span
        type="text: brew install --cask superhq-ai/tap/superhq; start: 12; end: 58"></span></div>
    </w-el>
  </w-el>
</w-sequence>

<!-- Beat 6: end card -->
<w-sequence from="556">
  <w-el motion="beat-in" x="0" y="0" width="1280" height="720"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;">
    <img src="assets/superhq/earth.webp" width="96" height="96" style="border-radius:50%;" />
    <div class="h2">SuperHQ</div>
    <div class="sub">Download for Mac</div>
    <div class="url">superhq.ai</div>
  </w-el>
  <w-data name="sky">["#7db8e8", "#f0c987", "#e8875a", "#88b8d8", "#f2e2c4", "#7db8e8", "#e8875a", "#f0c987", "#88b8d8", "#7db8e8", "#f2e2c4", "#e8875a"]</w-data>
  <w-for each="sky" as="c">
    <w-sequence from="{10 + i * 2}">
      <w-rect class="px" motion="pop-in" x="{532 + i * 18}" y="524" width="14" height="14" fill="{c}"></w-rect>
    </w-sequence>
  </w-for>
</w-sequence>
`;

export default {
  id: "superhq",
  kind: "Elements",
  title: "SuperHQ film",
  blurb: "A launch film for superhq.ai, authored with the WebMotion skill from the live site's copy.",
  downloadName: "superhq-demo.mp4",
  chapters: [
    { label: "Sandboxes", from: 0 },
    { label: "Agents", from: 96 },
    { label: "Glance", from: 206 },
    { label: "Remote", from: 356 },
    { label: "Install", from: 476 },
    { label: "Get it", from: 556 },
  ],
  source: `<w-composition width="1280" height="720" fps="30" duration="620">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#0a0a0c");
    element.innerHTML = SCENE;

    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
