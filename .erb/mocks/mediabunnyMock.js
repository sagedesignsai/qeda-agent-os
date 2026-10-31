/**
 * Jest mock for `mediabunny`.
 *
 * Encoding needs WebCodecs, which jsdom does not provide. The export runner is
 * still worth testing end to end at the control-flow level: this mock records
 * the frames added, forwards the finalize write through the real StreamTarget
 * writable, and lets a test force the "no codec" path.
 */

const calls = {
  probes: [],
  added: [],
  chunks: [],
  started: 0,
  finalized: 0,
  cancelled: 0,
  formats: [],
};

let nextCodec = 'avc';

class Mp4OutputFormat {
  constructor() {
    calls.formats.push('mp4');
  }
}

class WebMOutputFormat {
  constructor() {
    calls.formats.push('webm');
  }
}

class StreamTarget {
  constructor(writable, options) {
    this.writable = writable;
    this.options = options;
  }
}

class Output {
  constructor({ format, target }) {
    this.format = format;
    this.target = target;
  }

  addVideoTrack(source, options) {
    this.track = { source, options };
  }

  async start() {
    calls.started += 1;
  }

  async finalize() {
    calls.finalized += 1;
    // Prove the target really writes through the runner's transport.
    const writer = this.target.writable.getWriter();
    const data = new Uint8Array([1, 2, 3, 4]);
    await writer.write({ data, position: 0, type: 'key' });
    await writer.close();
  }

  async cancel() {
    calls.cancelled += 1;
  }
}

class CanvasSource {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
  }

  async add(timestamp, duration) {
    calls.added.push({ timestamp, duration, codec: this.config.codec });
  }
}

async function getFirstEncodableVideoCodec(codecs, options) {
  calls.probes.push({ codecs, options });
  return nextCodec;
}

module.exports = {
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  __calls: calls,
  __setCodec(codec) {
    nextCodec = codec;
  },
  __reset() {
    calls.probes.length = 0;
    calls.added.length = 0;
    calls.chunks.length = 0;
    calls.started = 0;
    calls.finalized = 0;
    calls.cancelled = 0;
    calls.formats.length = 0;
    nextCodec = 'avc';
  },
};
