// Vendor the DRACO and Basis decoder binaries from the installed three
// package into dist/three/decoders/, so compressed glTF loading works with
// zero configuration and no network dependency. Runs after tsc in the build.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const libs = join(root, "node_modules", "three", "examples", "jsm", "libs");
const out = join(root, "dist", "three", "decoders");

mkdirSync(out, { recursive: true });
cpSync(join(libs, "draco", "gltf"), join(out, "draco"), { recursive: true });
cpSync(join(libs, "basis"), join(out, "basis"), { recursive: true });
console.log("[build] vendored draco + basis decoders into dist/three/decoders");
