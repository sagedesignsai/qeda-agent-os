/**
 * lib/motion/export/presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Export presets as data. Main, the hidden render engine, and the editor dialog
 * all resolve through this module so a preset cannot mean two different things.
 *
 * The codec list is ordered by preference and the renderer takes the first one
 * its `VideoEncoder` supports. Size/fps of `'source'` come from the project's
 * `meta.output`; H.264 needs even dimensions, so source sizes are floored to the
 * nearest even pixel rather than failing an otherwise valid composition.
 */

import type { VideoCodec } from 'mediabunny';

import type { MotionOutputSettings } from '../types';

export type MotionExportContainer = 'mp4' | 'webm';
export type MotionExportPresetId =
  | 'launch-1080p'
  | 'launch-4k'
  | 'social-vertical'
  | 'social-square'
  | 'webm-vp9'
  | 'webm-av1';

export type MotionExportPreset = {
  id: MotionExportPresetId;
  label: string;
  container: MotionExportContainer;
  /** Preferred first; the engine probes until one encodes. */
  codecs: readonly VideoCodec[];
  width: number | 'source';
  height: number | 'source';
  fps: number | 'source';
  /** Target bitrate in bits per second. */
  bitrate: number;
};

export type MotionExportSettings = {
  presetId: MotionExportPresetId;
  container: MotionExportContainer;
  codecs: readonly VideoCodec[];
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  extension: '.mp4' | '.webm';
};

export class MotionExportPresetError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'MotionExportPresetError';
  }
}

export const MOTION_EXPORT_PRESETS: readonly MotionExportPreset[] = [
  { id: 'launch-1080p', label: 'Launch 1080p', container: 'mp4', codecs: ['avc'], width: 1920, height: 1080, fps: 30, bitrate: 12_000_000 },
  { id: 'launch-4k', label: 'Launch 4K', container: 'mp4', codecs: ['avc'], width: 3840, height: 2160, fps: 30, bitrate: 35_000_000 },
  { id: 'social-vertical', label: 'Social vertical', container: 'mp4', codecs: ['avc'], width: 1080, height: 1920, fps: 30, bitrate: 10_000_000 },
  { id: 'social-square', label: 'Social square', container: 'mp4', codecs: ['avc'], width: 1080, height: 1080, fps: 30, bitrate: 10_000_000 },
  { id: 'webm-vp9', label: 'WebM VP9', container: 'webm', codecs: ['vp9'], width: 'source', height: 'source', fps: 'source', bitrate: 8_000_000 },
  { id: 'webm-av1', label: 'WebM AV1 (slow)', container: 'webm', codecs: ['av1'], width: 'source', height: 'source', fps: 'source', bitrate: 6_000_000 },
];

export function getMotionExportPreset(presetId: string): MotionExportPreset {
  const preset = MOTION_EXPORT_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new MotionExportPresetError(`Unknown Motion export preset "${presetId}".`, 'MOTION_EXPORT_PRESET_UNKNOWN');
  }
  return preset;
}

/** H.264 encodes 4:2:0, so odd source dimensions would fail at the encoder. */
function evenDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 2 || value > 7680) {
    throw new MotionExportPresetError(`${label} must be a whole pixel count between 2 and 7680.`, 'MOTION_EXPORT_SIZE_INVALID');
  }
  return value - (value % 2);
}

export function resolveMotionExportSettings(
  presetId: string,
  output: MotionOutputSettings,
): MotionExportSettings {
  const preset = getMotionExportPreset(presetId);
  const width = preset.width === 'source' ? output.width : preset.width;
  const height = preset.height === 'source' ? output.height : preset.height;
  const fps = preset.fps === 'source' ? output.fps : preset.fps;
  if (![24, 30, 60].includes(fps)) {
    throw new MotionExportPresetError('Export frame rate must be 24, 30, or 60 fps.', 'MOTION_EXPORT_FPS_INVALID');
  }
  return {
    presetId: preset.id,
    container: preset.container,
    codecs: preset.codecs,
    width: evenDimension(width, 'Export width'),
    height: evenDimension(height, 'Export height'),
    fps,
    bitrate: preset.bitrate,
    extension: preset.container === 'webm' ? '.webm' : '.mp4',
  };
}

/** Rough size used for the disk-space preflight; encoders may undershoot. */
export function estimateMotionExportBytes(settings: Pick<MotionExportSettings, 'bitrate'>, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.ceil((settings.bitrate / 8) * duration);
}

export function motionExportFileName(projectName: string, settings: Pick<MotionExportSettings, 'extension'>): string {
  const slug = projectName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return `${slug || 'motion-export'}${settings.extension}`;
}
