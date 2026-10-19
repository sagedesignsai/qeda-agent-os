/**
 * lib/studio/render/webm-muxer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal streaming WebM muxer for the Studio frame-by-frame export renderer.
 *
 * Produces a valid WebM file from raw VP8/VP9 EncodedVideoChunks (from the
 * WebCodecs VideoEncoder API). Audio is omitted from this muxer — the main
 * process hands the file to ffmpeg, which re-muxes with the original audio
 * track from the source recording.
 *
 * WHY A CUSTOM MUXER
 * ──────────────────
 * We cannot use MediaRecorder in offline/pull mode — it only captures
 * real-time `captureStream()` output and cannot be driven frame-by-frame.
 * The WebCodecs VideoEncoder produces compressed frames that need packaging
 * into a container. This file provides the minimal EBML structure required
 * for a valid VP8 or VP9 WebM stream that ffmpeg can reliably consume.
 *
 * EBML / WebM STRUCTURE
 * ─────────────────────
 *   EBML header
 *   Segment (unknown size)
 *     SeekHead  (minimal, pointing to Info and Tracks)
 *     Info      (TimestampScale = 1ms)
 *     Tracks    (one video track, VP8 or VP9)
 *     Cluster*  (one per second of content, each with absolute timestamps)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── EBML helpers ─────────────────────────────────────────────────────────────

function vint(value: number): Uint8Array {
  // Variable-length EBML integer encoding.
  if (value < 0x7f) {
    return new Uint8Array([value | 0x80]);
  } else if (value < 0x3fff) {
    return new Uint8Array([((value >> 8) & 0x3f) | 0x40, value & 0xff]);
  } else if (value < 0x1fffff) {
    return new Uint8Array([
      ((value >> 16) & 0x1f) | 0x20,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  } else if (value < 0x0fffffff) {
    return new Uint8Array([
      ((value >> 24) & 0x0f) | 0x10,
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }
  // Unknown size sentinel (0x01FFFFFFFFFFFFFF)
  return new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
}

function uint(value: number, bytes: number): Uint8Array {
  const arr = new Uint8Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) {
    arr[i] = value & 0xff;
    value >>>= 8;
  }
  return arr;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.byteLength;
  }
  return out;
}

/** Encode an EBML element: ID bytes + VINT size + content. */
function elem(id: Uint8Array, content: Uint8Array): Uint8Array {
  return concat(id, vint(content.byteLength), content);
}

// ── EBML Element IDs ──────────────────────────────────────────────────────────
const ID_EBML = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
const ID_DOC_TYPE = new Uint8Array([0x42, 0x82]);
const ID_DOC_TYPE_VERSION = new Uint8Array([0x42, 0x87]);
const ID_DOC_TYPE_READ_VERSION = new Uint8Array([0x42, 0x85]);
const ID_SEGMENT = new Uint8Array([0x18, 0x53, 0x80, 0x67]);
const ID_INFO = new Uint8Array([0x15, 0x49, 0xa9, 0x66]);
const ID_TIMESTAMP_SCALE = new Uint8Array([0x2a, 0xd7, 0xb1]);
const ID_MUXING_APP = new Uint8Array([0x4d, 0x80]);
const ID_WRITING_APP = new Uint8Array([0x57, 0x41]);
const ID_DURATION = new Uint8Array([0x44, 0x89]);
const ID_TRACKS = new Uint8Array([0x16, 0x54, 0xae, 0x6b]);
const ID_TRACK_ENTRY = new Uint8Array([0xae]);
const ID_TRACK_NUMBER = new Uint8Array([0xd7]);
const ID_TRACK_UID = new Uint8Array([0x73, 0xc5]);
const ID_TRACK_TYPE = new Uint8Array([0x83]);
const ID_CODEC_ID = new Uint8Array([0x86]);
const ID_VIDEO = new Uint8Array([0xe0]);
const ID_PIXEL_WIDTH = new Uint8Array([0xb0]);
const ID_PIXEL_HEIGHT = new Uint8Array([0xba]);
const ID_CLUSTER = new Uint8Array([0x1f, 0x43, 0xb6, 0x75]);
const ID_TIMESTAMP = new Uint8Array([0xe7]);
const ID_SIMPLE_BLOCK = new Uint8Array([0xa3]);

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function float64(value: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, false);
  return new Uint8Array(buf);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface WebMChunk {
  /** Raw bytes for this chunk. */
  data: Uint8Array;
  /** True if this is the very first chunk (EBML header + Tracks). */
  isFirst: boolean;
}

export interface WebMMuxerOptions {
  width: number;
  height: number;
  /** 'vp8' or 'vp9' — must match the VideoEncoder codec. */
  codec: 'vp8' | 'vp9';
  /** Frames per second — used to compute cluster boundaries and timestamps. */
  fps: number;
  /** Called with each chunk to stream to the main process. */
  onChunk: (chunk: WebMChunk) => void;
}

/**
 * Streaming WebM muxer. Call `addFrame()` for each encoded video chunk,
 * then `finalize()` when done.
 */
export class WebMMuxer {
  private readonly width: number;
  private readonly height: number;
  private readonly codec: 'vp8' | 'vp9';
  private readonly fps: number;
  private readonly onChunk: (chunk: WebMChunk) => void;

