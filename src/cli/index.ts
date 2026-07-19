#!/usr/bin/env node
// The `webmotion` command line tool: a way to look at a scene without opening
// a browser. Two commands, both pointed at a scene entry (the starter's
// src/scene.js, or any HTML page holding a <w-composition>).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lint } from "./lint.js";
import { resolveProject } from "./project.js";
import { shoot } from "./shoot.js";

const USAGE = `webmotion <command> [entry] [options]

Commands:
  shoot [entry]   Screenshot the scene at key frames into a contact sheet
  lint  [entry]   Check the scene for mistakes that survive into the export

Entry defaults to src/scene.js, scene.js, or index.html in the current directory.

Options:
  --frames <spec>  shoot: "auto" (default, derived from labelled beats) or "0,30,60"
  --out <dir>      shoot: output directory (default .webmotion/shots)
  --scale <n>      shoot: pixel density of the screenshots (default 1)
  --beat <label>   lint: only check frames inside this beat
  --json           machine-readable output
  --verbose        stream the page's console output
  --help           show this message
  --version        show the package version

Examples:
  webmotion shoot
  webmotion shoot src/scene.js --frames 0,45,120 --out shots
  webmotion lint --json
`;

interface Args {
  command: string | undefined;
  entry: string | undefined;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    // Value flags take the next token; everything else is a switch.
    if (next !== undefined && !next.startsWith("--") && name !== "json" && name !== "verbose" &&
        name !== "help" && name !== "version") {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  }

  return { command: positional[0], entry: positional[1], flags };
}

function version(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.resolve(here, "../../package.json"), "utf8");
  return String(JSON.parse(raw).version ?? "unknown");
}

async function main(): Promise<number> {
  const { command, entry, flags } = parseArgs(process.argv.slice(2));

  if (flags["version"] === true) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }
  if (command === undefined || flags["help"] === true || command === "help") {
    process.stdout.write(USAGE);
    return command === undefined && flags["help"] !== true ? 1 : 0;
  }

  const asNumber = (value: string | boolean | undefined): number | undefined =>
    typeof value === "string" && Number.isFinite(Number(value)) ? Number(value) : undefined;
  const asString = (value: string | boolean | undefined): string | undefined =>
    typeof value === "string" ? value : undefined;

  const project = resolveProject(process.cwd(), entry);
  const json = flags["json"] === true;
  const verbose = flags["verbose"] === true;

  switch (command) {
    case "shoot":
      return await shoot(project, {
        frames: asString(flags["frames"]),
        out: asString(flags["out"]),
        scale: asNumber(flags["scale"]),
        json,
        verbose,
      });
    case "lint":
      return await lint(project, { beat: asString(flags["beat"]), json, verbose });
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
