// One scene, open in a real browser. Everything the commands do (screenshots,
// probes, facts) goes through a Session, so there is exactly one place that
// knows how a scene gets booted and torn down.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Browser, ConsoleMessage, Page } from "playwright";
import type { CompositionInfo, FrameProbe, SceneFacts } from "./browser/api.js";
import {
  API_PATH,
  HARNESS_PATH,
  MUXER_PREFIX,
  PACKAGE_PREFIX,
  THREE_PREFIX,
  harnessHtml,
} from "./harness.js";
import { type Project, servedPath } from "./project.js";
import { browserAssetsDir, startSceneServer, type Mount, type SceneServer } from "./server.js";

export interface SessionOptions {
  /** Pixel density of screenshots. 1 keeps them in composition pixels. */
  scale?: number;
  /** Print page console output, for debugging a scene that will not boot. */
  verbose?: boolean;
}

export interface Session {
  info: CompositionInfo;
  probe(frame: number): Promise<FrameProbe>;
  facts(): Promise<SceneFacts>;
  screenshot(frame: number, file: string): Promise<void>;
  /** Errors the page reported while booting or seeking. */
  errors: string[];
  /** Asset paths the scene asked for that do not exist. */
  missing: string[];
  close(): Promise<void>;
}

const INSTALL_HINT =
  "webmotion shoot and lint drive a real browser, which needs Playwright:\n" +
  "  npm install --save-dev playwright\n" +
  "It uses your installed Chrome when there is one, so no extra download is needed.";

async function launchBrowser(): Promise<Browser> {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(INSTALL_HINT);
  }

  // Prefer the user's Chrome: export needs Chromium-based anyway, and it saves
  // a browser download on a fresh machine.
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    try {
      return await chromium.launch();
    } catch {
      throw new Error(
        `${INSTALL_HINT}\nNo Chrome found either. Install one with:\n  npx playwright install chromium`,
      );
    }
  }
}

/**
 * Author-supplied HTML pages have no import map, so bare specifiers like
 * "@superhq/webmotion/elements" would not resolve. Inject one ahead of the
 * page's own modules.
 */
function injectImportMap(html: string, project: Project): string {
  const map = harnessHtml(project).match(/<script type="importmap">[\s\S]*?<\/script>/);
  if (!map) return html;
  return html.includes("<head>")
    ? html.replace("<head>", `<head>\n${map[0]}`)
    : `${map[0]}\n${html}`;
}

export async function openScene(project: Project, options: SessionOptions = {}): Promise<Session> {
  const mounts: Mount[] = [
    { prefix: PACKAGE_PREFIX, dir: project.packageDist },
    { prefix: "/", dir: project.root },
  ];
  if (project.threeDir) mounts.push({ prefix: THREE_PREFIX, dir: project.threeDir });
  if (project.muxerDir) mounts.push({ prefix: MUXER_PREFIX, dir: project.muxerDir });

  const virtual: Record<string, { body: string; type: string }> = {
    [HARNESS_PATH]: { body: harnessHtml(project), type: "text/html; charset=utf-8" },
    [API_PATH]: {
      body: readFileSync(path.join(browserAssetsDir(), "api.js"), "utf8"),
      type: "text/javascript; charset=utf-8",
    },
  };

  let entryPath = HARNESS_PATH;
  if (project.entryKind === "html") {
    entryPath = servedPath(project, project.entry);
    virtual[entryPath] = {
      body: injectImportMap(readFileSync(project.entry, "utf8"), project),
      type: "text/html; charset=utf-8",
    };
  }

  let server: SceneServer | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  const missing: string[] = [];

  try {
    server = await startSceneServer({
      mounts,
      virtual,
      onNotFound: (urlPath) => {
        // The browser asks for a favicon on its own; that is not the scene's doing.
        if (urlPath === "/favicon.ico") return;
        if (!missing.includes(urlPath)) missing.push(urlPath);
      },
    });
    browser = await launchBrowser();

    const page: Page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: options.scale ?? 1,
    });

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message: ConsoleMessage) => {
      // Failed subresources are reported by path through the missing-asset
      // rule, which says something useful; the console text does not.
      const text = message.text();
      if (message.type() === "error" && !text.startsWith("Failed to load resource")) {
        errors.push(text);
      }
      if (options.verbose) process.stderr.write(`  [page:${message.type()}] ${message.text()}\n`);
    });

    await page.goto(`${server.origin}${entryPath}`, { waitUntil: "load" });

    if (project.entryKind === "html") {
      // The author's page mounted its own composition; install the probe into it.
      await page.evaluate(async (apiPath) => {
        const comp = document.querySelector("w-composition");
        if (!comp) throw new Error("no <w-composition> found in the page");
        const api = (await import(apiPath)) as { install(el: Element): Promise<void> };
        await api.install(comp);
      }, API_PATH);
    }

    await page.waitForFunction(() => window.__wm !== undefined || "__wmError" in window, null, {
      timeout: 30_000,
    });

    const bootError = await page.evaluate(() => (window as { __wmError?: string }).__wmError);
    if (bootError) throw new Error(`scene failed to load:\n${bootError}`);

    const info = await page.evaluate(() => window.__wm!.info());

    // Size the viewport to the composition so full-frame screenshots never
    // need scrolling and layout matches what export sees.
    await page.setViewportSize({
      width: Math.max(info.width, 320),
      height: Math.max(info.height, 240),
    });

    const stage = page.locator("w-composition").first();
    const activeServer = server;
    const activeBrowser = browser;

    return {
      info,
      errors,
      missing,
      probe: (frame) => page.evaluate((f) => window.__wm!.probe(f), frame),
      facts: () => page.evaluate(() => window.__wm!.facts()),
      async screenshot(frame, file) {
        await page.evaluate((f) => window.__wm!.seek(f), frame);
        await stage.screenshot({ path: file });
      },
      async close() {
        await activeBrowser.close();
        await activeServer.close();
      },
    };
  } catch (error) {
    await browser?.close();
    await server?.close();
    throw error;
  }
}
