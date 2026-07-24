// Optional video entry. Importing it registers <w-video> alongside the core
// elements; mp4box is an optional peer dependency, so apps that never import
// "@superhq/webmotion/video" pay nothing for it.
import "../elements/index.js";
import { defineVideoElement } from "./video-element.js";

export { WVideo, defineVideoElement } from "./video-element.js";
export { VideoSource, sourceTimeAt, type SourceTiming } from "./decoder.js";
export { demuxVideo, type Demuxed, type VideoTrackInfo, type DemuxedSample } from "./mp4-demux.js";

defineVideoElement();
