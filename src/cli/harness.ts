// The page the CLI loads a scene into. For a module entry (the Vite starter's
// src/scene.js, exporting `config` and `scene`) we generate a host page that
// mounts a <w-composition> the same way the starter's player does. For an HTML
// entry we load the author's own page and install the probe into it.
import type { Project } from "./project.js";
import { servedPath } from "./project.js";

// Served from the root rather than a subdirectory so that relative asset URLs
// in a scene ("./assets/logo.png") resolve exactly as they do against the
// starter's index.html. Nesting the harness would silently break every
// relative path in the scene.
export const HARNESS_PATH = "/__wm-harness.html";
export const API_PATH = "/__wm/api.js";
const PACKAGE_PREFIX = "/__wm/pkg/";
const THREE_PREFIX = "/__wm/three/";
const MUXER_PREFIX = "/__wm/mp4-muxer/";

function importMap(project: Project): string {
  const imports: Record<string, string> = {
    "@superhq/webmotion": `${PACKAGE_PREFIX}index.js`,
    "@superhq/webmotion/elements": `${PACKAGE_PREFIX}elements/index.js`,
    "@superhq/webmotion/html-in-canvas": `${PACKAGE_PREFIX}html-in-canvas/index.js`,
    "@superhq/webmotion/three": `${PACKAGE_PREFIX}three/index.js`,
    "@superhq/webmotion/live": `${PACKAGE_PREFIX}live/index.js`,
  };

  // The export path imports the muxer by bare specifier, so the page needs it
  // even though nothing here encodes anything.
  if (project.muxerDir) imports["mp4-muxer"] = `${MUXER_PREFIX}build/mp4-muxer.mjs`;

  if (project.threeDir) {
    imports["three"] = `${THREE_PREFIX}build/three.module.js`;
    imports["three/webgpu"] = `${THREE_PREFIX}build/three.webgpu.js`;
    imports["three/tsl"] = `${THREE_PREFIX}build/three.tsl.js`;
    imports["three/addons/"] = `${THREE_PREFIX}examples/jsm/`;
  }

  return JSON.stringify({ imports }, null, 2);
}

/**
 * Host page for a module entry. Mirrors the starter's mount: read `config` for
 * the composition attributes, drop `scene` in as the inner markup. The stage is
 * pinned to the composition's own width so it renders at scale 1 and every
 * measurement comes back in author coordinates.
 */
export function harnessHtml(project: Project): string {
  const entryUrl = JSON.stringify(servedPath(project, project.entry));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>webmotion cli</title>
<script type="importmap">
${importMap(project)}
</script>
<style>
  html, body { margin: 0; padding: 0; background: #000; }
  #stage { position: relative; }
</style>
</head>
<body>
<div id="stage"></div>
<script type="module">
  const fail = (error) => {
    window.__wmError = error instanceof Error ? error.stack ?? error.message : String(error);
  };

  try {
    await import("@superhq/webmotion/elements");

    const entry = await import(${entryUrl});
    const config = entry.config ?? {};
    const scene = entry.scene ?? entry.default ?? "";
    if (typeof scene !== "string") {
      throw new Error("scene entry must export a \`scene\` string of <w-*> markup");
    }

    // The 3D entry is optional and pulls in three, so only load it when the
    // scene actually asks for a model.
    if (/<w-model/i.test(scene)) await import("@superhq/webmotion/three");

    const comp = document.createElement("w-composition");
    const attrs = {
      width: config.width ?? 1280,
      height: config.height ?? 720,
      fps: config.fps ?? 30,
      duration: config.duration ?? config.durationInFrames ?? 150,
    };
    for (const [name, value] of Object.entries(attrs)) comp.setAttribute(name, String(value));
    if (config.background) comp.setAttribute("background", config.background);
    comp.innerHTML = scene;

    const host = document.getElementById("stage");
    host.style.width = attrs.width + "px";
    host.appendChild(comp);

    const { install } = await import(${JSON.stringify(API_PATH)});
    await install(comp);
    await document.fonts.ready;
  } catch (error) {
    fail(error);
  }
</script>
</body>
</html>
`;
}

export { PACKAGE_PREFIX, THREE_PREFIX, MUXER_PREFIX };
