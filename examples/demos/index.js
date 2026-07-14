import titleCard from "./canvas-basics.js";
import productUi from "./html-in-canvas.js";
import insideWebMotion from "./inside-webmotion.js";

// Order here is the order shown in the tabs. The first entry is the default.
export const demos = [titleCard, productUi, insideWebMotion];

export const demoById = new Map(demos.map((d) => [d.id, d]));
