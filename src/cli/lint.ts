// `webmotion lint`: the sighted check that survives without eyes. Everything
// it reports is mechanical, so it reads the same whether a person or an agent
// is holding the loop, and it catches the failures a contact sheet is worst at
// (a font that never loaded, two tweens fighting, an asset that will export as
// a hole).
import path from "node:path";
import type { FrameProbe } from "./browser/api.js";
import { autoFrames, beatSamples } from "./frames.js";
import type { Project } from "./project.js";
import { runRules, type Finding } from "./rules.js";
import { openScene } from "./session.js";

export interface LintOptions {
  json?: boolean;
  verbose?: boolean;
  /** Only lint frames inside this beat label. */
  beat?: string;
}

const LABEL: Record<Finding["severity"], string> = { error: "error", warn: "warn " };

export async function lint(project: Project, options: LintOptions = {}): Promise<number> {
  const session = await openScene(project, { verbose: options.verbose });

  try {
    const { info } = session;
    const beats = options.beat ? info.beats.filter((b) => b.label === options.beat) : info.beats;
    if (options.beat && beats.length === 0) {
      throw new Error(`no beat labelled "${options.beat}" in this scene`);
    }

    // One probe per frame, shared by every rule. Beat samples and the contact
    // sheet frames overlap heavily, so collect the union and visit each once.
    const beatFrames = new Map<string, number[]>();
    const wanted = new Set<number>();
    for (const beat of beats) {
      const frames = beatSamples(beat, info);
      beatFrames.set(beat.label, frames);
      for (const frame of frames) wanted.add(frame);
    }
    if (!options.beat) for (const pick of autoFrames(info)) wanted.add(pick.frame);

    const probes = new Map<number, FrameProbe>();
    for (const frame of Array.from(wanted).sort((a, b) => a - b)) {
      probes.set(frame, await session.probe(frame));
    }

    const facts = await session.facts();
    const findings = runRules({
      info,
      facts,
      probes,
      beatFrames,
      pageErrors: session.errors,
      missingAssets: session.missing,
    });

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ entry: project.entry, info, findings }, null, 2)}\n`,
      );
    } else {
      report(project, session.info, probes.size, findings);
    }

    return findings.some((finding) => finding.severity === "error") ? 1 : 0;
  } finally {
    await session.close();
  }
}

function report(
  project: Project,
  info: { width: number; height: number; fps: number; duration: number; beats: unknown[] },
  frameCount: number,
  findings: Finding[],
): void {
  const { width, height, fps, duration } = info;
  process.stdout.write(
    `${path.relative(process.cwd(), project.entry)}  ${width}x${height} @${fps}fps, ` +
      `${duration} frames (${(duration / fps).toFixed(1)}s), ${info.beats.length} beats, ` +
      `${frameCount} frames sampled\n\n`,
  );

  if (findings.length === 0) {
    process.stdout.write("No findings.\n");
    return;
  }

  for (const finding of findings) {
    const at = finding.frame === undefined ? "" : ` [frame ${finding.frame}]`;
    process.stdout.write(
      `${LABEL[finding.severity]}  ${finding.rule.padEnd(16)}${finding.message}${at}\n`,
    );
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.length - errors;
  process.stdout.write(`\n${findings.length} findings (${errors} errors, ${warnings} warnings)\n`);
}
