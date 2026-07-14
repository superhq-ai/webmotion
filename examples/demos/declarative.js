// The declarative layer: the whole scene is HTML. Importing the elements entry
// registers <w-composition>, <w-sequence>, <w-text>, <w-rect>, <w-el> and the
// `animate` component, A-Frame style. The live custom element is the preview;
// export rasterizes the same DOM to MP4.
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
<w-rect x="0" y="0" width="1280" height="720"
        fill="radial-gradient(120% 130% at 50% -10%, #1b2338 0%, #0d101b 55%, #080a10 100%)"></w-rect>

<w-rect x="960" y="-180" width="480" height="480" radius="240"
        fill="linear-gradient(135deg, rgba(64,110,255,0.22), rgba(154,92,255,0.10))"
        animate__drift="property: y; from: 0; to: 50; start: 0; end: 150"
        animate__spin="property: rotate; from: 0; to: 35; start: 0; end: 150"></w-rect>
<w-rect x="-200" y="480" width="420" height="420" radius="210"
        fill="linear-gradient(315deg, rgba(64,110,255,0.16), rgba(154,92,255,0.06))"
        animate__drift="property: y; from: 0; to: -40; start: 0; end: 150"></w-rect>

<w-sequence from="12">
  <w-text text="Author in HTML." x="0" y="250" width="1280" align="center"
          font="${HEADLINE_FONT}" color="#f5f6f8"
          animate__fade="property: opacity; from: 0; to: 1; start: 0; end: 18; easing: easeOutCubic"
          animate__rise="property: y; from: 40; to: 0; start: 0; end: 18; easing: easeOutCubic"></w-text>
</w-sequence>

<w-sequence from="40">
  <w-text text="Every frame is a pure function. Export is a method call."
          x="0" y="392" width="1280" align="center"
          font="${TAGLINE_FONT}" color="rgba(235,238,245,0.62)"
          animate__fade="property: opacity; from: 0; to: 1; start: 0; end: 16; easing: easeOutCubic"
          animate__rise="property: y; from: 24; to: 0; start: 0; end: 16; easing: easeOutCubic"></w-text>
</w-sequence>

<w-sequence from="70">
  <w-text text="&lt;w-sequence&gt;" x="115" y="540" width="300" height="64" align="center"
          font="${CHIP_FONT}" color="#9fb4ff" style="${CHIP_STYLE}"
          animate__fade="property: opacity; from: 0; to: 1; start: 0; end: 12; easing: easeOutCubic"
          animate__pop="property: scale; from: 0.9; to: 1; start: 0; end: 12; easing: easeOutCubic"></w-text>
  <w-text text='animate="from: 0; to: 1"' x="455" y="540" width="420" height="64" align="center"
          font="${CHIP_FONT}" color="#c2a8ff" style="${CHIP_STYLE}"
          animate__fade="property: opacity; from: 0; to: 1; start: 8; end: 20; easing: easeOutCubic"
          animate__pop="property: scale; from: 0.9; to: 1; start: 8; end: 20; easing: easeOutCubic"></w-text>
  <w-text text=".export()" x="915" y="540" width="250" height="64" align="center"
          font="${CHIP_FONT}" color="#8fd8b8" style="${CHIP_STYLE}"
          animate__fade="property: opacity; from: 0; to: 1; start: 16; end: 28; easing: easeOutCubic"
          animate__pop="property: scale; from: 0.9; to: 1; start: 16; end: 28; easing: easeOutCubic"></w-text>
</w-sequence>
`;

export default {
  id: "declarative",
  title: "Declarative HTML",
  blurb:
    "This scene is markup, not code: A-Frame inspired custom elements " +
    "(&lt;w-composition&gt;, &lt;w-sequence&gt;, &lt;w-text&gt;) with animate attributes. " +
    "The live DOM below is the preview; export rasterizes the same DOM to MP4.",
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
