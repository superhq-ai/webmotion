// Lighting for <w-model>: named presets, declarative <w-light> children with
// tweenable numeric properties, and prefiltered environment maps. Everything
// samples from the frame, so lighting animation is as deterministic as any
// other tween.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { num } from "../elements/parse.js";
import { gatherTweens } from "../elements/registry.js";
import { readTween, sampleTween } from "../elements/tween.js";
import { sharedRenderer } from "./shared-renderer.js";

export type PresetName = "neutral" | "studio" | "dramatic" | "flat" | "none";

// Directional and ambient lights only, so presets are scale-free: they work
// unchanged for a sneaker and a skyscraper.
export function buildPreset(name: string | null): THREE.Light[] {
  switch ((name ?? "neutral") as PresetName) {
    case "studio": {
      const hemi = new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.2);
      const key = new THREE.DirectionalLight(0xffffff, 2.6);
      key.position.set(3, 5, 4);
      const fill = new THREE.DirectionalLight(0xffffff, 1.0);
      fill.position.set(-4, 2, 2);
      const rim = new THREE.DirectionalLight(0xffffff, 1.6);
      rim.position.set(-2, 3, -4);
      return [hemi, key, fill, rim];
    }
    case "dramatic": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.3);
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(4, 6, 3);
      const rim = new THREE.DirectionalLight(0xffffff, 2.8);
      rim.position.set(-3, 2.5, -4);
      return [ambient, key, rim];
    }
    case "flat":
      return [new THREE.AmbientLight(0xffffff, 2.8)];
    case "none":
      return [];
    case "neutral":
    default: {
      const hemi = new THREE.HemisphereLight(0xffffff, 0x666677, 2.4);
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2.5, 4, 3);
      return [hemi, key];
    }
  }
}

/** One declarative <w-light>, re-sampled every frame. */
export interface DeclaredLight {
  el: HTMLElement;
  light: THREE.Light;
}

export function createDeclaredLight(el: HTMLElement): DeclaredLight | null {
  const type = el.getAttribute("type") ?? "directional";
  const color = new THREE.Color(el.getAttribute("color") ?? "#ffffff");
  let light: THREE.Light;
  switch (type) {
    case "ambient":
      light = new THREE.AmbientLight(color);
      break;
    case "hemisphere":
      light = new THREE.HemisphereLight(
        color,
        new THREE.Color(el.getAttribute("ground-color") ?? "#444455"),
      );
      break;
    case "point":
      light = new THREE.PointLight(color);
      break;
    case "spot":
      light = new THREE.SpotLight(color);
      break;
    case "directional":
      light = new THREE.DirectionalLight(color);
      break;
    default:
      console.warn("[webmotion] <w-light> unknown type:", type);
      return null;
  }
  return { el, light };
}

// Apply static attributes plus this frame's tween samples to a light.
// Returns a state string folded into the model's render key, so a light
// change (and nothing else) still triggers a re-render.
export function applyLightFrame(decl: DeclaredLight, frame: number): string {
  const { el, light } = decl;

  const values: Record<string, number> = {
    intensity: num(el.getAttribute("intensity"), 1),
    x: 0,
    y: 0,
    z: 0,
    angle: num(el.getAttribute("angle"), 45),
    penumbra: num(el.getAttribute("penumbra"), 0.3),
    distance: num(el.getAttribute("distance"), 0),
    decay: num(el.getAttribute("decay"), 2),
  };
  const pos = (el.getAttribute("position") ?? "3 4 3").trim().split(/\s+/).map(Number);
  values["x"] = pos[0] ?? 3;
  values["y"] = pos[1] ?? 4;
  values["z"] = pos[2] ?? 3;

  for (const tween of gatherTweens(el)) {
    const data = readTween(tween);
    if (data.property in values) values[data.property] = sampleTween(data, frame);
  }

  light.intensity = values["intensity"] ?? 1;
  light.position.set(values["x"] ?? 0, values["y"] ?? 0, values["z"] ?? 0);
  if (light instanceof THREE.SpotLight) {
    light.angle = ((values["angle"] ?? 45) * Math.PI) / 180;
    light.penumbra = values["penumbra"] ?? 0;
    light.distance = values["distance"] ?? 0;
    light.decay = values["decay"] ?? 2;
  } else if (light instanceof THREE.PointLight) {
    light.distance = values["distance"] ?? 0;
    light.decay = values["decay"] ?? 2;
  }

  return (
    values["intensity"] + "," + values["x"] + "," + values["y"] + "," + values["z"] + "," +
    values["angle"] + "," + values["penumbra"] + "," + values["distance"]
  );
}

/**
 * Resolve the environment attribute to a prefiltered texture. "studio" uses
 * three's RoomEnvironment (no download); url(...) loads an equirect HDR.
 */
export function resolveEnvironment(value: string): Promise<THREE.Texture | null> {
  if (!value || value === "none") return Promise.resolve(null);
  if (value === "studio") {
    return Promise.resolve(
      sharedRenderer.environment("room", (pmrem) => {
        const room = new RoomEnvironment();
        const tex = pmrem.fromScene(room, 0.04).texture;
        return tex;
      }),
    );
  }
  const m = /^url\(\s*(['"]?)(.+?)\1\s*\)$/.exec(value.trim());
  if (!m || !m[2]) {
    console.warn("[webmotion] <w-model> unrecognized environment:", value);
    return Promise.resolve(null);
  }
  const url = new URL(m[2], document.baseURI).href;
  return new RGBELoader().loadAsync(url).then((equirect) =>
    sharedRenderer.environment("hdr:" + url, (pmrem) => {
      const tex = pmrem.fromEquirectangular(equirect).texture;
      equirect.dispose();
      return tex;
    }),
  );
}

const TONE_MAPPINGS: Record<string, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

export function resolveToneMapping(name: string | null): THREE.ToneMapping {
  if (!name) return THREE.NoToneMapping;
  const hit = TONE_MAPPINGS[name.trim().toLowerCase()];
  if (hit === undefined) {
    console.warn("[webmotion] <w-model> unknown tone-mapping:", name);
    return THREE.NoToneMapping;
  }
  return hit;
}

/**
 * A soft contact shadow: the first shadow-capable preset light casts onto an
 * invisible ground plane at the model's feet. Returns the plane so the caller
 * can place it (recentered coordinates, floor at boxMin.y - center.y).
 */
export function buildContactShadow(
  lights: THREE.Light[],
  radius: number,
  floorY: number,
  opacity: number,
): THREE.Mesh | null {
  const caster = lights.find(
    (l): l is THREE.DirectionalLight => l instanceof THREE.DirectionalLight,
  );
  if (!caster) return null;
  caster.castShadow = true;
  caster.shadow.mapSize.set(1024, 1024);
  const cam = caster.shadow.camera;
  cam.left = -radius * 2;
  cam.right = radius * 2;
  cam.top = radius * 2;
  cam.bottom = -radius * 2;
  cam.near = radius / 50;
  cam.far = radius * 20;
  caster.shadow.bias = -0.0002;
  // Directional shadow cameras follow the light position; scale it out to the
  // model's size so the frustum covers it.
  caster.position.normalize().multiplyScalar(radius * 4);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 8, radius * 8),
    new THREE.ShadowMaterial({ opacity }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = floorY;
  ground.receiveShadow = true;
  return ground;
}
