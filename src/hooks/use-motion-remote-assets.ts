/**
 * hooks/use-motion-remote-assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer side of the Motion asset catalog. Search and download live in main;
 * this hook debounces queries, caches variant lists per result, and turns a
 * completed download into one undoable `asset.add` batch with provenance.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  MotionAssetCommit,
  MotionDocument,
  MotionImportError,
  MotionRemoteAssetHit,
  MotionRemoteAssetKind,
  MotionRemoteImportResult,
  MotionRemoteProgress,
  MotionRemoteVariant,
} from '@/main/ipc/channels';
import { motionStore } from '@/hooks/use-motion-store';

type ImportProgress = { receivedBytes: number; totalBytes?: number };

const PROVIDER = 'polyhaven' as const;

export function useMotionRemoteAssets(projectId: string) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<MotionRemoteAssetKind>('model');
  const [hits, setHits] = useState<MotionRemoteAssetHit[]>([]);
  const [total, setTotal] = useState(0);
  const [providerCredit, setProviderCredit] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [variants, setVariants] = useState<Record<string, MotionRemoteVariant[]>>({});
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<MotionImportError[]>([]);
  const [progress, setProgress] = useState<Record<string, ImportProgress>>({});
  const searchSequence = useRef(0);
  const activeRequestIds = useRef(new Set<string>());
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const sequence = ++searchSequence.current;
    const timer = setTimeout(() => {
      setIsSearching(true);
      void window.electron.ipc
        .invoke<{ hits: MotionRemoteAssetHit[]; total: number; providerCredit: string }>(
          'motion:search-remote-assets',
          { provider: PROVIDER, query, kind, limit: 24 },
        )
        .then((result) => {
          if (sequence !== searchSequence.current) return;
          setHits(result.hits);
          setTotal(result.total);
          setProviderCredit(result.providerCredit);
          setSearchError(null);
        })
        .catch((cause) => {
          if (sequence !== searchSequence.current) return;
          setHits([]);
          setTotal(0);
          setSearchError(message(cause));
        })
        .finally(() => {
          if (sequence === searchSequence.current) setIsSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      if (searchSequence.current === sequence) searchSequence.current += 1;
    };
  }, [query, kind, retryToken]);

  useEffect(() => {
    // Variant lists are provider- and kind-specific; a new query can reuse them.
    setVariants({});
    setVariantErrors({});
  }, [kind]);

  useEffect(() => window.electron.ipc.on('motion:remote-import-progress', (payload) => {
    const update = payload as MotionRemoteProgress;
    if (!update?.assetId) return;
    if (update.requestId && !activeRequestIds.current.has(update.requestId)) return;
    setProgress((current) => ({
      ...current,
      [update.assetId]: { receivedBytes: update.receivedBytes, ...(update.totalBytes ? { totalBytes: update.totalBytes } : {}) },
    }));
  }), []);

  useEffect(() => () => {
    for (const requestId of activeRequestIds.current) {
      void window.electron.ipc.invoke<void>('motion:cancel-remote-import', { requestId }).catch(() => undefined);
    }
  }, []);

  const loadVariants = useCallback(async (hit: MotionRemoteAssetHit): Promise<MotionRemoteVariant[]> => {
    const cached = variants[hit.id];
    if (cached) return cached;
    try {
      const result = await window.electron.ipc.invoke<{ variants: MotionRemoteVariant[] }>(
        'motion:remote-asset-variants',
        { provider: PROVIDER, assetId: hit.id, kind: hit.kind },
      );
      setVariants((current) => ({ ...current, [hit.id]: result.variants }));
      return result.variants;
    } catch (cause) {
      setVariantErrors((current) => ({ ...current, [hit.id]: message(cause) }));
      return [];
    }
  }, [variants]);

  const importAsset = useCallback(async (hit: MotionRemoteAssetHit, variantId: string): Promise<boolean> => {
    if (!projectId) return false;
    setImporting((current) => new Set(current).add(hit.id));
    setImportErrors([]);
    setProgress((current) => ({ ...current, [hit.id]: { receivedBytes: 0 } }));
    const requestId = crypto.randomUUID();
    activeRequestIds.current.add(requestId);
    let stagedItems: MotionRemoteImportResult['items'] = [];
    try {
      const staged = await window.electron.ipc.invoke<MotionRemoteImportResult>('motion:import-remote-assets', {
        projectId,
        provider: PROVIDER,
        assetId: hit.id,
        kind: hit.kind,
        variantId,
        requestId,
      });
      stagedItems = staged.items;
      if (staged.errors.length) setImportErrors(staged.errors);
      const commits: MotionAssetCommit[] = staged.items.flatMap((item) => {
        if (item.kind === 'unknown') return [];
        return [{
          importId: item.importId,
          kind: item.kind,
          ...(staged.provenance[item.importId] ? { metadata: { ...staged.provenance[item.importId] } } : {}),
        }];
      });
      if (!commits.length) return false;

      const committed = await window.electron.ipc.invoke<{ assets: MotionDocument['assets']; errors: MotionImportError[] }>(
        'motion:commit-assets',
        { projectId, items: commits },
      );
      const ops = committed.assets.map((asset) => ({ op: 'asset.add' as const, ...asset }));
      if (ops.length) {
        const result = motionStore.commit(`Import ${hit.name} from Poly Haven`, ops);
        if (result.status === 'rejected' || result.status === 'pending') {
          throw result.error ?? new Error('The imported asset could not be added to the document.');
        }
        setImported((current) => new Set(current).add(hit.id));
      }
      if (committed.errors.length) setImportErrors(committed.errors);
      return committed.assets.length > 0;
    } catch (cause) {
      setImportErrors([{ name: hit.name, code: 'MOTION_IMPORT_UNREADABLE', message: message(cause) }]);
      return false;
    } finally {
      // Committed ids have already left the staging allowlist; cancellation only
      // moves any per-item failures into retention trash.
      await window.electron.ipc
        .invoke<void>('motion:cancel-import', { projectId, importIds: stagedItems.map((item) => item.importId) })
        .catch(() => undefined);
      activeRequestIds.current.delete(requestId);
      setImporting((current) => {
        const next = new Set(current);
        next.delete(hit.id);
        return next;
      });
      setProgress((current) => {
        const next = { ...current };
        delete next[hit.id];
        return next;
      });
    }
  }, [projectId]);

  const clearErrors = useCallback(() => setImportErrors([]), []);
  const retrySearch = useCallback(() => setRetryToken((current) => current + 1), []);
  const cancelImports = useCallback(() => {
    for (const requestId of activeRequestIds.current) {
      void window.electron.ipc.invoke<void>('motion:cancel-remote-import', { requestId }).catch(() => undefined);
    }
  }, []);

  return {
    query,
    setQuery,
    kind,
    setKind,
    hits,
    total,
    providerCredit,
    isSearching,
    searchError,
    retrySearch,
    variants,
    variantErrors,
    importing,
    imported,
    importErrors,
    progress,
    loadVariants,
    importAsset,
    cancelImports,
    clearErrors,
  };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
