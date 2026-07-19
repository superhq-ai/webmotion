// A static file server for the duration of one CLI run. The scene has to be
// loaded over http rather than file:// so that module imports, relative asset
// paths, and the same-origin rules the exporter depends on all behave the way
// they will in the user's dev server.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".ktx2": "image/ktx2",
  ".wasm": "application/wasm",
};

export interface Mount {
  /** URL prefix, always ending in a slash except for the root mount. */
  prefix: string;
  dir: string;
}

export interface SceneServerOptions {
  mounts: Mount[];
  /** Exact URL paths served from memory, for the generated harness page. */
  virtual?: Record<string, { body: string; type: string }>;
  /** Called with the URL path of every request that found no file. */
  onNotFound?: (urlPath: string) => void;
}

export interface SceneServer {
  origin: string;
  close(): Promise<void>;
}

/** The directory holding the browser-side modules we serve to the page. */
export function browserAssetsDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "browser");
}

function resolveInMount(mount: Mount, urlPath: string): string | null {
  const rest = urlPath.slice(mount.prefix.length);
  const target = path.resolve(mount.dir, rest);
  // Path traversal guard: the resolved file has to stay inside the mount.
  const relative = path.relative(mount.dir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  return target;
}

export async function startSceneServer(options: SceneServerOptions): Promise<SceneServer> {
  const virtual = options.virtual ?? {};
  // Longest prefix first so "/__wm/pkg/" wins over the root mount.
  const mounts = [...options.mounts].sort((a, b) => b.prefix.length - a.prefix.length);

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");

    const inMemory = virtual[urlPath];
    if (inMemory) {
      res.writeHead(200, { "content-type": inMemory.type, "cache-control": "no-store" });
      res.end(inMemory.body);
      return;
    }

    for (const mount of mounts) {
      if (!urlPath.startsWith(mount.prefix)) continue;
      const file = resolveInMount(mount, urlPath);
      if (!file) continue;
      res.writeHead(200, {
        "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      createReadStream(file).pipe(res);
      return;
    }

    options.onNotFound?.(urlPath);
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Not found: ${urlPath}`);
  };

  const server: Server = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Port 0: let the OS pick, so concurrent runs never collide.
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("scene server did not bind to a TCP port");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
