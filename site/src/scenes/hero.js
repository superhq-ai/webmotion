// The composition in the hero: thirty seconds of it.
//
// It sells nothing. The title and prose directly beneath make every claim the
// product has, so a film that also listed them would be a slide. What it does
// instead is hold five things still enough to look at, and put the frame it is
// drawing in the corner, because everything on screen is a function of that
// number and that is the only argument worth making here.
//
// The text is wall labels: artist, work, date, collection. Factual rather than
// promotional, and it credits the sources inside the film.
//
// Sources, all reproduced from public domain originals (see CREDITS.md):
//   Head of David      Michelangelo, cast, Statens Museum for Kunst  [3D scan]
//   Vitruvian Man      Leonardo, c. 1490, Gallerie dell'Accademia
//   La Gioconda        Leonardo, c. 1503, Musee du Louvre
//   Lady with Ermine   Leonardo, c. 1490, Czartoryski Museum
import "@superhq/webmotion/elements";
import "@superhq/webmotion/three";
import { registerFrameNo } from "./frameno.js";
import { HERO } from "./meta.js";

// A smooth envelope with one clear climax, computed offline: placeholders do
// arithmetic, not trigonometry.
const WAVE = [
  33, 36, 43, 53, 66, 82, 97, 111, 120, 124, 122, 115, 104, 93, 86, 84, 90, 104, 124, 146, 166, 181,
  187, 183, 170, 150, 126, 104, 84, 71, 64, 63, 65, 70, 74, 75, 74, 69, 62, 54,
];
const BASELINE = 470;
const FIRST_X = 130;
const STEP = 26;

// One bar per beat of a timeline, rising in the order frames are rendered.
// Each grows upward because its height opens while the transform walks the
// same distance back, pinning the foot to the baseline.
const row = (step, rise) => `
  <w-data name="wave">[${WAVE.join(", ")}]</w-data>
  <w-for each="wave" as="h">
    <w-el class="h-bar" x="{${FIRST_X} + i * ${STEP}}" y="{${BASELINE} - h}" width="4" height="{h}">
      <w-animate property="height" from="0px" to="{h}px"
                 start="{i * ${step}}" end="{i * ${step} + ${rise}}" easing="easeOutCubic"></w-animate>
      <w-animate property="y" from="{h}" to="0"
                 start="{i * ${step}}" end="{i * ${step} + ${rise}}" easing="easeOutCubic"></w-animate>
    </w-el>
  </w-for>`;

// A wall label: who, what, where. Set once, reused by every plate.
const label = (name, work, meta) => `
  <w-el class="h-label" motion="rise" x="120" y="250" width="420" height="220">
    <div class="h-name h-mono">${name}</div>
    <div class="h-work">${work}</div>
    <div class="h-meta h-mono">${meta}</div>
  </w-el>`;

// A dithered plate, drifting slowly so the still never sits dead.
const plate = (src, x, y, w, h) => `
  <w-el class="h-plate" x="${x}" y="${y}" width="${w}" height="${h}"
        style="background-image:url('assets/art/${src}');background-size:100% 100%">
    <w-animate property="opacity" from="0" to="1" start="0" end="26" easing="easeOutCubic"></w-animate>
    <w-animate property="scale" from="1.04" to="1" start="0" end="150" easing="easeOutSine"></w-animate>
  </w-el>`;

