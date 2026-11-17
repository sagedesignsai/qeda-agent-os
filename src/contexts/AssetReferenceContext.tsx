/**
 * contexts/AssetReferenceContext.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global asset reference state management.
 *
 * Enables any surface to manage, import, and reference project files without
 * prop drilling. Multiple surfaces can maintain separate reference scopes by
 * context ID (e.g., "chat-123", "document-456", "task-789").
 *
 * Usage:
 *   <AssetReferenceProvider>
 *     <App />
 *   </AssetReferenceProvider>
 *
 *   // In any component:
 *   const context = useAssetReferenceContext('chat-123');
 *   context.addReference(files);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ProjectFileSelection } from '@/lib/project-files';

export interface AssetReference {
  id: string;
  contextId: string;
  projectId: string;
  fileName: string;
  fileKind: string;
  mediaUrl: string | null;
  path: string;
  importedAt: number;
  metadata?: Record<string, unknown>;
}

interface ContextState {
  references: Map<string, AssetReference>;
  addReference: (contextId: string, selections: ProjectFileSelection | ProjectFileSelection[]) => void;
  removeReference: (id: string) => void;
  clearContext: (contextId: string) => void;
  getContextReferences: (contextId: string) => AssetReference[];
  hasReference: (contextId: string, projectId: string, path: string) => boolean;
}

const AssetReferenceContext = createContext<ContextState | null>(null);

export function AssetReferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [allReferences, setAllReferences] = useState<Map<string, AssetReference>>(
    new Map()
  );

  const generateId = useCallback(() => {
    return `aref-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  const addReference = useCallback(
    (contextId: string, selections: ProjectFileSelection | ProjectFileSelection[]) => {
      const items = Array.isArray(selections) ? selections : [selections];
      setAllReferences((current) => {
        const next = new Map(current);
        for (const item of items) {
          const id = generateId();
          next.set(id, {
            id,
            contextId,
            projectId: item.projectId,
            fileName: item.name,
            fileKind: item.kind,
            mediaUrl: item.mediaUrl,
            path: item.path,
            importedAt: Date.now(),
          });
        }
        return next;
      });
    },
    [generateId]
  );

  const removeReference = useCallback((id: string) => {
    setAllReferences((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const clearContext = useCallback((contextId: string) => {
    setAllReferences((current) => {
      const next = new Map(current);
      for (const [id, ref] of next.entries()) {
        if (ref.contextId === contextId) {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  const getContextReferences = useCallback(
    (contextId: string): AssetReference[] => {
      return Array.from(allReferences.values()).filter(
        (ref) => ref.contextId === contextId
      );
    },
    [allReferences]
  );

  const hasReference = useCallback(
    (contextId: string, projectId: string, path: string): boolean => {
      for (const ref of allReferences.values()) {
        if (
          ref.contextId === contextId &&
          ref.projectId === projectId &&
          ref.path === path
        ) {
          return true;
        }
      }
      return false;
    },
    [allReferences]
  );

  const value: ContextState = useMemo(
    () => ({
      references: allReferences,
      addReference,
      removeReference,
      clearContext,
      getContextReferences,
      hasReference,
    }),
    [allReferences, addReference, removeReference, clearContext, getContextReferences, hasReference]
  );

  return (
    <AssetReferenceContext.Provider value={value}>
      {children}
    </AssetReferenceContext.Provider>
  );
}

export function useAssetReferenceContext(contextId: string) {
  const context = useContext(AssetReferenceContext);
  if (!context) {
    throw new Error(
      'useAssetReferenceContext must be used within <AssetReferenceProvider>'
    );
  }

  return useMemo(
    () => ({
      references: context.getContextReferences(contextId),
      addReference: (selections: ProjectFileSelection | ProjectFileSelection[]) =>
        context.addReference(contextId, selections),
      removeReference: context.removeReference,
      clearReferences: () => context.clearContext(contextId),
      hasReference: (projectId: string, path: string) =>
        context.hasReference(contextId, projectId, path),
    }),
    [context, contextId]
  );
}
