/**
 * main/trace/vision-review.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared visual review for Trace renders. The active chat model may be
 * text-only, so the tool runs the app's vision provider over the frames and
 * returns a written review; the caller reports `performed: false` when no
 * vision model is configured instead of claiming a check that did not happen.
 */

import { generateText } from 'ai';

import {
  resolveVisionModel,
  selectVisionModel,
  type VisionModelSelection,
} from '../ai/vision-provider';

export interface VisionReviewFrame {
  timeMs: number;
  label?: string | null;
  png: Buffer;
}

export interface VisionReviewOptions {
  projectName: string;
  canvas: { width: number; height: number };
  frames: VisionReviewFrame[];
  /** Reviewer emphasis, in addition to the shared visual checks. */
  focus?: string;
  abortSignal?: AbortSignal;
}

export interface VisionReview {
  performed: boolean;
  model: string | null;
  notes: string;
}

export async function reviewCompositionFrames(
  options: VisionReviewOptions,
): Promise<VisionReview> {
  let selection: VisionModelSelection | null;
  try {
    selection = await selectVisionModel('composition-validation');
  } catch {
    selection = null;
  }
  if (!selection) {
    return {
      performed: false,
      model: null,
      notes:
        'No vision model is configured. The frames were rendered but not visually inspected.',
    };
  }

  const model = resolveVisionModel(selection.providerId, selection.modelId);
  if (!model) {
    return {
      performed: false,
      model: null,
      notes: `The configured vision model "${selection.modelName}" could not be resolved. The frames were not inspected.`,
    };
  }

  const frameLines = options.frames
    .map(
      (frame, index) =>
        `${index + 1}. ${frame.timeMs}ms${frame.label ? ` (${frame.label})` : ''}`,
    )
    .join('\n');

  const focus =
    options.focus ??
    'Inspect clipping, overlap, contrast, empty frames, missing focal content and collisions with the subtitle band at the bottom.';

  try {
    const review = await generateText({
      model: model as any,
      abortSignal: options.abortSignal,
      system:
        `You are reviewing rendered frames from the Nova Trace composition "${options.projectName}" ` +
        `(${options.canvas.width}×${options.canvas.height}). ${focus} ` +
        'A frame that is mostly one solid colour is a scene entrance veil — say that rather than ' +
        'reporting missing content. Do not invent elements you cannot see. Return 2–5 short, ' +
        'actionable bullet points, each prefixed with the frame time or number. If everything looks ' +
        'correct, say so plainly.',
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: `Frames, in order:\n${frameLines}`,
            },
            ...options.frames.flatMap((frame, index) => [
              {
                type: 'text' as const,
                text: `Frame ${index + 1} at ${frame.timeMs}ms${frame.label ? ` (${frame.label})` : ''}`,
              },
              {
                type: 'image' as const,
                image: new Uint8Array(frame.png),
              },
            ]),
          ],
        },
      ],
    });

    return {
      performed: true,
      model: `${selection.providerId}/${selection.modelId}`,
      notes: review.text.trim() || 'The vision model returned no notes.',
    };
  } catch (error) {
    if (options.abortSignal?.aborted) throw error;
    return {
      performed: false,
      model: `${selection.providerId}/${selection.modelId}`,
      notes:
        `The vision review failed: ` +
        (error instanceof Error ? error.message : String(error)),
    };
  }
}