// The flagship: an 11-second keynote-style launch film, authored entirely as
// markup. Structure is the storyboard: one <w-sequence> per beat, a wrapper
// <w-el> owning each beat's exit, entrances via named animations. Imagery is
// AI-generated (examples/assets/), typography is CSS, and every value is a
// pure function of the frame.
import "@superhq/webmotion/elements";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION = 385;

const SCENE = `
<style>
  w-composition {
    font-family: -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
    color: #f5f6f8;
  }
  .kicker   { font-size: 54px; font-weight: 600; text-align: center; letter-spacing: -0.01em; }
  .hero     { font-size: 108px; font-weight: 700; text-align: center; letter-spacing: 2px; }
  .sub      { font-size: 30px; font-weight: 400; text-align: center; color: rgba(235,238,245,0.66); }
  .feature  { font-size: 52px; font-weight: 600; text-align: center; letter-spacing: -0.01em; }
  .wordmark { font-size: 44px; font-weight: 600; text-align: center; letter-spacing: -0.02em; }
  .install  { font-size: 20px; text-align: center; color: rgba(235,238,245,0.55);
              font-family: 'SF Mono', ui-monospace, Menlo, monospace; }
</style>

<w-defs>
  <w-animation name="beat-in">
    <w-animate property="opacity" from="0"  to="1" start="0" end="16" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="28" to="0" start="0" end="16" easing="easeOutCubic"></w-animate>
  </w-animation>
  <!-- A revealed line steps back when its successor lands (36 frames later). -->
  <w-animation name="dim-when-next">
    <w-animate property="opacity" from="1" to="0.38" start="36" end="48" easing="easeInOutSine"></w-animate>
  </w-animation>
</w-defs>

<!-- Soundtrack: the score under the whole film, a whoosh on the reveal.
     Audio credits: examples/public/assets/CREDITS.md -->
<w-audio src="assets/launch-score.m4a" gain="0.9">
  <w-animate property="gain" from="0.9" to="0" start="345" end="385"></w-animate>
</w-audio>
<w-sequence from="74">
  <w-audio src="assets/whoosh.m4a" gain="0.55"></w-audio>
</w-sequence>

<w-rect x="0" y="0" width="1280" height="720" fill="#000"></w-rect>

<!-- Beat 1: Introducing. -->
<w-sequence from="12" duration="66">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="52" end="64" easing="easeInCubic"></w-animate>
    <w-text class="kicker" motion="beat-in" x="0" y="322" width="1280">Introducing.</w-text>
  </w-el>
</w-sequence>

<!-- Beat 2: the reveal. Ken Burns on the hero image, letter-tracked wordmark. -->
<w-sequence from="78" duration="112">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="98" end="110" easing="easeInCubic"></w-animate>

    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/hero-orb.webp') center/cover no-repeat;">
      <w-animate property="opacity" from="0"    to="1" start="0" end="18" easing="easeOutCubic"></w-animate>
      <w-animate property="scale"   from="1.07" to="1" start="0" end="112" easing="easeOutSine"></w-animate>
    </w-el>

    <w-text class="hero" x="0" y="270" width="1280">
      WebMotion
      <w-animate property="opacity"        from="0"    to="1"   start="14" end="34" easing="easeOutCubic"></w-animate>
      <w-animate property="letter-spacing" from="22px" to="2px" start="14" end="56" easing="easeOutCubic"></w-animate>
    </w-text>

    <w-text class="sub" x="0" y="412" width="1280">
      Video, born in the browser.
      <w-animate property="opacity" from="0"  to="1" start="42" end="60" easing="easeOutCubic"></w-animate>
      <w-animate property="y"       from="14" to="0" start="42" end="60" easing="easeOutCubic"></w-animate>
    </w-text>
  </w-el>
</w-sequence>

<!-- Beat 3: features over the light ribbons, staggered by structure. -->
<w-sequence from="190" duration="140">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="128" end="140" easing="easeInCubic"></w-animate>

    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/light-ribbons.webp') center/cover no-repeat;">
      <w-animate property="opacity" from="0" to="0.45" start="0" end="20" easing="easeOutSine"></w-animate>
    </w-el>

    <w-data name="features">[
      "Deterministic to the frame.",
      "Native to the browser.",
      "Zero render farm."
    ]</w-data>
    <w-for each="features" as="line">
      <w-sequence from="{6 + i * 30}">
        <w-text class="feature" motion="beat-in" x="0" y="{250 + i * 80}" width="1280">{line}</w-text>
      </w-sequence>
    </w-for>
  </w-el>
</w-sequence>

<!-- Beat 4: end card. -->
<w-sequence from="330">
  <w-el motion="beat-in" x="0" y="0" width="1280" height="720"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;">
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 20L7.5 4M10.5 20L13.5 4M16.5 20L19.5 4"
            stroke="#f5f6f8" stroke-width="2.4" stroke-linecap="round"/>
    </svg>
    <div class="wordmark">webmotion</div>
    <div class="install">npm install @superhq/webmotion</div>
  </w-el>
</w-sequence>
`;

export default {
  id: "launch",
  kind: "Elements",
  title: "Launch film",
  blurb:
    "A keynote-style launch film, authored entirely as markup: staged beats, a " +
    "letter-tracked reveal over AI-generated imagery, staggered feature lines, " +
    "and an end card. Export it and ship it.",
  downloadName: "webmotion-launch.mp4",
  chapters: [
    { label: "Intro", from: 0 },
    { label: "Reveal", from: 78 },
    { label: "Features", from: 190 },
    { label: "End card", from: 330 },
  ],
  source: `<w-composition width="1280" height="720" fps="30" duration="385">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#000");
    element.innerHTML = SCENE;

    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
