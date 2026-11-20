/**
 * SVG Animation Specialist for NovaTrace.
 *
 * It receives a focused TraceProject snapshot and can inspect its vector tree,
 * stage editable tracks, and visually review rasterized frames. Its tools never
 * write to the project store; the caller decides when to apply the proposal.
 */

import { ToolLoopAgent, generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import sharp from 'sharp';

import type { TraceAnimationPlan, SvgAnimationProperty, SvgAnimationRequest } from '../../lib/trace/animation-plan';
import type { TraceElement, TraceProject } from '../../lib/trace/types';
import { applyOps } from '../../lib/trace/ops';
import type { TraceOp } from '../../lib/trace/ops/types';
import { staticSvgMarkup } from '../../lib/trace/serialize/svg-markup';
import { lintTraceProject } from '../../lib/trace/lint';
import { isPathMorphCompatible } from '../../lib/trace/path/model';
import { getTraceProjectStore } from '../trace/service.js';
import type { ModelTarget } from './fallback.js';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';

const ANIMATABLE_PROPERTIES = [
  'x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'fillOpacity',
  'fill', 'stroke', 'strokeWidth', 'strokeDashoffset', 'strokeDasharray', 'd',
  'width', 'height', 'rx',
] as const satisfies readonly SvgAnimationProperty[];
const EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] as const;
const MAX_TRACKS = 24;
const MAX_KEYFRAMES_PER_TRACK = 12;
const proposalSchema = z.object({
  summary: z.string().min(1).max(180),
  playback: z.enum(['once', 'loop']),
  durationMs: z.number().int().min(1),
  warnings: z.array(z.string().max(240)).max(5).optional(),
  tracks: z.array(z.object({
    elementId: z.string(),
    property: z.enum(ANIMATABLE_PROPERTIES),
    keyframes: z.array(z.object({
      timeMs: z.number().int().min(0),
      value: z.union([z.number(), z.string()]),
      easing: z.enum(EASINGS),
    })).min(2).max(MAX_KEYFRAMES_PER_TRACK),
  })).min(1).max(MAX_TRACKS),
});

const motionHint: Record<SvgAnimationRequest['motion'], string> = {
  custom: 'Choose the motion design that best matches the user direction.',
  flicker: 'Use irregular motion and opacity changes where the artwork supports them; favor flame parts when present.',
  sway: 'Use a restrained side-to-side rotation with complementary motion on nested parts when useful.',
  pulse: 'Use smooth breathing scale and opacity changes.',
  reveal: 'Use a clear, polished entrance or reveal appropriate to the artwork and playback mode.',
};

function getTargetIds(project: TraceProject, targetId: string): string[] {
  if (!project.elements[targetId]) throw new Error('The selected SVG layer is missing from the project snapshot.');
  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    const element = project.elements[id];
    if (!element) return;
    seen.add(id);
    ids.push(id);
    element.childrenIds?.forEach(visit);
  };
  visit(targetId);
  if (ids.length > 100) throw new Error(`The selected subtree contains ${ids.length} layers, above the current 100-layer planning limit. Select a smaller group to animate it reliably.`);
  return ids;
}

function stageTracks(project: TraceProject, plan: TraceAnimationPlan): TraceProject {
  const ops: TraceOp[] = plan.tracks.map((track) => ({
    type: 'setTrack',
    elementId: track.elementId,
    property: track.property,
    label: `${track.property} · SVG Animation`,
    keyframes: track.keyframes,
  }));
  const result = applyOps(project, ops);
  if (!result.ok) throw new Error(result.diagnostics.filter((entry) => entry.severity === 'error').map((entry) => entry.message).join('; ') || 'The animation preview could not be composed.');
  return result.project;
}

