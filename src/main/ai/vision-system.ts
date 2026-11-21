/**
 * ai/vision-system.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core Vision System — unified API for all agents to see and understand visuals.
 *
 * Four main operations:
 * 1. analyzeViewport() — "What do you see in this editor?"
 * 2. scoreAsset() — "Does this render match the brief?"
 * 3. validateComposition() — "Is this layout correct?"
 * 4. checkConsistency() — "Do these states match?"
 *
 * Uses vision-provider.ts for smart model selection + fallback logic.
 */

import { generateText } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import * as cu from '../computer-use.js';
import {
  selectVisionModel,
  fallbackVisionModel,
  resolveVisionModel,
  type VisionTask,
  type VisionModelSelection,
} from './vision-provider.js';

// ─── Response schemas (Zod) ────────────────────────────────────────────────

export const ViewportAnalysisSchema = z.object({
  app: z.string().describe('Editor name: studio, motion, trace, workspace'),
  elements: z.array(z.string()).describe('UI elements visible'),
  focus: z.string().describe('What the user is working on'),
  issues: z.array(z.string()).describe('Visual problems detected'),
  suggestions: z.array(z.string()).optional().describe('Improvements'),
});
export type ViewportAnalysis = z.infer<typeof ViewportAnalysisSchema>;

export const AssetScoringSchema = z.object({
  match: z.number().min(0).max(1).describe('Match score 0–1'),
  issues: z.array(z.string()).describe('Specific problems'),
  strengths: z.array(z.string()).optional().describe('What looks good'),
  suggestions: z.array(z.string()).optional().describe('How to fix'),
});
export type AssetScoring = z.infer<typeof AssetScoringSchema>;

export const CompositionValidationSchema = z.object({
  valid: z.boolean().describe('Is the composition valid?'),
  warnings: z.array(z.string()).describe('Non-blocking issues'),
  errors: z.array(z.string()).describe('Blocking issues'),
  visualMetrics: z.optional(
    z.object({
      balance: z.enum(['good', 'poor']),
      contrast: z.enum(['good', 'poor']),
      alignment: z.enum(['good', 'poor']),
    }),
  ),
});
export type CompositionValidation = z.infer<typeof CompositionValidationSchema>;

export const ConsistencyCheckSchema = z.object({
  consistent: z.boolean().describe('Do they match?'),
  difference: z.string().describe('What changed'),
});
export type ConsistencyCheck = z.infer<typeof ConsistencyCheckSchema>;

// ─── Result wrapper ────────────────────────────────────────────────────────

export interface VisionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  modelUsed?: string;
  timingMs?: number;
}

// ─── Core Vision System class ──────────────────────────────────────────────

