/**
 * hooks/use-motion-assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinates main-owned staging/probing with renderer metadata probes, then
 * commits imported descriptors through the Motion op store as one undo entry.
 */

import { useCallback, useEffect, useState } from 'react';

import type { MotionAssetCommit, MotionDocument, MotionImportError, MotionStagedAsset } from '@/main/ipc/channels';
import { motionStore } from '@/hooks/use-motion-store';

type ImportResult = { items: MotionStagedAsset[]; errors: MotionImportError[] };

export function useMotionAssets(projectId: string) {
  const [isImporting, setIsImporting] = useState(false);
  const [errors, setErrors] = useState<MotionImportError[]>([]);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());

  const inspectAssets = useCallback(async () => {
    try {
      const result = await window.electron.ipc.invoke<Array<{ assetId: string; missing: boolean; hashMatches: boolean }>>('motion:inspect-assets', { projectId });
      setMissingIds(new Set(result.filter((item) => item.missing || !item.hashMatches).map((item) => item.assetId)));
    } catch {
      // A temporary inspection failure must not prevent opening the project.
    }
  }, [projectId]);

  useEffect(() => { void inspectAssets(); }, [inspectAssets]);

  const relinkAsset = useCallback(async (assetId: string) => {
    try {
      const result = await window.electron.ipc.invoke<{
        assetId: string; path: string; hash: string; byteSize: number; mimeType: string; matches: boolean;
      } | null>('motion:relink-asset', { projectId, assetId });
      if (!result) return;
      const { matches: _matches, ...relink } = result;
      const applied = motionStore.commit('Relink Motion asset', [{ op: 'asset.relink', ...relink }]);
      if (applied.status === 'rejected') throw applied.error ?? new Error('Relink could not be applied.');
      setMissingIds((current) => { const next = new Set(current); next.delete(assetId); return next; });
    } catch (error) {
      setErrors((current) => [...current, {
        name: assetId,
        code: 'MOTION_IMPORT_UNREADABLE',
        message: error instanceof Error ? error.message : String(error),
      }]);
    }
  }, [projectId]);

  const removeAsset = useCallback((assetId: string) => {
    const result = motionStore.commit('Remove Motion asset', [{ op: 'asset.remove', assetId }]);
    if (result.status === 'rejected') {
      setErrors((current) => [...current, { name: assetId, code: 'MOTION_IMPORT_UNREADABLE', message: result.error?.message ?? 'Asset removal failed.' }]);
    }
  }, []);

  const cleanUnusedFiles = useCallback(async () => {
    if (!window.confirm('Move asset files no longer referenced by this saved project to trash? They can be restored for 7 days.')) return;
    try {
      const result = await window.electron.ipc.invoke<{ directories: number; bytes: number }>('motion:clean-unused-assets', { projectId });
      setErrors((current) => [...current, {
        name: 'Cleanup', code: 'MOTION_IMPORT_UNREADABLE',
        message: result.directories ? `Moved ${result.directories} unused asset folder(s) (${formatBytes(result.bytes)}) to trash; they are retained for 7 days.` : 'No unused asset files found.',
      }]);
    } catch (error) {
      setErrors((current) => [...current, { name: 'Cleanup', code: 'MOTION_IMPORT_UNREADABLE', message: error instanceof Error ? error.message : String(error) }]);
    }
  }, [projectId]);

  const importAssets = useCallback(async () => {
    setIsImporting(true);
    setErrors([]);
    let stagedItems: MotionStagedAsset[] = [];
    try {
      const staged = await window.electron.ipc.invoke<ImportResult>('motion:pick-assets', { projectId });
      stagedItems = staged.items;
      const importErrors = [...staged.errors];
      const commits: MotionAssetCommit[] = [];
      const rejectedIds: string[] = [];
      for (const item of staged.items) {
        try {
          commits.push({ importId: item.importId, kind: item.kind as MotionAssetCommit['kind'], ...(await probeInRenderer(item)) });
        } catch (error) {
          rejectedIds.push(item.importId);
          importErrors.push({
            name: item.sourceName,
            code: 'MOTION_IMPORT_PROBE_FAILED',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (rejectedIds.length) {
        await window.electron.ipc.invoke<void>('motion:cancel-import', { projectId, importIds: rejectedIds });
      }
      if (!commits.length) {
        setErrors(importErrors);
        return;
      }
      const committed = await window.electron.ipc.invoke<{ assets: MotionDocument['assets']; errors: MotionImportError[] }>('motion:commit-assets', { projectId, items: commits });
      const ops = committed.assets.map((asset) => ({ op: 'asset.add' as const, ...asset }));
      if (ops.length) {
        const result = motionStore.commit('Import Motion assets', ops);
        if (result.status === 'rejected' || result.status === 'pending') {
          throw result.error ?? new Error('The imported assets could not be added to the document.');
        }
      }
      if (commits.length) {
        // Successfully committed ids have already left the staging allowlist;
        // cancellation only moves any per-item failures into the retention trash.
        await window.electron.ipc.invoke<void>('motion:cancel-import', { projectId, importIds: commits.map((commit) => commit.importId) });
      }
      setErrors([...importErrors, ...committed.errors]);
    } catch (error) {
      const unsaved = stagedItems.map((item) => item.importId);
      if (unsaved.length) {
        await window.electron.ipc.invoke<void>('motion:cancel-import', { projectId, importIds: unsaved }).catch(() => undefined);
      }
      setErrors([{ name: 'Import', code: 'MOTION_IMPORT_UNREADABLE', message: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setIsImporting(false);
    }
  }, [projectId]);

  return { isImporting, errors, missingIds, inspectAssets, relinkAsset, removeAsset, cleanUnusedFiles, importAssets, clearErrors: () => setErrors([]) };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function probeInRenderer(item: MotionStagedAsset): Promise<Partial<MotionAssetCommit>> {
  if (item.kind === 'image' || item.kind === 'image-sequence') {
    const response = await fetch(item.probeUrl);
    if (!response.ok) throw new Error(`Image could not be read for validation (${response.status}).`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      if (bitmap.width !== item.width || bitmap.height !== item.height) throw new Error('Image dimensions changed during staging.');
    } finally {
      bitmap.close();
    }
    return item.kind === 'image-sequence'
      ? { frameCount: item.frameCount, fps: item.fps ?? 30 }
      : { frameCount: 1 };
  }
  if (item.kind === 'video') {
    const metadata = await probeMediaElement(item.probeUrl, 'video');
    return { metadata };
  }
  if (item.kind === 'audio') {
    const metadata = await probeMediaElement(item.probeUrl, 'audio');
    return { metadata };
  }
  return {};
}

function probeMediaElement(url: string, kind: 'audio' | 'video'): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const media = kind === 'video' ? document.createElement('video') : document.createElement('audio');
    const timeout = window.setTimeout(() => finish(new Error('Media metadata probe timed out.')), 20_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      media.removeEventListener('loadedmetadata', onLoaded);
      media.removeEventListener('error', onError);
      media.removeAttribute('src');
      media.load();
    };
    const finish = (error?: Error) => {
      const result: Record<string, unknown> = { duration: media.duration };
      if (kind === 'video') {
        result.width = (media as HTMLVideoElement).videoWidth;
        result.height = (media as HTMLVideoElement).videoHeight;
      }
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };
    const onLoaded = () => {
      if (!Number.isFinite(media.duration) || media.duration <= 0) return finish(new Error('Media duration is invalid.'));
      if (kind === 'video' && (!(media as HTMLVideoElement).videoWidth || !(media as HTMLVideoElement).videoHeight)) return finish(new Error('Video dimensions are invalid.'));
      finish();
    };
    const onError = () => finish(new Error('The staged media could not be decoded by Chromium.'));
    media.preload = 'metadata';
    media.addEventListener('loadedmetadata', onLoaded, { once: true });
    media.addEventListener('error', onError, { once: true });
    media.src = url;
    media.load();
  });
}