function validateProposal(
  request: SvgAnimationRequest,
  plan: TraceAnimationPlan,
  targetIds: Set<string>,
): void {
  const durationMs = plan.durationMs;
  const projectDurationMs = Math.max(1, Math.round(request.project.durationMs));
  if (durationMs > projectDurationMs) throw new Error(`Animation duration cannot exceed the project duration of ${projectDurationMs} ms.`);
  if (plan.playback === 'loop' && durationMs !== projectDurationMs) {
    throw new Error(`NovaTrace repeats the whole project timeline. A looping proposal must span its full ${projectDurationMs} ms duration.`);
  }
  if (plan.tracks.length > MAX_TRACKS) throw new Error(`Use no more than ${MAX_TRACKS} tracks.`);
  if (request.playback !== 'auto' && plan.playback !== request.playback) {
    throw new Error(`The requested playback mode is ${request.playback}; the proposal used ${plan.playback}.`);
  }
  const uniqueTracks = new Set<string>();
  for (const track of plan.tracks) {
    if (!targetIds.has(track.elementId)) throw new Error('The plan referenced a layer outside the selected SVG.');
    const uniqueKey = `${track.elementId}:${track.property}`;
    if (uniqueTracks.has(uniqueKey)) throw new Error('The plan repeated a property track.');
    uniqueTracks.add(uniqueKey);
    if (track.keyframes.length > MAX_KEYFRAMES_PER_TRACK) {
      throw new Error(`Each track may contain at most ${MAX_KEYFRAMES_PER_TRACK} keyframes.`);
    }
    if (track.keyframes[0].timeMs !== 0 || track.keyframes.at(-1)?.timeMs !== durationMs) {
      throw new Error('Every track must start at 0 ms and finish at the selected duration.');
    }
    if (track.keyframes.some((frame, index) => frame.timeMs > durationMs || (index > 0 && frame.timeMs <= track.keyframes[index - 1].timeMs))) {
      throw new Error('Keyframes must be ordered and stay inside the selected duration.');
    }
    const element = request.project.elements[track.elementId]!;
    const values = track.keyframes.map((frame) => frame.value);
    if (plan.playback === 'loop' && values[0] !== values.at(-1)) {
      throw new Error('Looping tracks must have matching start and end values. Choose one-shot playback for an intro or outro.');
    }
    if (track.property === 'fill' || track.property === 'stroke' || track.property === 'd') {
      if (values.some((value) => typeof value !== 'string')) throw new Error(`${track.property} keyframes must use string values.`);
      if (track.property === 'd') {
        if (element.type !== 'path') throw new Error('The d property can only animate path elements.');
        if (values.some((value) => (value as string).length > 30_000)) throw new Error('Path morph keyframes may not exceed 30000 characters.');
        if (values[0] !== element.attributes.d) throw new Error('A path morph must begin with the original path data to avoid a visual jump.');
        for (let index = 1; index < values.length; index += 1) {
          if (!isPathMorphCompatible(values[index - 1] as string, values[index] as string)) {
            throw new Error('Path morph keyframes must share subpath and anchor counts; arc commands are not supported for morphing yet.');
          }
        }
      }
    } else if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`${track.property} keyframes must use finite numeric values.`);
    }
    const numbers = values.filter((value): value is number => typeof value === 'number');
    if ((track.property === 'opacity' || track.property === 'fillOpacity') && numbers.some((value) => value < 0 || value > 1)) {
      throw new Error('Opacity keyframes must stay between 0 and 1.');
    }
    if ((track.property === 'scaleX' || track.property === 'scaleY') && numbers.some((value) => value < 0.1 || value > 4)) {
      throw new Error('Scale keyframes must stay between 0.1 and 4.');
    }
    if (track.property === 'rotation' && numbers.some((value) => Math.abs(value) > 360)) {
      throw new Error('Rotation keyframes must stay within ±360 degrees.');
    }
    if ((track.property === 'strokeWidth' || track.property === 'width' || track.property === 'height' || track.property === 'rx') && numbers.some((value) => value < 0 || value > 100_000)) {
      throw new Error(`${track.property} keyframes must stay between 0 and 100000.`);
    }
    if ((track.property === 'strokeDasharray' && numbers.some((value) => value < 0 || value > 100_000)) || (track.property === 'strokeDashoffset' && numbers.some((value) => Math.abs(value) > 100_000))) {
      throw new Error('Stroke dash keyframes must stay within ±100000, and dash arrays cannot be negative.');
    }
    if (track.property === 'strokeDashoffset' && !['path', 'line', 'polyline', 'polygon'].includes(element.type)) {
      throw new Error('strokeDashoffset can only animate stroked vector shapes.');
    }
    if (track.property === 'strokeDasharray' && !['path', 'line', 'polyline', 'polygon'].includes(element.type)) {
      throw new Error('strokeDasharray can only animate stroked vector shapes.');
    }
  }
}

