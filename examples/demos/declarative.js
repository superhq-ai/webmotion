// The declarative layer: the whole scene is HTML. Importing the elements entry
// registers the structural elements (<w-composition>, <w-sequence>, <w-text>,
// <w-rect>, <w-el>) and the motion elements (<w-animate>, <w-defs>,
// <w-animation>), spec in docs/MOTION.md. The live custom element is the
// preview; export rasterizes the same DOM to MP4.
import "@superhq/webmotion/elements";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION = 150;

const HEADLINE_FONT =
  "700 96px -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif";
const TAGLINE_FONT =
  "400 34px -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";
const CHIP_FONT = "500 25px 'SF Mono', ui-monospace, Menlo, monospace";
const CHIP_STYLE =
  "line-height:64px;white-space:nowrap;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.13);border-radius:999px;";

const SCENE = `
<w-defs>
  <w-animation name="fade-up">
    <w-animate property="opacity" from="0"  to="1" start="0" end="18" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="40" to="0" start="0" end="18" easing="easeOutCubic"></w-animate>
  </w-animation>
  <w-animation name="pop-in">
    <w-animate property="opacity" from="0"   to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
    <w-animate property="scale"   from="0.9" to="1" start="0" end="12" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<w-rect x="0" y="0" width="1280" height="720"
        fill="radial-gradient(120% 130% at 50% -10%, #1b2338 0%, #0d101b 55%, #080a10 100%)"></w-rect>

<w-rect x="960" y="-180" width="480" height="480" radius="240"
        fill="linear-gradient(135deg, rgba(64,110,255,0.22), rgba(154,92,255,0.10))">
  <w-animate property="y"      from="0" to="50" start="0" end="150"></w-animate>
  <w-animate property="rotate" from="0" to="35" start="0" end="150"></w-animate>
</w-rect>
<w-rect x="-200" y="480" width="420" height="420" radius="210"
        fill="linear-gradient(315deg, rgba(64,110,255,0.16), rgba(154,92,255,0.06))">
  <w-animate property="y" from="0" to="-40" start="0" end="150"></w-animate>
</w-rect>

<w-sequence from="12">
  <w-text motion="fade-up" x="0" y="250" width="1280" align="center"
          font="${HEADLINE_FONT}" color="#f5f6f8">Author in HTML.</w-text>
</w-sequence>

<w-sequence from="40">
  <w-text motion="fade-up" x="0" y="392" width="1280" align="center"
          font="${TAGLINE_FONT}" color="rgba(235,238,245,0.62)">Every frame is a pure function. Export is a method call.</w-text>
</w-sequence>

<w-sequence from="70">
  <w-sequence from="0">
    <w-text motion="pop-in" x="135" y="540" width="300" height="64" align="center"
            font="${CHIP_FONT}" color="#9fb4ff" style="${CHIP_STYLE}">&lt;w-animate&gt;</w-text>
  </w-sequence>
  <w-sequence from="8">
    <w-text motion="pop-in" x="475" y="540" width="380" height="64" align="center"
            font="${CHIP_FONT}" color="#c2a8ff" style="${CHIP_STYLE}">motion="pop-in"</w-text>
  </w-sequence>
  <w-sequence from="16">
    <w-text motion="pop-in" x="895" y="540" width="250" height="64" align="center"
            font="${CHIP_FONT}" color="#8fd8b8" style="${CHIP_STYLE}">.export()</w-text>
  </w-sequence>
</w-sequence>
`;

export default {
  id: "declarative",
  kind: "Elements",
  title: "Declarative HTML",
  blurb:
    "This scene is markup, not code. Named animations live in &lt;w-defs&gt;, elements " +
    "reference them with motion=&quot;...&quot; (class-like), one-off tweens are inline " +
    "&lt;w-animate&gt; children, and sequences stagger the instances.",
  downloadName: "webmotion-declarative.mp4",
  poster: 110,
  chapters: [
    { label: "Backdrop", from: 0 },
    { label: "Headline", from: 12 },
    { label: "Tagline", from: 40 },
    { label: "Components", from: 70 },
  ],
  source: `<w-composition width="1280" height="720" fps="30" duration="150">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#080a10");
    element.innerHTML = SCENE;

    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
