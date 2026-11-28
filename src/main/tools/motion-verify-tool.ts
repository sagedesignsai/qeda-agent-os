/**
 * main/tools/motion-verify-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification in the Motion loop (Trace lintProject pattern).
 * - lintMotionProject: preflight checks (blocking + warnings).
 * - renderMotionPreview: reserved for a real offscreen renderer. It must never
 *   report success for a stand-in scene; an agent that believes it saw the
 *   document will stop fixing real visual problems.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { preflightMotionExport } from '../../lib/motion/export/preflight';
import type { MotionToolContext } from './motion';

export function createMotionVerifyTool(context: MotionToolContext) {
  const lintMotionProject = tool({
    description:
      'Lint the current Motion document: blocking export issues (missing scene, bad output size/fps, missing assets, unknown node types) and warnings. Call after major changes.',
    inputSchema: z.object({ sceneId: z.string().optional() }),
    execute: async ({ sceneId }) => {
      const doc = context.getDocument();
      const scene = sceneId ? doc.scenes.find((candidate) => candidate.id === sceneId) : undefined;
      if (sceneId && !scene) {
        return {
          ok: false,
          issues: [{
            severity: 'blocking' as const,
            code: 'MOTION_SCENE_MISSING',
            message: `Scene "${sceneId}" is not present in this project.`,
            action: 'Select an existing scene.',
          }],
          nodeCount: doc.scenes.reduce((sum, candidate) => sum + candidate.nodes.length, 0),
          revision: doc.revision,
        };
      }
      const issues = preflightMotionExport(doc, {
        // A fixed six-second window used to fail every scene shorter than six
        // seconds and hid defects after that point.
        ...(scene ? { range: { start: 0, end: scene.timeline.duration, sceneId: scene.id } } : {}),
      });
      return {
        ok: issues.filter((issue) => issue.severity === 'blocking').length === 0,
        issues,
        nodeCount: doc.scenes.reduce((sum, candidate) => sum + candidate.nodes.length, 0),
        revision: doc.revision,
      };
    },
  });

  const renderMotionPreview = tool({
    description:
      'Unavailable in this build: Motion has no offscreen still-frame renderer. Do not call this to claim visual verification. Use lintMotionProject and ask the user to inspect the viewport or export a frame.',
    inputSchema: z.object({}),
    execute: async () => ({
      success: false as const,
      available: false,
      sceneRendered: false,
      error:
        'Motion preview rendering is not implemented. Use lintMotionProject and the editor viewport; do not claim visual verification.',
    }),
  });

  return { lintMotionProject, renderMotionPreview };
}

export type MotionVerifyTools = ReturnType<typeof createMotionVerifyTool>;