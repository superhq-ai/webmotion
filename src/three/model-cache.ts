// Parse each glTF url once and hand out clones. Clones share geometry and
// texture GPU resources on the shared context, so N instances of one model
// cost one upload plus N scene graphs. SkeletonUtils.clone keeps skinned
// models animatable per instance; a plain Object3D.clone would leave every
// clone bound to the original skeleton.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { createGLTFLoader } from "./loaders.js";

const cache = new Map<string, Promise<GLTF>>();
let loaderPromise: Promise<GLTFLoader> | null = null;

export function loadGLTF(url: string): Promise<GLTF> {
  let hit = cache.get(url);
  if (!hit) {
    if (!loaderPromise) loaderPromise = createGLTFLoader();
    hit = loaderPromise.then((loader) => loader.loadAsync(url));
    cache.set(url, hit);
    hit.catch(() => {
      if (cache.get(url) === hit) cache.delete(url);
    });
  }
  return hit;
}

export interface ModelInstance {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export function instantiate(gltf: GLTF): ModelInstance {
  return {
    scene: SkeletonUtils.clone(gltf.scene) as THREE.Group,
    animations: gltf.animations,
  };
}

/** Test hook: drop all parsed models. */
export function clearModelCache(): void {
  cache.clear();
  loaderPromise = null;
}
