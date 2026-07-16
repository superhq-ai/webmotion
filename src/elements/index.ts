// Declarative authoring for WebMotion. Import this module to register the
// custom elements: <w-composition>, <w-sequence>, <w-text>, <w-rect>, <w-el>
// for structure, and <w-animate>, <w-defs>, <w-animation> for motion (spec in
// docs/MOTION.md). Scenes can be authored directly or held inert in a
// <template> and instantiated via the composition's `template` attribute.
// Everything renders as a pure function of frame and exports to MP4 through
// the html-in-canvas backend.
import { defineElements } from "./elements.js";
import { definePlayer } from "./player.js";

export { defineElements, WComposition } from "./elements.js";
export { WPlayer, definePlayer, type PlayableSource, type PlayerChapter } from "./player.js";
export { PlaybackController, type PlaybackMedia } from "../playback/controller.js";
export {
  registerComponent,
  setAnimatedProp,
  type ComponentDef,
  type FrameContext,
} from "./registry.js";
export { readTween, sampleTween, type TweenData } from "./tween.js";
export { expandTemplates, evaluate } from "./template.js";
export { collectAudioClips, type AudioClip } from "../audio/schedule.js";
export { collectSections, type TimelineSection } from "./sections.js";
export { exportComposition, type ExportTarget, type ExportOptions } from "./export.js";
export { parseProps, num, splitUnit, resolveEasing } from "./parse.js";

// Auto register on import, the way A-Frame defines its elements on load.
defineElements();
definePlayer();
