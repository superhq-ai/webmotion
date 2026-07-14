import titleCard from "./canvas-basics.js";
import productUi from "./html-in-canvas.js";
import insideWebMotion from "./inside-webmotion.js";
import declarative from "./declarative.js";

// Order here is the order shown in the tabs. The first entry is the default.
export const demos = [titleCard, productUi, insideWebMotion, declarative];

export const demoById = new Map(demos.map((d) => [d.id, d]));
