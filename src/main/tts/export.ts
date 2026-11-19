/**
 * main/tts/export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Save a generated clip wherever the user chooses.
 *
 * The renderer only supplies an asset id and an optional suggested filename;
 * the source path is resolved here from the database row. That keeps the
 * "no arbitrary filesystem paths from the renderer" rule intact even for
 * downloads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  TTS_FORMAT_EXTENSION,
  type TtsAsset,
  type TtsExportResult,
} from '../../lib/tts/types.js';
import { getTtsAsset } from './store.js';

const MAX_STEM = 80;

function sanitizeStem(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STEM);
}

function assetStem(asset: TtsAsset): string {
  const label = asset.label?.trim();
  if (label) {
    const safe = sanitizeStem(label);
    if (safe) return safe;
  }
  const snippet = sanitizeStem(asset.text.replace(/\s+/g, ' ').trim());
  if (snippet) return snippet.slice(0, 48);
  return `Speech ${asset.id.slice(0, 8)}`;
}

export function defaultTtsFilename(asset: TtsAsset): string {
  return `${assetStem(asset)}${TTS_FORMAT_EXTENSION[asset.format]}`;
}

export async function exportTtsAsset(
  id: string,
  destination: string,
): Promise<TtsExportResult> {
  const asset = getTtsAsset(id);
  if (!asset) return { saved: false, error: 'That speech clip no longer exists.' };

  const target = path.resolve(destination);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(asset.path, target);
    return { saved: true, path: target };
  } catch (error) {
    return {
      saved: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
