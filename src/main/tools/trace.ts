/**
 * tools/trace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * NovaTrace Copilot tools — verbs allowing an autonomous agent to create,
 * inspect, animate, and export 2D vector motion compositions.
 *
 * The copilot operates directly on TraceProject data via the ops engine.
 * All mutations flow through `applyOps` — the same atomic contract the editor
 * uses — so the copilot, the UI and IPC callers produce identical documents.
 *
 * Tools are read-only or write-local by default. Only `deleteElement` and
 * `deleteTrack` are destructive (gated for approval). Exporting is read-only
 * (generates output but does not mutate the project).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

import { applyOps } from '../../lib/trace/ops';
import type { TraceOp, TraceElementSpec } from '../../lib/trace/ops/types';
import type { TraceNarration, TraceProject, TraceStyle } from '../../lib/trace/types';
import {
  buildNarrationTimingOps,
  hasMeasuredDurations,
} from '../../lib/trace/narration-timing';
import { synthesizeNarrationLines } from '../trace/narration-service';
import { createBlankTraceProject } from '../../lib/trace/defaults';
import { lintTraceProject } from '../../lib/trace/lint';
import {
  CAMERA_LABELS,
  resolveCameraAtTime,
} from '../../lib/trace/runtime/camera';
import {
  describeBlockParameters,
  getBlock,
  instantiateBlock,
  searchBlocks,
  TRACE_BLOCKS,
} from '../../lib/trace/blocks';
import {
  applyLookToElements,
  getLook,
  listLooks,
  styleFonts,
  styleFromLook,
  styleMotion,
  stylePalette,
} from '../../lib/trace/look';
import {
  addReviewNote,
  reviewNoteSummary,
  sortReviewNotes,
  updateReviewNote,
} from '../../lib/trace/review';
import { createTraceQaTool } from './trace-qa-tool';
import { staticSvgMarkup } from '../../lib/trace/serialize/svg-markup';
import { getTraceProjectStore } from '../trace/service';
import { TraceProjectError } from '../trace/trace-project-store';
import {
  expandRecipe,
  type RecipeId,
} from '../../lib/trace/recipes';

// ── Helpers ──────────────────────────────────────────────────────────────────

let opCounter = 0;
const projectRevisions = new WeakMap<TraceProject, number>();
function nextId(prefix: string): string {
  opCounter += 1;
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Date.now().toString(36)}-${opCounter}-${random}`;
}

/** Resolve the active project from the store, or null. */
async function resolveProject(projectId?: string): Promise<TraceProject | null> {
  const store = getTraceProjectStore();
  if (projectId) {
    const result = await store.openProject(projectId);
    projectRevisions.set(result.project, result.revision)
    return result?.project ?? null;
  }
  return null;
}

/** Persist a project to the store. */
async function persistProject(
  projectId: string,
  project: TraceProject,
  basedOn: TraceProject,
): Promise<{ projectId: string; revision: number; saved: boolean }> {
  const store = getTraceProjectStore();
  const expectedRevision = projectRevisions.get(basedOn);
  try {
    const result = await store.saveProject(projectId, project, {
      ...(expectedRevision !== undefined ? { expectedRevision } : {}),
    });
    projectRevisions.set(project, result.revision)
    return {
      projectId,
      revision: result?.revision ?? 0,
      saved: true,
    };
  } catch (err) {
    if (
      err instanceof TraceProjectError &&
      err.code === 'TRACE_REVISION_CONFLICT'
    ) {
      // The user saved in the editor while the copilot was working. Keep their
      // copy (the store rejected ours) and tell every window — never retry
      // blindly, which would clobber the newer document.
      notifyTraceDrift({
        projectId,
        expectedRevision,
        message:
          'The project changed in the editor while the copilot was working. ' +
          'Your editor version was kept; the copilot changes were not saved. ' +
          'Re-run the request to apply them on top of your latest edits.',
      });
      throw new Error(
        'Revision conflict: the project changed in the editor while the copilot ' +
          'was working. Your editor version was kept. Re-run the request to apply ' +
          'the changes on top of the latest document.',
      );
    }
    throw err;
  }
}

/** Push a drift notice to every renderer window. Best-effort by design. */
function notifyTraceDrift(payload: {
  projectId: string;
  expectedRevision?: number;
  message: string;
}): void {
  try {
    const { BrowserWindow } = require('electron');
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('trace-copilot:drift', payload);
      }
    }
  } catch {
    // No window listening (headless/tests) — the thrown error still reaches the turn.
  }
}

/**
 * Read one copilot document (contract or capability map) from the app bundle,
 * falling back to the source tree in dev. Missing docs degrade to null so the
 * tool can report "not found" rather than failing the turn.
 */
