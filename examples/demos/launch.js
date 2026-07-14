// The flagship: an 11-second keynote-style launch film, authored entirely as
// markup. Structure is the storyboard: one <w-sequence> per beat, a wrapper
// <w-el> owning each beat's exit, entrances via named animations. Imagery is
// AI-generated (examples/assets/), typography is CSS, and every value is a
// pure function of the frame.
import "@superhq/webmotion/elements";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION = 330;

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
</w-defs>

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
          style="background:url('assets/hero-orb.png') center/cover no-repeat;">
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
<w-sequence from="190" duration="86">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="74" end="86" easing="easeInCubic"></w-animate>

    <w-el x="0" y="0" width="1280" height="720"
          style="background:url('assets/light-ribbons.png') center/cover no-repeat;">
      <w-animate property="opacity" from="0" to="0.45" start="0" end="20" easing="easeOutSine"></w-animate>
    </w-el>

    <w-sequence from="4">
      <w-text class="feature" motion="beat-in" x="0" y="250" width="1280">Deterministic to the frame.</w-text>
    </w-sequence>
    <w-sequence from="13">
      <w-text class="feature" motion="beat-in" x="0" y="330" width="1280">Native to the browser.</w-text>
    </w-sequence>
    <w-sequence from="22">
      <w-text class="feature" motion="beat-in" x="0" y="410" width="1280">Zero render farm.</w-text>
    </w-sequence>
  </w-el>
</w-sequence>

<!-- Beat 4: end card. -->
<w-sequence from="276">
  <w-el motion="beat-in" x="0" y="0" width="1280" height="720"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;">
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1"
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
  poster: 130,
  chapters: [
    { label: "Intro", from: 0 },
    { label: "Reveal", from: 78 },
    { label: "Features", from: 190 },
    { label: "End card", from: 276 },
  ],
  source: `<w-composition width="1280" height="720" fps="30" duration="330">${SCENE}</w-composition>`,
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
