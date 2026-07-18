// GLTF loader construction, including decoders for the compressed formats
// most published GLBs use: DRACO geometry, KTX2/Basis textures, and Meshopt
// buffers. Meshopt is a plain module and needs nothing. DRACO and Basis need
// WASM binaries fetched at decode time; the default path is a CDN pinned to
// the running three revision, because worker scripts fetched from inside a
// library survive neither dev-server transforms nor bundler asset tracing.
// Self-hosters call configureModelLoaders with their own paths; the binaries
// are also vendored into this package under dist/three/decoders/ so there is
// something to self-host without visiting three's repo.
import { REVISION } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { sharedRenderer } from "./shared-renderer.js";

interface LoaderConfig {
  dracoPath?: string;
  ktx2Path?: string;
}

let config: LoaderConfig = {};

export function configureModelLoaders(overrides: LoaderConfig): void {
  config = { ...config, ...overrides };
}

function cdnBase(): string {
  return `https://cdn.jsdelivr.net/npm/three@0.${REVISION}.0/examples/jsm/libs/`;
}

export async function createGLTFLoader(): Promise<GLTFLoader> {
  const loader = new GLTFLoader();

  const draco = new DRACOLoader();
  draco.setDecoderPath(config.dracoPath ?? cdnBase() + "draco/gltf/");
  loader.setDRACOLoader(draco);

  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(config.ktx2Path ?? cdnBase() + "basis/");
  // Transcode target selection probes the backend; WebGPU probing is async.
  const renderer = sharedRenderer.get();
  await sharedRenderer.ready();
  const probe = ktx2 as unknown as {
    detectSupportAsync?: (r: unknown) => Promise<unknown>;
    detectSupport: (r: unknown) => unknown;
  };
  if (typeof probe.detectSupportAsync === "function") await probe.detectSupportAsync(renderer);
  else probe.detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}
