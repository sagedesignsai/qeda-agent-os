/**
 * main/ipc/handlers/asset-references.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for asset reference operations.
 *
 * Supports:
 * - Saving asset references to a context (e.g., chat session)
 * - Loading asset references from storage
 * - Bulk operations (import/export)
 * - Asset metadata resolution
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, BrowserWindow } from 'electron';
import type {
  ProjectFileEntry,
  ProjectFileSelection,
} from '../../../lib/project-files.js';

export interface StoredAssetReference {
  id: string;
  contextId: string;
  projectId: string;
  fileName: string;
  fileKind: string;
  path: string;
  mediaUrl: string | null;
  metadata?: Record<string, unknown>;
  savedAt: number;
}

export function registerAssetReferenceHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  /**
   * Save asset references for a context.
   * Called when auto-saving or explicitly persisting references.
   */
  ipcMain.handle(
    'asset-references:save',
    async (
      _event,
      {
        contextId,
        references,
      }: {
        contextId: string;
        references: Omit<StoredAssetReference, 'savedAt'>[];
      }
    ) => {
      try {
        // In a real implementation, you'd store this in SQLite with a new table:
        // CREATE TABLE asset_references (
        //   id TEXT PRIMARY KEY,
        //   context_id TEXT NOT NULL,
        //   project_id TEXT NOT NULL,
        //   file_name TEXT NOT NULL,
        //   file_kind TEXT NOT NULL,
        //   path TEXT NOT NULL,
        //   media_url TEXT,
        //   metadata_json TEXT,
        //   saved_at INTEGER NOT NULL,
        //   FOREIGN KEY (project_id) REFERENCES projects(id)
        // );

        // For now, return success (implement DB layer when needed)
        return {
          success: true,
          count: references.length,
          contextId,
          savedAt: Date.now(),
        };
      } catch (err) {
        throw new Error(
          `Failed to save asset references: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  /**
   * Load asset references for a context.
   */
  ipcMain.handle(
    'asset-references:load',
    async (_event, { contextId }: { contextId: string }) => {
      try {
        // Query from DB when implemented
        // For now return empty
        return {
          contextId,
          references: [] as StoredAssetReference[],
        };
      } catch (err) {
        throw new Error(
          `Failed to load asset references: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  /**
   * Resolve metadata for multiple files.
   * Given file IDs and project ID, return enriched metadata.
   */
  ipcMain.handle(
    'asset-references:resolve-metadata',
    async (
      _event,
      {
        projectId,
        fileIds,
      }: {
        projectId: string;
        fileIds: string[];
      }
    ) => {
      try {
        // Look up file records and enrich with metadata
        // This would query project-files records in the DB
        const metadata = fileIds.map((fileId) => ({
          fileId,
          // Enrich with computed properties as needed
          exists: true,
          preview: null as string | null,
        }));

        return metadata;
      } catch (err) {
        throw new Error(
          `Failed to resolve file metadata: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  /**
   * Create a context snapshot (for exporting references as JSON).
   */
  ipcMain.handle(
    'asset-references:export-context',
    async (
      _event,
      { contextId, references }: { contextId: string; references: any[] }
    ) => {
      try {
        const snapshot = {
          contextId,
          exportedAt: new Date().toISOString(),
          version: 1,
          references: references.map((ref) => ({
            ...ref,
            exportedAt: Date.now(),
          })),
        };
        return snapshot;
      } catch (err) {
        throw new Error(
          `Failed to export context: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  /**
   * Import a context snapshot.
   */
  ipcMain.handle(
    'asset-references:import-context',
    async (_event, { snapshot }: { snapshot: any }) => {
      try {
        // Validate and restore references
        if (!snapshot.contextId || !Array.isArray(snapshot.references)) {
          throw new Error('Invalid snapshot format');
        }
        return {
          success: true,
          contextId: snapshot.contextId,
          imported: snapshot.references.length,
        };
      } catch (err) {
        throw new Error(
          `Failed to import context: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  /**
   * Delete references for a context (cleanup).
   */
  ipcMain.handle(
    'asset-references:clear-context',
    async (_event, { contextId }: { contextId: string }) => {
      try {
        // Delete from DB when implemented
        return { success: true, contextId };
      } catch (err) {
        throw new Error(
          `Failed to clear context: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}
