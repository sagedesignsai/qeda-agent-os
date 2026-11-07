/**
 * main/tools/trace-preview-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * renderTracePreview — visual verification for Trace (Phase B).
 * Writes a static SVG frame to userData/trace-previews and returns the path
 * + lint summary, so the copilot can verify before summarizing. Read-only.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { getTraceProjectStore } from '../trace/service';
import { staticSvgMarkup } from '../../lib/trace/serialize/svg-markup';
import { lintTraceProject } from '../../lib/trace/lint';

export function createTracePreviewTool() {
  return tool({
    description:
      'Render a static SVG preview frame of a NovaTrace project to a temp file for visual verification. ' +
      'Returns the preview path + lint summary. Call lintProject + renderTracePreview after major changes to verify before summarizing.',
    inputSchema: z.object({
      projectId: z.string(),
      timeMs: z.number().optional().describe('Time to sample in ms (default 0).'),
    }),
    execute: async ({ projectId, timeMs }) => {
      try {
        const store = getTraceProjectStore();
        const result = await store.openProject(projectId);
        const project = result?.project;
        if (!project) return { success: false as const, error: `Project "${projectId}" not found.` };

        const svg = staticSvgMarkup(project, timeMs ?? 0, { size: true });
        const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
        const baseDir = path.join(app.getPath('userData'), 'trace-previews', runId);
        const previewPath = path.join(baseDir, 'frame.svg');
        await fs.mkdir(baseDir, { recursive: true });
        await fs.writeFile(previewPath, svg, 'utf8');

        const lint = lintTraceProject(project);
        return {
          success: true as const,
          previewPath,
          bytes: Buffer.byteLength(svg, 'utf8'),
          lint: { ok: lint.ok, errorCount: lint.errorCount, warningCount: lint.warningCount },
          elementCount: Object.keys(project.elements ?? {}).length,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}

export type TracePreviewTool = ReturnType<typeof createTracePreviewTool>;
