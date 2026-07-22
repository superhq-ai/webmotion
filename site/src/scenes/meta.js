// Scene constants and source text, with no imports at all.
//
// Astro frontmatter runs in Node at build time, and the scene modules pull in
// `@superhq/webmotion/elements`, which defines custom elements and therefore
// needs a DOM. Anything a component needs while rendering markup lives here so
// the browser-only modules stay browser-only.

export const HERO = {
  width: 1280,
  height: 720,
  fps: 30,
  duration: 900,
  background: "#0f0f0f",
};

export const AUTHORING = { width: 960, height: 540, fps: 30, duration: 130 };

/** The Authoring section's scene: rendered live, and printed as the sample. */
export const AUTHORING_SCENE = `  <style>
    w-composition { font-family: -apple-system, sans-serif; }
    .headline { font: 400 74px -apple-system, sans-serif; color: #e1e1e1; }
    .subline  { font: 400 25px ui-monospace, monospace;      color: #a1a1a1; }
    .divider  { background: rgba(255, 255, 255, 0.18); }
  </style>

  <w-defs>
    <w-animation name="in">
      <w-animate property="opacity" from="0"  to="1"
                 start="0" end="16" easing="easeOutCubic"></w-animate>
      <w-animate property="y"       from="24" to="0"
                 start="0" end="16" easing="easeOutCubic"></w-animate>
    </w-animation>
  </w-defs>

  <w-rect x="0" y="0" width="960" height="540" fill="#0f0f0f"></w-rect>

  <w-sequence from="8" label="Title">
    <w-text class="headline" motion="in" x="0" y="196" width="960" align="center">
      Author in HTML.
    </w-text>
  </w-sequence>

  <w-sequence from="34" label="Line">
    <w-text class="subline" motion="in" x="0" y="300" width="960" align="center">
      a pure function of the frame
    </w-text>
  </w-sequence>

  <w-sequence from="60" label="Rule">
    <w-el class="divider" x="330" y="368" width="300" height="1">
      <w-animate property="scale" from="0" to="1"
                 start="0" end="22" easing="easeOutCubic"></w-animate>
    </w-el>
  </w-sequence>`;

/** Exactly what the code panel prints. */
export const AUTHORING_SOURCE = `<w-composition width="960" height="540" fps="30" duration="130" loop autoplay>
${AUTHORING_SCENE}
</w-composition>`;
