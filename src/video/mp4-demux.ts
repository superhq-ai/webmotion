// Demux an MP4 into what WebCodecs needs: the video track's codec string and
// description bytes, plus every sample in decode order with its presentation
// time and keyframe flag. mp4box parses the container; the decode itself is
// VideoDecoder's job (see decoder.ts). The whole file is fetched and parsed at
// once, which is fine for launch-length clips.
import { createFile, DataStream, MP4BoxBuffer } from "mp4box";
import type { Movie, Sample, VisualSampleEntry } from "mp4box";

export interface VideoTrackInfo {
  id: number;
  /** WebCodecs codec string, e.g. "avc1.640028". */
  codec: string;
  timescale: number;
  width: number;
  height: number;
  nbSamples: number;
  /** Track duration in seconds. */
  durationSec: number;
}

// One coded frame. `data` is the compressed bitstream; `timestampMicros` is the
// presentation time (cts), which is what a seek resolves against.
export interface DemuxedSample {
  timestampMicros: number;
  durationMicros: number;
  isKeyframe: boolean;
  data: Uint8Array;
}

export interface Demuxed {
  track: VideoTrackInfo;
  /** avcC/hvcC/vpcC/av1C bytes for VideoDecoder.configure; some codecs carry
   *  their parameters in-band and leave this undefined. */
  description?: Uint8Array;
  /** Samples in decode order (mp4box delivery order); index is the decode
   *  position a keyframe seek anchors on. */
  samples: DemuxedSample[];
}

export async function demuxVideo(url: string): Promise<Demuxed> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`<w-video>: failed to fetch ${url} (${res.status})`);
  const buffer = await res.arrayBuffer();

  const file = createFile();
  let track: VideoTrackInfo | null = null;
  let description: Uint8Array | undefined;
  const samples: DemuxedSample[] = [];

  return await new Promise<Demuxed>((resolve, reject) => {
    file.onError = (module, message) => reject(new Error(`<w-video>: mp4box ${module}: ${message}`));

    file.onReady = (info: Movie) => {
      const vt = info.videoTracks[0];
      if (!vt) {
        reject(new Error("<w-video>: no video track in file (WebM is not supported)"));
        return;
      }
      track = {
        id: vt.id,
        codec: vt.codec,
        timescale: vt.timescale,
        width: vt.video?.width ?? vt.track_width,
        height: vt.video?.height ?? vt.track_height,
        nbSamples: vt.nb_samples,
        durationSec: vt.timescale ? vt.duration / vt.timescale : 0,
      };
      // Ask for every sample of the video track in one pass.
      file.setExtractionOptions(vt.id, undefined, { nbSamples: Number.POSITIVE_INFINITY });
      file.start();
    };

    file.onSamples = (_id, _user, chunk: Sample[]) => {
      for (const s of chunk) {
        if (!description) description = descriptionOf(s);
        if (!s.data || !s.timescale) continue;
        samples.push({
          timestampMicros: Math.round((s.cts / s.timescale) * 1e6),
          durationMicros: Math.round((s.duration / s.timescale) * 1e6),
          isKeyframe: s.is_sync,
          data: s.data,
        });
      }
    };

    // A whole-file buffer parses synchronously: onReady then onSamples fire
    // during append/flush, so track and samples are populated by the time
    // flush returns.
    file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buffer, 0));
    file.flush();

    if (!track) {
      reject(new Error("<w-video>: could not parse a video track"));
      return;
    }
    if (samples.length === 0) {
      reject(new Error("<w-video>: video track has no samples"));
      return;
    }
    resolve({ track, description, samples });
  });
}

// The decoder description lives in the sample entry's codec box (avcC for
// H.264, hvcC for H.265, and so on). Writing the box out and dropping its
// 8-byte header yields exactly the bytes VideoDecoder.configure wants.
function descriptionOf(sample: Sample): Uint8Array | undefined {
  const entry = sample.description as VisualSampleEntry | undefined;
  const box = entry?.avcC ?? entry?.hvcC ?? entry?.vpcC ?? entry?.av1C;
  if (!box) return undefined;
  // DataStream defaults to big-endian, which is what box bytes are written in.
  const stream = new DataStream(undefined, 0);
  // avcC/hvcC declare slightly different write() stream types; both accept a
  // DataStream at runtime, which is the documented extraction path.
  (box as { write(s: DataStream): void }).write(stream);
  return new Uint8Array(stream.buffer, 8);
}
