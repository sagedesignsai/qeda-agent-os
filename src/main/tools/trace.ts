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
import type { TraceProject } from '../../lib/trace/types';
import { createBlankTraceProject } from '../../lib/trace/defaults';
import { lintTraceProject } from '../../lib/trace/lint';
import { staticSvgMarkup } from '../../lib/trace/serialize/svg-markup';
import { getTraceProjectStore } from '../trace/service';
import {
  expandRecipe,
  type RecipeId,
} from '../../lib/trace/recipes';

// ── Helpers ──────────────────────────────────────────────────────────────────

let opCounter = 0;
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
    return result?.project ?? null;
  }
  return null;
}

/** Persist a project to the store. */
async function persistProject(
  projectId: string,
  project: TraceProject,
  expectedRevision?: number,
): Promise<{ projectId: string; revision: number; saved: boolean }> {
  const store = getTraceProjectStore();
  const result = await store.saveProject(projectId, project, {
    expectedRevision: expectedRevision ?? 0,
  });
  return {
    projectId,
    revision: result?.revision ?? 0,
    saved: true,
  };
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

      const saved = await persistProject(projectId, result.project);
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

      await persistProject(projectId, result.project);
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
              'fontSize', 'letterSpacing', 'text', 'width', 'height', 'rx',
              'pathProgress', 'trimStart', 'trimEnd', 'trimOffset',
              'morphProgress', 'boxShadow', 'backgroundColor', 'color',
              'borderRadius', 'filter',
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

      await persistProject(projectId, result.project);
      broadcast();
      return {
        updatedIds: result.diff.updated,
        project: summarizeProject(result.project),
      };
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

      await persistProject(projectId, result.project);
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

      await persistProject(projectId, result.project);
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

      await persistProject(projectId, result.project);
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

      await persistProject(projectId, result.project);
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

      await persistProject(projectId, result.project);
      broadcast();
      return {
        rootId: result.recipeRootIds[0] ?? null,
        addedIds: result.diff.added,
        project: summarizeProject(result.project),
      };
    },
  });

  // ── Storyboard ─────────────────────────────────────────────────────────────

  const addScene = tool({
    description:
      'Add a storyboard scene to the project. Scenes partition the timeline for planning and can carry a director intent note.',
    inputSchema: z.object({
      projectId: z.string(),
      name: z.string().optional().describe('Scene name'),
      durationMs: z.number().optional().describe('Scene duration in ms (default 1500)'),
      intent: z.string().optional().describe('Director note describing what happens in this scene'),
      background: z.string().optional().describe('Scene background color'),
    }),
    execute: async ({ projectId, name, durationMs, intent, background }) => {
      const project = await resolveProject(projectId);
      if (!project) return { error: `Project "${projectId}" not found.` };

      const ops: TraceOp[] = [{
        type: 'addScene' as const,
        ...(name ? { name } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(intent ? { intent } : {}),
        ...(background ? { background } : {}),
      }];

      const result = applyOps(project, ops);
      if (!result.ok) {
        return { error: 'Failed to add scene.', diagnostics: result.diagnostics };
      }

      await persistProject(projectId, result.project);
      broadcast();
      return {
        addedSceneIds: result.diff.scenes.added,
        project: summarizeProject(result.project),
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
      'Ask the NovaTrace capability agent how to achieve something. Returns structured guidance: available patterns, element types, animation properties, easing types, color palettes, and design patterns. Call this BEFORE generating complex compositions to ground your output in real system capabilities. Ask "How do I create a [pattern]?" or "What properties can I animate on [type]?"',
    inputSchema: z.object({
      query: z
        .string()
        .describe('What you want to know, e.g. "How do I create a logo stinger with staggered feature reveals?"'),
    }),
    execute: async ({ query }) => {
      // Read the capability docs
      const docsPath = path.join(
        app.getAppPath(),
        'docs',
        'systems',
        'novatrace-system.md',
      );
      try {
        const docs = await readFile(docsPath, 'utf-8');
        return { capability: query, docs, available: true };
      } catch {
        // Fallback: read from the source path in dev
        const devPath = path.join(
          process.cwd(),
          'docs',
          'systems',
          'novatrace-system.md',
        );
        try {
          const docs = await readFile(devPath, 'utf-8');
          return { capability: query, docs, available: true };
        } catch {
          return {
            capability: query,
            docs: null,
            available: false,
            error: 'Capability docs not found. Use your knowledge of the TraceProject schema.',
          };
        }
      }
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
      const result = applyOps(project, ops);
      if (!result.ok) {
        return {
          error: 'Ops batch failed.',
          diagnostics: result.diagnostics.filter((d) => d.severity === 'error'),
          applied: result.applied,
        };
      }

      await persistProject(projectId, result.project);
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
    setCanvas,
    groupElements,
    deleteElements,
    setDefs,
    applyRecipe,
    addScene,
    exportSvg,
    getTraceCapability,
    dispatchOps,
  };
}

export type TraceTools = ReturnType<typeof createTraceTools>;