export class VisionSystem {
  /**
   * Analyze a viewport: "What do you see?"
   */
  async analyzeViewport(
    app: 'studio' | 'motion' | 'trace' | 'workspace',
    question?: string,
  ): Promise<VisionResult<ViewportAnalysis>> {
    const startMs = Date.now();

    try {
      // 1. Capture viewport screenshot
      const screenshot = await this.captureViewportScreenshot(app);
      if (!screenshot) {
        return {
          success: false,
          error: `Could not capture ${app} viewport.`,
          timingMs: Date.now() - startMs,
        };
      }

      // 2. Select vision model
      const modelSelection = selectVisionModel('viewport-analysis');
      if (!modelSelection) {
        return {
          success: false,
          error: 'No vision model available. Set OPENROUTER_API_KEY, GEMINI_API_KEY, or enable offline models in Settings.',
          timingMs: Date.now() - startMs,
        };
      }

      // 3. Resolve model
      const model = resolveVisionModel(modelSelection.providerId, modelSelection.modelId);
      if (!model) {
        return {
          success: false,
          error: `Vision model unavailable: ${modelSelection.modelId}. ${
            modelSelection.providerId === 'offline'
              ? 'Download models in Settings → Offline Models first.'
              : `Check that your ${modelSelection.providerId} API key is configured.`
          }`,
          timingMs: Date.now() - startMs,
        };
      }

      // 4. Call vision model with viewport-specific prompt
      const result = await generateText({
        model: model as any,
        system: `You are a UI/UX analyst. Examine the screenshot and identify:
- What application or editor this is
- What task the user appears to be doing
- Key UI elements visible and their state
- Any visual issues, misalignments, or broken state
- Suggestions for how an AI could help

Respond ONLY with valid JSON matching this schema:
{
  "app": "studio|motion|trace|workspace",
  "elements": ["element 1", "element 2"],
  "focus": "the primary task",
  "issues": [],
  "suggestions": []
}

Do not include markdown formatting, just the JSON object.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image' as const,
                image: screenshot,
              },
              {
                type: 'text' as const,
                text:
                  question ||
                  'Analyze this viewport and identify the current UI state.',
              },
            ],
          },
        ],
      });

      // 5. Parse response
      const text = result.text?.trim() ?? '{}';
      const json = JSON.parse(text) as ViewportAnalysis;

      return {
        success: true,
        data: json,
        modelUsed: modelSelection.modelName,
        timingMs: Date.now() - startMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timingMs: Date.now() - startMs,
      };
    }
  }

  /**
   * Score a preview render: "Does this match the brief?"
   */
  async scoreAsset(
    imagePath: string,
    brief: string,
    criteria: 'geometry' | 'animation' | 'styling' | 'composition' = 'geometry',
  ): Promise<VisionResult<AssetScoring>> {
    const startMs = Date.now();

    try {
      // 1. Read image file
      const imageBuffer = await fs.readFile(imagePath);

      // 2. Select vision model
      const modelSelection = selectVisionModel('asset-scoring');
      if (!modelSelection) {
        return {
          success: false,
          error: 'No vision model available for asset scoring. Set OPENROUTER_API_KEY or GEMINI_API_KEY.',
          timingMs: Date.now() - startMs,
        };
      }

      // 3. Resolve model
      const model = resolveVisionModel(modelSelection.providerId, modelSelection.modelId);
      if (!model) {
        return {
          success: false,
          error: `Vision model unavailable: ${modelSelection.modelId}. ${
            modelSelection.providerId === 'offline'
              ? 'Download models in Settings → Offline Models first.'
              : `Check that your ${modelSelection.providerId} API key is configured.`
          }`,
          timingMs: Date.now() - startMs,
        };
      }

      // 4. Call vision model with asset-scoring prompt
      const criteriaGuide = this.getCriteriaGuide(criteria);

      const result = await generateText({
        model: model as any,
        system: `You are a 3D/2D asset visual quality evaluator. Examine the preview render and the brief it was supposed to match.

Focus on: ${criteriaGuide}

Score the match from 0.0 (no match) to 1.0 (perfect match).
Identify specific, actionable issues and how to fix them.

Respond ONLY with valid JSON matching this schema:
{
  "match": 0.0–1.0,
  "issues": ["issue 1", "issue 2"],
  "strengths": ["strength 1"],
  "suggestions": ["suggestion 1"]
}

Do not include markdown formatting, just the JSON object.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image' as const,
                image: imageBuffer,
              },
              {
                type: 'text' as const,
                text: `Brief: ${brief}`,
              },
            ],
          },
        ],
      });

      // 5. Parse response
      const text = result.text?.trim() ?? '{}';
      const json = JSON.parse(text) as AssetScoring;

      return {
        success: true,
        data: json,
        modelUsed: modelSelection.modelName,
        timingMs: Date.now() - startMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timingMs: Date.now() - startMs,
      };
    }
  }

  /**
   * Validate a composition: "Is this layout correct?"
   */
  async validateComposition(
    imagePath: string,
    spec: string,
  ): Promise<VisionResult<CompositionValidation>> {
    const startMs = Date.now();

    try {
      // 1. Read image file
      const imageBuffer = await fs.readFile(imagePath);

      // 2. Select vision model
      const modelSelection = selectVisionModel('composition-validation');
      if (!modelSelection) {
        return {
          success: false,
          error: 'No vision model available for composition validation. Set OPENROUTER_API_KEY or GEMINI_API_KEY.',
          timingMs: Date.now() - startMs,
        };
      }

      // 3. Resolve model
      const model = resolveVisionModel(modelSelection.providerId, modelSelection.modelId);
      if (!model) {
        return {
          success: false,
          error: `Vision model unavailable: ${modelSelection.modelId}. ${
            modelSelection.providerId === 'offline'
              ? 'Download models in Settings → Offline Models first.'
              : `Check that your ${modelSelection.providerId} API key is configured.`
          }`,
          timingMs: Date.now() - startMs,
        };
      }

      // 4. Call vision model with composition-validation prompt
      const result = await generateText({
        model: model as any,
        system: `You are a composition and layout validator. Examine the image and evaluate it against the specification.

Check:
- Visual balance and weight distribution
- Contrast and readability
- Element alignment and spacing
- Visual hierarchy and focus
- Any visual breaking or misalignment

Respond ONLY with valid JSON matching this schema:
{
  "valid": true/false,
  "errors": ["blocking issue 1"],
  "warnings": ["non-blocking issue 1"],
  "visualMetrics": {
    "balance": "good" or "poor",
    "contrast": "good" or "poor",
    "alignment": "good" or "poor"
  }
}

Do not include markdown formatting, just the JSON object.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image' as const,
                image: imageBuffer,
              },
              {
                type: 'text' as const,
                text: `Specification: ${spec}`,
              },
            ],
          },
        ],
      });

      // 5. Parse response
      const text = result.text?.trim() ?? '{}';
      const json = JSON.parse(text) as CompositionValidation;

      return {
        success: true,
        data: json,
        modelUsed: modelSelection.modelName,
        timingMs: Date.now() - startMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timingMs: Date.now() - startMs,
      };
    }
  }

  /**
   * Check visual consistency: "Do these match?"
   */
  async checkConsistency(
    imagePath1: string,
    imagePath2: string,
    dimension: 'color' | 'style' | 'scale' | 'alignment',
  ): Promise<VisionResult<ConsistencyCheck>> {
    const startMs = Date.now();

    try {
      // 1. Read both images
      const [buffer1, buffer2] = await Promise.all([
        fs.readFile(imagePath1),
        fs.readFile(imagePath2),
      ]);

      // 2. Select vision model
      const modelSelection = selectVisionModel('consistency-check');
      if (!modelSelection) {
        return {
          success: false,
          error: 'No vision model available for consistency check. Set OPENROUTER_API_KEY or GEMINI_API_KEY.',
          timingMs: Date.now() - startMs,
        };
      }

      // 3. Resolve model
      const model = resolveVisionModel(modelSelection.providerId, modelSelection.modelId);
      if (!model) {
        return {
          success: false,
          error: `Vision model unavailable: ${modelSelection.modelId}. ${
            modelSelection.providerId === 'offline'
              ? 'Download models in Settings → Offline Models first.'
              : `Check that your ${modelSelection.providerId} API key is configured.`
          }`,
          timingMs: Date.now() - startMs,
        };
      }

      // 4. Call vision model with consistency-check prompt
      const dimensionGuide = this.getDimensionGuide(dimension);

      const result = await generateText({
        model: model as any,
        system: `You are a visual consistency checker. Compare two images and evaluate if they are consistent in the given dimension.

Check for: ${dimensionGuide}

Respond ONLY with valid JSON matching this schema:
{
  "consistent": true/false,
  "difference": "What changed or differs between the two images"
}

Do not include markdown formatting, just the JSON object.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text' as const,
                text: 'First image (reference):',
              },
              {
                type: 'image' as const,
                image: buffer1,
              },
              {
                type: 'text' as const,
                text: 'Second image (to check):',
              },
              {
                type: 'image' as const,
                image: buffer2,
              },
            ],
          },
        ],
      });

      // 5. Parse response
      const text = result.text?.trim() ?? '{}';
      const json = JSON.parse(text) as ConsistencyCheck;

      return {
        success: true,
        data: json,
        modelUsed: modelSelection.modelName,
        timingMs: Date.now() - startMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timingMs: Date.now() - startMs,
      };
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async captureViewportScreenshot(
    app: 'studio' | 'motion' | 'trace' | 'workspace',
  ): Promise<Buffer | null> {
    try {
      // Get app window by title hint
      const shot = await cu.captureScreenshot();
      if (shot && 'dataUrl' in shot && shot.dataUrl) {
        // Extract base64 from data URL
        const base64 = shot.dataUrl.split(',')[1];
        return Buffer.from(base64, 'base64');
      }
      return null;
    } catch {
      return null;
    }
  }

  private getCriteriaGuide(criteria: string): string {
    switch (criteria) {
      case 'geometry':
        return 'Part count, proportions, landmarks mentioned in the brief, silhouette, mass distribution';
      case 'animation':
        return 'Motion smoothness, timing, path correctness, does it match the intended behavior';
      case 'styling':
        return 'Colors, materials, textures, lighting, surface appearance, visual style consistency';
      case 'composition':
        return 'Overall layout, balance, visual hierarchy, focal points, how elements work together';
      default:
        return criteria;
    }
  }

  private getDimensionGuide(dimension: string): string {
    switch (dimension) {
      case 'color':
        return 'Color palette, saturation, hue, brightness consistency between images';
      case 'style':
        return 'Visual style, material appearance, texture, design language consistency';
      case 'scale':
        return 'Size, proportions, relative sizing of elements remain constant';
      case 'alignment':
        return 'Position, centering, spacing, alignment of elements in the frame';
      default:
        return dimension;
    }
  }
}

// ─── Singleton instance ────────────────────────────────────────────────────

export const visionSystem = new VisionSystem();
