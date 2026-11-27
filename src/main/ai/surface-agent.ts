/**
 * main/ai/surface-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trace Surface Specialist — the generative half of the Surfaces add-on.
 *
 * It writes static SVG plus an editable animation plan, then runs the real
 * importer, ops engine, fragment validator and linter over the result. It never
 * writes to the project directly in the editor flow: a proposal is returned for
 * preview and explicit application. The copilot subagent tool applies the
 * validated proposal through `insertFragment` because additive composition is
 * already recoverable and undoable.
 */

import { ToolLoopAgent, generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import sharp from 'sharp';

import {
  SURFACE_GENERATION_LIMITS,
  compileSurfaceProposal,
  surfaceProposalProject,
  type SurfaceGenerationProposal,
  type SurfaceGenerationRequest,
  type SurfaceProposalCandidate,
} from '../../lib/trace/addons/surfaces/generation';
import { SURFACE_BLOCKS } from '../../lib/trace/addons/surfaces';
import type { SvgAnimationProperty } from '../../lib/trace/animation-plan';
import { staticSvgMarkup } from '../../lib/trace/serialize/svg-markup';
import { applyOps } from '../../lib/trace/ops';
import { getTraceProjectStore } from '../trace/service.js';
import type { ModelTarget } from './fallback.js';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';

const ANIMATABLE_PROPERTIES = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'fillOpacity',
  'fill',
  'stroke',
  'strokeWidth',
  'strokeDashoffset',
  'strokeDasharray',
  'd',
  'width',
  'height',
  'rx',
] as const satisfies readonly SvgAnimationProperty[];

const proposalSchema = z.object({
  summary: z.string().min(1).max(180),
  svg: z
    .string()
    .min(40)
    .max(SURFACE_GENERATION_LIMITS.maxSvgBytes)
    .describe(
      'Static SVG artwork with the exact canvas viewBox. No SMIL, CSS animation, raster images, clip paths, masks or foreignObject.',
    ),
  tracks: z
    .array(
      z.object({
        elementId: z.string().min(1).max(120),
        property: z.enum(ANIMATABLE_PROPERTIES),
        keyframes: z
          .array(
            z.object({
              timeMs: z.number().int().min(0).max(60_000),
              value: z.union([z.number(), z.string()]),
              easing: z.string().min(1).max(60).default('ease-in-out'),
            }),
          )
          .min(2)
          .max(SURFACE_GENERATION_LIMITS.maxKeyframesPerTrack),
      }),
    )
    .max(SURFACE_GENERATION_LIMITS.maxTracks)
    .default([])
    .describe(
      'Editable tracks. Element ids must match id attributes in the SVG. Continuous properties must start and end on the same value when loop is true.',
    ),
  warnings: z.array(z.string().max(240)).max(5).optional(),
});

function effectivePalette(request: SurfaceGenerationRequest) {
  const stylePalette = request.style?.palette ?? {};
  return {
    base:
      request.palette?.base ??
      stylePalette.background ??
      '#0b1120',
    deep: request.palette?.deep ?? '#020617',
    accent:
      request.palette?.accent ??
      stylePalette.accent ??
      '#38bdf8',
    secondary:
      request.palette?.secondary ??
      stylePalette.accentAlt ??
      '#8b5cf6',
  };
}

function renderableMarkup(proposal: SurfaceGenerationProposal, timeMs: number) {
  const project = surfaceProposalProject(proposal);
  return staticSvgMarkup(project, timeMs, {
    size: true,
    scenePresentation: false,
    camera: false,
  });
}

