/**
 * lib/studio/audio/mixer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time audio mixer for Studio timeline preview playback.
 *
 * Decodes audio assets into AudioBuffers, then mixes the active clips at the
 * current playhead position into a single output bus.  Supports:
 *   - Multiple audio tracks with independent mute/volume
 *   - Per-clip volume overrides
 *   - Audio-only assets and audio extracted from video elements
 *   - Scrubbing (cross-seeks on playhead jumps)
 *
 * The mixer runs on the shared AudioContext from lib/audio/context.ts and
 * connects to the context destination so audio plays through speakers during
 * preview.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getAudioContext } from '@/lib/audio/context';
import type { TimelineClip, TimelineTrack } from '@/lib/studio/types';
import type { EvaluatedTimelineClip } from '@/lib/studio/timeline/evaluate';

/** Cached decoded audio buffer for a timeline clip. */
interface AudioClipCache {
  buffer: AudioBuffer;
  sampleRate: number;
}

/**
 * Load an audio source URL into an AudioBuffer.
 * Works for audio-only files and for extracting audio from video files.
 */
export async function decodeAudioSource(
  url: string,
  sampleRate: number = 48000,
): Promise<AudioBuffer | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    // Resample to the target sample rate if needed
    if (audioBuffer.sampleRate !== sampleRate) {
      return resampleAudioBuffer(audioBuffer, sampleRate);
    }
    return audioBuffer;
  } catch {
    return null;
  }
}

/** Resample an AudioBuffer to a different sample rate. */
function resampleAudioBuffer(
  source: AudioBuffer,
  targetRate: number,
): AudioBuffer {
  const ctx = getAudioContext();
  if (!ctx) return source;

  const offlineCtx = new OfflineAudioContext(
    source.numberOfChannels,
    Math.ceil(source.duration * targetRate),
    targetRate,
  );
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = source;
  sourceNode.connect(offlineCtx.destination);
  sourceNode.start(0);

  return offlineCtx.startRendering() as unknown as AudioBuffer;
}

/**
 * Compute waveform peaks (RMS amplitude 0-1) from an AudioBuffer.
 * Returns a Float32Array with one peak per bucket across the buffer duration.
 * The number of peaks is capped to keep memory bounded for long clips.
 */
export function computeWaveformPeaks(
  audioBuffer: AudioBuffer,
  peaksPerSecond: number = 80,
  maxPeaks: number = 8000,
): Float32Array {
  const durationSec = audioBuffer.duration;
  if (durationSec <= 0) return new Float32Array(0);

  const totalPeaks = Math.max(
    1,
    Math.min(Math.ceil(durationSec * peaksPerSecond), maxPeaks),
  );
  const peaks = new Float32Array(totalPeaks);

  // Use the first channel for waveform visualization
  const channelData = audioBuffer.getChannelData(0);
  const samplesPerPeak = Math.floor(channelData.length / totalPeaks);

  for (let i = 0; i < totalPeaks; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += channelData[j] * channelData[j];
    }
    // RMS amplitude, boosted for visual legibility
    const rms = Math.sqrt(sum / (end - start));
    peaks[i] = Math.min(1, rms * 2.5);
  }

  return peaks;
}

/**
 * Mix audio samples from multiple evaluated clips at a given time position.
 * Returns an interleaved Float32Array of mixed samples.
 */
