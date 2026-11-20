/**
 * hooks/use-persistent-assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically persist asset references to a storage key and restore on mount.
 *
 * Usage:
 *   const { references, addReference } = usePersistentAssets(
 *     'chat-123',
 *     'chat-123:assets'  // localStorage or IndexedDB key
 *   );
 *
 * The hook will:
 * - Load saved assets on mount
 * - Auto-save when references change
 * - Handle JSON serialization/deserialization
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
import type { ProjectFileSelection } from '@/lib/project-files';

interface PersistentAssetOptions {
  /** Custom storage getter/setter. Default: localStorage */
  storage?: Storage;
  /** Debounce saves by this many ms. Default: 1000 */
  saveDebounceMs?: number;
}

export function usePersistentAssets(
  contextId: string,
  storageKey: string,
  options: PersistentAssetOptions = {}
) {
  const { references, addReference } = useAssetReferenceContext(contextId);
  const storage = options.storage ?? globalThis.localStorage;
  const debounceMs = options.saveDebounceMs ?? 1000;

  // Load on mount
  useEffect(() => {
    try {
      const saved = storage.getItem(storageKey);
      if (saved) {
        const data: Array<{
          id: string;
          projectId: string;
          fileName: string;
          fileKind: string;
          path: string;
          mediaUrl?: string;
          metadata?: Record<string, unknown>;
        }> = JSON.parse(saved);
        for (const entry of data) {
          addReference({
            id: entry.id,
            projectId: entry.projectId,
            name: entry.fileName,
            kind: entry.fileKind as 'image' | 'video' | 'audio' | 'document' | 'text' | 'archive' | 'other',
            path: entry.path,
            mimeType: '',
            sizeBytes: null,
            mediaUrl: entry.mediaUrl ?? null,
            source: 'indexed' as const,
          });
        }
      }
    } catch (err) {
      console.error(`Failed to load persistent assets for ${contextId}:`, err);
    }
  }, [contextId, storageKey, storage, addReference]);

  // Auto-save on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const toSave = references.map((ref) => ({
          id: ref.id,
          projectId: ref.projectId,
          fileName: ref.fileName,
          fileKind: ref.fileKind,
          path: ref.path,
          mediaUrl: ref.mediaUrl,
          metadata: ref.metadata,
        }));
        storage.setItem(storageKey, JSON.stringify(toSave));
      } catch (err) {
        console.error(`Failed to save persistent assets for ${contextId}:`, err);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [references, contextId, storageKey, storage, debounceMs]);

  return {
    references,
    addReference: (selections: ProjectFileSelection | ProjectFileSelection[]) => {
      const context = useAssetReferenceContext(contextId);
      context.addReference(selections);
    },
    clear: () => {
      storage.removeItem(storageKey);
    },
  };
}

/**
 * Similar to usePersistentAssets but for IndexedDB storage (handles larger files).
 *
 * Usage:
 *   const { references } = useIndexedDBAssets('chat-123', 'assets:chat:123');
 */
export async function useIndexedDBAssets(
  contextId: string,
  dbKey: string
) {
  const { references, addReference } = useAssetReferenceContext(contextId);

  // Load on mount
  useEffect(() => {
    const loadFromIDB = async () => {
      try {
        const db = await openDB('qeda-assets', 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains('assets')) {
              db.createObjectStore('assets', { keyPath: 'key' });
            }
          },
        });
        const tx = db.transaction('assets', 'readonly');
        const store = tx.objectStore('assets');
        const request = store.get(dbKey);
        request.onsuccess = () => {
          const saved = request.result;
          if (saved) {
            const data = Array.isArray(saved) ? saved : [saved];
            for (const entry of data) {
              addReference({
                id: entry.id ?? '',
                projectId: entry.projectId,
                name: entry.fileName,
                kind: entry.fileKind as 'image' | 'video' | 'audio' | 'document' | 'text' | 'archive' | 'other',
                path: entry.path,
                mimeType: '',
                sizeBytes: null,
                mediaUrl: entry.mediaUrl ?? null,
                source: 'indexed' as const,
              });
            }
          }
        };
      } catch (err) {
        console.error(`Failed to load IndexedDB assets for ${contextId}:`, err);
      }
    };
    void loadFromIDB();
  }, [contextId, dbKey, addReference]);

  // Auto-save on change
  useEffect(() => {
    const saveToIDB = async () => {
      try {
        const db = await openDB('qeda-assets', 1);
        const toSave = references.map((ref) => ({
          key: dbKey,
          id: ref.id,
          projectId: ref.projectId,
          fileName: ref.fileName,
          fileKind: ref.fileKind,
          path: ref.path,
          mediaUrl: ref.mediaUrl,
          metadata: ref.metadata,
        }));
        const tx = db.transaction('assets', 'readwrite');
        const store = tx.objectStore('assets');
        store.put(toSave, dbKey);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.error(`Failed to save IndexedDB assets for ${contextId}:`, err);
      }
    };

    const timer = setTimeout(() => {
      void saveToIDB();
    }, 1000);

    return () => clearTimeout(timer);
  }, [references, contextId, dbKey]);

  return { references };
}

/**
 * Helper to open/upgrade an IndexedDB database.
 * (Simplified version; consider using idb library for production)
 */
async function openDB(
  name: string,
  version: number,
  { upgrade }: { upgrade?: (db: IDBDatabase) => void } = {}
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      upgrade?.(db);
    };
  });
}
