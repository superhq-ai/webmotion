import launch from "./launch.js";
import numbers from "./numbers.js";

// Order here is the order shown in the sidebar. The first entry is the default.
export const demos = [launch, numbers];

export const demoById = new Map(demos.map((d) => [d.id, d]));