export function createSurfaceAgent(
  request: SurfaceGenerationRequest,
  target?: ModelTarget,
) {
  if ((request.prompt?.length ?? 0) > 800) {
    throw new Error('Surface briefs must be 800 characters or fewer.');
  }
  const settings = getSettings();
  const model = resolveModel(
    target?.providerId ?? settings.activeProvider,
    target?.modelId ?? settings.activeModel,
  );
  const width = Math.max(16, Math.round(request.width));
  const height = Math.max(16, Math.round(request.height));
  const durationMs = Math.max(1, Math.round(request.durationMs));
  const loop = request.loop !== false;
  const palette = effectivePalette(request);
  const intensity = Math.max(0, Math.min(100, request.intensity ?? 55));

  let proposal: SurfaceGenerationProposal | null = null;
  let visualReview: SurfaceGenerationProposal['visualReview'];

  const inspectBrief = tool({
    description:
      'Read the surface brief, exact canvas, duration, palette, look tokens and the prebuilt surface catalogue. Call this before designing so geometry and colour match the project.',
    inputSchema: z.object({}),
    execute: async () => ({
      brief: request.prompt,
      projectName: request.projectName ?? null,
      canvas: { width, height, durationMs, fps: request.fps },
      loop,
      intensity,
      palette,
      look: request.style ?? null,
      limits: SURFACE_GENERATION_LIMITS,
      prebuiltSurfaces: SURFACE_BLOCKS.map((block) => ({
        id: block.id,
        title: block.title,
        description: block.description,
        tags: block.tags,
      })),
      supportedElements: [
        'g',
        'path',
        'rect',
        'circle',
        'ellipse',
        'line',
        'polygon',
        'polyline',
        'text',
      ],
      supportedDefs: [
        'linearGradient',
        'radialGradient',
        'filter (feGaussianBlur, feTurbulence, feColorMatrix, feOffset, feComposite, feMerge, feFlood, feBlend, feMorphology, feDropShadow, …)',
      ],
    }),
  });

  const proposeSurface = tool({
    description:
      'Stage a generated surface. It parses and validates the SVG with the real Trace importer, attaches the tracks through the ops engine, checks budgets and lints the result. It stores a proposal only; it never writes to the project. If validation fails, the error names the exact problem: repair the SVG or tracks and call again.',
    inputSchema: proposalSchema,
    execute: async (candidate) => {
      const compiled = compileSurfaceProposal(
        { ...request, width, height, durationMs, loop },
        candidate as SurfaceProposalCandidate,
      );
      proposal = compiled;
      visualReview = undefined;
      return {
        staged: true,
        summary: compiled.summary,
        elementCount: Object.keys(compiled.fragment.elements).length,
        trackCount: compiled.tracks.length,
        warningCount: compiled.warnings.length,
        warnings: compiled.warnings.slice(0, 8),
        hint: 'Call reviewRenderedSurface to inspect real frames before finishing.',
      };
    },
  });

  const reviewRenderedSurface = tool({
    description:
      'Render three moments of the staged surface and ask a vision-capable model to review composition, depth, clipping, banding, palette match and brief alignment. Use after proposeSurface and before finishing.',
    inputSchema: z.object({}),
    execute: async (_input, { abortSignal }) => {
      if (!proposal) {
        return { reviewed: false, error: 'Stage a surface with proposeSurface first.' };
      }
      const staged = proposal;
      const sampleTimes = [
        0,
        Math.round(staged.durationMs * 0.38),
        Math.round(staged.durationMs * 0.72),
      ];
      try {
        const frames = await Promise.all(
          sampleTimes.map(async (timeMs) => {
            const svg = renderableMarkup(staged, timeMs);
            const png = await sharp(Buffer.from(svg))
              .resize({ width: 960, height: 960, fit: 'inside' })
              .png()
              .toBuffer();
            return { timeMs, png };
          }),
        );
        const review = await generateText({
          model: model as any,
          abortSignal,
          system:
            'You are reviewing rendered NovaTrace background surfaces. Judge them as a motion designer: composition, depth, focal hierarchy, colour balance, unwanted banding, clipping at the frame edge, and whether the surface supports foreground content without fighting it. Return concise JSON with fields "ok" (boolean) and "notes" (array of short, actionable strings). Do not request changes outside the described surface.',
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'text' as const,
                  text: `Brief: ${request.prompt}\nCanvas: ${width}×${height}, ${durationMs} ms, ${loop ? 'seamless loop' : 'one-shot'}, intensity ${intensity}%. Palette: ${JSON.stringify(palette)}. Rendered moments: ${sampleTimes.join(', ')} ms.`,
                },
                ...frames.flatMap(({ timeMs, png }) => [
                  { type: 'text' as const, text: `Frame at ${timeMs} ms` },
                  { type: 'image' as const, image: new Uint8Array(png) },
                ]),
              ],
            },
          ],
        });
        visualReview = {
          performed: true,
          notes: review.text.slice(0, 1200),
        };
        if (proposal === staged) proposal = { ...staged, visualReview };
        return {
          reviewed: true,
          notes: visualReview.notes,
          sampleTimes,
        };
      } catch (cause) {
        if (abortSignal?.aborted) throw cause;
        visualReview = {
          performed: false,
          notes:
            cause instanceof Error
              ? cause.message.slice(0, 400)
              : String(cause).slice(0, 400),
        };
        if (proposal === staged) proposal = { ...staged, visualReview };
        return {
          reviewed: false,
          visualModelUnavailable: true,
          reason: visualReview.notes,
          svgFramesRendered: true,
        };
      }
    },
  });

  const agent = new ToolLoopAgent({
    model: model as any,
    instructions: `You are NovaTrace's Surface Specialist. You design animated backgrounds and graphic surfaces that become ordinary, editable Trace layers.

## Output contract
- Call inspectBrief first.
- Call proposeSurface with STATIC SVG plus an editable tracks array. This is the only way to stage work.
- Never emit SMIL (<animate>, <animateTransform>, <set>), CSS @keyframes, raster <image>, clip-path, mask, marker or foreignObject. They do not survive import; the compiler will reject the proposal.
- Call reviewRenderedSurface after a successful proposal, repair anything it names, and only then finish.

## SVG rules
- The root must be <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">.
- Every visible thing must be vector: g, path, rect, circle, ellipse, line, polygon, polyline, text.
- Start with a full-bleed base rect (x=0 y=0 width=${width} height=${height}). Use gradients and low-opacity glows for depth.
- Put gradients and filters in <defs>. Reference them with fill="url(#id)" / filter="url(#id)".
- Give every animated layer a short, unique, stable id. Tracks target those exact ids after import.
- Prefer absolute geometry. transforms (translate, rotate, scale, matrix) are baked correctly by the importer.
- Presentation attributes only (fill, stroke, opacity, stroke-width…); do not rely on CSS selectors or inline animation.
- Keep the SVG under ${SURFACE_GENERATION_LIMITS.maxSvgBytes} bytes and the result under ${SURFACE_GENERATION_LIMITS.maxElements} elements.

## Track rules
- Allowed properties: ${ANIMATABLE_PROPERTIES.join(', ')}.
- Use 2–${SURFACE_GENERATION_LIMITS.maxKeyframesPerTrack} keyframes per track, times inside 0–${durationMs} ms, strictly ascending.
- Numeric properties need finite numbers; fill, stroke, strokeDasharray and d need strings. Opacity 0–1; scale 0.05–6; rotation within ±720.
- ${loop ? 'This surface must loop seamlessly: every continuous track (x, y, rotation, scale, opacity, fill, stroke, strokeWidth) MUST start and end on the same value.' : 'This surface is one-shot; tracks may end on a different value.'}
- Prefer 4–16 tracks on 3–8 focal layers. Ambient motion only: no high-frequency jitter. Movement should read as slow drift, breathing or orbit over the full ${durationMs} ms.
- Stroke-dash tracks only on layers that actually have a stroke.

## Design direction
- Brief: ${request.prompt}
- Palette: base ${palette.base}, deep ${palette.deep}, accent ${palette.accent}, secondary ${palette.secondary}.
- Intensity ${intensity}% (0 = barely moving, 100 = energetic).
- Build depth: dark base, 2–4 blurred light pools or gradients, a vignette, then structure (grid, waves, contours, particles) and optional texture grain.
- One focal area; leave the centre calm if the surface will sit behind text. Respect a comfortable safe area.
- Avoid pure black; use the deep palette colour. Avoid flat single-colour fills; gradients and atmosphere carry quality.
- If the user asks for a style that matches a prebuilt surface, you may use its structure as a reference, but emit your own SVG and tracks.`,
    tools: { inspectBrief, proposeSurface, reviewRenderedSurface },
    stopWhen: [isStepCount(14)],
  });

  return {
    agent,
    getProposal: () => {
      if (!proposal) return null;
      const merged = visualReview ? { ...proposal, visualReview } : proposal;
      return merged;
    },
  };
}