export function mixAudioSamples(
  audioClips: EvaluatedTimelineClip[],
  tracks: readonly TimelineTrack[],
  sampleRate: number,
  framesCount: number,
): Float32Array | null {
  if (audioClips.length === 0) return null;

  const ctx = getAudioContext();
  if (!ctx) return null;

  // Build track lookup for mute/volume
  const trackMap = new Map<string, TimelineTrack>();
  for (const track of tracks) {
    trackMap.set(track.id, track);
  }

  // Determine channel count from the first available clip
  let channelCount = 1;
  for (const clip of audioClips) {
    if (clip.clip.payload?.audioBuffer) {
      channelCount = Math.max(channelCount, clip.clip.payload.audioBuffer.numberOfChannels);
      break;
    }
  }

  const output = new Float32Array(framesCount * channelCount);

  for (const evaluated of audioClips) {
    const track = trackMap.get(evaluated.track.id);
    if (track?.muted) continue;

    const buffer = evaluated.clip.payload?.audioBuffer;
    if (!buffer) continue;

    // Per-clip volume (default 1.0)
    const clipVolume = evaluated.clip.payload?.volume ?? 1.0;
    // Per-track volume from track metadata
    const trackVolume = (track as any)?.volume ?? 1.0;
    const volume = clipVolume * trackVolume;

    if (volume <= 0) continue;

    // Calculate source offset in samples
    const sourceOffset = Math.floor((evaluated.sourceTimeMs / 1000) * buffer.sampleRate);
    const availableFrames = buffer.length - sourceOffset;
    const framesToCopy = Math.min(framesCount, availableFrames);

    if (framesToCopy <= 0) continue;

    // Mix samples
    for (let ch = 0; ch < Math.min(channelCount, buffer.numberOfChannels); ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < framesToCopy; i++) {
        const srcIdx = sourceOffset + i;
        const dstIdx = i * channelCount + ch;
        output[dstIdx] += channelData[Math.min(srcIdx, channelData.length - 1)] * volume;
      }
    }
  }

  return output;
}

/**
 * Studio audio mixer for preview playback.
 * Manages AudioBufferSourceNodes for smooth continuous playback.
 */
export class StudioAudioMixer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private currentOffset = 0; // Current playback offset in seconds
  private currentClipId = '';
  private playbackRate = 1;
  private scheduledStart = 0; // Context time when current playback started

  /** Cache of decoded audio buffers keyed by clip ID */
  private bufferCache = new Map<string, AudioBuffer>();

  /** Callback when playback ends */
  private onEnded?: () => void;

  constructor() {
    this.ctx = getAudioContext();
    if (this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
    }
  }

  /**
   * Play or continue audio at the given position.
   * If the playhead jumped (scrub), stop the current source and start fresh.
   */
  playAt(
    timeMs: number,
    activeClips: EvaluatedTimelineClip[],
    tracks: readonly TimelineTrack[],
    playbackRate: number = 1,
  ) {
    if (!this.ctx || !this.masterGain) return;
    if (activeClips.length === 0) return;

    this.playbackRate = playbackRate;

    // Find the active audio clip at this time
    let activeClip: EvaluatedTimelineClip | null = null;
    for (const clip of activeClips) {
      const track = tracks.find((t) => t.id === clip.track.id);
      if (track?.muted) continue;
      activeClip = clip;
      break;
    }

    if (!activeClip) return;

    const clipId = activeClip.clip.id;
    const buffer = activeClip.clip.payload?.audioBuffer;
    if (!buffer) return;

    // Cache the buffer
    this.bufferCache.set(clipId, buffer);

    // Check if we need to restart (different clip or big jump)
    const offsetSec = activeClip.localTimeMs / 1000;
    const isJump =
      clipId !== this.currentClipId ||
      Math.abs(offsetSec - this.currentOffset) > 0.1;

    if (isJump) {
      this.stopCurrentSource();
      this.startSource(buffer, offsetSec, clipId);
    }

    this.currentOffset = offsetSec;
    this.currentClipId = clipId;
  }

  /** Stop all audio playback. */
  stop() {
    this.stopCurrentSource();
    this.currentClipId = '';
    this.currentOffset = 0;
  }

  /** Set the master output volume (0-1). */
  setVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /** Clean up resources. */
  dispose() {
    this.stop();
    this.bufferCache.clear();
    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }
    this.ctx = null;
  }

  private stopCurrentSource() {
    try {
      this.currentSource?.stop();
    } catch {
      // Already stopped
    }
    this.currentSource?.disconnect();
    this.currentSource = null;
  }

  private startSource(buffer: AudioBuffer, offset: number, clipId: string) {
    if (!this.ctx || !this.masterGain) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(this.masterGain);

    const ctxTime = this.ctx.currentTime;
    source.start(ctxTime, offset);
    this.scheduledStart = ctxTime;
    this.currentSource = source;
    this.currentBuffer = buffer;
    this.currentClipId = clipId;

    source.onended = () => {
      if (this.currentSource === source) {
        this.currentClipId = '';
        this.onEnded?.();
      }
    };
  }
}

