/**
 * tools/vision.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vision tools for agents — read-only inspection operations.
 *
 * These are exposed to all agents (Studio Copilot, Motion, Trace, Chat, etc.)
 * and require NO user approval (read-only operations).
 */

import { tool } from 'ai';
import { z } from 'zod';
import { visionSystem } from '../ai/vision-system.js';

export const visionTools = {
  /**
   * Inspect what is currently visible in an editor viewport.
   * Read-only: no approval needed.
   */
  analyzeViewport: tool({
    description:
      'Inspect what is currently visible in an editor viewport (Studio, Motion, Trace, Workspace). ' +
      'Returns UI layout, focus area, and any visual issues detected. Use this before making edits to understand context.',
    inputSchema: z.object({
      app: z
        .enum(['studio', 'motion', 'trace', 'workspace'])
        .describe('Which editor to inspect'),
      question: z
        .string()
        .optional()
        .describe('Optional specific question to answer about the viewport'),
    }),
    execute: async ({ app, question }) => {
      const result = await visionSystem.analyzeViewport(app, question);
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          timingMs: result.timingMs,
        };
      }
      return {
        success: true,
        analysis: result.data,
        modelUsed: result.modelUsed,
        timingMs: result.timingMs,
      };
    },
  }),

  /**
   * Score a preview render against a brief.
   * Read-only: no approval needed.
   */
  scorePreview: tool({
    description:
      'Score a rendered preview (3D Blender GLB, Trace SVG, video frame, etc.) against its intended design brief. ' +
      'Returns a match score (0–1) and specific issues to refine. Call after generation to validate.',
    inputSchema: z.object({
      imagePath: z
        .string()
        .describe(
          'Path to preview image (PNG/JPG). For Trace SVG, render to PNG first.',
        ),
      brief: z.string().min(3).describe('What the render is supposed to be'),
      criteria: z
        .enum(['geometry', 'animation', 'styling', 'composition'])
        .optional()
        .describe('What aspect to prioritize in scoring'),
    }),
    execute: async ({ imagePath, brief, criteria }) => {
      const result = await visionSystem.scoreAsset(imagePath, brief, criteria);
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          timingMs: result.timingMs,
        };
      }
      return {
        success: true,
        match: result.data?.match,
        issues: result.data?.issues,
        strengths: result.data?.strengths,
        suggestions: result.data?.suggestions,
        modelUsed: result.modelUsed,
        timingMs: result.timingMs,
      };
    },
  }),

  /**
   * Validate a composite layout.
   * Read-only: no approval needed.
   */
  validateComposition: tool({
    description:
      'Validate a composite layout: multi-element scene, captions over video, UI mockup, etc. ' +
      'Checks alignment, balance, visual hierarchy. Returns validation report.',
    inputSchema: z.object({
      imagePath: z
        .string()
        .describe('Screenshot of the composition to validate'),
      spec: z
        .string()
        .describe(
          'Specification of what the composition should look like (e.g., "multi-track video with 3 clips and effects")',
        ),
    }),
    execute: async ({ imagePath, spec }) => {
      const result = await visionSystem.validateComposition(imagePath, spec);
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          timingMs: result.timingMs,
        };
      }
      return {
        success: true,
        valid: result.data?.valid,
        warnings: result.data?.warnings,
        errors: result.data?.errors,
        metrics: result.data?.visualMetrics,
        modelUsed: result.modelUsed,
        timingMs: result.timingMs,
      };
    },
  }),

  /**
   * Check if two visuals are consistent.
   * Read-only: no approval needed.
   */
  checkConsistency: tool({
    description:
      'Compare two visual states for consistency: do the colors/styling/scale/alignment match? ' +
      'Used to validate multi-pass iterations match a reference.',
    inputSchema: z.object({
      imagePath1: z.string().describe('Path to reference/first image'),
      imagePath2: z.string().describe('Path to current/second image'),
      dimension: z
        .enum(['color', 'style', 'scale', 'alignment'])
        .describe('Which aspect to check for consistency'),
    }),
    execute: async ({ imagePath1, imagePath2, dimension }) => {
      const result = await visionSystem.checkConsistency(
        imagePath1,
        imagePath2,
        dimension,
      );
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          timingMs: result.timingMs,
        };
      }
      return {
        success: true,
        consistent: result.data?.consistent,
        difference: result.data?.difference,
        modelUsed: result.modelUsed,
        timingMs: result.timingMs,
      };
    },
  }),
};