const SCENE = `
<style>
  w-composition {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #e1e1e1;
  }
  .h-mono { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; }

  .h-bar { background: linear-gradient(to top, #4c4c4c, #ededed); }
  .h-base { background: #3a3a3a; }

  .h-label { display: flex; flex-direction: column; gap: 14px; }
  .h-name { font-size: 19px; letter-spacing: 0.24em; text-transform: uppercase; color: #7d7d7d; }
  .h-work { font-size: 38px; letter-spacing: -0.015em; color: #e1e1e1; line-height: 1.15; }
  .h-meta { font-size: 17px; letter-spacing: 0.06em; color: #5e5e5e; }

  .h-stamp { position: absolute; inset: 0; display: flex; align-items: center;
             justify-content: flex-end; font-size: 16px; letter-spacing: 0.16em;
             text-transform: uppercase; color: #4a4a4a; }
  .h-stamp b { font-weight: 400; color: #5b83ff; }
</style>

<!-- The bed. Synthesised for this film (scripts/make-hero-score.py), with a
     struck tone on each cut. Export mixes it down sample-exact and muxes AAC. -->
<w-audio src="assets/hero-score.m4a" gain="0.85"></w-audio>

<w-defs>
  <w-animation name="rise">
    <w-animate property="opacity" from="0"  to="1" start="0" end="24" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="18" to="0" start="0" end="24" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<!-- 01. The row, rising in the order frames render. -->
<w-sequence from="0" duration="105" label="Row">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="82" end="102" easing="easeInOutSine"></w-animate>
    <w-el class="h-base" x="${FIRST_X}" y="${BASELINE}" height="1">
      <w-animate property="width" from="0px" to="${(WAVE.length - 1) * STEP + 4}px"
                 start="3" end="24" easing="easeInOutCubic"></w-animate>
    </w-el>
    ${row(1, 18)}
  </w-el>
</w-sequence>

<!-- 02. The sculpture. A live glTF scan on a slow turntable; sequence bounds
     cut it, because a model composites as its own layer and cannot be wrapped
     in an entity that would own its exit. -->
<w-sequence from="110" duration="190" label="David">
  <w-model src="assets/david.glb" x="700" y="70" width="500" height="580"
           spin="18" rotation="0 62 0" fov="26"
           lights="studio" environment="studio" tone-mapping="aces" exposure="1.05"></w-model>
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="168" end="188" easing="easeInOutSine"></w-animate>
    ${label("Michelangelo", "Head of David", "cast &middot; Statens Museum for Kunst")}
  </w-el>
</w-sequence>

<!-- 03-05. Three plates from the same hand, dithered to one bit. -->
<w-sequence from="305" duration="175" label="Vitruvian Man">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="148" end="170" easing="easeInOutSine"></w-animate>
    ${plate("vitruvian.png", 760, 130, 340, 462)}
    ${label("Leonardo da Vinci", "Le proporzioni del corpo umano", "c. 1490 &middot; Gallerie dell&rsquo;Accademia")}
  </w-el>
</w-sequence>

<w-sequence from="485" duration="175" label="La Gioconda">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="148" end="170" easing="easeInOutSine"></w-animate>
    ${plate("mona.png", 790, 136, 300, 448)}
    ${label("Leonardo da Vinci", "La Gioconda", "c. 1503 &middot; Mus&eacute;e du Louvre")}
  </w-el>
</w-sequence>

<w-sequence from="665" duration="170" label="Lady with an Ermine">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="143" end="165" easing="easeInOutSine"></w-animate>
    ${plate("ermine.png", 790, 156, 300, 408)}
    ${label("Leonardo da Vinci", "Dama con l&rsquo;ermellino", "c. 1490 &middot; Czartoryski Museum")}
  </w-el>
</w-sequence>

<!-- 06. The row again, quicker, and out. The film ends on the empty frame it
     started from, so the loop rejoins itself instead of cutting. -->
<w-sequence from="840" duration="60" label="Row reprise">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="44" end="58" easing="easeInOutSine"></w-animate>
    <w-el class="h-base" x="${FIRST_X}" y="${BASELINE}" height="1"
          style="width:${(WAVE.length - 1) * STEP + 4}px"></w-el>
    ${row(1, 14)}
  </w-el>
</w-sequence>

<!-- Drawn by the scene, so the scrubber below has something to agree with. -->
<w-el x="96" y="626" width="1088" height="28">
  <div class="h-stamp h-mono">frame&nbsp;<b frameno="pad: 3"></b></div>
</w-el>
`;

/** Build the hero composition element, ready to append. */
export function createHero() {
  registerFrameNo();
  const el = document.createElement("w-composition");
  el.setAttribute("width", String(HERO.width));
  el.setAttribute("height", String(HERO.height));
  el.setAttribute("fps", String(HERO.fps));
  el.setAttribute("duration", String(HERO.duration));
  el.setAttribute("background", HERO.background);
  el.setAttribute("loop", "");
  el.setAttribute("poster", "150");
  el.innerHTML = SCENE;
  return el;
}
