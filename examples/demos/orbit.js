// A full product film for a fictional app, "Orbit": six scenes over twenty
// seconds. The product UI is real HTML (window chrome, kanban board, charts),
// so it stays crisp at any resolution; the atmosphere is AI-generated imagery;
// the counters and chart bars are frame-driven components. This is the demo
// that shows the whole point: a launch video is just a web page with a clock.
import "@superhq/webmotion/elements";
import { registerCount } from "./lib/count.js";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION = 600;

registerCount();

const SCENE = `
<style>
  w-composition {
    font-family: -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
    color: #f5f6f8;
  }
  .wordmark  { font-size: 76px; font-weight: 700; text-align: center; letter-spacing: -0.02em; }
  .tagline   { font-size: 26px; text-align: center; color: rgba(235,238,245,0.62); }
  .headline  { font-size: 44px; font-weight: 700; text-align: center; letter-spacing: -0.015em; }
  .eyebrow   { font-size: 14px; font-weight: 600; letter-spacing: 0.18em; color: #9fb4ff; }
  .f-head    { font-size: 46px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.12; }
  .f-sub     { font-size: 19px; line-height: 1.5; color: rgba(235,238,245,0.6); }
  .quote     { font-size: 36px; font-weight: 600; text-align: center; letter-spacing: -0.01em; line-height: 1.3; }
  .attrib    { font-size: 15px; text-align: center; color: rgba(235,238,245,0.55);
               text-transform: uppercase; letter-spacing: 0.14em; }
  .cta       { font-size: 40px; font-weight: 700; text-align: center; letter-spacing: -0.015em; }
  .url       { font-size: 19px; text-align: center; color: rgba(235,238,245,0.5);
               font-family: 'SF Mono', ui-monospace, Menlo, monospace; }

  /* Product UI, as real HTML. */
  .win { width: 100%; height: 100%; border-radius: 16px; overflow: hidden;
         background: linear-gradient(180deg, rgba(24,28,44,0.97), rgba(14,17,28,0.97));
         border: 1px solid rgba(255,255,255,0.1); font-size: 13px; }
  .bar-title { display: flex; align-items: center; gap: 8px; padding: 12px 16px;
               border-bottom: 1px solid rgba(255,255,255,0.07);
               color: rgba(235,238,245,0.55); font-size: 12px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.14); }
  .body { display: flex; height: calc(100% - 43px); }
  .side { width: 168px; padding: 14px 10px; border-right: 1px solid rgba(255,255,255,0.07);
          display: flex; flex-direction: column; gap: 4px; }
  .nav { padding: 8px 12px; border-radius: 8px; color: rgba(235,238,245,0.55); }
  .nav.on { background: rgba(111,146,255,0.14); color: #cdd9ff; }
  .mainpane { flex: 1; padding: 18px; display: flex; flex-direction: column; gap: 16px; }
  .tiles { display: flex; gap: 12px; }
  .tile { flex: 1; padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07); }
  .tile b { display: block; font-size: 26px; font-weight: 700; letter-spacing: -0.01em;
            font-variant-numeric: tabular-nums; }
  .tile span { font-size: 11.5px; color: rgba(235,238,245,0.5); text-transform: uppercase;
               letter-spacing: 0.1em; }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 10px;
         background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.06); }
  .row .grow { flex: 1; }
  .pill { font-size: 10.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
          text-transform: uppercase; letter-spacing: 0.08em; }
  .pill.ship { background: rgba(125,216,178,0.16); color: #8fd8b8; }
  .pill.prog { background: rgba(111,146,255,0.16); color: #9fb4ff; }
  .pill.rev  { background: rgba(255,125,199,0.14); color: #ff9fd3; }
  .av { width: 20px; height: 20px; border-radius: 50%;
        background: linear-gradient(135deg, #6f92ff, #a97dff); }
  .av.b { background: linear-gradient(135deg, #7dd8c8, #6f92ff); }
  .av.c { background: linear-gradient(135deg, #ff9fd3, #a97dff); }

  .cols { display: flex; gap: 12px; padding: 16px; height: calc(100% - 43px); }
  .col { flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .col h4 { margin: 0; font-size: 11px; font-weight: 600; color: rgba(235,238,245,0.5);
            text-transform: uppercase; letter-spacing: 0.1em; }
  .card { padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.07); font-size: 12.5px; line-height: 1.35; }
  .card .meta { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
  .tag { font-size: 10px; color: rgba(235,238,245,0.45); }

  .chart { flex: 1; display: flex; align-items: flex-end; gap: 14px; padding: 18px 18px 14px; }
  .vbar { flex: 1; border-radius: 6px 6px 3px 3px;
          background: linear-gradient(180deg, #a97dff, #6f92ff); opacity: 0.9; }
  .stats2 { display: flex; gap: 12px; padding: 0 18px 18px; }
</style>

<w-defs>
  <w-animation name="beat-in">
    <w-animate property="opacity" from="0"  to="1" start="0" end="16" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="28" to="0" start="0" end="16" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="panel-up">
    <w-animate property="opacity" from="0"  to="1" start="0" end="20" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="64" to="0" start="0" end="24" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="panel-left">
    <w-animate property="opacity" from="0"   to="1" start="0" end="20" easing="easeOutCubic"></w-animate>
    <w-animate property="x"       from="90"  to="0" start="0" end="24" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="panel-right">
    <w-animate property="opacity" from="0"    to="1" start="0" end="20" easing="easeOutCubic"></w-animate>
    <w-animate property="x"       from="-90"  to="0" start="0" end="24" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<!-- Soundtrack: steady product-demo pulse, swooshes on the panel scenes.
     Audio credits: examples/public/assets/CREDITS.md -->
<w-audio src="assets/orbit-score.m4a" gain="0.8">
  <w-animate property="gain" from="0.8" to="0" start="560" end="600"></w-animate>
</w-audio>
<w-sequence from="88">
  <w-audio src="assets/whoosh.m4a" gain="0.35"></w-audio>
</w-sequence>
<w-sequence from="556">
  <w-audio src="assets/whoosh.m4a" gain="0.3"></w-audio>
</w-sequence>

<w-rect x="0" y="0" width="1280" height="720" fill="#05060a"></w-rect>

<!-- Scene 1: identity -->
<w-sequence from="12" duration="80">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="68" end="80" easing="easeInCubic"></w-animate>
    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/aurora.webp') center/cover no-repeat;">
      <w-animate property="opacity" from="0" to="0.75" start="0" end="24" easing="easeOutSine"></w-animate>
      <w-animate property="scale" from="1.05" to="1" start="0" end="80" easing="easeOutSine"></w-animate>
    </w-el>
    <w-text class="wordmark" x="0" y="288" width="1280">
      Orbit
      <w-animate property="opacity" from="0" to="1" start="8" end="28" easing="easeOutCubic"></w-animate>
      <w-animate property="letter-spacing" from="18px" to="-1.5px" start="8" end="46" easing="easeOutCubic"></w-animate>
    </w-text>
    <w-text class="tagline" x="0" y="404" width="1280">
      Mission control for modern teams.
      <w-animate property="opacity" from="0" to="1" start="30" end="48" easing="easeOutCubic"></w-animate>
      <w-animate property="y" from="14" to="0" start="30" end="48" easing="easeOutCubic"></w-animate>
    </w-text>
  </w-el>
</w-sequence>

<!-- Scene 2: the product, in one view -->
<w-sequence from="92" duration="128">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="116" end="128" easing="easeInCubic"></w-animate>
    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/mesh.webp') center/cover no-repeat;">
      <w-animate property="opacity" from="0" to="0.55" start="0" end="20" easing="easeOutSine"></w-animate>
    </w-el>
    <w-text class="headline" motion="beat-in" x="0" y="64" width="1280">Everything, in one view.</w-text>

    <w-sequence from="12">
      <w-el motion="panel-up" x="180" y="160" width="920" height="470">
        <div class="win">
          <div class="bar-title"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
            Orbit — Overview</div>
          <div class="body">
            <div class="side">
              <div class="nav on">Overview</div><div class="nav">Streams</div>
              <div class="nav">Cycles</div><div class="nav">Releases</div><div class="nav">People</div>
            </div>
            <div class="mainpane">
              <w-data name="tiles">[
                { "count": "to: 24; start: 20; end: 52",                          "label": "active streams" },
                { "count": "to: 132; start: 20; end: 56",                        "label": "shipped this quarter" },
                { "count": "to: 99.98; decimals: 2; suffix: %; start: 20; end: 60", "label": "uptime" }
              ]</w-data>
              <w-data name="tasks">[
                { "name": "Realtime sync engine",    "av": "",  "pill": "ship", "status": "shipped" },
                { "name": "Mobile command bar",      "av": "b", "pill": "prog", "status": "in progress" },
                { "name": "Workspace insights",      "av": "c", "pill": "rev",  "status": "in review" },
                { "name": "SSO + SCIM provisioning", "av": "",  "pill": "prog", "status": "in progress" }
              ]</w-data>
              <div class="tiles">
                <w-for each="tiles" as="t">
                  <div class="tile"><b count="{t.count}"></b><span>{t.label}</span></div>
                </w-for>
              </div>
              <div class="rows">
                <w-for each="tasks" as="task">
                  <div class="row"><span class="av {task.av}"></span><span class="grow">{task.name}</span><span class="pill {task.pill}">{task.status}</span></div>
                </w-for>
              </div>
            </div>
          </div>
        </div>
      </w-el>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Scene 3: plan -->
<w-sequence from="220" duration="130">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="118" end="130" easing="easeInCubic"></w-animate>
    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/mesh.webp') center/cover no-repeat;transform:scaleX(-1);opacity:0.35;"></w-el>

    <w-el motion="beat-in" x="96" y="212" width="440" height="300">
      <div class="eyebrow">PLAN</div>
      <div class="f-head" style="margin-top:14px;">See every stream of work.</div>
      <div class="f-sub" style="margin-top:16px;">Streams, cycles, and releases in one board that stays honest, because it is the same data your team ships from.</div>
    </w-el>

    <w-sequence from="10">
      <w-el motion="panel-left" x="620" y="140" width="564" height="440">
        <div class="win">
          <div class="bar-title"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
            Orbit — Streams</div>
          <w-data name="board">[
            { "title": "Backlog", "cards": [
              { "t": "Usage-based billing", "id": "ORB-341", "av": "c" },
              { "t": "Audit log export",    "id": "ORB-329", "av": "" },
              { "t": "Slack digest bot",    "id": "ORB-317", "av": "b" }
            ]},
            { "title": "In progress", "cards": [
              { "t": "Mobile command bar",  "id": "ORB-312", "av": "b" },
              { "t": "Workspace insights",  "id": "ORB-308", "av": "" },
              { "t": "Cycle burndown view", "id": "ORB-301", "av": "c" }
            ]},
            { "title": "Done", "cards": [
              { "t": "Realtime sync engine", "id": "ORB-290", "av": "" },
              { "t": "Keyboard-first nav",   "id": "ORB-275", "av": "c" },
              { "t": "Public roadmap embed", "id": "ORB-268", "av": "b" }
            ]}
          ]</w-data>
          <div class="cols">
            <w-for each="board" as="col">
              <div class="col"><h4>{col.title}</h4>
                <w-for each="col.cards" as="card">
                  <div class="card">{card.t}<div class="meta"><span class="tag">{card.id}</span><span class="av {card.av}"></span></div></div>
                </w-for>
              </div>
            </w-for>
          </div>
        </div>
      </w-el>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Scene 4: track -->
<w-sequence from="350" duration="130">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="118" end="130" easing="easeInCubic"></w-animate>
    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/mesh.webp') center/cover no-repeat;opacity:0.35;"></w-el>

    <w-sequence from="10">
      <w-el motion="panel-right" x="96" y="140" width="564" height="440">
        <div class="win">
          <div class="bar-title"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
            Orbit — Velocity</div>
          <div style="display:flex;flex-direction:column;height:calc(100% - 43px);">
            <w-data name="velocity">[96, 132, 118, 170, 152, 208, 238]</w-data>
            <div class="chart">
              <w-for each="velocity" as="peak">
                <div class="vbar"><w-animate property="height" from="16px" to="{peak}px"
                     start="{18 + i * 4}" end="{44 + i * 4}" easing="easeOutCubic"></w-animate></div>
              </w-for>
            </div>
            <div class="stats2">
              <div class="tile"><b count="to: 42; start: 40; end: 68"></b><span>ships / week</span></div>
              <div class="tile"><b count="to: 2.4; decimals: 1; suffix: d; start: 44; end: 72"></b><span>median cycle time</span></div>
            </div>
          </div>
        </div>
      </w-el>
    </w-sequence>

    <w-el motion="beat-in" x="744" y="212" width="440" height="300">
      <div class="eyebrow">TRACK</div>
      <div class="f-head" style="margin-top:14px;">Progress that proves itself.</div>
      <div class="f-sub" style="margin-top:16px;">Velocity, cycle time, and release health, computed from what actually merged. No status meetings required.</div>
    </w-el>
  </w-el>
</w-sequence>

<!-- Scene 5: the quote -->
<w-sequence from="480" duration="80">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="68" end="80" easing="easeInCubic"></w-animate>
    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/horizon.webp') center/cover no-repeat;">
      <w-animate property="opacity" from="0" to="0.85" start="0" end="24" easing="easeOutSine"></w-animate>
      <w-animate property="scale" from="1.04" to="1" start="0" end="80" easing="easeOutSine"></w-animate>
    </w-el>
    <w-text class="quote" motion="beat-in" x="160" y="286" width="960">&#8220;Orbit cut our release cycle in half.&#8221;</w-text>
    <w-text class="attrib" x="0" y="392" width="1280">
      Ana Reyes &#183; VP Engineering, Meridian
      <w-animate property="opacity" from="0" to="1" start="18" end="34" easing="easeOutCubic"></w-animate>
    </w-text>
  </w-el>
</w-sequence>

<!-- Scene 6: end card -->
<w-sequence from="560">
  <w-el motion="beat-in" x="0" y="0" width="1280" height="720"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;">
    <div class="cta">Start your orbit.</div>
    <div class="url">orbit.superhq.ai</div>
  </w-el>
</w-sequence>
`;

export default {
  id: "orbit",
  kind: "Elements",
  title: "Product demo",
  blurb:
    "A twenty-second launch film for a fictional product. The app UI is real " +
    "HTML (window chrome, kanban, charts), so it stays crisp at any resolution; " +
    "the backdrops are generated imagery; the bars and counters are frame-driven.",
  downloadName: "orbit-product-demo.mp4",
  chapters: [
    { label: "Orbit", from: 0 },
    { label: "Overview", from: 92 },
    { label: "Plan", from: 220 },
    { label: "Track", from: 350 },
    { label: "Voices", from: 480 },
    { label: "CTA", from: 560 },
  ],
  source: `<w-composition width="1280" height="720" fps="30" duration="600">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#05060a");
    element.innerHTML = SCENE;

    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
