/**
 * tools/workspace-resources.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only agent tools for cross-workspace discovery.
 *
 * These tools let an agent list workspace resources (studio takes, documents,
 * research runs, terminal sessions, SoundLab sessions, knowledge pages, code
 * projects) scoped to a project. They default to the active project if no ID
 * is provided, returning an empty array when no project is set.
 *
 * These are passive discovery tools — they never modify data.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { projectResources } from '../db/projects.js';
import { resolveActiveProjectId } from '../ai/project-context.js';

function resolveProjectId(id?: string): string | null {
  if (id) return id;
  return resolveActiveProjectId();
}

// ─── listStudioTakes ──────────────────────────────────────────────────────────

export const listStudioTakesTool = tool({
  description:
    'List video takes (recordings) for a project. Returns title, duration, and source type. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { takes: [], count: 0 };
    const resources = projectResources(id);
    return {
      takes: resources.studioTakes.map((t) => ({
        id: t.id,
        title: t.title,
        durationMs: t.durationMs,
        sourceType: t.sourceType,
      })),
      count: resources.studioTakes.length,
    };
  },
});

// ─── listDocuments ────────────────────────────────────────────────────────────

export const listDocumentsTool = tool({
  description:
    'List drafted documents for a project. Returns title and template ID. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { documents: [], count: 0 };
    const resources = projectResources(id);
    return {
      documents: resources.documents.map((d) => ({
        id: d.id,
        title: d.title,
        templateId: d.templateId,
      })),
      count: resources.documents.length,
    };
  },
});

// ─── listResearchRuns ─────────────────────────────────────────────────────────

export const listResearchRunsTool = tool({
  description:
    'List research investigations for a project. Returns question and status. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { runs: [], count: 0 };
    const resources = projectResources(id);
    return {
      runs: resources.researchRuns.map((r) => ({
        id: r.id,
        question: r.question,
        status: r.status,
      })),
      count: resources.researchRuns.length,
    };
  },
});

// ─── listTerminalSessions ─────────────────────────────────────────────────────

export const listTerminalSessionsTool = tool({
  description:
    'List past terminal sessions for a project. Returns title, goal, and status. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { sessions: [], count: 0 };
    const resources = projectResources(id);
    return {
      sessions: resources.terminalSessions.map((t) => ({
        id: t.id,
        title: t.title,
        goal: t.goal,
        status: t.status,
      })),
      count: resources.terminalSessions.length,
    };
  },
});

// ─── listSoundLabSessions ─────────────────────────────────────────────────────

export const listSoundLabSessionsTool = tool({
  description:
    'List SoundLab music sessions for a project. Returns title, BPM, and key. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { sessions: [], count: 0 };
    const resources = projectResources(id);
    return {
      sessions: resources.soundLabSessions.map((s) => ({
        id: s.id,
        title: s.title,
        bpm: s.bpm,
        keySignature: s.keySignature,
      })),
      count: resources.soundLabSessions.length,
    };
  },
});

// ─── listKnowledgePages ───────────────────────────────────────────────────────

export const listKnowledgePagesTool = tool({
  description:
    'List knowledge-base pages scoped to a project. Returns page titles. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { pages: [], count: 0 };
    const resources = projectResources(id);
    return {
      pages: resources.knowledgePages.map((p) => ({
        id: p.id,
        title: p.title,
      })),
      count: resources.knowledgePages.length,
    };
  },
});

// ─── listCodeProjects ─────────────────────────────────────────────────────────

export const listCodeProjectsTool = tool({
  description:
    'List linked code repositories for a project. Returns name, directory, and index status. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { projects: [], count: 0 };
    const resources = projectResources(id);
    return {
      projects: resources.codeProjects.map((c) => ({
        id: c.id,
        name: c.name,
        directory: c.directory,
        indexStatus: c.indexStatus,
      })),
      count: resources.codeProjects.length,
    };
  },
});

// ─── listChatSessions ─────────────────────────────────────────────────────────

export const listChatSessionsTool = tool({
  description:
    'List past chat sessions for a project. Returns session titles. Defaults to the active project.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. Defaults to the active project if omitted.'),
  }),
  execute: ({ projectId }) => {
    const id = resolveProjectId(projectId);
    if (!id) return { sessions: [], count: 0 };
    const resources = projectResources(id);
    return {
      sessions: resources.chatSessions.map((s) => ({
        id: s.id,
        title: s.title,
      })),
      count: resources.chatSessions.length,
    };
  },
});

// ─── Export ────────────────────────────────────────────────────────────────────

// ─── listMotionProjects ───────────────────────────────────────────────────────

export const listMotionProjectsTool = tool({
  description:
    'List 3D Motion projects. Returns project name, scene count, dimensions, and preview. Defaults to the active project scope.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. If omitted, lists all Motion projects in the workspace.'),
  }),
  execute: ({ projectId }) => {
    try {
      const { MotionProjectIndex } = require('../motion/project-index.js') as typeof import('../motion/project-index.js');
      const index = new MotionProjectIndex();
      const projects = index.list();
      
      // If projectId provided, filter to connected projects
      // For now, return all Motion projects (Motion uses filesystem not relational)
      return {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          sceneCount: p.scene_count,
          width: p.width,
          height: p.height,
          fps: p.fps,
          duration: p.duration,
          updatedAt: p.updated_at,
        })),
        count: projects.length,
      };
    } catch {
      return { projects: [], count: 0 };
    }
  },
});

// ─── listTraceProjects ────────────────────────────────────────────────────────

export const listTraceProjectsTool = tool({
  description:
    'List 2D vector animation (Nova Trace) projects. Returns project name, dimensions, element count, and duration. Defaults to the active project scope.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. If omitted, lists all Trace projects in the workspace.'),
  }),
  execute: ({ projectId }) => {
    try {
      const { TraceProjectIndex } = require('../trace/trace-project-index.js') as typeof import('../trace/trace-project-index.js');
      const traceDir = require('electron').app.getPath('userData');
      const index = new TraceProjectIndex(traceDir);
      const projects = index.list();
      
      // If projectId provided, filter to connected projects
      // For now, return all Trace projects
      return {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          width: p.width,
          height: p.height,
          elementCount: p.element_count,
          durationMs: p.duration_ms,
          fps: p.fps,
          updatedAt: p.updated_at,
        })),
        count: projects.length,
      };
    } catch {
      return { projects: [], count: 0 };
    }
  },
});

// ─── listPresenceBatches ──────────────────────────────────────────────────────

export const listPresenceBatchesTool = tool({
  description:
    'List social presence content batches (post drafts, connection ideas, platform suggestions). Returns batch title, status, and item count. Defaults to the active project scope.',
  inputSchema: z.object({
    projectId: z
      .string()
      .optional()
      .describe('Project ID. If omitted, lists all Presence batches in the workspace.'),
  }),
  execute: ({ projectId }) => {
    try {
      const { listBatches } = require('../db/presence.js') as typeof import('../db/presence.js');
      const batches = listBatches(projectId ?? null);
      
      return {
        batches: batches.map((b) => ({
          id: b.id,
          focus: b.focus,
          createdAt: b.created_at,
        })),
        count: batches.length,
      };
    } catch {
      return { batches: [], count: 0 };
    }
  },
});

export const workspaceResourceTools = {
  listStudioTakes: listStudioTakesTool,
  listDocuments: listDocumentsTool,
  listResearchRuns: listResearchRunsTool,
  listTerminalSessions: listTerminalSessionsTool,
  listSoundLabSessions: listSoundLabSessionsTool,
  listKnowledgePages: listKnowledgePagesTool,
  listCodeProjects: listCodeProjectsTool,
  listChatSessions: listChatSessionsTool,
  listMotionProjects: listMotionProjectsTool,
  listTraceProjects: listTraceProjectsTool,
  listPresenceBatches: listPresenceBatchesTool,
};