  private isFirst = true;
  /** Timestamp of the current open cluster (ms). */
  private clusterTimestampMs = -1;
  /** Frames buffered in the current cluster. */
  private clusterFrames: Uint8Array[] = [];
  /** Frames per cluster (one cluster ≈ 1 second). */
  private readonly framesPerCluster: number;

  constructor(options: WebMMuxerOptions) {
    this.width = options.width;
    this.height = options.height;
    this.codec = options.codec;
    this.fps = options.fps;
    this.onChunk = options.onChunk;
    this.framesPerCluster = Math.max(1, Math.round(options.fps));
  }

  private buildHeader(): Uint8Array {
    const ebmlHeader = elem(
      ID_EBML,
      concat(
        elem(ID_DOC_TYPE, textBytes('webm')),
        elem(ID_DOC_TYPE_VERSION, uint(4, 1)),
        elem(ID_DOC_TYPE_READ_VERSION, uint(2, 1)),
      ),
    );

    const codecIdStr = this.codec === 'vp9' ? 'V_VP9' : 'V_VP8';
    const videoElem = elem(
      ID_VIDEO,
      concat(
        elem(ID_PIXEL_WIDTH, uint(this.width, 4)),
        elem(ID_PIXEL_HEIGHT, uint(this.height, 4)),
      ),
    );
    const trackEntry = elem(
      ID_TRACK_ENTRY,
      concat(
        elem(ID_TRACK_NUMBER, uint(1, 1)),
        elem(ID_TRACK_UID, uint(1, 4)),
        elem(ID_TRACK_TYPE, uint(1, 1)), // 1 = video
        elem(ID_CODEC_ID, textBytes(codecIdStr)),
        videoElem,
      ),
    );
    const tracks = elem(ID_TRACKS, trackEntry);

    const info = elem(
      ID_INFO,
      concat(
        elem(ID_TIMESTAMP_SCALE, uint(1_000_000, 4)), // 1ms in nanoseconds
        elem(ID_MUXING_APP, textBytes('qeda-studio')),
        elem(ID_WRITING_APP, textBytes('qeda-studio')),
      ),
    );

    // Segment uses unknown-size sentinel so we don't need to know total length.
    const segmentOpen = concat(
      ID_SEGMENT,
      new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    );

    return concat(ebmlHeader, segmentOpen, info, tracks);
  }

  /** Encode a SimpleBlock for track 1 with the given timestamp offset (ms). */
  private buildSimpleBlock(
    frameData: Uint8Array,
    timestampOffsetMs: number,
    isKeyframe: boolean,
  ): Uint8Array {
    // SimpleBlock = track number VINT + 2-byte relative timestamp + flags + data
    const trackVint = vint(1);
    const tsBytes = new Uint8Array(2);
    const ts = Math.max(0, Math.min(0x7fff, Math.round(timestampOffsetMs)));
    tsBytes[0] = (ts >> 8) & 0xff;
    tsBytes[1] = ts & 0xff;
    const flags = isKeyframe ? 0x80 : 0x00;
    const header = concat(trackVint, tsBytes, new Uint8Array([flags]));
    const blockContent = concat(header, frameData);
    return elem(ID_SIMPLE_BLOCK, blockContent);
  }

  private flushCluster(): void {
    if (this.clusterFrames.length === 0 || this.clusterTimestampMs < 0) return;
    const tsElem = elem(
      ID_TIMESTAMP,
      uint(Math.round(this.clusterTimestampMs), 4),
    );
    const clusterContent = concat(tsElem, ...this.clusterFrames);
    const cluster = elem(ID_CLUSTER, clusterContent);

    this.onChunk({ data: cluster, isFirst: false });
    this.clusterFrames = [];
  }

  /** Add one encoded video frame. `timestampMs` is the absolute presentation time. */
  addFrame(
    frameData: Uint8Array,
    timestampMs: number,
    isKeyframe: boolean,
  ): void {
    const frameIndex = Math.round((timestampMs / 1000) * this.fps);
    const newCluster =
      this.clusterTimestampMs < 0 ||
      frameIndex % this.framesPerCluster === 0;

    if (newCluster) {
      this.flushCluster();
      this.clusterTimestampMs = timestampMs;

      if (this.isFirst) {
        this.isFirst = false;
        const header = this.buildHeader();
        // Emit header + first cluster open in one chunk
        const tsElem = elem(ID_TIMESTAMP, uint(Math.round(timestampMs), 4));
        const relTs = timestampMs - this.clusterTimestampMs;
        const block = this.buildSimpleBlock(frameData, relTs, isKeyframe);
        const clusterContent = concat(tsElem, block);
        const cluster = elem(ID_CLUSTER, clusterContent);
        this.onChunk({ data: concat(header, cluster), isFirst: true });
        return;
      }
    }

    const relTs = timestampMs - this.clusterTimestampMs;
    const block = this.buildSimpleBlock(frameData, relTs, isKeyframe);
    this.clusterFrames.push(block);
  }

  /** Flush any remaining frames and close the muxer. */
  finalize(): void {
    this.flushCluster();
  }
}
