/**
 * main/motion/asset-probe.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cheap, main-process header probes for Motion imports. Full video/audio probing
 * stays in the renderer, and model thumbnails/validation are deferred to Phase 2.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { imageSizeFromFile } from 'image-size/fromFile';

import type { MotionAssetKind } from '../../lib/motion/types';

export type MotionAssetProbe = {
  kind: MotionAssetKind;
  mimeType: string;
  width?: number;
  height?: number;
  warnings: string[];
};

export type MotionAssetFileKind = MotionAssetKind | 'unknown';

export const MOTION_IMPORT_TYPES: Record<string, { kind: MotionAssetKind; mimeType: string }> = {
  '.png': { kind: 'image', mimeType: 'image/png' },
  '.jpg': { kind: 'image', mimeType: 'image/jpeg' },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg' },
  '.webp': { kind: 'image', mimeType: 'image/webp' },
  '.gif': { kind: 'image', mimeType: 'image/gif' },
  '.avif': { kind: 'image', mimeType: 'image/avif' },
  '.mp4': { kind: 'video', mimeType: 'video/mp4' },
  '.mov': { kind: 'video', mimeType: 'video/quicktime' },
  '.webm': { kind: 'video', mimeType: 'video/webm' },
  '.mkv': { kind: 'video', mimeType: 'video/x-matroska' },
  '.mp3': { kind: 'audio', mimeType: 'audio/mpeg' },
  '.wav': { kind: 'audio', mimeType: 'audio/wav' },
  '.m4a': { kind: 'audio', mimeType: 'audio/mp4' },
  '.ogg': { kind: 'audio', mimeType: 'audio/ogg' },
  '.woff': { kind: 'font', mimeType: 'font/woff' },
  '.woff2': { kind: 'font', mimeType: 'font/woff2' },
  '.ttf': { kind: 'font', mimeType: 'font/ttf' },
  '.otf': { kind: 'font', mimeType: 'font/otf' },
  '.glb': { kind: 'model', mimeType: 'model/gltf-binary' },
  '.gltf': { kind: 'model', mimeType: 'model/gltf+json' },
  '.hdr': { kind: 'environment', mimeType: 'image/vnd.radiance' },
  '.exr': { kind: 'environment', mimeType: 'image/x-exr' },
};

export function classifyMotionAsset(filePath: string): { kind: MotionAssetKind; mimeType: string } | null {
  return MOTION_IMPORT_TYPES[path.extname(filePath).toLowerCase()] ?? null;
}

export async function probeMotionAsset(filePath: string): Promise<MotionAssetProbe> {
  const type = classifyMotionAsset(filePath);
  if (!type) throw new Error(`Unsupported Motion asset type: ${path.extname(filePath) || '(no extension)'}`);
  const warnings: string[] = [];
  if (type.kind === 'image') {
    let dimensions: { width: number; height: number };
    try {
      dimensions = await imageSizeFromFile(filePath);
    } catch (error) {
      throw new Error(`Image header could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1) {
      throw new Error('Image dimensions are invalid.');
    }
    if (dimensions.width > 16_384 || dimensions.height > 16_384) {
      throw new Error('Image dimensions exceed the 16384 px import limit.');
    }
    if (dimensions.width > 8192 || dimensions.height > 8192) warnings.push('Preview will be downscaled; the original will be preserved for export.');
    return { ...type, ...dimensions, warnings };
  }
  if (type.kind === 'model') {
    if (path.extname(filePath).toLowerCase() === '.glb') {
      const header = Buffer.alloc(12);
      const handle = await fs.open(filePath, 'r');
      try {
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (bytesRead < header.length || header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2) {
          throw new Error('GLB header is invalid or uses an unsupported container version.');
        }
      } finally {
        await handle.close();
      }
    } else {
      try {
        const json = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
          asset?: { version?: string };
          buffers?: Array<{ uri?: string }>;
          images?: Array<{ uri?: string }>;
        };
        if (!json.asset?.version?.startsWith('2.')) throw new Error('glTF must declare asset.version 2.x.');
        const externalUris = [...(json.buffers ?? []), ...(json.images ?? [])]
          .map((item) => item.uri)
          .filter((uri): uri is string => !!uri && !uri.startsWith('data:'));
        if (externalUris.some((uri) => /^[a-z][a-z\d+.-]*:/i.test(uri) || uri.startsWith('/') || uri.includes('\\') || uri.split('/').includes('..'))) {
          throw new Error('glTF references a remote or out-of-folder resource. Only relative sidecars inside the source folder are allowed.');
        }
        if (externalUris.length) warnings.push('Relative glTF sidecars were copied into this project bundle.');
      } catch (error) {
        throw new Error(`glTF JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { ...type, warnings };
  }
  if (type.kind === 'font') {
    const handle = await fs.open(filePath, 'r');
    try {
      const signature = Buffer.alloc(4);
      const { bytesRead } = await handle.read(signature, 0, 4, 0);
      const tag = signature.toString('ascii', 0, bytesRead);
      if (bytesRead < 4 || !['wOF2', 'wOFF', 'OTTO', 'true', 'typ1'].includes(tag) && signature.readUInt32BE(0) !== 0x00010000) {
        throw new Error('Font header is not a supported sfnt/WOFF file.');
      }
    } finally {
      await handle.close();
    }
  }
  if (type.kind === 'environment') {
    const handle = await fs.open(filePath, 'r');
    const header = Buffer.alloc(16 * 1024);
    let bytesRead = 0;
    try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); }
    finally { await handle.close(); }
    if (path.extname(filePath).toLowerCase() === '.hdr') {
      const text = header.toString('ascii', 0, bytesRead);
      const resolution = /(?:^|\n)[+-]Y\s+(\d+)\s+[+-]X\s+(\d+)/.exec(text);
      if (!/^#\?(?:RADIANCE|RGBE)(?:\r?\n)/.test(text) || !/FORMAT=32-bit_rle_rgbe/.test(text) || !resolution) {
        throw new Error('Radiance HDR header is invalid or unsupported.');
      }
      const height = Number(resolution[1]);
      const width = Number(resolution[2]);
      if (!width || !height || width > 32768 || height > 32768) throw new Error('HDR dimensions are invalid or exceed 32768 px.');
      return { ...type, width, height, warnings };
    }
    if (bytesRead < 4 || header.readUInt32LE(0) !== 0x01312f76) throw new Error('OpenEXR header is invalid.');
  }
  return { ...type, warnings };
}
