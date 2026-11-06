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

export const workspaceResourceTools = {
  listStudioTakes: listStudioTakesTool,
  listDocuments: listDocumentsTool,
  listResearchRuns: listResearchRunsTool,
  listTerminalSessions: listTerminalSessionsTool,
  listSoundLabSessions: listSoundLabSessionsTool,
  listKnowledgePages: listKnowledgePagesTool,
  listCodeProjects: listCodeProjectsTool,
  listChatSessions: listChatSessionsTool,
};
