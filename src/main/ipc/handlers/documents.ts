/**
 * ipc/handlers/documents.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handler module for PDF Document Studio.
 *
 * Handles:
 *   - CRUD operations on documents stored in SQLite
 *   - Native PDF and JSON file export via system dialogs
 *   - AI Copilot block generation via configured LLM
 *   - Broadcasting 'documents:changed' invalidation events
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  listDocuments,
  getDocument,
  saveDocument,
  deleteDocument,
  type PdfDocumentRecord,
  type PdfDocumentSummary,
} from '../../db/documents.js';
import { getSettings } from '../../ai/settings.js';
import { resolveModel } from '../../ai/provider.js';

export function registerDocumentsHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcastChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('documents:changed');
    }
  };

  // ── List & Get ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'documents:list',
    (_e, req?: { projectId?: string | null }): PdfDocumentSummary[] => {
      return listDocuments(req?.projectId ?? null);
    },
  );

  ipcMain.handle(
    'documents:get',
    (_e, { id }: { id: string }): PdfDocumentRecord | null => {
      return getDocument(id);
    },
  );

  // ── Save & Delete ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'documents:save',
    (
      _e,
      req: {
        id: string;
        projectId?: string | null;
        title: string;
        description?: string;
        templateId?: string;
        dataJson: string;
      },
    ): PdfDocumentRecord => {
      const record = saveDocument(req);
      broadcastChanged();
      return record;
    },
  );

  ipcMain.handle('documents:delete', (_e, { id }: { id: string }): boolean => {
    const ok = deleteDocument(id);
    if (ok) broadcastChanged();
    return ok;
  });

  // ── Native File Export ────────────────────────────────────────────────────

  ipcMain.handle(
    'documents:export-file',
    async (
      _e,
      req: {
        id: string;
        format: 'pdf' | 'json';
        filename?: string;
        pdfBase64?: string;
        dataJson?: string;
      },
    ): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      try {
        const isPdf = req.format === 'pdf';
        const defaultName =
          req.filename ||
          (isPdf ? `document-${req.id}.pdf` : `document-${req.id}.json`);

        const result = await dialog.showSaveDialog(mainWindow, {
          title: isPdf ? 'Export PDF Document' : 'Export Document JSON',
          defaultPath: defaultName,
          filters: isPdf
            ? [{ name: 'PDF Documents', extensions: ['pdf'] }]
            : [{ name: 'JSON Documents', extensions: ['json'] }],
        });

        if (result.canceled || !result.filePath) {
          return { ok: false, error: 'User canceled export' };
        }

        if (isPdf) {
          if (!req.pdfBase64) {
            return { ok: false, error: 'No PDF data provided for export' };
          }
          const buffer = Buffer.from(req.pdfBase64, 'base64');
          await fs.writeFile(result.filePath, buffer);
        } else {
          const content = req.dataJson || '{}';
          await fs.writeFile(result.filePath, content, 'utf-8');
        }

        shell.showItemInFolder(result.filePath);
        return { ok: true, filePath: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );

  // ── AI Copilot Block Generation ───────────────────────────────────────────

  ipcMain.handle(
    'documents:ai-generate-block',
    async (
      _e,
      req: { prompt: string; blockType?: string; context?: string },
    ): Promise<{ block: unknown; note?: string }> => {
      try {
        const settings = getSettings();
        const model = resolveModel(
          settings.activeProvider,
          settings.activeModel,
        );

        const promptLower = req.prompt.toLowerCase();
        const preferredType =
          req.blockType ||
          (promptLower.includes('table')
            ? 'table'
            : promptLower.includes('metric') || promptLower.includes('kpi')
              ? 'metrics'
              : promptLower.includes('callout') ||
                  promptLower.includes('summary') ||
                  promptLower.includes('note')
                ? 'callout'
                : 'paragraph');

        if (preferredType === 'table') {
          const schema = z.object({
            columns: z.array(
              z.object({
                header: z.string(),
                widthPct: z.number().default(25),
                align: z.enum(['left', 'center', 'right']).default('left'),
              }),
            ),
            rows: z.array(z.array(z.string())),
            note: z.string().optional(),
          });

          const { object } = await generateObject({
            model,
            schema,
            prompt: `Generate a structured document table based on this user request: "${req.prompt}". Document context: ${req.context || 'Business document'}.`,
          });

          const cols = object.columns.map((c) => ({
            id: nanoid(),
            header: c.header,
            widthPct: c.widthPct,
            align: c.align,
          }));

          return {
            block: {
              id: nanoid(),
              type: 'table',
              columns: cols,
              rows: object.rows,
              striped: true,
              showBorders: true,
            },
            note: object.note,
          };
        }

        if (preferredType === 'metrics') {
          const schema = z.object({
            items: z.array(
              z.object({
                label: z.string(),
                value: z.string(),
                change: z.string().optional(),
                isPositive: z.boolean().optional(),
              }),
            ),
            note: z.string().optional(),
          });

          const { object } = await generateObject({
            model,
            schema,
            prompt: `Generate 2 to 4 key KPI metric cards based on: "${req.prompt}". Document context: ${req.context || 'Executive report'}.`,
          });

          return {
            block: {
              id: nanoid(),
              type: 'metrics',
              columns: Math.min(Math.max(object.items.length, 2), 4) as
                2 | 3 | 4,
              items: object.items.map((i) => ({ ...i, id: nanoid() })),
            },
            note: object.note,
          };
        }

        if (preferredType === 'callout') {
          const schema = z.object({
            title: z.string().optional(),
            text: z.string(),
            variant: z
              .enum(['info', 'warning', 'success', 'note', 'quote'])
              .default('info'),
            note: z.string().optional(),
          });

          const { object } = await generateObject({
            model,
            schema,
            prompt: `Generate a highlighted executive callout box based on: "${req.prompt}". Document context: ${req.context || 'Report'}.`,
          });

          return {
            block: {
              id: nanoid(),
              type: 'callout',
              title: object.title,
              text: object.text,
              variant: object.variant,
            },
            note: object.note,
          };
        }

        // Default: Paragraph block
        const schema = z.object({
          content: z.string(),
          note: z.string().optional(),
        });

        const { object } = await generateObject({
          model,
          schema,
          prompt: `Draft a professional document paragraph based on: "${req.prompt}". Document context: ${req.context || 'Formal document'}.`,
        });

        return {
          block: {
            id: nanoid(),
            type: 'paragraph',
            content: object.content,
            fontSize: 10,
            lineHeight: 1.45,
          },
          note: object.note,
        };
      } catch {
        // Fallback gracefully without throwing
        return {
          block: {
            id: nanoid(),
            type: 'paragraph',
            content: req.prompt,
            fontSize: 10,
            lineHeight: 1.45,
          },
          note: 'Generated fallback block',
        };
      }
    },
  );
}
