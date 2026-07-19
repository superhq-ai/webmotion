// `webmotion shoot`: a contact sheet of the scene. The point is to give
// whoever is iterating on a video, a person or an agent, something to look at
// without opening a browser and scrubbing by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveFrames } from "./frames.js";
import type { Project } from "./project.js";
import { openScene } from "./session.js";

export interface ShootOptions {
  frames?: string;
  out?: string;
  scale?: number;
  json?: boolean;
  verbose?: boolean;
}

interface Shot {
  frame: number;
  seconds: number;
  label: string | null;
  file: string;
}

function slug(label: string | null): string {
  if (!label) return "";
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned ? `-${cleaned.slice(0, 24)}` : "";
}

export async function shoot(project: Project, options: ShootOptions = {}): Promise<number> {
  const outDir = path.resolve(project.root, options.out ?? ".webmotion/shots");
  const session = await openScene(project, { scale: options.scale, verbose: options.verbose });

  try {
    const picks = resolveFrames(options.frames, session.info);
    mkdirSync(outDir, { recursive: true });

    const shots: Shot[] = [];
    for (const pick of picks) {
      const name = `f${String(pick.frame).padStart(4, "0")}${slug(pick.label)}.png`;
      await session.screenshot(pick.frame, path.join(outDir, name));
      shots.push({
        frame: pick.frame,
        seconds: Number((pick.frame / session.info.fps).toFixed(2)),
        label: pick.label,
        file: path.join(outDir, name),
      });
    }

    const index = {
      entry: project.entry,
      width: session.info.width,
      height: session.info.height,
      fps: session.info.fps,
      duration: session.info.duration,
      scale: options.scale ?? 1,
      beats: session.info.beats,
      shots,
    };
    writeFileSync(path.join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
      return 0;
    }

    const { width, height, fps, duration } = session.info;
    process.stdout.write(
      `${path.relative(process.cwd(), project.entry)}  ${width}x${height} @${fps}fps, ` +
        `${duration} frames (${(duration / fps).toFixed(1)}s)\n\n`,
    );
    for (const s of shots) {
      const at = `${String(s.frame).padStart(4)}  ${s.seconds.toFixed(2)}s`;
      process.stdout.write(`  ${at}  ${s.label ?? "-"}\n    ${s.file}\n`);
    }
    process.stdout.write(`\n${shots.length} frames written to ${outDir}\n`);
    return 0;
  } finally {
    await session.close();
  }
}
