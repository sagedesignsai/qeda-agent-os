/**
 * hooks/use-motion-local-library.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer side of the pre-installed 3D model library. Models are shipped with
 * the app and imported into projects via the standard staging pipeline — no
 * network required.
 */

import { useCallback, useEffect, useState } from 'react';

import type {
  MotionAssetCommit,
  MotionDocument,
  MotionImportError,
  MotionLocalModelEntry,
  MotionStagedAsset,
} from '@/main/ipc/channels';
import { motionStore } from '@/hooks/use-motion-store';

export function useMotionLocalLibrary(projectId: string) {
  const [models, setModels] = useState<MotionLocalModelEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<MotionImportError[]>([]);

  useEffect(() => {
    void window.electron.ipc.invoke<MotionLocalModelEntry[]>('motion:list-local-models').then(
      (result) => {
        setModels(result);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const filteredModels = models.filter((m) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return m.name.toLowerCase().includes(q) || m.source.toLowerCase().includes(q);
  });

  const importModel = useCallback(
    async (model: MotionLocalModelEntry): Promise<boolean> => {
      setImporting((current) => new Set(current).add(model.id));
      setImportErrors([]);
      let stagedItems: MotionStagedAsset[] = [];
      try {
        const staged = await window.electron.ipc.invoke<{
          items: MotionStagedAsset[];
          errors: MotionImportError[];
        }>('motion:import-local-model', { projectId, modelId: model.id });
        stagedItems = staged.items;
        if (staged.errors.length) {
          setImportErrors(staged.errors);
          return false;
        }
        if (!staged.items.length) return false;

        const commits: MotionAssetCommit[] = staged.items.flatMap((item) => {
          if (item.kind === 'unknown') return [];
          return [{ importId: item.importId, kind: item.kind }];
        });
        if (!commits.length) return false;

        const committed = await window.electron.ipc.invoke<{
          assets: MotionDocument['assets'];
          errors: MotionImportError[];
        }>('motion:commit-assets', { projectId, items: commits });

        const ops = committed.assets.map((asset) => ({ op: 'asset.add' as const, ...asset }));
        if (ops.length) {
          const result = motionStore.commit(`Import ${model.name} from local library`, ops);
          if (result.status === 'rejected' || result.status === 'pending') {
            throw result.error ?? new Error('The model could not be added to the document.');
          }
          setImported((current) => new Set(current).add(model.id));
        }
        if (committed.errors.length) setImportErrors(committed.errors);

        // Cleanup staging
        await window.electron.ipc
          .invoke<void>('motion:cancel-import', {
            projectId,
            importIds: stagedItems.map((item) => item.importId),
          })
          .catch(() => undefined);

        return committed.assets.length > 0;
      } catch (cause) {
        setImportErrors([
          { name: model.name, code: 'MOTION_IMPORT_UNREADABLE', message: String(cause) },
        ]);
        // Cleanup staging on error
        await window.electron.ipc
          .invoke<void>('motion:cancel-import', {
            projectId,
            importIds: stagedItems.map((item) => item.importId),
          })
          .catch(() => undefined);
        return false;
      } finally {
        setImporting((current) => {
          const next = new Set(current);
          next.delete(model.id);
          return next;
        });
      }
    },
    [projectId],
  );

  return {
    models: filteredModels,
    totalCount: models.length,
    query,
    setQuery,
    loading,
    importing,
    imported,
    importErrors,
    importModel,
    clearErrors: useCallback(() => setImportErrors([]), []),
  };
}