function inspectElement(element: TraceElement) {
  const attributes: Record<string, unknown> = {};
  let pathDataTruncated = false;
  for (const [key, value] of Object.entries(element.attributes ?? {})) {
    if (typeof value === 'string') {
      const maxLength = key === 'd' ? 30_000 : 600;
      attributes[key] = value.slice(0, maxLength);
      if (key === 'd' && value.length > maxLength) pathDataTruncated = true;
    }
    else if (typeof value === 'number' || typeof value === 'boolean') attributes[key] = value;
  }
  return {
    id: element.id,
    name: element.name,
    type: element.type,
    parentId: element.parentId ?? null,
    childrenIds: element.childrenIds ?? [],
    attributes,
    pathDataTruncated,
    tracks: (element.tracks ?? []).map((track) => ({ property: track.property, keyframes: track.keyframes })),
  };
}

export function createSvgAnimationAgent(request: SvgAnimationRequest, target?: ModelTarget) {
  if ((request.prompt?.length ?? 0) > 500) throw new Error('Motion directions must be 500 characters or fewer.');
  const settings = getSettings();
  const model = resolveModel(target?.providerId ?? settings.activeProvider, target?.modelId ?? settings.activeModel);
  const durationMs = Math.min(Math.max(1, Math.round(request.durationMs)), Math.max(1, Math.round(request.project.durationMs)));
  const targetIds = new Set(getTargetIds(request.project, request.targetElementId));
  let proposal: TraceAnimationPlan | null = null;
  let visualReview: TraceAnimationPlan['visualReview'] = undefined;
  let inspectionWarning: string | undefined;

  const inspectSelectedSvg = tool({
    description: 'Read the selected SVG layer and its child layers from the NovaTrace snapshot. Returns the vector geometry, paint attributes, existing tracks, canvas timing, and a rendered SVG frame. Read this before planning.',
    inputSchema: z.object({}),
    execute: async (_input, { abortSignal }) => {
      let detailBudget = 42_000;
      const elements = [...targetIds].map((id) => {
        const element = inspectElement(request.project.elements[id]!);
        const serialized = JSON.stringify(element);
        if (serialized.length <= detailBudget) {
          detailBudget -= serialized.length;
          return element;
        }
        const attributes: Record<string, unknown> = {};
        let remaining = Math.max(0, detailBudget - 1000);
        for (const [key, value] of Object.entries(element.attributes)) {
          if (remaining <= 0) break;
          const maxLength = Math.min(remaining, key === 'd' ? 6000 : 500);
          attributes[key] = typeof value === 'string' ? value.slice(0, maxLength) : value;
          remaining -= JSON.stringify(attributes[key]).length + key.length + 8;
        }
        const truncated = {
          ...element,
          attributes,
          tracks: element.tracks.slice(0, 2).map((track) => ({
            ...track,
            keyframes: track.keyframes.slice(0, 4),
          })),
          pathDataTruncated: typeof element.attributes.d === 'string' && attributes.d !== element.attributes.d,
          geometryTruncated: true,
        };
        detailBudget = 0;
        return truncated;
      });
      const markup = staticSvgMarkup(request.project, 0, { size: true });
      let visualDescription: string | null = null;
      let visualInspectionWarning: string | null = null;
      if (Buffer.byteLength(markup, 'utf8') <= 2_000_000) {
        try {
          const png = await sharp(Buffer.from(markup))
            .resize({ width: 900, height: 900, fit: 'inside' })
            .png()
            .toBuffer();
          const visual = await generateText({
            model: model as any,
            abortSignal,
            system: 'You are visually inspecting an SVG logo before animation. Describe the visible silhouette, distinct parts by their NovaTrace element ids when possible, dominant colors, and details that should remain intact. Do not invent semantic names for paths you cannot identify. Keep the response under 160 words.',
            prompt: [{
              role: 'user',
              content: [
                { type: 'text' as const, text: `Selected SVG element id: ${request.targetElementId}.` },
                { type: 'image' as const, image: new Uint8Array(png) },
              ],
            }],
          });
          visualDescription = visual.text.slice(0, 1200);
        } catch (cause) {
          if (abortSignal?.aborted) throw cause;
          visualInspectionWarning = cause instanceof Error ? cause.message.slice(0, 300) : String(cause).slice(0, 300);
        }
      } else {
        visualInspectionWarning = 'The focused SVG exceeds the 2 MB visual-inspection limit; use its listed layer data and avoid guessing path semantics.';
      }
      const markupTruncated = markup.length > 30_000;
      const inspectionWarnings = [
        visualInspectionWarning,
        detailBudget === 0 ? 'Some layer geometry and existing keyframes were truncated to fit the inspection context.' : null,
        markupTruncated ? 'The textual SVG frame was truncated; use the raster inspection and element details.' : null,
      ].filter((warning): warning is string => Boolean(warning));
      inspectionWarning = inspectionWarnings.length ? inspectionWarnings.join(' ') : undefined;
      return {
        selectedElementId: request.targetElementId,
        canvas: { width: request.project.width, height: request.project.height, durationMs, fps: request.project.fps },
        elementCount: elements.length,
        elements,
        currentFrameSvg: markup.slice(0, 30_000),
        svgWasTruncated: markupTruncated,
        geometryDetailsTruncated: detailBudget === 0,
        visualDescription,
        visualInspectionWarning: inspectionWarning ?? null,
      };
    },
  });

  const proposeAnimation = tool({
    description: 'Stage an editable one-shot or looping animation plan for the selected SVG. Choose an explicit durationMs, which may follow the user request instead of the preferred duration. This tool validates and stores a proposal only; it never changes the project.',
    inputSchema: proposalSchema,
    execute: async (candidate) => {
      const plan = candidate as TraceAnimationPlan;
      validateProposal(request, plan, targetIds);
      proposal = plan;
      visualReview = undefined;
      return { staged: true, summary: plan.summary, tracks: plan.tracks.length, elements: [...new Set(plan.tracks.map((track) => track.elementId))] };
    },
  });

  const reviewProposal = async (abortSignal?: AbortSignal) => {
    if (!proposal) return { reviewed: false, error: 'Stage a plan with proposeAnimation first.' };
    const durationMs = proposal.durationMs;
    const stagedProject = stageTracks(request.project, proposal);
    const lint = lintTraceProject(stagedProject);
    try {
      const candidateTimes = [...new Set([
        0,
        Math.floor(durationMs / 2),
        ...proposal.tracks.flatMap((track) => track.keyframes.map((frame) => frame.timeMs)),
        durationMs,
      ])].sort((a, b) => a - b);
      const sampleTimes = candidateTimes.length <= 6
        ? candidateTimes
        : Array.from({ length: 6 }, (_, index) => candidateTimes[Math.round(index * (candidateTimes.length - 1) / 5)]);
      const baseSvg = staticSvgMarkup(request.project, 0, { size: true });
      const basePng = await sharp(Buffer.from(baseSvg)).resize({ width: 900, height: 900, fit: 'inside' }).png().toBuffer();
      const frames = await Promise.all(sampleTimes.map(async (timeMs) => {
        const svg = staticSvgMarkup(stagedProject, timeMs, { size: true });
        const png = await sharp(Buffer.from(svg)).resize({ width: 900, height: 900, fit: 'inside' }).png().toBuffer();
        return { timeMs, png };
      }));
      const review = await generateText({
        model: model as any,
        abortSignal,
        system: 'You are reviewing rendered NovaTrace SVG animation frames. Inspect the supplied images for readability, preservation of the original silhouette, excessive movement, and whether the first and last frames appear continuous. Return concise JSON with fields "ok" (boolean) and "notes" (array of short strings). Do not ask for source changes outside editable animation tracks.',
        prompt: [{
          role: 'user',
          content: [
            { type: 'text' as const, text: `Compare the original artwork to this ${request.playback} animation. User direction: ${request.prompt?.trim() || request.motion}. Motion preset hint: ${request.motion}. Intensity: ${request.intensity}%. Check every supplied moment for intent match, recognizable artwork, clipping, continuity, and whether the motion is one-shot or looping as requested. Rendered frame times: ${sampleTimes.join(', ')} ms.` },
            { type: 'text' as const, text: 'Original artwork before animation:' },
            { type: 'image' as const, image: new Uint8Array(basePng) },
            ...frames.flatMap(({ timeMs, png }) => [
              { type: 'text' as const, text: `Rendered frame at ${timeMs} ms` },
              { type: 'image' as const, image: new Uint8Array(png) },
            ]),
          ],
        }],
      });
      visualReview = { performed: true, notes: review.text.slice(0, 1200) };
      return {
        reviewed: true,
        review: review.text.slice(0, 1600),
        sampleTimes,
        lint: { ok: lint.ok, errorCount: lint.errorCount, warningCount: lint.warningCount, diagnostics: lint.diagnostics.slice(0, 8).map((entry) => entry.message) },
      };
    } catch (cause) {
      if (abortSignal?.aborted) throw cause;
      // The generated frames remain available in the add-on preview even
      // when the selected text model cannot accept image input.
      visualReview = {
        performed: false,
        notes: cause instanceof Error ? cause.message.slice(0, 400) : String(cause).slice(0, 400),
      };
      return {
        reviewed: false,
        visualModelUnavailable: true,
        reason: cause instanceof Error ? cause.message.slice(0, 400) : String(cause).slice(0, 400),
        svgFramesRendered: true,
        lint: { ok: lint.ok, errorCount: lint.errorCount, warningCount: lint.warningCount, diagnostics: lint.diagnostics.slice(0, 8).map((entry) => entry.message) },
      };
    }
  };

  const reviewRenderedMotion = tool({
    description: 'Render the original artwork and representative staged animation keyframes, then ask a vision-capable model to check request match, visual clarity, shape preservation, clipping, and continuity. Use after proposeAnimation and before finishing.',
    inputSchema: z.object({}),
    execute: async (_input, { abortSignal }) => reviewProposal(abortSignal),
  });

  const preferredPlayback = request.playback === 'auto'
    ? `Infer once versus loop from the user's wording: intro/stinger/reveal/outro means once; continuous/loop/repeat means loop.`
    : `Use ${request.playback} playback as requested.`;
  const presetHint = request.motion === 'custom'
    ? 'No preset is selected.'
    : `The selected ${request.motion} preset is a soft hint only.`;
  const agent = new ToolLoopAgent({
    model: model as any,
    instructions: `You are NovaTrace's SVG Animation Specialist. Your job is to understand the selected vector artwork and fulfill the user's requested motion with a polished, editable animation. The user's direction is authoritative; a preset is never allowed to override it.\n\nUse inspectSelectedSvg first. Use its visual description and element ids rather than guessing what each path represents. If visual inspection is unavailable or geometry is truncated, state that limitation and do not invent path semantics. Only animate the selected id or descendants. Preserve recognizable artwork unless the user explicitly requests a transformation.\n\nUser direction: ${request.prompt?.trim() || 'Design a polished animation appropriate to the selected SVG.'}\nPreset hint: ${request.motion}. ${presetHint} ${motionHint[request.motion]}\nPlayback preference: ${preferredPlayback}\nPreferred duration: ${durationMs} ms; this is a starting point. Follow an explicit duration in the user's direction, within the project duration of ${Math.round(request.project.durationMs)} ms. Intensity preference: ${Math.max(0, Math.min(100, request.intensity))}%; the user's explicit description takes priority.\n\nThe portable properties available to this specialist are: ${ANIMATABLE_PROPERTIES.join(', ')}. Path morphing is supported when each keyframe keeps the same subpath and anchor counts; SVG arc commands are not supported by the current morph interpolator. If the requested morph cannot meet those constraints or needs another unsupported capability, explain that and offer a clearly labeled alternative instead of claiming the exact effect was created. Do not silently substitute a different effect.\n\nUse proposeAnimation to stage a plan. It accepts up to ${MAX_TRACKS} tracks with 2–${MAX_KEYFRAMES_PER_TRACK} ordered keyframes each. Choose a duration up to the project duration and end every track at that plan duration. A loop must span the full ${Math.round(request.project.durationMs)} ms project timeline because playback loops the whole project; if the user's preferred loop period differs, mention that limitation in warnings. Looping tracks must have matching endpoint values; one-shot tracks may end at a different value. Keep opacity in 0–1, scale in 0.1–4, rotation within ±360 degrees, and respect the property-specific limits reported by tool errors. Use color strings for fill and stroke. For d tracks, keep every frame compatible with the original path topology and begin with the exact original d value.\n\nAfter proposing, call reviewRenderedMotion. It compares the original artwork and up to six animation frames. If it identifies a mismatch, clipped art, or broken continuity, revise the tracks and review again. Treat tool validation errors as actionable: correct the named property or frame and retry within the step budget. The tool stages a proposal only; it never modifies the project. Finish with a concise summary, playback mode, duration, and any limitations or review failure.`,
    tools: { inspectSelectedSvg, proposeAnimation, reviewRenderedMotion },
    stopWhen: [isStepCount(14)],
  });

  return {
    agent,
    reviewProposal,
    getProposal: () => {
      if (!proposal) return null;
      const warnings = [...new Set([...(proposal.warnings ?? []), ...(inspectionWarning ? [inspectionWarning] : [])])];
      return {
        ...proposal,
        ...(warnings.length ? { warnings } : {}),
        ...(visualReview ? { visualReview } : {}),
      };
    },
  };
}

