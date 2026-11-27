/**
 * main/tools/trace-qa-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * auditComposition — the readiness pass before a cut is shown.
 *
 * It combines the measurable QA report (lint, scene coverage, narration,
 * contrast, notes, motion metrics) with a rendered contact sheet that a vision
 * model reviews. The written review + issue list is what the copilot fixes; the
 * sheet path is kept for the user.
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
import { framesForProject, qaTraceProject } from '../../lib/trace/qa';
import { staticSvgMarkup } from '../../lib/trace/serialize/svg-markup';
import { reviewCompositionFrames } from '../trace/vision-review';

const CELL_WIDTH = 480;
const CELL_HEIGHT = 270;
const COLUMNS = 3;
const MAX_FRAMES = 9;

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function createTraceQaTool() {
  return tool({
    description:
      'Run a measurable composition audit and a visual review of a contact sheet. ' +
      'Returns QA issues (lint, scene coverage, narration readiness, large-text contrast, open review notes), ' +
      'metrics, the frame list, the contact-sheet path and a written vision review. Use after composing a cut ' +
      'and before final delivery; fix the named issues, then audit again. Read `visualReview.performed` to know ' +
      'whether the visual check actually happened.',
    inputSchema: z.object({
      projectId: z.string(),
      includeContactSheet: z
        .boolean()
        .optional()
        .describe('Render and review a contact sheet. Default true.'),
    }),
    execute: async ({ projectId, includeContactSheet }, { abortSignal }) => {
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

        const report = qaTraceProject(project);
        const summarized = {
          ok: report.ok,
          errorCount: report.errorCount,
          warningCount: report.warningCount,
          infoCount: report.infoCount,
          metrics: report.metrics,
          issues: report.issues
            .slice()
            .sort(
              (a, b) =>
                SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
            )
            .slice(0, 40),
          frames: report.frames,
        };

        if (includeContactSheet === false) {
          return {
            success: true as const,
            qa: summarized,
            contactSheetPath: null,
            visualReview: {
              performed: false,
              model: null,
              notes: 'Contact sheet disabled by the caller.',
            },
          };
        }

        const frames = framesForProject(project, MAX_FRAMES);
        const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
        const baseDir = path.join(
          app.getPath('userData'),
          'trace-qa',
          runId,
        );
        await fs.mkdir(baseDir, { recursive: true });

        const pngs: Buffer[] = [];
        for (const frame of frames) {
          const svg = staticSvgMarkup(project, frame.timeMs, {
            size: true,
            subtitles: true,
          });
          const png = await sharp(Buffer.from(svg, 'utf8'))
            .resize({
              width: CELL_WIDTH,
              height: CELL_HEIGHT,
              fit: 'contain',
              background: '#070b14',
            })
            .png()
            .toBuffer();
          pngs.push(png);
          await fs.writeFile(
            path.join(baseDir, `frame-${frame.timeMs}ms.png`),
            png,
          );
        }

        const rows = Math.max(1, Math.ceil(frames.length / COLUMNS));
        const contactSheetPath = path.join(baseDir, 'contact-sheet.png');
        await sharp({
          create: {
            width: CELL_WIDTH * COLUMNS,
            height: CELL_HEIGHT * rows,
            channels: 3,
            background: '#070b14',
          },
        })
          .composite(
            pngs.map((input, index) => ({
              input,
              left: (index % COLUMNS) * CELL_WIDTH,
              top: Math.floor(index / COLUMNS) * CELL_HEIGHT,
            })),
          )
          .png()
          .toFile(contactSheetPath);

        const visualReview = await reviewCompositionFrames({
          projectName: project.name,
          canvas: { width: project.width, height: project.height },
          frames: frames.map((frame, index) => ({
            timeMs: frame.timeMs,
            label: frame.label,
            png: pngs[index],
          })),
          focus:
            'This contact sheet spans the whole cut; frames are in timeline order. QA found ' +
            `${report.errorCount} error(s) and ${report.warningCount} warning(s). Inspect each frame for ` +
            'clipping, low contrast, empty frames, off-brand content and unfinished moments, and name the ' +
            'frame time where each problem appears.',
          abortSignal,
        });

        return {
          success: true as const,
          qa: summarized,
          contactSheetPath,
          frames: frames.map((frame) => ({
            timeMs: frame.timeMs,
            label: frame.label,
          })),
          visualReview,
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

export type TraceQaTool = ReturnType<typeof createTraceQaTool>;