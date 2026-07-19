// Working out what to load and where it lives. The CLI runs from a user's
// video project, which may be the Vite starter (a src/scene.js exporting
// `config` and `scene`), a bare HTML page holding a <w-composition>, or this
// repo itself. Everything downstream takes a resolved Project.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** How the entry file hands us a composition. */
export type EntryKind = "module" | "html";

export interface Project {
  /** Directory served to the browser; every asset path is relative to it. */
  root: string;
  /** Absolute path of the scene entry. */
  entry: string;
  entryKind: EntryKind;
  /** The `dist` directory of the @superhq/webmotion the scene should run against. */
  packageDist: string;
  /** Directory of the `three` package, when one is installed. */
  threeDir: string | null;
  /** Directory of mp4-muxer, which the library imports by bare specifier. */
  muxerDir: string | null;
}

const DEFAULT_ENTRIES = ["src/scene.js", "scene.js", "src/scene.mjs", "index.html"];

/** The dist directory this CLI was built into, used when a project has no local install. */
function ownDist(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/** Nearest ancestor directory (inclusive) holding a package.json. */
function findPackageRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
}

function readName(dir: string): string | null {
  try {
    const raw = readFileSync(path.join(dir, "package.json"), "utf8");
    const name: unknown = JSON.parse(raw).name;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a dependency's directory from the project's own node_modules, so a
 * scene runs against the version it declares rather than whatever the CLI was
 * installed beside.
 */
function resolveFrom(root: string, specifier: string): string | null {
  const require = createRequire(path.join(root, "package.json"));

  try {
    return path.dirname(require.resolve(`${specifier}/package.json`));
  } catch {
    // Packages with an "exports" map that omits ./package.json (mp4-muxer is
    // one) refuse that lookup, so resolve the entry and walk back up to it.
  }

  try {
    let dir = path.dirname(require.resolve(specifier));
    for (;;) {
      if (readName(dir) === specifier) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch {
    return null;
  }
}

function resolvePackageDist(root: string): string {
  // Running inside the webmotion repo: use the build sitting next to the source.
  if (readName(root) === "@superhq/webmotion" && existsSync(path.join(root, "dist"))) {
    return path.join(root, "dist");
  }
  const installed = resolveFrom(root, "@superhq/webmotion");
  if (installed && existsSync(path.join(installed, "dist"))) return path.join(installed, "dist");
  return ownDist();
}

export function findEntry(cwd: string, requested?: string): string {
  if (requested) {
    const abs = path.resolve(cwd, requested);
    if (!existsSync(abs)) throw new Error(`Entry not found: ${requested}`);
    return abs;
  }
  for (const candidate of DEFAULT_ENTRIES) {
    const abs = path.join(cwd, candidate);
    if (existsSync(abs)) return abs;
  }
  throw new Error(
    `No scene entry found. Looked for ${DEFAULT_ENTRIES.join(", ")} in ${cwd}.\n` +
      `Pass one explicitly, for example: webmotion lint src/scene.js`,
  );
}

export function resolveProject(cwd: string, requested?: string): Project {
  const entry = findEntry(cwd, requested);
  const root = findPackageRoot(path.dirname(entry));
  const packageDist = resolvePackageDist(root);
  // Dependencies the library imports by bare specifier have to be resolvable
  // too. They usually live beside the library rather than in the video project,
  // so fall back to resolving from the package's own directory.
  const packageRoot = path.dirname(packageDist);
  const dependency = (name: string): string | null =>
    resolveFrom(root, name) ?? resolveFrom(packageRoot, name);

  return {
    root,
    entry,
    entryKind: entry.endsWith(".html") ? "html" : "module",
    packageDist,
    threeDir: dependency("three"),
    muxerDir: dependency("mp4-muxer"),
  };
}

/** URL path for a file inside the served project root. */
export function servedPath(project: Project, absolute: string): string {
  const rel = path.relative(project.root, absolute);
  if (rel.startsWith("..")) throw new Error(`${absolute} is outside the project root`);
  return `/${rel.split(path.sep).join("/")}`;
}
