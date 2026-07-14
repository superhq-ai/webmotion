import type { AudioClip } from "./schedule.js";
import { loadClipBuffers, scheduleClips } from "./engine.js";

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;
export const AUDIO_BITRATE = 128_000;

export interface AudioCodecChoice {
  /** WebCodecs codec string. */
  webCodec: string;
  /** mp4-muxer codec name. */
  muxCodec: "aac" | "opus";
}

// AAC is the native MP4 pairing; Opus is the universal fallback in Chromium.
export async function negotiateAudioCodec(): Promise<AudioCodecChoice | null> {
  if (typeof AudioEncoder === "undefined") return null;
  const candidates: AudioCodecChoice[] = [
    { webCodec: "mp4a.40.2", muxCodec: "aac" },
    { webCodec: "opus", muxCodec: "opus" },
  ];
  for (const candidate of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: candidate.webCodec,
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfChannels: AUDIO_CHANNELS,
        bitrate: AUDIO_BITRATE,
      });
      if (support.supported) return candidate;
    } catch {
      // Unsupported codec string; try the next one.
    }
  }
  return null;
}

// The deterministic mixdown: the same clips and envelopes the preview plays,
// rendered sample-exact through an OfflineAudioContext.
export async function renderAudioMix(
  clips: AudioClip[],
  fps: number,
  durationInFrames: number,
): Promise<AudioBuffer> {
  const length = Math.ceil((durationInFrames / fps) * AUDIO_SAMPLE_RATE);
  const ctx = new OfflineAudioContext(AUDIO_CHANNELS, length, AUDIO_SAMPLE_RATE);
  const buffers = await loadClipBuffers(ctx, clips);
  scheduleClips(ctx, clips, buffers, fps, 0, 0);
  return ctx.startRendering();
}

export interface AudioMuxer {
  addAudioChunk(chunk: EncodedAudioChunk, meta: EncodedAudioChunkMetadata | undefined): void;
}

// Encode a rendered mix into the muxer's audio track. Runs before the video
// loop; mp4-muxer interleaves tracks at finalize.
export async function encodeAudioIntoMuxer(
  mix: AudioBuffer,
  codec: AudioCodecChoice,
  muxer: AudioMuxer,
): Promise<void> {
  let encodeError: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  encoder.configure({
    codec: codec.webCodec,
    sampleRate: mix.sampleRate,
    numberOfChannels: mix.numberOfChannels,
    bitrate: AUDIO_BITRATE,
  });

  const channels = mix.numberOfChannels;
  const CHUNK_FRAMES = 9_600; // 200ms at 48kHz
  for (let offset = 0; offset < mix.length; offset += CHUNK_FRAMES) {
    const frames = Math.min(CHUNK_FRAMES, mix.length - offset);
    const data = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) {
      mix.copyFromChannel(data.subarray(c * frames, (c + 1) * frames), c, offset);
    }
    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate: mix.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / mix.sampleRate) * 1_000_000),
      data,
    });
    encoder.encode(audioData);
    audioData.close();
    if (encodeError) break;
  }

  await encoder.flush();
  encoder.close();
  if (encodeError) {
    throw new Error("Audio encoding failed", { cause: encodeError });
  }
}
