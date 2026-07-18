// A 3D scene: the Khronos sample fox (CC-BY, see assets/CREDITS.md) running
// through a meme-style caption card. Shows <w-model> playing GLTF clips as a
// pure function of frame, composed with 2D entities, tweens, and sequences.
import "@superhq/webmotion/elements";
import "@superhq/webmotion/three";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION = 300;

const SCENE = `
<style>
  .fox-title { font-family: Impact, 'Arial Black', sans-serif; font-size: 64px;
               text-align: center; color: #fff; -webkit-text-stroke: 2px #000;
               letter-spacing: 0.01em; }
  .fox-sub   { font-size: 24px; text-align: center; color: rgba(255,255,255,0.75);
               font-family: ui-monospace, monospace; }
</style>

<w-rect x="0" y="0" width="1280" height="720" fill="linear-gradient(180deg, #12203a 0%, #2a1a3a 100%)"></w-rect>

<w-sequence from="0" duration="150" label="survey">
  <w-model src="assets/fox.glb" animation="Survey" x="390" y="110" width="500" height="440">
    <w-animate property="opacity" from="0" to="1" start="0" end="12"></w-animate>
    <w-animate property="scale" from="0.9" to="1" start="0" end="14" easing="easeOutCubic"></w-animate>
  </w-model>
  <w-text class="fox-title" x="0" y="570" width="1280">me minding my business</w-text>
  <w-text class="fox-sub" x="0" y="650" width="1280">
    <w-animate property="opacity" from="0" to="1" start="20" end="35"></w-animate>
    rendered by the frame clock, not the wall clock
  </w-text>
</w-sequence>

<w-sequence from="150" duration="150" label="run">
  <w-model src="assets/fox.glb" animation="Run" speed="1.2" x="-40" y="140" width="560" height="420">
    <w-animate property="x" from="-260" to="820" start="0" end="150"></w-animate>
  </w-model>
  <w-text class="fox-title" x="0" y="580" width="1280">the crocs when i said no</w-text>
</w-sequence>
`;

export default {
  id: "fox",
  kind: "Elements + three.js",
  title: "3D fox meme",
  blurb: "An animated GLB driven by the frame clock through w-model, composited with 2D captions.",
  downloadName: "fox-demo.mp4",
  chapters: [
    { label: "Survey", from: 0 },
    { label: "Run", from: 150 },
  ],
  source: `<w-composition width="1280" height="720" fps="30" duration="${DURATION}">${SCENE}</w-composition>`,
  create() {
    const element = document.createElement("w-composition");
    element.setAttribute("width", String(WIDTH));
    element.setAttribute("height", String(HEIGHT));
    element.setAttribute("fps", String(FPS));
    element.setAttribute("duration", String(DURATION));
    element.setAttribute("background", "#12203a");
    element.innerHTML = SCENE;
    return {
      composition: { width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames: DURATION },
      element,
    };
  },
};
