// A stats film: the "big numbers" beat every SaaS launch page wants, with
// counters that count up deterministically. The count-up is a custom component
// registered through the same registry the built-ins use, so this demo is also
// the extensibility showcase: `count="to: 12480; start: 8; end: 56"` on any
// entity, driven purely by the frame.
import "@superhq/webmotion/elements";
import { registerCount } from "./lib/count.js";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION = 240;

registerCount();

const SCENE = `
<style>
  w-composition {
    font-family: -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
    color: #f5f6f8;
  }
  .kicker  { font-size: 54px; font-weight: 600; text-align: center; letter-spacing: -0.01em; }
  .num     { font-size: 88px; font-weight: 700; text-align: center; letter-spacing: -0.02em;
             font-variant-numeric: tabular-nums; }
  .label   { font-size: 18px; font-weight: 500; text-align: center; color: rgba(235,238,245,0.55);
             text-transform: uppercase; letter-spacing: 0.14em; }
  .close   { font-size: 44px; font-weight: 600; text-align: center; letter-spacing: -0.01em; }
  .install { font-size: 19px; text-align: center; color: rgba(235,238,245,0.5);
             font-family: 'SF Mono', ui-monospace, Menlo, monospace; }
</style>

<w-defs>
  <w-animation name="beat-in">
    <w-animate property="opacity" from="0"  to="1" start="0" end="16" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="28" to="0" start="0" end="16" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="rule-in">
    <w-animate property="opacity" from="0"   to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
    <w-animate property="scale"   from="0.2" to="1" start="0" end="16" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<w-rect x="0" y="0" width="1280" height="720"
        fill="radial-gradient(110% 130% at 50% -20%, #151b2e 0%, #0b0e18 55%, #07090f 100%)"></w-rect>

<!-- Beat 1: kicker -->
<w-sequence from="12" duration="60">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="46" end="58" easing="easeInCubic"></w-animate>
    <w-text class="kicker" motion="beat-in" x="0" y="322" width="1280">By the numbers.</w-text>
  </w-el>
</w-sequence>

<!-- Beat 2: three counters from one template, staggered by the loop index -->
<w-data name="stats">[
  { "to": 99.99, "decimals": 2, "suffix": "%",      "label": "uptime",          "fade": "#6f92ff, #a97dff" },
  { "to": 12480, "decimals": 0, "suffix": "",       "label": "renders per day", "fade": "#a97dff, #ff7dc7" },
  { "to": 4.8,   "decimals": 1, "suffix": "&#215;", "label": "faster exports",  "fade": "#7dd8ff, #6f92ff" }
]</w-data>

<w-sequence from="72" duration="132">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="118" end="130" easing="easeInCubic"></w-animate>

    <w-for each="stats" as="stat">
      <w-sequence from="{i * 10}">
        <w-el motion="beat-in" x="{53 + i * 427}" y="248" width="320" height="240">
          <w-rect motion="rule-in" x="140" y="0" width="40" height="4" radius="2"
                  fill="linear-gradient(90deg, {stat.fade})"></w-rect>
          <w-text class="num" x="0" y="42" width="320"
                  count="to: {stat.to}; decimals: {stat.decimals}; suffix: {stat.suffix}; start: 8; end: 56"></w-text>
          <w-text class="label" x="0" y="168" width="320">{stat.label}</w-text>
        </w-el>
      </w-sequence>
    </w-for>
  </w-el>
</w-sequence>

<!-- Beat 3: close -->
<w-sequence from="204">
  <w-el motion="beat-in" x="0" y="0" width="1280" height="720"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;">
    <div class="close">Author yours in HTML.</div>
    <div class="install">npm install @superhq/webmotion</div>
  </w-el>
</w-sequence>
`;

export default {
  id: "numbers",
  kind: "Elements",
  title: "By the numbers",
  blurb:
    "The stats beat from every launch page, as markup. The count-up is a custom " +
    "component registered through the same registry as the built-ins, driven " +
    "purely by the frame, so the counters land identically in every export.",
  downloadName: "webmotion-numbers.mp4",
  chapters: [
    { label: "Intro", from: 0 },
    { label: "Numbers", from: 72 },
    { label: "Close", from: 204 },
  ],
  source: `<w-composition width="1280" height="720" fps="30" duration="240">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#07090f");
    element.innerHTML = SCENE;

    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