export async function runSurfaceAgent(
  request: SurfaceGenerationRequest,
  abortSignal?: AbortSignal,
  target?: ModelTarget,
): Promise<SurfaceGenerationProposal> {
  const { agent, getProposal } = createSurfaceAgent(request, target);
  const result = await agent.generate({
    prompt: `Design and validate an animated surface for this brief: ${request.prompt}`,
    abortSignal,
  });
  const proposal = getProposal();
  if (!proposal) {
    throw new Error(
      result.text ||
        'The Surface Specialist finished without a valid proposal. Try a more specific brief.',
    );
  }
  return proposal;
}

/**
 * Copilot subagent: generate a surface and insert the validated fragment at the
 * back of the stack. Additive composition is undoable, so no approval step.
 */
export function createSurfaceGenerationSubagentTool(opts: {
  target?: ModelTarget;
  broadcastChanged?: () => void;
} = {}) {
  return tool({
    description:
      'Generate a bespoke animated background surface from a brief and insert it at the back of the stack. The specialist emits SVG plus editable tracks, validates the parsed fragment, lints it, reviews rendered frames, and only then applies it. Use for custom backdrops that no prebuilt block covers.',
    inputSchema: z.object({
      projectId: z.string().min(1),
      prompt: z.string().min(1).max(800).describe('The surface brief in the user’s words.'),
      intensity: z.number().int().min(0).max(100).default(55),
      loop: z.boolean().default(true),
      palette: z
        .object({
          base: z.string().optional(),
          deep: z.string().optional(),
          accent: z.string().optional(),
          secondary: z.string().optional(),
        })
        .optional(),
    }),
    execute: async ({ projectId, prompt, intensity, loop, palette }, { abortSignal }) => {
      try {
        const store = getTraceProjectStore();
        const opened = await store.openProject(projectId);
        const request: SurfaceGenerationRequest = {
          width: opened.project.width,
          height: opened.project.height,
          durationMs: opened.project.durationMs,
          fps: opened.project.fps,
          projectName: opened.project.name,
          prompt,
          intensity,
          loop,
          ...(opened.project.style ? { style: opened.project.style } : {}),
          ...(palette ? { palette } : {}),
        };
        const proposal = await runSurfaceAgent(
          request,
          abortSignal,
          opts.target,
        );
        const activeScene =
          opened.project.storyboard?.activeSceneId ??
          opened.project.storyboard?.scenes[0]?.id ??
          null;
        const suffix = `surface-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;
        const result = applyOps(opened.project, [
          {
            type: 'insertFragment',
            fragment: proposal.fragment,
            sceneId: activeScene,
            position: 'back',
            suffix,
          },
        ]);
        if (!result.ok) {
          return {
            success: false,
            error:
              result.diagnostics
                .filter((entry) => entry.severity === 'error')
                .map((entry) => entry.message)
                .join('; ') || 'Surface insertion failed.',
          };
        }
        await store.saveProject(projectId, result.project, {
          expectedRevision: opened.revision,
        });
        opts.broadcastChanged?.();
        return {
          success: true,
          summary: proposal.summary,
          rootElementId: result.diff.added[0] ?? null,
          addedLayerCount: result.diff.added.length,
          elementCount: Object.keys(proposal.fragment.elements).length,
          trackCount: proposal.tracks.length,
          warningCount: proposal.warnings.length,
          warnings: proposal.warnings.slice(0, 8),
          visualReview: proposal.visualReview ?? { performed: false, notes: 'Visual review was not completed.' },
          insertedAt: 'back',
          hint: 'The surface is ordinary layers now. Adjust colours, tracks and timing with the normal tools.',
        };
      } catch (cause) {
        return {
          success: false,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  });
}