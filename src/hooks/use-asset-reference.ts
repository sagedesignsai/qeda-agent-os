/**
 * hooks/use-asset-reference.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A unified hook for any surface to reference/import project assets.
 *
 * Usage:
 *   const { addReference, removeReference, references } = useAssetReference('chat-session-123');
 *   // Call addReference when user picks files from ProjectFileBrowserDialog
 *   // Call removeReference to clean up
 *
 * This hook:
 * - Stores asset references keyed by context (chat session, document, task, etc.)
 * - Tracks what was imported/referenced and from where
 * - Provides callbacks for selection handlers
 * - Integrates with the project file catalog
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectFileSelection } from '@/lib/project-files';

export interface AssetReference {
  id: string;
  referenceId: string; // Unique ID for this reference
  projectId: string;
  fileName: string;
  fileKind: string;
  mediaUrl: string | null;
  path: string;
  importedAt: number;
  metadata?: Record<string, unknown>;
}

export interface UseAssetReferenceOptions {
  /** Optional project to scope references to */
  projectId?: string | null;
  /** Custom metadata to attach to references */
  metadata?: Record<string, unknown>;
}

export function useAssetReference(
  contextId: string,
  options: UseAssetReferenceOptions = {}
) {
  const [references, setReferences] = useState<Map<string, AssetReference>>(
    new Map()
  );
  const [error, setError] = useState<string | null>(null);

  // Generate unique reference ID
  const generateRefId = useCallback(() => {
    return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  /**
   * Add one or more file selections as references.
   * Called from ProjectFileBrowserDialog.onSelect callback.
   */
  const addReference = useCallback(
    (selections: ProjectFileSelection | ProjectFileSelection[]) => {
      setError(null);
      try {
        const items = Array.isArray(selections) ? selections : [selections];
        setReferences((current) => {
          const next = new Map(current);
          for (const item of items) {
            const refId = generateRefId();
            next.set(refId, {
              id: refId,
              referenceId: refId,
              projectId: item.projectId,
              fileName: item.name,
              fileKind: item.kind,
              mediaUrl: item.mediaUrl,
              path: item.path,
              importedAt: Date.now(),
              metadata: options.metadata,
            });
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [generateRefId, options.metadata]
  );

  /**
   * Remove a reference by its ID.
   */
  const removeReference = useCallback((referenceId: string) => {
    setReferences((current) => {
      const next = new Map(current);
      next.delete(referenceId);
      return next;
    });
  }, []);

  /**
   * Clear all references for this context.
   */
  const clearReferences = useCallback(() => {
    setReferences(new Map());
  }, []);

  /**
   * Get all references as an array for iteration.
   */
  const referenceArray = useMemo(() => {
    return Array.from(references.values());
  }, [references]);

  /**
   * Check if a file is already referenced.
   */
  const hasReference = useCallback(
    (projectId: string, filePath: string) => {
      return referenceArray.some(
        (ref) => ref.projectId === projectId && ref.path === filePath
      );
    },
    [referenceArray]
  );

  /**
   * Export references as JSON for persistence (e.g., in chat context).
   */
  const exportReferences = useCallback(() => {
    return referenceArray.map((ref) => ({
      id: ref.referenceId,
      projectId: ref.projectId,
      fileName: ref.fileName,
      fileKind: ref.fileKind,
      path: ref.path,
      mediaUrl: ref.mediaUrl,
      metadata: ref.metadata,
    }));
  }, [referenceArray]);

  /**
   * Restore references from persisted JSON.
   */
  const importReferences = useCallback(
    (data: ReturnType<typeof exportReferences>) => {
      setReferences(new Map());
      const next = new Map<string, AssetReference>();
      for (const item of data) {
        const refId = item.id || generateRefId();
        next.set(refId, {
          id: refId,
          referenceId: refId,
          projectId: item.projectId,
          fileName: item.fileName,
          fileKind: item.fileKind,
          mediaUrl: item.mediaUrl,
          path: item.path,
          importedAt: Date.now(),
          metadata: item.metadata,
        });
      }
      setReferences(next);
    },
    [generateRefId]
  );

  return {
    references: referenceArray,
    referenceMap: references,
    addReference,
    removeReference,
    clearReferences,
    hasReference,
    exportReferences,
    importReferences,
    error,
    count: references.size,
  };
}
