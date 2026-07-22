// Browser side of the Authoring section. The markup itself lives in meta.js so
// the page can print the very same string it renders.
import "@superhq/webmotion/elements";
import { AUTHORING, AUTHORING_SCENE } from "./meta.js";

export function createAuthoring() {
  const el = document.createElement("w-composition");
  el.setAttribute("width", String(AUTHORING.width));
  el.setAttribute("height", String(AUTHORING.height));
  el.setAttribute("fps", String(AUTHORING.fps));
  el.setAttribute("duration", String(AUTHORING.duration));
  el.setAttribute("background", "#0f0f0f");
  el.setAttribute("loop", "");
  el.setAttribute("poster", "70");
  el.innerHTML = AUTHORING_SCENE;
  return el;
}
