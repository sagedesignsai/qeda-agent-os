/**
 * lib/trace/export/presets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Export presets for Trace compositions.
 *
 * Trace projects already carry their own canvas (width/height/fps), so a preset
 * only chooses the container, codec ladder, and bitrate; dimensions and frame
 * rate are resolved from the project. H.264 requires even pixel dimensions, so
 * odd canvases are floored — the visual difference is at most one pixel.
 *
 * Pure data so the editor, the render host and tests share one definition.
 */

export type TraceExportContainer = 'mp4' | 'webm';

export interface TraceExportSettings {
  presetId: string;
  container: TraceExportContainer;
  /** Video codecs in preference order, probed at render time. */
  codecs: readonly string[];
  /** Audio codecs in preference order for the narration track. */
  audioCodecs: readonly string[];
  bitrate: number;
  extension: string;
  width: number;
  height: number;
  fps: number;
}

export interface TraceExportPreset {
  id: string;
  label: string;
  container: TraceExportContainer;
  codecs: readonly string[];
  audioCodecs: readonly string[];
  bitrate: number;
}

const PRESETS: Record<string, TraceExportPreset> = {
  'mp4-avc': {
    id: 'mp4-avc',
    label: 'MP4 · H.264',
    container: 'mp4',
    codecs: ['avc'],
    audioCodecs: ['aac'],
    bitrate: 12_000_000,
  },
  'webm-vp9': {
    id: 'webm-vp9',
    label: 'WebM · VP9',
    container: 'webm',
    codecs: ['vp9'],
    audioCodecs: ['opus'],
    bitrate: 8_000_000,
  },
  'webm-av1': {
    id: 'webm-av1',
    label: 'WebM · AV1',
    container: 'webm',
    codecs: ['av1'],
    audioCodecs: ['opus'],
    bitrate: 6_000_000,
  },
};

export const DEFAULT_TRACE_EXPORT_PRESET_ID = 'mp4-avc';

export function listTraceExportPresets(): TraceExportPreset[] {
  return Object.values(PRESETS);
}

export function getTraceExportPreset(presetId: string | undefined): TraceExportPreset {
  return PRESETS[presetId ?? ''] ?? PRESETS[DEFAULT_TRACE_EXPORT_PRESET_ID];
}

function floorEven(value: number): number {
  const safe = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  return Math.max(0, safe - (safe % 2));
}

function clampFps(value: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(120, Math.max(1, safe || 30));
}

export function resolveTraceExportSettings(
  presetId: string | undefined,
  project: { width: number; height: number; fps: number },
): TraceExportSettings {
  const preset = getTraceExportPreset(presetId);
  const evenRequired = preset.container === 'mp4';
  return {
    presetId: preset.id,
    container: preset.container,
    codecs: preset.codecs,
    audioCodecs: preset.audioCodecs,
    bitrate: preset.bitrate,
    extension: preset.container === 'webm' ? '.webm' : '.mp4',
    width: evenRequired ? floorEven(project.width) : Math.max(1, Math.round(project.width)),
    height: evenRequired ? floorEven(project.height) : Math.max(1, Math.round(project.height)),
    fps: clampFps(project.fps),
  };
}

/** Filesystem-safe default name for an export. */
export function traceExportFileName(
  projectName: string,
  options: { extension: string },
): string {
  const base = projectName.trim().replace(/[^\w\- ]+/g, ' ').trim() || 'trace-composition';
  return `${base}${options.extension}`;
}