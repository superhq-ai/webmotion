// Synthesizes the demo soundtrack deterministically: an ambient score and a
// whoosh, written as 16-bit stereo WAVs into examples/public/assets. No
// samples, no licensing, fully reproducible.
// Usage: node scripts/generate-audio.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RATE = 44_100;

// Deterministic PRNG (mulberry32) so every run produces identical bytes.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function writeWav(path, left, right) {
  const frames = left.length;
  const data = Buffer.alloc(44 + frames * 4);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + frames * 4, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(2, 22); // stereo
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(path, data);
  console.log(`wrote ${path} (${(data.length / 1024).toFixed(0)} KB, ${(frames / RATE).toFixed(2)}s)`);
}

function out(rel) {
  return fileURLToPath(new URL(`../examples/public/assets/${rel}`, import.meta.url));
}

// ---- Score: a slow ambient pad in A minor, ~13.5s ----
{
  const seconds = 13.5;
  const n = Math.round(seconds * RATE);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const noise = rng(1337);

  const chord = [110, 220, 261.63, 329.63, 440]; // A2 A3 C4 E4 A4
  const level = [0.3, 0.22, 0.16, 0.16, 0.07];

  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    // Global envelope: 2s swell in, 2.5s tail out.
    const env =
      Math.min(1, t / 2) * Math.min(1, Math.max(0, (seconds - t) / 2.5));
    // The pad breathes slowly.
    const breathe = 0.8 + 0.2 * Math.sin(2 * Math.PI * t * 0.09);

    let vL = 0;
    let vR = 0;
    for (let k = 0; k < chord.length; k++) {
      const f = chord[k];
      const vib = 1 + 0.0015 * Math.sin(2 * Math.PI * t * (0.11 + k * 0.03));
      vL += level[k] * Math.sin(2 * Math.PI * f * vib * t);
      vR += level[k] * Math.sin(2 * Math.PI * f * 1.0012 * vib * t + 0.6);
    }

    // Soft airy noise floor, low-passed per channel.
    lpL += 0.02 * ((noise() * 2 - 1) * 0.5 - lpL);
    lpR += 0.02 * ((noise() * 2 - 1) * 0.5 - lpR);

    left[i] = (vL * breathe + lpL * 0.6) * env * 0.5;
    right[i] = (vR * breathe + lpR * 0.6) * env * 0.5;
  }
  writeWav(out("score.wav"), left, right);
}

// ---- Whoosh: a resonant noise sweep, ~1.4s ----
{
  const seconds = 1.4;
  const n = Math.round(seconds * RATE);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const noise = rng(7331);

  // Two-pole resonant bandpass, swept up then settled.
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const p = t / seconds;
    // Amplitude peaks just past the middle, like a hit landing.
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.1)), 1.6);
    // Sweep 180Hz -> 2.8kHz -> 900Hz.
    const sweep =
      p < 0.55 ? 180 + (2800 - 180) * (p / 0.55) : 2800 - (2800 - 900) * ((p - 0.55) / 0.45);
    const f = (2 * Math.PI * sweep) / RATE;
    const q = 0.25;

    const x = noise() * 2 - 1;
    low += f * band;
    const high = x - low - q * band;
    band += f * high;

    const v = band * env * 0.85;
    // A slight stereo skew so it moves left-to-right with the reveal.
    left[i] = v * (1 - 0.3 * p);
    right[i] = v * (0.7 + 0.3 * p);
  }
  writeWav(out("whoosh.wav"), left, right);
}
