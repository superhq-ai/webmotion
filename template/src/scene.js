// Your video lives here. Edit this file and the preview reloads.
//
// The one rule that makes WebMotion deterministic: everything visible is a pure
// function of the current frame. Never reach for Date.now(), Math.random(), or
// wall-clock time. Derive every value from the frame index (via <w-animate>),
// so frame N always renders the exact same image, in preview and in export.
//
// Timing is in frames. At fps: 30, duration: 180 is a 6-second video.
// Full authoring reference: https://github.com/superhq-ai/webmotion (skills/webmotion).

export const config = {
  width: 1280,
  height: 720,
  fps: 30,
  duration: 180,
  background: "#0b0d14",
  // File name used by the Export MP4 button.
  downloadName: "my-video.mp4",
  // The scrub bar's section labels come straight from `label="..."` on the
  // top-level <w-sequence> beats below, so the timeline and the scene stay in
  // sync. (You can still hardcode chapters here as `chapters: [{ label, from }]`
  // if you prefer; sequence labels win when present.)
};

// The scene is the inner markup of a <w-composition>. Author it as HTML: a
// <style> block for frame-constant look, <w-animate> tweens for anything that
// moves. See the elements table in the skill/README for every <w-*> tag.
export const scene = `
<style>
  w-composition {
    font-family: -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    color: #f5f6f8;
  }
  .hero    { font-size: 104px; font-weight: 700; text-align: center; letter-spacing: -0.02em; }
  .sub     { font-size: 30px;  font-weight: 400; text-align: center; color: rgba(235,238,245,0.66); }
  .feature { font-size: 46px;  font-weight: 600; text-align: center; letter-spacing: -0.01em; }
</style>

<w-defs>
  <w-animation name="fade-up">
    <w-animate property="opacity" from="0"  to="1" start="0" end="18" easing="easeOutCubic"></w-animate>
    <w-animate property="y"       from="32" to="0" start="0" end="18" easing="easeOutCubic"></w-animate>
  </w-animation>
</w-defs>

<!-- Backdrop: a soft radial glow, drawn as a rect with a CSS gradient fill. -->
<w-rect x="0" y="0" width="1280" height="720"
        fill="radial-gradient(1200px 700px at 50% 34%, #182142 0%, #0b0d14 62%)"></w-rect>

<!-- Audio rides the same timeline and shows up as a clip on the audio lane
     under the scrub bar. The file is public/ambient.m4a; swap it for your own
     (a soundtrack, a voiceover) or delete this block. A gain tween fades it out
     over the last second; gain animates in local frames, like any tween. -->
<w-audio src="ambient.m4a" gain="0.8">
  <w-animate property="gain" from="0.8" to="0" start="150" end="180"></w-animate>
</w-audio>

<!-- Beat 1: the title. Wrapper <w-el> owns the exit; inner text owns entrances.
     the label attribute names this beat on the scrub bar. -->
<w-sequence label="Title" from="6" duration="76">
  <w-el x="0" y="0" width="1280" height="720">
    <w-animate property="opacity" from="1" to="0" start="60" end="72" easing="easeInCubic"></w-animate>

    <w-text class="hero" x="0" y="256" width="1280">
      Hello, WebMotion
      <w-animate property="opacity"        from="0"    to="1"   start="6"  end="28" easing="easeOutCubic"></w-animate>
      <w-animate property="letter-spacing" from="16px" to="-2px" start="6" end="46" easing="easeOutCubic"></w-animate>
    </w-text>

    <w-text class="sub" motion="fade-up" x="0" y="404" width="1280">
      Video, born in the browser.
    </w-text>
  </w-el>
</w-sequence>

<!-- Beat 2: three feature lines, staggered by structure (one <w-sequence> each). -->
<w-sequence label="Features" from="78">
  <w-data name="features">[
    "Deterministic to the frame.",
    "Native to the browser.",
    "Exports real MP4."
  ]</w-data>
  <w-for each="features" as="line">
    <w-sequence from="{i * 26}">
      <w-text class="feature" motion="fade-up" x="0" y="{250 + i * 80}" width="1280">{line}</w-text>
    </w-sequence>
  </w-for>
</w-sequence>
`;