export async function runSvgAnimationAgent(
  request: SvgAnimationRequest,
  abortSignal?: AbortSignal,
  target?: ModelTarget,
): Promise<TraceAnimationPlan> {
  const { agent, getProposal, reviewProposal } = createSvgAnimationAgent(request, target);
  const result = await agent.generate({
    prompt: `Create and visually review the requested animation for the selected SVG layer. Preferred duration: ${request.durationMs} ms.`,
    abortSignal,
  });
  let plan = getProposal();
  if (!plan) throw new Error(result.text || 'The SVG specialist finished without proposing animation tracks. Please try again.');
  if (!plan.visualReview) {
    await reviewProposal(abortSignal);
    plan = getProposal() ?? plan;
  }
  return plan;
}

function focusedProject(project: TraceProject, targetId: string): TraceProject {
  const target = project.elements[targetId];
  if (!target) throw new Error(`SVG layer "${targetId}" was not found in the project.`);
  const ancestors: string[] = [];
  const ancestorSet = new Set<string>();
  let cursor: TraceElement | undefined = target;
  while (cursor && !ancestorSet.has(cursor.id)) {
    ancestorSet.add(cursor.id);
    ancestors.push(cursor.id);
    cursor = cursor.parentId ? project.elements[cursor.parentId] : undefined;
  }
  const included = new Set(ancestors);
  const visitChildren = (id: string) => {
    for (const childId of project.elements[id]?.childrenIds ?? []) {
      if (included.has(childId) || !project.elements[childId]) continue;
      included.add(childId);
      visitChildren(childId);
    }
  };
  visitChildren(targetId);
  const elements: TraceProject['elements'] = {};
  for (const id of included) {
    const element = project.elements[id];
    if (!element) continue;
    const ancestorIndex = ancestors.indexOf(id);
    elements[id] = {
      ...element,
      childrenIds: ancestorIndex > 0
        ? [ancestors[ancestorIndex - 1]]
        : (element.childrenIds ?? []).filter((childId) => included.has(childId)),
    };
  }
  return {
    ...project,
    elements,
    rootElementIds: [ancestors[ancestors.length - 1] ?? targetId],
  };
}

