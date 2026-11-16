/**
 * ipc/handlers/workspace.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Notebooks, nested pages, and the block-editor save path.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { isBlockType } from '../../../lib/markdown-blocks.js';
import {
  createNotebook,
  createPage,
  deleteNotebook,
  deletePage,
  getPage,
  listBacklinks,
  listNotebooks,
  listOutgoingLinks,
  listPageTags,
  listPageVersions,
  listPages,
  listRecentPages,
  listTags,
  loadPageBlocks,
  loadPageMarkdown,
  movePageToNotebook,
  relatedPages,
  restoreVersion,
  savePageBlocks,
  searchPages,
  updateNotebook,
  updatePage,
} from '../../db/workspace';
import { type PageDetail } from '../channels';

export function registerWorkspaceHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  /**
   * Tell the renderer the knowledge tree changed shape or naming.
   *
   * Every surface that lists notebooks or pages — the rail, the breadcrumb, the
   * project dialog's notebook picker — refetches on this. Not broadcast for
   * `pages:save-blocks`: that fires on every autosave and page bodies are not
   * part of any tree.
   */
  const broadcastWorkspaceChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workspace:changed');
    }
  };

  // ── Workspace: notebooks ──────────────────────────────────────────────────

  ipcMain.handle('notebooks:list', () => listNotebooks());

  ipcMain.handle(
    'notebooks:create',
    (
      _e,
      {
        title,
        description,
        icon,
        projectId,
      }: {
        title: string;
        description?: string;
        icon?: string;
        projectId?: string | null;
      },
    ) => {
      const notebook = createNotebook(
        title,
        description,
        icon,
        projectId ?? null,
      );
      broadcastWorkspaceChanged();
      return notebook;
    },
  );

  ipcMain.handle(
    'notebooks:update',
    (
      _e,
      patch: {
        id: string;
        title?: string;
        description?: string;
        icon?: string;
        project_id?: string | null;
      },
    ) => {
      const { id, ...rest } = patch;
      updateNotebook(id, rest);
      broadcastWorkspaceChanged();
    },
  );

  ipcMain.handle('notebooks:delete', (_e, { id }: { id: string }) => {
    deleteNotebook(id);
    broadcastWorkspaceChanged();
  });

  // ── Workspace: pages ──────────────────────────────────────────────────────

  ipcMain.handle('pages:list', (_e, { notebookId }: { notebookId?: string }) =>
    listPages(notebookId),
  );

  ipcMain.handle('pages:recent', (_e, { limit }: { limit?: number }) =>
    listRecentPages(limit),
  );

  ipcMain.handle(
    'pages:get',
    (_e, { id }: { id: string }): PageDetail | null => {
      const page = getPage(id);
      if (!page) return null;
      return {
        page,
        blocks: loadPageBlocks(id),
        markdown: loadPageMarkdown(id),
        tags: listPageTags(id),
        backlinks: listBacklinks(id).map((p) => ({ id: p.id, title: p.title })),
        outgoing: listOutgoingLinks(id).map((p) => ({
          id: p.id,
          title: p.title,
        })),
        related: relatedPages(id).map((p) => ({ id: p.id, title: p.title })),
        versions: listPageVersions(id),
      };
    },
  );

  ipcMain.handle(
    'pages:create',
    (
      _e,
      {
        notebookId,
        title,
        parentPageId,
      }: { notebookId: string; title: string; parentPageId?: string | null },
    ) => {
      const page = createPage(notebookId, title, parentPageId ?? null);
      broadcastWorkspaceChanged();
      return page;
    },
  );

  ipcMain.handle(
    'pages:rename',
    (_e, { id, title }: { id: string; title: string }) => {
      updatePage(id, { title });
      broadcastWorkspaceChanged();
    },
  );

  ipcMain.handle(
    'pages:move',
    (
      _e,
      {
        id,
        parentPageId,
        notebookId,
      }: { id: string; parentPageId: string | null; notebookId?: string },
    ) => {
      // A move that names another notebook is a cross-notebook move: the whole
      // subtree has to change `notebook_id` (and re-inherit the new project),
      // not just gain a different parent. Re-parenting alone left the pages
      // claiming the old notebook, so the rail could not render them.
      if (notebookId) {
        movePageToNotebook(id, notebookId);
        if (parentPageId) updatePage(id, { parent_page: parentPageId });
      } else {
        updatePage(id, { parent_page: parentPageId });
      }
      broadcastWorkspaceChanged();
    },
  );

  ipcMain.handle('pages:delete', (_e, { id }: { id: string }) => {
    deletePage(id);
    broadcastWorkspaceChanged();
  });

  ipcMain.handle(
    'pages:save-blocks',
    (
      _e,
      { id, blocks, title }: { id: string; blocks: unknown[]; title?: string },
    ) => {
      // Blocks come from the renderer; validate the shape minimally before
      // they reach the store.
      const safeBlocks = (Array.isArray(blocks) ? blocks : []).map(
        (b, index) => {
          const block = b as {
            id?: string;
            type?: string;
            text?: string;
            checked?: boolean;
            language?: string;
          };
          return {
            id:
              typeof block.id === 'string' && block.id
                ? block.id
                : `imported-${index}`,
            type: isBlockType(block.type) ? block.type : ('paragraph' as const),
            text: typeof block.text === 'string' ? block.text : '',
            ...(block.type === 'todo'
              ? { checked: Boolean(block.checked) }
              : {}),
            ...(block.type === 'code' && block.language
              ? { language: block.language }
              : {}),
          };
        },
      );
      savePageBlocks(id, safeBlocks, {
        ...(title !== undefined ? { title } : {}),
        versionOrigin: 'manual',
      });
    },
  );

  ipcMain.handle(
    'pages:search',
    (_e, { query, limit }: { query: string; limit?: number }) =>
      searchPages(query, limit ?? 20),
  );

  ipcMain.handle(
    'pages:restore-version',
    (_e, { versionId }: { versionId: string }) => {
      return Boolean(restoreVersion(versionId));
    },
  );

  ipcMain.handle('workspace:tags', () => listTags());
}
