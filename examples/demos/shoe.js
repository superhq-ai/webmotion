// A 9:16 Instagram sneaker ad cut like a drop film: hard cuts every ~20
// frames, flash frames, a strobe word section, and a price smash. The shoe is
// the Khronos materials-variants sneaker (CC-BY, see assets/CREDITS.md); the
// background art was generated with an image model. Models sit directly under
// their sequences so they composite as live layers.
import "@superhq/webmotion/elements";
import "@superhq/webmotion/three";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION = 300;

const SLAM = "cubic-bezier(0.2, 1.4, 0.3, 1)";

const SCENE = `
<style>
  w-composition * { box-sizing: border-box; }
  .head { font-family: Impact, 'Arial Black', sans-serif; text-transform: uppercase;
          color: #fff; text-align: center; line-height: 0.9; letter-spacing: 0.01em; }
  .h-mega  { font-size: 300px; }
  .h-giant { font-size: 230px; }
  .h-word  { font-size: 170px; }
  .lime { color: #ccff00; }
  .pink { color: #ff2ea6; }
  .ink  { color: #0a0a0c; }
  .outline      { color: transparent; -webkit-text-stroke: 4px rgba(255,255,255,0.9); }
  .outline-lime { color: transparent; -webkit-text-stroke: 4px #ccff00; }
  .wall { font-size: 150px; white-space: nowrap; text-align: left; opacity: 0.9; }
  .sub  { font-family: ui-monospace, Menlo, monospace; font-size: 34px; text-align: center;
          color: rgba(255,255,255,0.85); letter-spacing: 0.2em; text-transform: uppercase; }
  .sticker { font-family: Impact, 'Arial Black', sans-serif; font-size: 44px; text-transform: uppercase;
             text-align: center; padding: 20px 34px; border-radius: 999px; color: #0a0a0c; }
  .lime-bg { background: #ccff00; }
  .pink-bg { background: #ff2ea6; color: #fff; }
  .white-bg { background: #fff; }
  .tilt-l { transform: rotate(-7deg); }
  .tilt-r { transform: rotate(6deg); }
  .strike { text-decoration: line-through; }
  .cta { font-family: Impact, 'Arial Black', sans-serif; font-size: 96px; text-transform: uppercase;
         text-align: center; line-height: 160px; background: #ccff00; color: #0a0a0c;
         border-radius: 28px; }
  .handle { font-family: ui-monospace, Menlo, monospace; font-size: 32px; text-align: center;
            color: rgba(255,255,255,0.65); letter-spacing: 0.12em; }
</style>

<w-audio src="assets/drop-score.m4a" gain="1"></w-audio>

<w-rect x="0" y="0" width="1080" height="1920" fill="#0d031f"></w-rect>
<w-el x="0" y="0" width="1080" height="1920">
  <img src="assets/shoe-bg.png" width="1080" height="1920"
       style="display:block;width:100%;height:100%;object-fit:cover;" />
</w-el>

<!-- 0-12: date stamp slams -->
<w-sequence from="0" duration="12">
  <w-text class="head h-mega" x="0" y="760" width="1080">
    <w-animate property="scale" from="2.6" to="1" start="0" end="6" easing="${SLAM}"></w-animate>
    <w-animate property="opacity" from="0" to="1" start="0" end="3"></w-animate>
    08.01
  </w-text>
</w-sequence>

<!-- 12-28: THE DROP stacked slam -->
<w-sequence from="12" duration="16">
  <w-text class="head h-giant" x="0" y="640" width="1080">
    <w-animate property="scale" from="2.2" to="1" start="2" end="7" easing="${SLAM}"></w-animate>
    <w-animate property="opacity" from="0" to="1" start="2" end="4"></w-animate>
    THE
  </w-text>
  <w-text class="head h-giant lime" x="0" y="880" width="1080">
    <w-animate property="scale" from="2.2" to="1" start="4" end="9" easing="${SLAM}"></w-animate>
    <w-animate property="opacity" from="0" to="1" start="4" end="6"></w-animate>
    DROP
  </w-text>
</w-sequence>

<!-- 28-50: CUT 1, shoe huge, word behind -->
<w-sequence from="28" duration="22">
  <w-text class="head h-mega outline-lime" x="-80" y="1150" width="1240" style="transform: rotate(-8deg);">
    LIGHT
  </w-text>
  <w-model src="assets/shoe.glb" x="-160" y="260" width="1400" height="1400"
           spin="130" rotation="20 40 -12" fov="26" lights="dramatic" tone-mapping="aces" exposure="1.1">
    <w-animate property="scale" from="1.35" to="1" start="0" end="8" easing="${SLAM}"></w-animate>
  </w-model>
</w-sequence>

<!-- 50-72: CUT 2, other angle, zoom punch -->
<w-sequence from="50" duration="22">
  <w-text class="head h-mega pink" x="-40" y="300" width="1160" style="transform: rotate(6deg);">
    AF.
  </w-text>
  <w-model src="assets/shoe.glb" x="-100" y="420" width="1280" height="1280"
           spin="130" rotation="0 150 10" fov="26" lights="dramatic" tone-mapping="aces" exposure="1.1">
    <w-animate property="scale" from="0.8" to="1.15" start="0" end="22" easing="easeOutQuad"></w-animate>
  </w-model>
</w-sequence>

<!-- 72-94: CUT 3, sole, outline word -->
<w-sequence from="72" duration="22">
  <w-text class="head h-word outline" x="-60" y="1360" width="1200" style="transform: rotate(-6deg);">
    CLOUD STEP
  </w-text>
  <w-model src="assets/shoe.glb" x="-120" y="330" width="1320" height="1320"
           spin="150" rotation="65 210 0" fov="26" lights="dramatic" tone-mapping="aces" exposure="1.1">
    <w-animate property="scale" from="1.3" to="1" start="0" end="7" easing="${SLAM}"></w-animate>
  </w-model>
</w-sequence>

<!-- 94-164: turntable hero over a drifting word wall -->
<w-sequence from="94" duration="70">
  <w-el x="0" y="0" width="1080" height="1920" style="transform: rotate(-6deg);">
    <w-text class="head wall outline" x="-700" y="330" width="2600">
      <w-animate property="x" from="0" to="-260" start="0" end="70"></w-animate>
      VELOCITY 01 VELOCITY 01 VELOCITY 01
    </w-text>
    <w-text class="head wall lime" x="-1500" y="640" width="2600">
      <w-animate property="x" from="0" to="260" start="0" end="70"></w-animate>
      VELOCITY 01 VELOCITY 01 VELOCITY 01
    </w-text>
    <w-text class="head wall outline" x="-700" y="1210" width="2600">
      <w-animate property="x" from="0" to="-200" start="0" end="70"></w-animate>
      VELOCITY 01 VELOCITY 01 VELOCITY 01
    </w-text>
    <w-text class="head wall pink" x="-1500" y="1520" width="2600">
      <w-animate property="x" from="0" to="220" start="0" end="70"></w-animate>
      VELOCITY 01 VELOCITY 01 VELOCITY 01
    </w-text>
  </w-el>

  <w-model src="assets/shoe.glb" x="-40" y="380" width="1160" height="1160"
           spin="150" rotation="18 30 -8" fov="28"
           lights="studio" environment="studio" tone-mapping="aces" shadow="0.35">
    <w-light type="directional" position="-4 2 -4" color="#ff2ea6" intensity="0">
      <w-animate property="intensity" from="0" to="4" start="14" end="34" easing="easeOutCubic"></w-animate>
    </w-light>
    <w-animate property="scale" from="1.4" to="1" start="0" end="8" easing="${SLAM}"></w-animate>
  </w-model>

  <w-el x="0" y="0" width="1080" height="1920">
    <w-el x="80" y="500" width="380" height="95">
      <w-animate property="scale" from="2" to="1" start="10" end="16" easing="${SLAM}"></w-animate>
      <w-animate property="opacity" from="0" to="1" start="10" end="12"></w-animate>
      <div class="sticker lime-bg tilt-l">feather-lite</div>
    </w-el>
    <w-el x="620" y="1330" width="380" height="95">
      <w-animate property="scale" from="2" to="1" start="20" end="26" easing="${SLAM}"></w-animate>
      <w-animate property="opacity" from="0" to="1" start="20" end="22"></w-animate>
      <div class="sticker pink-bg tilt-r">all-day cloud</div>
    </w-el>
    <w-text class="sub" x="0" y="1680" width="1080">
      <w-animate property="opacity" from="0" to="1" start="30" end="36"></w-animate>
      3 colorways . vegan . recycled knit
    </w-text>
  </w-el>
</w-sequence>

<!-- 164-188: strobe words, full-bleed color cuts every 4 frames -->
<w-sequence from="164" duration="4">
  <w-rect x="0" y="0" width="1080" height="1920" fill="#ccff00"></w-rect>
  <w-text class="head h-mega ink" x="0" y="760" width="1080">RUN</w-text>
</w-sequence>
<w-sequence from="168" duration="4">
  <w-rect x="0" y="0" width="1080" height="1920" fill="#0a0a0c"></w-rect>
  <w-text class="head h-mega" x="0" y="760" width="1080">DON'T</w-text>
</w-sequence>
<w-sequence from="172" duration="4">
  <w-rect x="0" y="0" width="1080" height="1920" fill="#ff2ea6"></w-rect>
  <w-text class="head h-mega" x="0" y="760" width="1080">WALK</w-text>
</w-sequence>
<w-sequence from="176" duration="4">
  <w-rect x="0" y="0" width="1080" height="1920" fill="#ccff00"></w-rect>
  <w-text class="head h-mega ink" x="0" y="760" width="1080">RUN</w-text>
</w-sequence>
<w-sequence from="180" duration="4">
  <w-rect x="0" y="0" width="1080" height="1920" fill="#0a0a0c"></w-rect>
  <w-text class="head h-mega" x="0" y="760" width="1080">DON'T</w-text>
</w-sequence>
<w-sequence from="184" duration="4">
  <w-rect x="0" y="0" width="1080" height="1920" fill="#ff2ea6"></w-rect>
  <w-text class="head h-mega" x="0" y="760" width="1080">WALK</w-text>
</w-sequence>

<!-- 188-236: price smash -->
<w-sequence from="188" duration="48">
  <w-model src="assets/shoe.glb" x="40" y="1150" width="1000" height="1000"
           spin="170" rotation="10 80 -6" fov="30" lights="dramatic" tone-mapping="aces" exposure="1.1"></w-model>
  <w-el x="0" y="0" width="1080" height="1920">
    <w-text class="head h-word strike" x="0" y="420" width="1080" style="color: rgba(255,255,255,0.45);">
      <w-animate property="scale" from="1.8" to="1" start="0" end="6" easing="${SLAM}"></w-animate>
      <w-animate property="opacity" from="0" to="1" start="0" end="3"></w-animate>
      $149
    </w-text>
    <w-text class="head h-mega lime" x="0" y="560" width="1080">
      <w-animate property="scale" from="3" to="1" start="10" end="16" easing="${SLAM}"></w-animate>
      <w-animate property="opacity" from="0" to="1" start="10" end="12"></w-animate>
      $89
    </w-text>
    <w-text class="sub" x="0" y="950" width="1080">
      <w-animate property="opacity" from="0" to="1" start="20" end="26"></w-animate>
      launch week only
    </w-text>
  </w-el>
</w-sequence>

<!-- 236-300: close -->
<w-sequence from="236" duration="64">
  <w-model src="assets/shoe.glb" x="-10" y="300" width="1100" height="1100"
           spin="120" rotation="18 250 -8" fov="28"
           lights="studio" environment="studio" tone-mapping="aces" shadow="0.4">
    <w-animate property="scale" from="1.25" to="1" start="0" end="8" easing="${SLAM}"></w-animate>
  </w-model>
  <w-el x="0" y="0" width="1080" height="1920">
    <w-el x="240" y="1330" width="600" height="160">
      <w-animate property="scale" from="2.4" to="1" start="4" end="10" easing="${SLAM}"></w-animate>
      <w-animate property="opacity" from="0" to="1" start="4" end="6"></w-animate>
      <w-animate property="scale" from="1" to="1.06" start="24" end="32" easing="easeInOutSine"></w-animate>
      <w-animate property="scale" from="1.06" to="1" start="32" end="40" easing="easeInOutSine"></w-animate>
      <w-animate property="scale" from="1" to="1.06" start="40" end="48" easing="easeInOutSine"></w-animate>
      <w-animate property="scale" from="1.06" to="1" start="48" end="56" easing="easeInOutSine"></w-animate>
      <div class="cta">cop now</div>
    </w-el>
    <w-text class="head h-word" x="0" y="1560" width="1080" style="font-size: 64px;">
      <w-animate property="opacity" from="0" to="1" start="10" end="16"></w-animate>
      VELOCITY <span class="lime">01</span>
    </w-text>
    <w-text class="handle" x="0" y="1680" width="1080">
      <w-animate property="opacity" from="0" to="1" start="14" end="20"></w-animate>
      @velocity.kicks &#183; link in bio &#183; 08.01
    </w-text>
  </w-el>
</w-sequence>

<!-- flash frames, last in document order so they paint over everything; each
     carries a synthesized impact hit so cuts land on a boom -->
<w-sequence from="10" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ccff00"></w-rect><w-audio src="assets/impact.m4a" gain="0.8"></w-audio></w-sequence>
<w-sequence from="26" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ff2ea6"></w-rect><w-audio src="assets/impact.m4a" gain="0.7"></w-audio></w-sequence>
<w-sequence from="48" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ffffff"></w-rect><w-audio src="assets/impact.m4a" gain="0.7"></w-audio></w-sequence>
<w-sequence from="70" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ccff00"></w-rect><w-audio src="assets/impact.m4a" gain="0.7"></w-audio></w-sequence>
<w-sequence from="92" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ffffff"></w-rect><w-audio src="assets/impact.m4a" gain="0.7"></w-audio></w-sequence>
<w-sequence from="162" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ffffff"></w-rect><w-audio src="assets/impact.m4a" gain="0.8"></w-audio></w-sequence>
<w-sequence from="198" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ffffff"></w-rect><w-audio src="assets/impact.m4a" gain="0.9"></w-audio></w-sequence>
<w-sequence from="234" duration="2"><w-rect x="0" y="0" width="1080" height="1920" fill="#ccff00"></w-rect><w-audio src="assets/impact.m4a" gain="0.8"></w-audio></w-sequence>
`;

export default {
  id: "shoe",
  kind: "Elements + three.js",
  title: "Sneaker drop ad",
  blurb: "A 9:16 drop film: hard cuts, flash frames, strobe words, turntable GLB, price smash.",
  downloadName: "sneaker-drop.mp4",
  chapters: [
    { label: "Slam", from: 0 },
    { label: "Cuts", from: 28 },
    { label: "Turntable", from: 94 },
    { label: "Strobe", from: 164 },
    { label: "Price", from: 188 },
    { label: "Close", from: 236 },
  ],
  source: `<w-composition width="1080" height="1920" fps="30" duration="${DURATION}">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#0d031f");
    element.innerHTML = SCENE;
    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