/**
 * Delegate detailed SVG animation work from Trace Copilot. The specialist
 * returns a scoped proposal; the parent applies it with the normal setTracks
 * tool after inspecting the proposal.
 */
export function createSvgAnimationSubagentTool(opts: { target?: ModelTarget } = {}) {
  return tool({
    description:
      'Delegate animation of an imported SVG or layered vector asset to NovaTrace’s SVG Animation Specialist. It visually inspects the selected asset, stages editable one-shot or looping motion tracks, and reviews rendered frames. It returns a proposal and any existing-track conflicts; it does not write changes.',
    inputSchema: z.object({
      projectId: z.string().min(1),
      elementId: z.string().min(1).describe('Selected SVG layer id in the NovaTrace Explorer.'),
      motion: z.enum(['custom', 'flicker', 'sway', 'pulse', 'reveal']).default('custom'),
      playback: z.enum(['auto', 'once', 'loop']).default('auto'),
      durationMs: z.number().int().min(1).default(3000),
      intensity: z.number().int().min(0).max(100).default(55),
      prompt: z.string().max(500).optional(),
    }),
    execute: async ({ projectId, elementId, motion, playback, durationMs, intensity, prompt }, { abortSignal }) => {
      try {
        const opened = await getTraceProjectStore().openProject(projectId);
        const focused = focusedProject(opened.project, elementId);
        const request: SvgAnimationRequest = { project: focused, targetElementId: elementId, motion, playback, durationMs, intensity, prompt };
        const plan = await runSvgAnimationAgent(request, abortSignal, opts.target);
        const conflicts = plan.tracks.flatMap((track) => {
          const element = opened.project.elements[track.elementId];
          const existing = element?.tracks.find((entry) => entry.property === track.property);
          return existing ? [{ elementId: track.elementId, elementName: element.name, property: track.property, trackId: existing.id, trackLabel: existing.label }] : [];
        });
        return { success: true, summary: plan.summary, playback: plan.playback, durationMs: plan.durationMs, conflicts, warnings: plan.warnings ?? [], plan };
      } catch (cause) {
        return { success: false, error: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  });
}
