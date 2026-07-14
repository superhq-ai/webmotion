// A vertical reel (1080x1920): World Cup 2026 by the numbers, as of the
// semifinals (July 15, 2026). Sports-infographic styling, data-driven bars
// via w-for, count-ups, and a portrait composition end to end.
import "@superhq/webmotion/elements";
import { registerCount } from "./lib/count.js";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION = 420;

registerCount();

const SCENE = `
<style>
  w-composition {
    font-family: -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
    color: #f4fff2;
  }
  .tag    { font-size: 30px; font-weight: 700; text-align: center; letter-spacing: 0.3em;
            color: #c8f542; }
  .mega   { font-size: 128px; font-weight: 800; font-style: italic; text-align: center;
            letter-spacing: -0.03em; line-height: 1.02; }
  .big    { font-size: 76px; font-weight: 800; font-style: italic; text-align: center;
            letter-spacing: -0.02em; }
  .sub    { font-size: 34px; text-align: center; color: rgba(244,255,242,0.6); }

  .board  { display: flex; flex-direction: column; gap: 26px; }
  .brow   { display: flex; align-items: center; gap: 18px; }
  .bflag  { width: 58px; height: 44px; border-radius: 6px; object-fit: cover; }
  .bname  { width: 280px; font-size: 38px; font-weight: 800; font-style: italic; text-align: right; }
  .btrack { flex: 1; height: 54px; border-radius: 10px; background: rgba(255,255,255,0.07); position: relative; }
  .bfill  { display: block; position: relative; height: 54px; border-radius: 10px;
            background: linear-gradient(90deg, #8fd542, #c8f542); }
  .bgoals { width: 64px; font-size: 44px; font-weight: 800; color: #c8f542;
            font-variant-numeric: tabular-nums; }

  .vs   { font-size: 40px; font-weight: 700; color: #c8f542; text-align: center; }
  .card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
          background: rgba(255,255,255,0.05); border: 2px solid rgba(200,245,66,0.35);
          border-radius: 22px; }
  .trow { display: flex; align-items: center; gap: 24px; }
  .tflag { width: 84px; height: 63px; border-radius: 8px; object-fit: cover; }
  .team { font-size: 64px; font-weight: 800; font-style: italic; letter-spacing: -0.02em; }
  .meta { font-size: 24px; letter-spacing: 0.18em; color: rgba(244,255,242,0.55); }

  .fact  { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
           background: rgba(255,255,255,0.05); border-radius: 22px; }
  .fnum  { font-size: 110px; font-weight: 800; font-style: italic; color: #c8f542;
           font-variant-numeric: tabular-nums; }
  .flab  { font-size: 26px; font-weight: 700; letter-spacing: 0.22em; color: rgba(244,255,242,0.65); }
</style>

<w-defs>
  <w-animation name="slam">
    <w-animate property="opacity" from="0"    to="1" start="0" end="10" easing="easeOutCubic"></w-animate>
    <w-animate property="scale"   from="1.25" to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="up">
    <w-animate property="opacity" from="0"  to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="44" to="0" start="0" end="14" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<w-audio src="assets/reel-score.m4a" gain="0.9">
  <w-animate property="gain" from="0.9" to="0" start="396" end="420"></w-animate>
</w-audio>
<w-sequence from="66"><w-audio src="assets/whoosh.m4a" gain="0.5"></w-audio></w-sequence>
<w-sequence from="226"><w-audio src="assets/whoosh.m4a" gain="0.45"></w-audio></w-sequence>

<w-rect x="0" y="0" width="1080" height="1920"
        fill="radial-gradient(140% 90% at 50% 0%, #0d2414 0%, #081409 55%, #050c06 100%)"></w-rect>
<w-rect x="0" y="0" width="1080" height="1920"
        fill="repeating-linear-gradient(0deg, transparent 0px, transparent 118px, rgba(200,245,66,0.05) 118px, rgba(200,245,66,0.05) 120px)"></w-rect>

<!-- Hook -->
<w-sequence from="8" duration="64">
  <w-el x="0" y="0" width="1080" height="1920">
    <w-animate property="opacity" from="1" to="0" start="54" end="64" easing="easeInCubic"></w-animate>
    <w-text class="tag" motion="up" x="0" y="330" width="1080">WORLD CUP 2026</w-text>
    <w-sequence from="8">
      <w-text class="mega" motion="slam" x="60" y="404" width="960">THE SEMIS,<br/>BY THE<br/>NUMBERS</w-text>
    </w-sequence>
    <w-sequence from="16">
      <w-el motion="slam" x="150" y="830" width="780" height="1050"
            style="background:url('assets/reel/striker.png') center/contain no-repeat;">
        <w-animate property="y" from="0" to="-14" start="12" end="48" easing="easeOutSine"></w-animate>
      </w-el>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Golden boot race -->
<w-sequence from="72" duration="156">
  <w-el x="0" y="0" width="1080" height="1920">
    <w-animate property="opacity" from="1" to="0" start="146" end="156" easing="easeInCubic"></w-animate>
    <w-text class="tag" motion="up" x="0" y="330" width="1080">GOLDEN BOOT RACE</w-text>
    <w-sequence from="6">
      <w-text class="big" motion="slam" x="0" y="392" width="1080">8 GOALS. TWO LEGENDS.</w-text>
    </w-sequence>

    <w-data name="boot">[
      { "name": "MBAPPÉ",     "flag": "fr",     "goals": 8 },
      { "name": "MESSI",      "flag": "ar",     "goals": 8 },
      { "name": "HAALAND",    "flag": "no",     "goals": 7 },
      { "name": "BELLINGHAM", "flag": "gb-eng", "goals": 6 },
      { "name": "KANE",       "flag": "gb-eng", "goals": 6 }
    ]</w-data>
    <w-el x="70" y="600" width="940" height="600">
      <div class="board">
        <w-for each="boot" as="p">
          <div class="brow">
            <img class="bflag" src="assets/flags/{p.flag}.svg" />
            <span class="bname">{p.name}</span>
            <span class="btrack">
              <span class="bfill" style="width:56px;">
                <w-animate property="width" from="56px" to="{p.goals * 54}px"
                           start="{14 + i * 6}" end="{40 + i * 6}" easing="easeOutCubic"></w-animate>
              </span>
            </span>
            <b class="bgoals" count="to: {p.goals}; start: {14 + i * 6}; end: {40 + i * 6}"></b>
          </div>
        </w-for>
      </div>
    </w-el>
    <w-sequence from="60">
      <w-text class="sub" motion="up" x="0" y="1280" width="1080">Mbappé leads on assists: 3 to Messi's 1.</w-text>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- The semifinals -->
<w-sequence from="228" duration="92">
  <w-el x="0" y="0" width="1080" height="1920">
    <w-animate property="opacity" from="1" to="0" start="82" end="92" easing="easeInCubic"></w-animate>
    <w-text class="tag" motion="up" x="0" y="400" width="1080">THE SEMIFINALS</w-text>

    <w-data name="semis">[
      { "a": "FRANCE",    "fa": "fr", "b": "SPAIN",   "fb": "es",     "meta": "JUL 14" },
      { "a": "ARGENTINA", "fa": "ar", "b": "ENGLAND", "fb": "gb-eng", "meta": "JUL 15" }
    ]</w-data>
    <w-for each="semis" as="s">
      <w-sequence from="{8 + i * 14}">
        <w-el class="card" motion="slam" x="90" y="{500 + i * 460}" width="900" height="400">
          <div class="trow"><img class="tflag" src="assets/flags/{s.fa}.svg" /><span class="team">{s.a}</span></div>
          <div class="vs">VS</div>
          <div class="trow"><img class="tflag" src="assets/flags/{s.fb}.svg" /><span class="team">{s.b}</span></div>
          <div class="meta">{s.meta}</div>
        </w-el>
      </w-sequence>
    </w-for>
    <w-sequence from="40">
      <w-el motion="up" x="120" y="1400" width="840" height="480"
            style="background:url('assets/reel/duel.png') center/contain no-repeat;"></w-el>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Tournament scale -->
<w-sequence from="320" duration="60">
  <w-el x="0" y="0" width="1080" height="1920">
    <w-animate property="opacity" from="1" to="0" start="50" end="60" easing="easeInCubic"></w-animate>
    <w-text class="tag" motion="up" x="0" y="420" width="1080">BIGGEST CUP EVER</w-text>
    <w-data name="facts">[
      { "n": 48,  "label": "TEAMS",        "x": 90,  "y": 560 },
      { "n": 104, "label": "MATCHES",      "x": 560, "y": 560 },
      { "n": 16,  "label": "CITIES",       "x": 90,  "y": 920 },
      { "n": 3,   "label": "HOST NATIONS", "x": 560, "y": 920 }
    ]</w-data>
    <w-for each="facts" as="f">
      <w-sequence from="{6 + i * 6}">
        <w-el class="fact" motion="slam" x="{f.x}" y="{f.y}" width="430" height="330">
          <b class="fnum" count="to: {f.n}; start: 4; end: 26"></b>
          <div class="flab">{f.label}</div>
        </w-el>
      </w-sequence>
    </w-for>
  </w-el>
</w-sequence>

<!-- Outro -->
<w-sequence from="380">
  <w-el motion="slam" x="0" y="0" width="1080" height="1920"
        style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:380px;gap:22px;">
    <div class="tag">THE FINAL</div>
    <div class="mega">JUL 19<br/>METLIFE</div>
    <div class="sub">Who takes it?</div>
  </w-el>
  <w-sequence from="6">
    <w-el motion="up" x="270" y="1060" width="540" height="810"
          style="background:url('assets/reel/celebrate.png') center/contain no-repeat;"></w-el>
  </w-sequence>
</w-sequence>
`;

export default {
  id: "reel",
  kind: "Elements",
  title: "Football reel",
  blurb:
    "A vertical 1080x1920 infographic reel: World Cup 2026 at the semifinals, " +
    "with the golden boot race as data-driven bars, count-ups, and slam cuts. " +
    "Portrait compositions export like any other.",
  downloadName: "worldcup-reel.mp4",
  chapters: [
    { label: "Hook", from: 0 },
    { label: "Golden Boot", from: 72 },
    { label: "Semis", from: 228 },
    { label: "Scale", from: 320 },
    { label: "Final", from: 380 },
  ],
  source: `<w-composition width="1080" height="1920" fps="30" duration="420">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#050c06");
    element.innerHTML = SCENE;

    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
