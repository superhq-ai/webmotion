#!/usr/bin/env python3
"""Synthesise the ambient bed under the site's hero film.

Original material, so there is nothing to licence. It is written here rather
than sourced because the film is austere and short, and because the score wants
to land on the cuts: the act boundaries below are the frames where the hero
scene changes shot, and each gets a soft struck tone.

    python3 scripts/make-hero-score.py            # writes the m4a via ffmpeg

Requires numpy and ffmpeg.
"""
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
FPS = 30
FRAMES = 900                      # the hero composition's duration
DUR = FRAMES / FPS                # 30 seconds
OUT = Path("examples/public/assets/hero-score.m4a")

# Frames where the hero film cuts to a new act.
CUTS = [110, 305, 485, 665, 840]

t = np.linspace(0, DUR, int(SR * DUR), endpoint=False)


def swell(centre, width, height=1.0):
    """A smooth hill in time, for fading voices in and out."""
    return height * np.exp(-(((t - centre) / width) ** 2))


def voice(freq, amp, detune=0.0):
    """A sine with a slight phase wander, so it breathes instead of sitting still.

    The wander is kept shallow on purpose. An earlier version modulated by 0.6
    radians, deep enough that the voices intermodulated and put a spurious
    partial an octave below the fundamental.
    """
    drift = 0.12 * np.sin(2 * np.pi * 0.031 * t + freq)
    return amp * np.sin(2 * np.pi * (freq + detune) * t + drift)


# A drone, its fifth, and an octave. Pitched at D3 rather than D2: the first
# version put 92% of its energy under 160 Hz, which is rumble on a laptop and
# inaudible on a phone. A quiet A2 underneath is all the weight this needs.
bed = (
    voice(146.83, 0.30) + voice(146.83, 0.25, detune=0.17)        # D3
    + voice(220.00, 0.17) + voice(220.00, 0.14, detune=-0.21)     # A3
    + voice(293.66, 0.10) * swell(18.0, 11.0)                     # D4, later
    + voice(110.00, 0.09)                                         # A2, body only
)

# Air, from tone rather than noise. An earlier version low-passed white noise,
# but a 900-tap kernel at 44.1 kHz cuts around 49 Hz, and broadband rumble that
# low is indistinguishable from wind across a microphone. Quiet high partials
# with independent tremolo give the same sense of space and stay musical.
for freq, amp, rate in ((587.33, 0.020, 0.043), (880.00, 0.014, 0.031), (1174.66, 0.009, 0.023)):
    tremolo = 0.55 + 0.45 * np.sin(2 * np.pi * rate * t + freq)
    bed += np.sin(2 * np.pi * freq * t) * amp * tremolo * swell(15.0, 12.0)

# Struck tones on the cuts: a soft partial stack with a long decay.
for i, frame in enumerate(CUTS):
    start = frame / FPS
    rel = t - start
    env = np.where(rel >= 0, np.exp(-rel * 1.5), 0.0)
    root = 293.66 * (1.5 if i % 2 else 1.0)                        # D4 / A4
    strike = sum(
        np.sin(2 * np.pi * root * h * t) * a
        for h, a in ((1.0, 0.30), (2.0, 0.12), (3.0, 0.05), (4.01, 0.02))
    )
    bed += strike * env * 0.5

# Overall shape: come up out of nothing, sit, and clear before the loop point.
bed *= np.clip(np.minimum(t / 2.2, (DUR - t) / 2.6), 0.0, 1.0)

# Clear everything under ~55 Hz. Nothing musical lives there and it is where
# rumble collects.
spectrum = np.fft.rfft(bed)
freqs = np.fft.rfftfreq(bed.size, 1 / SR)
bed = np.fft.irfft(spectrum * np.clip((freqs - 30.0) / 25.0, 0.0, 1.0), n=bed.size)

peak = np.max(np.abs(bed))
if peak > 0:
    bed = bed / peak * 0.72

# Both channels identical. The first version delayed one side by 240 samples for
# "width", which is half a cycle at 92 Hz and therefore phase-inverted the very
# band carrying most of the energy: anti-correlated bass, which is the swirling,
# wind-across-a-microphone sound. Width is not worth that.
stereo = np.stack([bed, bed], axis=1)
pcm = (np.clip(stereo, -1.0, 1.0) * 32767).astype("<i2")

wav = OUT.with_suffix(".wav")
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(wav), "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes(pcm.tobytes())

subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
     "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-c:a", "aac", "-b:a", "96k", str(OUT)],
    check=True,
)
wav.unlink()
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {DUR:.0f}s)")
