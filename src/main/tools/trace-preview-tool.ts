/**
 * main/tools/trace-preview-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * renderTracePreview — visual verification for Trace.
 *
 * The tool renders up to four frames, then asks the app's vision provider to
 * inspect them and returns a written review. Returning a filesystem path alone
 * was not verification: the copilot cannot open files, and the active chat model
 * may be text-only. The review names what is actually on screen (clipped copy,
 * empty frames, a transition veil) so the agent can fix it before summarizing.
 *
 * Read-only: it never mutates the project.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import sharp from 'sharp';

import { getTraceProjectStore } from '../trace/service';
import { lintTraceProject } from '../../lib/trace/lint';
import { sceneAtTime } from '../../lib/trace/runtime/scenes';
import { staticSvgMarkup } from '../../lib/trace/serialize/svg-markup';
import { reviewCompositionFrames } from '../trace/vision-review';

const MAX_PREVIEW_FRAMES = 4;
const PREVIEW_MAX_EDGE = 900;

interface RenderedFrame {
  timeMs: number;
  scene: string | null;
  png: Buffer;
}

function clampTime(projectDurationMs: number, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(projectDurationMs, Math.round(value)));
}

export function createTracePreviewTool() {
  return tool({
    description:
      'Render up to four frames of a NovaTrace project and have a vision model inspect them. ' +
      'Returns a written visual review (clipping, overlap, contrast, empty frames, subtitle band), ' +
      'the preview path, per-frame scene names and a lint summary. Call lintProject + renderTracePreview ' +
      'after major changes and fix what the review names before summarizing. Read `visualReview.performed` ' +
      'to know whether the check actually happened.',
    inputSchema: z.object({
      projectId: z.string(),
      timeMs: z
        .number()
        .optional()
        .describe('Time to sample in ms (default 0). Ignored when `times` is set.'),
      times: z
        .array(z.number())
        .min(1)
        .max(MAX_PREVIEW_FRAMES)
        .optional()
        .describe(
          'Explicit sample times in ms, e.g. a scene entrance and its settled frame.',
        ),
    }),
    execute: async ({ projectId, timeMs, times }, { abortSignal }) => {
      try {
        const store = getTraceProjectStore();
        const result = await store.openProject(projectId);
        const project = result?.project;
        if (!project) {
          return {
            success: false as const,
            error: `Project "${projectId}" not found.`,
          };
        }

        const requested = (times?.length ? times : [timeMs ?? 0])
          .slice(0, MAX_PREVIEW_FRAMES)
          .map((value) => clampTime(project.durationMs, value));
        const sampleTimes = [...new Set(requested)];

        const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
        const baseDir = path.join(
          app.getPath('userData'),
          'trace-previews',
          runId,
        );
        await fs.mkdir(baseDir, { recursive: true });

        const frames: RenderedFrame[] = [];
        const pngPaths: string[] = [];
        for (const at of sampleTimes) {
          const svg = staticSvgMarkup(project, at, { size: true });
          if (frames.length === 0) {
            await fs.writeFile(path.join(baseDir, 'frame.svg'), svg, 'utf8');
          }
          const png = await sharp(Buffer.from(svg, 'utf8'))
            .resize({
              width: PREVIEW_MAX_EDGE,
              height: PREVIEW_MAX_EDGE,
              fit: 'inside',
            })
            .png()
            .toBuffer();
          const pngPath = path.join(baseDir, `frame-${at}ms.png`);
          await fs.writeFile(pngPath, png);
          pngPaths.push(pngPath);
          frames.push({
            timeMs: at,
            scene: sceneAtTime(project, at)?.name ?? null,
            png,
          });
        }

        const lint = lintTraceProject(project);
        const visualReview = await reviewCompositionFrames({
          projectName: project.name,
          canvas: { width: project.width, height: project.height },
          frames: frames.map((frame) => ({
            timeMs: frame.timeMs,
            label: frame.scene,
            png: frame.png,
          })),
          focus:
            'Inspect clipping, overlap, contrast, empty frames, missing focal content and collisions ' +
            'with the subtitle band at the bottom. A frame that is mostly one solid colour is a scene ' +
            'entrance veil — say that rather than reporting missing content.',
          abortSignal,
        });

        return {
          success: true as const,
          previewPath: path.join(baseDir, 'frame.svg'),
          frames: frames.map((frame, index) => ({
            timeMs: frame.timeMs,
            scene: frame.scene,
            pngPath: pngPaths[index],
          })),
          visualReview,
          lint: {
            ok: lint.ok,
            errorCount: lint.errorCount,
            warningCount: lint.warningCount,
          },
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