async function readTraceDoc(fileName: string): Promise<string | null> {
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath
  const candidates = [
    // Packaged builds copy docs/systems through electron-builder's
    // extraResources, so it lives beside app.asar rather than inside it.
    ...(resourcesPath
      ? [path.join(resourcesPath, 'docs', 'systems', fileName)]
      : []),
    path.join(app.getAppPath(), 'docs', 'systems', fileName),
    path.join(process.cwd(), 'docs', 'systems', fileName),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf-8');
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function summarizeProject(project: TraceProject): Record<string, any> {
  const elements = Object.values(project.elements);
  const elementSummary = elements.map((el) => ({
    id: el.id,
    name: el.name,
    type: el.type,
    visible: el.visible,
    trackCount: el.tracks?.length ?? 0,
    parentId: el.parentId ?? null,
    childrenCount: el.childrenIds?.length ?? 0,
  }));

  return {
    name: project.name,
    width: project.width,
    height: project.height,
    durationMs: project.durationMs,
    fps: project.fps,
    elementCount: elements.length,
    rootElementCount: project.rootElementIds.length,
    elements: elementSummary,
    rootElementIds: project.rootElementIds,
    sceneCount: project.storyboard?.scenes.length ?? 0,
    gradientCount: Object.keys(project.gradients ?? {}).length,
    hasAudio: (project.audioTracks?.length ?? 0) > 0,
    narrationLineCount: project.narration?.lines.length ?? 0,
    camera: project.camera
      ? {
          x: project.camera.x,
          y: project.camera.y,
          zoom: project.camera.zoom,
          rotation: project.camera.rotation,
          tracks: project.camera.tracks?.length ?? 0,
        }
      : null,
    style: project.style
      ? {
          lookId: project.style.lookId ?? null,
          palette: stylePalette(project.style),
          fonts: styleFonts(project.style),
          motion: styleMotion(project.style),
        }
      : null,
    reviewNotes: reviewNoteSummary(project.reviewNotes),
  };
}

function summarizeLint(project: TraceProject): Record<string, any> {
  const result = lintTraceProject(project);
  return {
    ok: result.ok,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    diagnostics: result.diagnostics.slice(0, 20).map((d) => ({
      code: d.code,
      severity: d.severity,
      message: d.message,
      elementId: d.elementId,
    })),
  };
}

// ── Tool factory ─────────────────────────────────────────────────────────────

export interface CreateTraceToolsOptions {
  /** Broadcast trace:changed to renderer windows after mutations. */
  broadcastChanged?: () => void;
}

export function createTraceTools(opts: CreateTraceToolsOptions = {}) {
  const broadcast = () => {
    opts.broadcastChanged?.();
    try {
      const { BrowserWindow } = require('electron');
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('trace:changed');
      }
    } catch {
      // No window listening
    }
  };

  // ── Project management ─────────────────────────────────────────────────────

  const getProject = tool({
    description:
      'Get the current NovaTrace project: canvas size, duration, fps, element list with types and track counts, root element ids, scene count, and gradients. Use this first to understand what is already in the composition.',
    inputSchema: z.object({
      projectId: z
        .string()
        .describe('The trace project id to inspect.'),
    }),
    execute: async ({ projectId }) => {
      const project = await resolveProject(projectId);
      if (!project) {
        return { error: `Project "${projectId}" not found.` };
      }
      return summarizeProject(project);
    },
  });

  const createProject = tool({
    description:
      'Create a new NovaTrace project from scratch or from a template. Returns the project id and a summary. Use this when starting a new composition.',
    inputSchema: z.object({
      name: z.string().describe('Project name, e.g. "Sponsor Card — Qeda"'),
      templateId: z
        .enum([
          'blank',
          'nova-mark',
          'kinetic-type',
          'metrics',
          'lower-third',
          'sponsor-card',
          'lower-third-overlay',
        ])
        .optional()
        .describe('Template to instantiate. Omit for a blank canvas.'),
      width: z.number().optional().describe('Canvas width in px (default 1920)'),
      height: z.number().optional().describe('Canvas height in px (default 1080)'),
      durationMs: z.number().optional().describe('Duration in ms (default 6000)'),
      fps: z.number().optional().describe('Frame rate (default 60)'),
    }),
    execute: async ({ name, templateId, width, height, durationMs, fps }) => {
      const store = getTraceProjectStore();

      // Use the template system if specified
      const { instantiateCompositionTemplate } = await import(
        '../../lib/trace/templates/index.js'
      );
      const project = instantiateCompositionTemplate(templateId, {
        name,
        width,
        height,
        durationMs,
        fps,
      });

      const created = await store.createProject({ name, project });
      broadcast();
      return {
        projectId: created.id,
        ...summarizeProject({ ...project, name: created.name }),
      };
    },
  });

  const lintProject = tool({
    description:
      'Lint a NovaTrace project for errors (orphan elements, keyframe issues, bounds violations, broken references). Returns ok/error/warning counts and diagnostic details. Use this after making changes to verify quality.',
    inputSchema: z.object({
      projectId: z.string().describe('The trace project id to lint.'),
    }),
    execute: async ({ projectId }) => {
      const project = await resolveProject(projectId);
      if (!project) {
        return { error: `Project "${projectId}" not found.` };
      }
      return summarizeLint(project);
    },
  });

  // ── Element creation ───────────────────────────────────────────────────────

  const addElements = tool({
    description:
      'Add one or more elements to a NovaTrace project. Each element is a spec object with type, id (optional), name, position, and type-specific attributes. Elements are added as root-level unless parentId is specified. Returns the ids of created elements and a project summary.',
    inputSchema: z.object({
      projectId: z.string().describe('The trace project id.'),
      elements: z
        .array(
          z.object({
            type: z.enum([
              'text', 'rect', 'circle', 'ellipse', 'line',
              'polyline', 'polygon', 'path', 'image', 'use', 'group',
            ]),
            id: z.string().optional().describe('Element id (auto-generated if omitted)'),
            name: z.string().optional().describe('Layer name'),
            x: z.number().optional().describe('X position'),
            y: z.number().optional().describe('Y position'),
            parentId: z.string().optional().describe('Parent group id (omit for root)'),
            visible: z.boolean().optional(),
            // Text
            text: z.string().optional().describe('Text content (type=text)'),
            fontSize: z.number().optional(),
            fontWeight: z.union([z.number(), z.string()]).optional(),
            fontFamily: z.string().optional(),
            textAnchor: z.enum(['start', 'middle', 'end']).optional(),
            // Shapes
            width: z.number().optional(),
            height: z.number().optional(),
            radius: z.number().optional().describe('Circle radius (type=circle)'),
            rx: z.number().optional().describe('Corner radius (type=rect)'),
            points: z.string().optional().describe('Polyline/polygon points "x,y x,y ..."'),
            polygonSides: z.number().optional().describe('Regular polygon sides (type=polygon)'),
            starRatio: z.number().optional().describe('Star inner/outer ratio (type=polygon)'),
            // Path
            d: z.string().optional().describe('SVG path data (type=path)'),
            // Paint
            fill: z.string().optional().describe('Fill color (hex, rgb, rgba, url(#id), "none")'),
            stroke: z.string().optional().describe('Stroke color'),
            strokeWidth: z.number().optional(),
            strokeDasharray: z.string().optional(),
            opacity: z.number().optional(),
            // Image
            href: z.string().optional().describe('Image href/data-uri (type=image)'),
          }),
        )
        .describe('Elements to add.'),
    }),
    execute: async ({ projectId, elements }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = elements.map((el) => ({
        type: 'addElement' as const,
        element: el as TraceElementSpec,
      }));

      const result = applyOps(project, ops);
      if (!result.ok) {
        return {
          error: 'Failed to add elements.',
          diagnostics: result.diagnostics.filter((d) => d.severity === 'error'),
        };
      }

      const saved = await persistProject(projectId, result.project, project);
      broadcast();
      return {
        addedIds: result.diff.added,
        project: summarizeProject(result.project),
        lint: summarizeLint(result.project),
        saved: saved.saved,
      };
    },
  });

  // ── Element updates ───────────────────────────────────────────────────────

  const updateElements = tool({
    description:
      'Update attributes of one or more existing elements. Pass the element id and a patch object of attributes to merge. Set an attribute to null to delete it.',
    inputSchema: z.object({
      projectId: z.string(),
      updates: z.array(
        z.object({
          id: z.string().describe('Element id to update'),
          attributes: z
            .record(z.string(), z.any())
            .describe('Attribute patch — merged into existing attributes'),
          name: z.string().optional(),
          visible: z.boolean().optional(),
        }),
      ),
    }),
    execute: async ({ projectId, updates }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = updates.map((u) => ({
        type: 'updateElement' as const,
        id: u.id,
        attributes: u.attributes,
        ...(u.name !== undefined ? { name: u.name } : {}),
        ...(u.visible !== undefined ? { visible: u.visible } : {}),
      }));

      const result = applyOps(project, ops);
      if (!result.ok) {
        return {
          error: 'Failed to update elements.',
          diagnostics: result.diagnostics.filter((d) => d.severity === 'error'),
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        updatedIds: result.diff.updated,
        project: summarizeProject(result.project),
      };
    },
  });

  // ── Animation ──────────────────────────────────────────────────────────────

  const setTracks = tool({
    description:
      'Set or replace animation tracks on elements. Each track targets one animatable property and contains keyframes (time in ms, value, easing). This is how you animate elements — position, opacity, scale, rotation, colors, etc. Existing tracks for the same property are replaced.',
    inputSchema: z.object({
      projectId: z.string(),
      tracks: z.array(
        z.object({
          elementId: z.string().describe('Element to animate'),
          property: z
            .enum([
              'x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity',
              'fillOpacity', 'fill', 'stroke', 'strokeWidth', 'strokeDashoffset',
              'strokeDasharray', 'd', 'fontSize', 'letterSpacing', 'text', 'width', 'height', 'rx',
              'pathProgress', 'trimStart', 'trimEnd', 'trimOffset', 'filter',
            ])
            .describe('Property to animate'),
          label: z.string().optional().describe('Track label (defaults to property name)'),
          keyframes: z
            .array(
              z.object({
                timeMs: z.number().describe('Time in milliseconds from project start'),
                value: z
                  .union([z.number(), z.string()])
                  .describe('Value at this keyframe (number for most, color string for fill/stroke, text string for text)'),
                easing: z
                  .string()
                  .optional()
                  .describe('Easing type: linear, power2.out, ease-out, back.out, elastic.out, bounce.out, etc. Default: power2.out'),
              }),
            )
            .min(1)
            .describe('Keyframes for this track, ordered by time'),
        }),
      ),
    }),
    execute: async ({ projectId, tracks }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = tracks.map((t) => ({
        type: 'setTrack' as const,
        elementId: t.elementId,
        property: t.property as any,
        label: t.label ?? t.property,
        keyframes: t.keyframes.map((kf) => ({
          timeMs: kf.timeMs,
          value: kf.value,
          easing: kf.easing ?? 'power2.out',
        })),
      }));

      const result = applyOps(project, ops);
      if (!result.ok) {
        return {
          error: 'Failed to set tracks.',
          diagnostics: result.diagnostics.filter((d) => d.severity === 'error'),
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        updatedIds: result.diff.updated,
        project: summarizeProject(result.project),
      };
    },
  });

  const setTracePlaybackLooping = tool({
    description: 'Choose whether the active NovaTrace timeline repeats after it reaches its end. Use false for one-shot intros and stingers, true for continuous loops. This changes editor playback state, not project artwork.',
    inputSchema: z.object({
      projectId: z.string(),
      looping: z.boolean(),
    }),
    execute: async ({ projectId, looping }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };
      try {
        const { BrowserWindow } = require('electron');
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send('trace:playback-loop', { projectId, looping });
          }
        }
      } catch {
        return { error: 'The Trace editor is not available to update playback mode.' };
      }
      return { projectId, looping, mode: looping ? 'loop' : 'once' };
    },
  });

  // ── Canvas ─────────────────────────────────────────────────────────────────

  const setCanvas = tool({
    description:
      'Update the canvas dimensions, duration, or frame rate of a project.',
    inputSchema: z.object({
      projectId: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      durationMs: z.number().optional().describe('Total duration in ms'),
      fps: z.number().optional(),
    }),
    execute: async ({ projectId, width, height, durationMs, fps }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = [{
        type: 'setCanvas' as const,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(fps !== undefined ? { fps } : {}),
      }];

      const result = applyOps(project, ops);
      if (!result.ok) {
        return { error: 'Failed to update canvas.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return { project: summarizeProject(result.project) };
    },
  });

  // ── Grouping & hierarchy ────────────────────────────────────────────────────

  const groupElements = tool({
    description:
      'Group multiple elements under a new group. The group is created at the common parent of the selected elements.',
    inputSchema: z.object({
      projectId: z.string(),
      elementIds: z.array(z.string()).min(1).describe('Element ids to group'),
      name: z.string().optional().describe('Group name'),
      groupId: z.string().optional().describe('Group id (auto-generated if omitted)'),
    }),
    execute: async ({ projectId, elementIds, name, groupId }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = [{
        type: 'groupElements' as const,
        elementIds,
        ...(name ? { name } : {}),
        ...(groupId ? { groupId } : {}),
      }];

      const result = applyOps(project, ops);
      if (!result.ok) {
        return { error: 'Failed to group elements.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        addedIds: result.diff.added,
        project: summarizeProject(result.project),
      };
    },
  });

  // ── Deletion (destructive — gated) ─────────────────────────────────────────

  const deleteElements = tool({
    description:
      'Delete one or more elements (including their subtrees). This is irreversible — the user will be asked to approve.',
    inputSchema: z.object({
      projectId: z.string(),
      elementIds: z.array(z.string()).min(1).describe('Element ids to delete'),
    }),
    execute: async ({ projectId, elementIds }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = elementIds.map((id) => ({
        type: 'deleteElement' as const,
        id,
      }));

      const result = applyOps(project, ops);
      if (!result.ok) {
        return { error: 'Failed to delete elements.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        removedIds: result.diff.removed,
        project: summarizeProject(result.project),
      };
    },
  });

  // ── Defs / gradients ───────────────────────────────────────────────────────

  const setDefs = tool({
    description:
      'Set the SVG defs block (gradients, filters, patterns). This is a full replacement of the defs string. Use this to add gradients referenced by element fill/stroke via url(#id).',
    inputSchema: z.object({
      projectId: z.string(),
      defs: z.string().describe('SVG defs markup (e.g. <linearGradient ...>...</linearGradient>)'),
    }),
    execute: async ({ projectId, defs }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = [{ type: 'setDefs' as const, defs }];

      const result = applyOps(project, ops);
      if (!result.ok) {
        return { error: 'Failed to set defs.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return { project: summarizeProject(result.project) };
    },
  });

  // ── Recipes ────────────────────────────────────────────────────────────────

  const applyRecipe = tool({
    description:
      'Instantiate a pre-built recipe (lower-third, kinetic-text, progress-ring, bar-chart, counter) into the project. The recipe creates a group with animated child elements at the specified position. Returns the root element id.',
    inputSchema: z.object({
      projectId: z.string(),
      recipeId: z
        .enum(['lower-third', 'kinetic-text', 'progress-ring', 'bar-chart', 'counter'])
        .describe('Recipe to instantiate'),
      x: z.number().optional().describe('X position (default depends on recipe)'),
      y: z.number().optional().describe('Y position'),
      name: z.string().optional().describe('Root element name'),
      options: z
        .record(z.string(), z.any())
        .optional()
        .describe('Recipe-specific options (e.g. title, subtitle, text, fontSize, bars, progress)'),
    }),
    execute: async ({ projectId, recipeId, x, y, name, options }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = [{
        type: 'applyRecipe' as const,
        recipeId,
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(name ? { name } : {}),
        ...(options ? { options } : {}),
      }];

      const result = applyOps(project, ops);
      if (!result.ok) {
        return { error: 'Failed to apply recipe.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        rootId: result.recipeRootIds[0] ?? null,
        addedIds: result.diff.added,
        project: summarizeProject(result.project),
      };
    },
  });

  // ── Block registry ─────────────────────────────────────────────────────────

  const searchBlocksTool = tool({
    description:
      'Search the Trace block registry for insertable named visuals (title cards, lower thirds, quotes, bullet lists, counters, charts, callouts, device frames, logo end cards, background treatments). Call this BEFORE hand-building a named visual; blocks land as ordinary editable layers. Returns id, description, category, layer and the parameters each builder reads.',
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe('Free-text search, e.g. "lower third", "quote", "chart", "background".'),
      category: z
        .string()
        .optional()
        .describe('Optional category filter: Titles, Lower thirds, Data, Callouts, Social, Backgrounds.'),
      limit: z.number().min(1).max(30).optional().describe('Default 12.'),
    }),
    execute: ({ query, category, limit }) => {
      const blocks = searchBlocks(query ?? '', {
        ...(category ? { category } : {}),
        limit: limit ?? 12,
      });
      return {
        blocks: blocks.map((block) => ({
          id: block.id,
          title: block.title,
          description: block.description,
          category: block.category,
          tags: block.tags,
          layer: block.layer ?? 'foreground',
          parameters: describeBlockParameters(block),
        })),
        total: TRACE_BLOCKS.length,
      };
    },
  });

  const insertBlock = tool({
    description:
      'Insert a registry block into the active scene. The block becomes ordinary layers and tracks; adjust its copy, colour and timing afterwards with updateElements/setTracks. Returns the new root id and the applied options. Use searchBlocks first when unsure of the id or parameter names.',
    inputSchema: z.object({
      projectId: z.string(),
      blockId: z.string().describe('Registry id from searchBlocks, e.g. "title-card".'),
      options: z
        .record(z.string(), z.any())
        .optional()
        .describe('Block parameters, matching the fields searchBlocks reports.'),
      x: z.number().optional().describe('Optional placement override in canvas px.'),
      y: z.number().optional().describe('Optional placement override in canvas px.'),
      sceneId: z
        .string()
        .optional()
        .describe('Target scene; defaults to the active scene.'),
    }),
    execute: async ({ projectId, blockId, options, x, y, sceneId }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const block = getBlock(blockId);
      if (!block) {
        return {
          error: `Unknown block "${blockId}".`,
          available: TRACE_BLOCKS.map((entry) => entry.id),
        };
      }

      let instantiated;
      try {
        instantiated = instantiateBlock(
          blockId,
          {
            ...(options ?? {}),
            ...(x !== undefined ? { x } : {}),
            ...(y !== undefined ? { y } : {}),
          },
          {
            canvas: { width: project.width, height: project.height },
            ...(project.style ? { style: project.style } : {}),
          },
        );
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : String(error),
        };
      }

      const targetScene =
        sceneId ??
        project.storyboard?.activeSceneId ??
        project.storyboard?.scenes[0]?.id ??
        null;

      const result = applyOps(project, [
        {
          type: 'insertFragment',
          fragment: instantiated.fragment,
          sceneId: targetScene,
          position: block.layer === 'background' ? 'back' : 'front',
          suffix: nextId('block'),
        },
      ]);
      if (!result.ok) {
        return {
          error: 'Block insertion failed.',
          diagnostics: result.diagnostics.filter(
            (diagnostic) => diagnostic.severity === 'error',
          ),
          applied: result.applied,
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();

      return {
        ok: true,
        blockId,
        title: block.title,
        rootElementId: result.diff.added[0] ?? null,
        addedIds: result.diff.added,
        options: instantiated.options,
        applied: result.applied,
        lint: summarizeLint(result.project),
        hint: 'The block is ordinary layers now — adjust with updateElements / setTracks.',
      };
    },
  });

  // ── Look & style ───────────────────────────────────────────────────────────

  const listLooksTool = tool({
    description:
      'List the Trace look presets: palette, heading/body fonts and motion tokens (easing, duration, stagger). Use before choosing colours or easing, or when the user asks for a style. The active project look is reported by getProject.',
    inputSchema: z.object({}),
    execute: () => ({
      looks: listLooks().map((look) => ({
        id: look.id,
        label: look.label,
        description: look.description,
        palette: look.palette,
        fonts: look.fonts,
        motion: look.motion,
      })),
    }),
  });

  const setLook = tool({
    description:
      'Set or clear the project look: palette, fonts and motion tokens. Accepts a preset lookId or a custom style; style: null clears it. Existing layers are only restyled when applyToElements is true (role-matched fills/strokes and text fonts); applyBackground sets every scene background to the look background. Use listLooks first when no look is set.',
    inputSchema: z.object({
      projectId: z.string(),
      lookId: z.string().optional(),
      style: z
        .object({
          lookId: z.string().optional(),
          palette: z
            .object({
              background: z.string().optional(),
              surface: z.string().optional(),
              text: z.string().optional(),
              muted: z.string().optional(),
              accent: z.string().optional(),
              accentAlt: z.string().optional(),
            })
            .optional(),
          fonts: z
            .object({
              heading: z.string().optional(),
              body: z.string().optional(),
            })
            .optional(),
          motion: z
            .object({
              easing: z.string().optional(),
              durationMs: z.number().min(1).max(10000).optional(),
              staggerMs: z.number().min(0).max(2000).optional(),
            })
            .optional(),
        })
        .nullable()
        .optional()
        .describe('Custom tokens. Use lookId for a preset.'),
      applyToElements: z
        .boolean()
        .optional()
        .describe('Restyle role-matched existing layers and set text fonts. Default false.'),
      applyBackground: z
        .boolean()
        .optional()
        .describe('Set every scene background to the look background. Default false.'),
    }),
    execute: async ({
      projectId,
      lookId,
      style,
      applyToElements,
      applyBackground,
    }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      let nextStyle: TraceStyle | null = null;
      if (style === null) {
        nextStyle = null;
      } else if (style) {
        nextStyle = {
          ...(style as TraceStyle),
          ...(lookId ? { lookId } : {}),
        };
      } else if (lookId) {
        if (!getLook(lookId)) {
          return {
            error: `Unknown look "${lookId}".`,
            available: listLooks().map((look) => look.id),
          };
        }
        nextStyle = styleFromLook(lookId);
      }

      if (!nextStyle && style !== null) {
        return {
          error:
            'Provide lookId, a style object, or style: null to clear the look.',
        };
      }

      const ops: TraceOp[] = [{ type: 'setStyle', style: nextStyle }];
      let restyledElements = 0;
      let restyledScenes = 0;

      if (nextStyle && (applyToElements || applyBackground)) {
        const restyleOps = applyLookToElements(project, nextStyle, {
          background: applyBackground === true,
        });
        if (applyToElements) {
          const fills = restyleOps.filter(
            (op) => op.type === 'updateElement',
          );
          ops.push(...fills);
          restyledElements = fills.length;
        }
        if (applyBackground) {
          const scenes = restyleOps.filter(
            (op) => op.type === 'updateScene',
          );
          ops.push(...scenes);
          restyledScenes = scenes.length;
        }
      }

      const result = applyOps(project, ops);
      if (!result.ok) {
        return {
          error: 'Look batch failed.',
          diagnostics: result.diagnostics.filter(
            (diagnostic) => diagnostic.severity === 'error',
          ),
          applied: result.applied,
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();

      return {
        ok: true,
        cleared: nextStyle === null,
        lookId: nextStyle?.lookId ?? null,
        palette: nextStyle ? stylePalette(nextStyle) : null,
        fonts: nextStyle ? styleFonts(nextStyle) : null,
        motion: nextStyle ? styleMotion(nextStyle) : null,
        restyledElements,
        restyledScenes,
        lint: summarizeLint(result.project),
      };
    },
  });

  // ── Review notes & audit ────────────────────────────────────────────────────

  const getReviewNotes = tool({
    description:
      'Read the project review notes: timestamped comments left by the user or a previous pass. Notes are the review layer of the cut — read them before editing and resolve them only after verifying the fix. Unresolved notes are returned by default.',
    inputSchema: z.object({
      projectId: z.string(),
      includeResolved: z.boolean().optional().describe('Default false.'),
    }),
    execute: async ({ projectId, includeResolved }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };
      const all = sortReviewNotes(project.reviewNotes ?? []);
      const notes = all.filter((note) => includeResolved || !note.resolved);
      return {
        notes: notes.map((note) => ({
          id: note.id,
          text: note.text,
          timeMs: note.timeMs,
          resolved: Boolean(note.resolved),
          scene:
            project.storyboard?.scenes.find(
              (scene) => scene.id === note.sceneId,
            )?.name ?? null,
          element: note.elementId
            ? project.elements[note.elementId]?.name ?? null
            : null,
        })),
        total: all.length,
        unresolved: all.filter((note) => !note.resolved).length,
      };
    },
  });

  const addReviewNoteTool = tool({
    description:
      'Add a timestamped review note. Use it when a moment needs attention but is out of scope for the current change, or when the user asks you to note something for later. Notes are not a substitute for fixing what you were asked to fix.',
    inputSchema: z.object({
      projectId: z.string(),
      text: z.string().min(1).max(800),
      timeMs: z
        .number()
        .min(0)
        .optional()
        .describe('Moment being reviewed, in ms. Defaults to 0.'),
      sceneId: z.string().optional(),
      elementId: z.string().optional(),
    }),
    execute: async ({ projectId, text, timeMs, sceneId, elementId }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const before = new Set((project.reviewNotes ?? []).map((note) => note.id));
      const notes = addReviewNote(project.reviewNotes, {
        text,
        timeMs: Math.min(
          project.durationMs,
          Math.max(0, Math.round(timeMs ?? 0)),
        ),
        ...(sceneId ? { sceneId } : {}),
        ...(elementId ? { elementId } : {}),
      });
      const added = notes.find((note) => !before.has(note.id)) ?? null;

      const result = applyOps(project, [
        { type: 'setReviewNotes', notes },
      ]);
      if (!result.ok) {
        return {
          error: 'Could not add the review note.',
          diagnostics: result.diagnostics.filter(
            (diagnostic) => diagnostic.severity === 'error',
          ),
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        ok: true,
        note: added,
        unresolved: (result.project.reviewNotes ?? []).filter(
          (note) => !note.resolved,
        ).length,
      };
    },
  });

  const resolveReviewNotes = tool({
    description:
      'Mark review notes resolved (or unresolved again). Resolve only after the named issue is actually fixed and verified; never delete notes to make the audit clean.',
    inputSchema: z.object({
      projectId: z.string(),
      noteIds: z.array(z.string()).min(1).max(50),
      resolved: z.boolean().optional().describe('Default true.'),
    }),
    execute: async ({ projectId, noteIds, resolved }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      let notes = project.reviewNotes ?? [];
      for (const id of noteIds) {
        notes = updateReviewNote(notes, id, { resolved: resolved !== false });
      }

      const result = applyOps(project, [
        { type: 'setReviewNotes', notes },
      ]);
      if (!result.ok) {
        return {
          error: 'Could not update the review notes.',
          diagnostics: result.diagnostics.filter(
            (diagnostic) => diagnostic.severity === 'error',
          ),
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        ok: true,
        updated: noteIds.length,
        unresolved: (result.project.reviewNotes ?? []).filter(
          (note) => !note.resolved,
        ).length,
      };
    },
  });

  const qaTool = createTraceQaTool();

  // ── Storyboard ─────────────────────────────────────────────────────────────

  const addScene = tool({
    description:
      'Add a storyboard scene to the project. Scenes partition the timeline for planning; they can carry an entrance (cut/fade/slide), a background and a director intent note. Adding a scene shifts later scenes; startMs is derived from order.',
    inputSchema: z.object({
      projectId: z.string(),
      name: z.string().optional().describe('Scene name'),
      durationMs: z.number().optional().describe('Scene duration in ms (default 1500)'),
      intent: z.string().optional().describe('Director note describing what happens in this scene'),
      transitionIn: z
        .enum(['cut', 'fade', 'slide'])
        .optional()
        .describe('Scene entrance veil; default cut'),
      background: z.string().optional().describe('Scene background color'),
      afterSceneId: z
        .string()
        .optional()
        .describe('Insert after this scene; defaults to the end'),
    }),
    execute: async ({
      projectId,
      name,
      durationMs,
      intent,
      background,
      transitionIn,
      afterSceneId,
    }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = [{
        type: 'addScene' as const,
        ...(name ? { name } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(intent ? { intent } : {}),
        ...(background ? { background } : {}),
        ...(transitionIn ? { transitionIn } : {}),
        ...(afterSceneId ? { afterSceneId } : {}),
      }];

      const result = applyOps(project, ops);
      if (!result.ok) {
        return { error: 'Failed to add scene.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        addedSceneIds: result.diff.scenes.added,
        project: summarizeProject(result.project),
      };
    },
  });

  const updateScene = tool({
    description:
      'Update a storyboard scene: name, duration, entrance (cut/fade/slide), background, or director note. Durations re-lay every scene start time contiguously, so the canvas may also be extended when needed. Set background/intent to null to clear them.',
    inputSchema: z.object({
      projectId: z.string(),
      sceneId: z.string().describe('Scene id (from getProject or addScene)'),
      name: z.string().optional(),
      durationMs: z.number().min(100).optional(),
      intent: z.string().nullable().optional().describe('null clears the note'),
      transitionIn: z.enum(['cut', 'fade', 'slide']).optional(),
      background: z
        .string()
        .nullable()
        .optional()
        .describe('null restores the project default background'),
    }),
    execute: async ({ projectId, sceneId, ...patch }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const result = applyOps(project, [
        { type: 'updateScene', id: sceneId, ...patch },
      ]);
      if (!result.ok) {
        return { error: 'Failed to update scene.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        ok: true,
        scenes: result.project.storyboard?.scenes.map((scene) => ({
          id: scene.id,
          name: scene.name,
          startMs: scene.startMs,
          durationMs: scene.durationMs,
          transitionIn: scene.transitionIn ?? 'cut',
          background: scene.background ?? null,
        })),
      };
    },
  });

  const reorderScene = tool({
    description:
      'Move a storyboard scene to a new position. Scene order is the timeline: every startMs is re-derived contiguously, and layers keep their scene assignment.',
    inputSchema: z.object({
      projectId: z.string(),
      sceneId: z.string(),
      index: z.number().min(0).describe('Zero-based destination index'),
    }),
    execute: async ({ projectId, sceneId, index }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const result = applyOps(project, [
        { type: 'reorderScene', id: sceneId, index },
      ]);
      if (!result.ok) {
        return { error: 'Failed to reorder scene.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        ok: true,
        scenes: result.project.storyboard?.scenes.map((scene, position) => ({
          index: position,
          id: scene.id,
          name: scene.name,
          startMs: scene.startMs,
          durationMs: scene.durationMs,
        })),
      };
    },
  });

  // ── Narration (voice-first timing) ─────────────────────────────────────────

  const generateNarrationVoice = tool({
    description:
      'Synthesize the voiceover audio for narration lines (metered TTS). Returns each line with a measured durationMs and ttsAssetId. Use this before setNarration when the composition should be narrated, then pass the returned durations and asset ids into setNarration so every scene and beat is timed to the real voice. Only call when the user asked for narration or approved the plan.',
    inputSchema: z.object({
      lines: z
        .array(
          z.object({
            id: z.string().optional(),
            text: z.string().min(1),
          }),
        )
        .min(1)
        .max(60),
      provider: z
        .enum(['deepgram', 'elevenlabs', 'cartesia'])
        .optional()
        .describe('Omit to use the first configured speech provider.'),
      voiceId: z.string().optional(),
    }),
    execute: async ({ lines, provider, voiceId }) => {
      try {
        const result = await synthesizeNarrationLines(lines, {
          ...(provider ? { provider } : {}),
          ...(voiceId ? { voiceId } : {}),
        });
        return { ok: true, ...result };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const setNarration = tool({
    description:
      'Set the spoken narration for the composition. Provide the script as one entry per spoken sentence or phrase. When every line carries a measured `durationMs` (from generated TTS), the default fitTimeline re-times every scene and the canvas to the voices so picture follows sound. Without measured durations the narration is stored as-is and `untimedLineIds` reports what still needs audio — generate the voiceover first, then call again to fit. Scenes without lines keep their current duration.',
    inputSchema: z.object({
      projectId: z.string(),
      voiceId: z.string().optional(),
      provider: z.string().optional(),
      lines: z
        .array(
          z.object({
            id: z.string().optional(),
            text: z.string().min(1),
            sceneId: z.string().optional().describe('Storyboard scene this line belongs to (defaults to the last scene).'),
            durationMs: z.number().positive().optional().describe('Measured spoken duration from the generated voice asset.'),
            ttsAssetId: z.string().optional().describe('Generated TTS asset id for this line.'),
            speaker: z.string().optional().describe('Optional on-screen speaker label.'),
          }),
        )
        .min(1),
      fitTimeline: z.boolean().optional().describe('Re-time scenes and canvas to the measured voices. Default true when every line is measured.'),
      lineGapMs: z.number().min(0).optional().describe('Silence between lines inside a scene, ms.'),
      sceneTailMs: z.number().min(0).optional().describe('Hold after a scene\'s last line before the cut, ms.'),
    }),
    execute: async ({
      projectId,
      voiceId,
      provider,
      lines,
      fitTimeline,
      lineGapMs,
      sceneTailMs,
    }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const narration: TraceNarration = {
        ...(voiceId ? { voiceId } : {}),
        ...(provider ? { provider } : {}),
        lines: lines.map((line) => ({
          id: line.id ?? nextId('narr'),
          text: line.text,
          ...(line.sceneId !== undefined ? { sceneId: line.sceneId } : {}),
          ...(line.durationMs !== undefined
            ? { durationMs: line.durationMs }
            : {}),
          ...(line.ttsAssetId !== undefined
            ? { ttsAssetId: line.ttsAssetId }
            : {}),
          ...(line.speaker !== undefined ? { speaker: line.speaker } : {}),
        })),
      };

      const untimedLineIds = narration.lines
        .filter(
          (line) =>
            typeof line.durationMs !== 'number' || line.durationMs <= 0,
        )
        .map((line) => line.id);
      const shouldFit = fitTimeline !== false && hasMeasuredDurations(narration);

      const ops: TraceOp[] = shouldFit
        ? buildNarrationTimingOps(project, narration, {
            ...(lineGapMs !== undefined ? { lineGapMs } : {}),
            ...(sceneTailMs !== undefined ? { sceneTailMs } : {}),
          }).ops
        : [{ type: 'setNarration', narration }];

      const result = applyOps(project, ops);
      if (!result.ok) {
        return {
          error: 'Narration batch failed.',
          diagnostics: result.diagnostics.filter(
            (diagnostic) => diagnostic.severity === 'error',
          ),
          applied: result.applied,
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        ok: true,
        applied: result.applied,
        fitted: shouldFit,
        lineCount: narration.lines.length,
        untimedLineIds,
        durationMs: result.project.durationMs,
        scenes:
          result.project.storyboard?.scenes.map((scene) => ({
            id: scene.id,
            name: scene.name,
            startMs: scene.startMs,
            durationMs: scene.durationMs,
          })) ?? [],
        lint: summarizeLint(result.project),
      };
    },
  });

  // ── Camera (screen-space framing) ──────────────────────────────────────────

  const setCamera = tool({
    description:
      'Set or clear the composition camera. x/y name the canvas point that sits at the centre of the frame, zoom is a multiplier (1 = 100%), rotation is in degrees. Animate with tracks (x, y, zoom, rotation). The camera frames the element graph only: scene backgrounds, entrance veils and subtitles stay fixed. Pass null to restore the full artboard. Typical moves: push-in (zoom 1→1.15 with power2.inOut), pan (x/y from one subject to another), subtle Ken Burns (zoom 1→1.06 across the whole piece).',
    inputSchema: z.object({
      projectId: z.string(),
      camera: z
        .object({
          x: z.number().optional().describe('Focus point X in canvas px (default: canvas centre).'),
          y: z.number().optional().describe('Focus point Y in canvas px (default: canvas centre).'),
          zoom: z.number().positive().max(20).optional().describe('Zoom multiplier; 1 = 100%.'),
          rotation: z.number().optional().describe('Rotation in degrees.'),
          tracks: z
            .array(
              z.object({
                property: z.enum(['x', 'y', 'zoom', 'rotation']),
                label: z.string().optional(),
                keyframes: z
                  .array(
                    z.object({
                      timeMs: z.number().min(0),
                      value: z.number(),
                      easing: z.string().optional().describe('Outgoing-keyframe ease (default power2.out).'),
                    }),
                  )
                  .min(2)
                  .max(200),
              }),
            )
            .max(4)
            .optional(),
        })
        .nullable(),
    }),
    execute: async ({ projectId, camera }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const nextCamera = camera
        ? {
            ...(camera.x !== undefined ? { x: camera.x } : {}),
            ...(camera.y !== undefined ? { y: camera.y } : {}),
            ...(camera.zoom !== undefined ? { zoom: camera.zoom } : {}),
            ...(camera.rotation !== undefined
              ? { rotation: camera.rotation }
              : {}),
            ...(camera.tracks?.length
              ? {
                  tracks: camera.tracks.map((track) => ({
                    id: `camera-${track.property}`,
                    property: track.property,
                    label: track.label ?? CAMERA_LABELS[track.property],
                    keyframes: track.keyframes
                      .map((keyframe, index) => ({
                        id: `camera-${track.property}-${Math.round(keyframe.timeMs)}-${index}`,
                        timeMs: Math.round(keyframe.timeMs),
                        value: keyframe.value,
                        easing: keyframe.easing ?? 'power2.out',
                      }))
                      .sort((a, b) => a.timeMs - b.timeMs),
                  })),
                }
              : {}),
          }
        : null;

      const result = applyOps(project, [{ type: 'setCamera', camera: nextCamera }]);
      if (!result.ok) {
        return {
          error: 'Camera batch failed.',
          diagnostics: result.diagnostics.filter(
            (diagnostic) => diagnostic.severity === 'error',
          ),
          applied: result.applied,
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();

      const duration = result.project.durationMs;
      const samples = result.project.camera
        ? [0, 0.5, 1].map((fraction) => {
            const atMs = Math.round(duration * fraction);
            const state = resolveCameraAtTime(result.project, atMs);
            return {
              atMs,
              x: Math.round(state.x),
              y: Math.round(state.y),
              zoom: Number(state.zoom.toFixed(3)),
              rotation: Number(state.rotation.toFixed(1)),
            };
          })
        : [];

      return {
        ok: true,
        applied: result.applied,
        cleared: nextCamera === null,
        trackCount: nextCamera?.tracks?.length ?? 0,
        samples,
        diff: result.diff,
        lint: summarizeLint(result.project),
      };
    },
  });

  // ── Export (read-only) ──────────────────────────────────────────────────────

  const exportSvg = tool({
    description:
      'Export a NovaTrace project as a static SVG at a specific time (defaults to 0ms). Returns the full SVG markup string. This is read-only — it does not modify the project. Use to preview or save a frame.',
    inputSchema: z.object({
      projectId: z.string(),
      timeMs: z.number().optional().describe('Time to sample in ms (default 0)'),
      background: z.string().optional().describe('Background fill color'),
    }),
    execute: async ({ projectId, timeMs, background }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const svg = staticSvgMarkup(project, timeMs ?? 0, {
        ...(background ? { background } : {}),
        size: true,
      });
      return { svg, svgLength: svg.length };
    },
  });

  // ── Capability discovery ───────────────────────────────────────────────────

  const getTraceCapability = tool({
    description:
      'Load the NovaTrace copilot contract and the capability map. Returns the NORMATIVE contract (rules, budgets, verification commands, "done means") plus structured capability guidance: patterns, element types, animation properties, easing types, color palettes, and design patterns. Call this BEFORE generating any composition of more than a couple of elements to ground your output in real system capabilities. Ask "How do I create a [pattern]?" or "What properties can I animate on [type]?"',
    inputSchema: z.object({
      query: z
        .string()
        .describe('What you want to know, e.g. "How do I create a logo stinger with staggered feature reveals?"'),
    }),
    execute: async ({ query }) => {
      const contract = await readTraceDoc('trace-contract.md');
      const docs = await readTraceDoc('novatrace-system.md');
      if (!docs && !contract) {
        return {
          capability: query,
          docs: null,
          contract: null,
          available: false,
          error:
            'Capability docs not found. Use your knowledge of the TraceProject schema.',
        };
      }
      return {
        capability: query,
        contract,
        docs,
        available: true,
      };
    },
  });

  // ── Dispatch (raw ops) ──────────────────────────────────────────────────────

  const dispatchOps = tool({
    description:
      'Apply a raw batch of Trace ops directly. Use this for complex multi-step mutations that combine element creation, track setting, and canvas updates in one atomic operation. Ops apply in order, all-or-nothing.',
    inputSchema: z.object({
      projectId: z.string(),
      ops: z
        .array(z.record(z.string(), z.any()))
        .min(1)
        .describe('Array of Trace op objects (e.g. { type: "addElement", element: {...} }, { type: "setTrack", elementId, property, keyframes, label })'),
    }),
    execute: async ({ projectId, ops: rawOps }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops = rawOps as TraceOp[];
      const gatedOps = new Set([
        'deleteElement',
        'deleteTrack',
        'removeScene',
        'restore',
      ]);
      const gatedOp = ops.find((op) => gatedOps.has(op.type));
      if (gatedOp) {
        return {
          error: `The ${gatedOp.type} op is blocked in dispatchOps. Use the explicitly approved destructive action where available.`,
        };
      }
      const result = applyOps(project, ops);
      if (!result.ok) {
        return {
          error: 'Ops batch failed.',
          diagnostics: result.diagnostics.filter((d) => d.severity === 'error'),
          applied: result.applied,
        };
      }

      await persistProject(projectId, result.project, project);
      broadcast();
      return {
        ok: true,
        applied: result.applied,
        diff: result.diff,
        lint: summarizeLint(result.project),
        project: summarizeProject(result.project),
      };
    },
  });

  return {
    getProject,
    createProject,
    lintProject,
    addElements,
    updateElements,
    setTracks,
    setTracePlaybackLooping,
    setCanvas,
    groupElements,
    deleteElements,
    setDefs,
    applyRecipe,
    searchBlocks: searchBlocksTool,
    insertBlock,
    listLooks: listLooksTool,
    setLook,
    getReviewNotes,
    addReviewNote: addReviewNoteTool,
    resolveReviewNotes,
    auditComposition: qaTool,
    addScene,
    updateScene,
    reorderScene,
    exportSvg,
    getTraceCapability,
    dispatchOps,
    generateNarrationVoice,
    setNarration,
    setCamera,
  };
}

export type TraceTools = ReturnType<typeof createTraceTools>;
