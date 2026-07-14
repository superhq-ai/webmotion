import launch from "./launch.js";
import orbit from "./orbit.js";
import numbers from "./numbers.js";
import reel from "./reel.js";

// Order here is the order shown in the sidebar. The first entry is the default.
export const demos = [launch, orbit, numbers, reel];

export const demoById = new Map(demos.map((d) => [d.id, d]));
