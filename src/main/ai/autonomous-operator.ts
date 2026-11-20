/**
 * ai/autonomous-operator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous Operator Daemon (Phase 1 scaffold)
 *
 * Executes tasks unattended within a configurable safety budget:
 *  - picks eligible tasks (autonomous=1, status backlog/active)
 *  - assembles basic workspace/project context
 *  - runs a ToolLoopAgent with a sandboxed auto-approval policy
 *  - emits progress events for the renderer
 *  - marks tasks done/failed and records a best-effort audit note
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { ToolLoopAgent, isStepCount } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { allTools } from '../tools/index.js';
import { createPlanTools } from '../tools/plan.js';
import { PlanManager } from './plan-manager.js';
import {
  getTask,
  updateTask,
  getNextAutonomousTask,
  type Task,
} from '../db/tasks.js';
import { getProject } from '../db/projects.js';
import {
  createNotebook,
  createPage,
  savePageBlocks,
  listNotebooks,
} from '../db/workspace.js';
import { parseMarkdownToBlocks } from '../../lib/markdown-blocks.js';

export type AutonomousOperatorEvent =
  | { type: 'status'; status: OperatorStatus }
  | { type: 'task-started'; taskId: string; title: string }
  | { type: 'step'; taskId: string; message: string }
  | { type: 'task-finished'; taskId: string; ok: boolean; error?: string }
  | { type: 'error'; error: string };

export interface OperatorStatus {
  running: boolean;
  paused: boolean;
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  stepCount: number;
  maxSteps: number;
}

const DEFAULT_MAX_STEPS = 30;

function nowIso() {
  return new Date().toISOString();
}

function isPathInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function extractToolTargets(toolName: string, input: any): string[] {
  if (!input || typeof input !== 'object') return [];
  const candidates: string[] = [];
  const keys = ['path', 'filePath', 'cwd', 'dir', 'directory', 'targetPath'];
  for (const k of keys) {
    if (typeof input[k] === 'string') candidates.push(input[k]);
  }
  // Shell commands are opaque; we only do lightweight checks.
  if (toolName === 'runShell' && typeof input.command === 'string') {
    candidates.push(input.command);
  }
  return candidates;
}

class AutonomousOperator {
  private emitter = new EventEmitter();
  private running = false;
  private paused = false;
  private loopTimer: NodeJS.Timeout | null = null;
  private currentTaskId: string | null = null;
  private currentTaskTitle: string | null = null;
  private stepCount = 0;
  private maxSteps = DEFAULT_MAX_STEPS;
  private abortController: AbortController | null = null;

  on(listener: (event: AutonomousOperatorEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  private emit(event: AutonomousOperatorEvent) {
    this.emitter.emit('event', event);
  }

  getStatus(): OperatorStatus {
    return {
      running: this.running,
      paused: this.paused,
      currentTaskId: this.currentTaskId,
      currentTaskTitle: this.currentTaskTitle,
      stepCount: this.stepCount,
      maxSteps: this.maxSteps,
    };
  }

  private emitStatus() {
    this.emit({ type: 'status', status: this.getStatus() });
  }

  start(opts?: { maxSteps?: number }) {
    if (opts?.maxSteps && Number.isFinite(opts.maxSteps)) {
      this.maxSteps = Math.max(1, Math.min(200, Math.floor(opts.maxSteps)));
    }
    if (this.running) {
      this.paused = false;
      this.emitStatus();
      this.schedule();
      return this.getStatus();
    }
    this.running = true;
    this.paused = false;
    this.emitStatus();
    this.schedule(0);
    return this.getStatus();
  }

  pause() {
    this.paused = true;
    try {
      this.abortController?.abort();
    } catch {
      // ignore
    }
    this.emitStatus();
    return this.getStatus();
  }

  async startTask(taskId: string) {
    const task = getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.autonomous !== 1) {
      // allow explicit start by marking it autonomous for this run
      updateTask(taskId, { autonomous: 1 });
    }
    // If idle, run immediately in background.
    this.start();
    if (!this.currentTaskId) {
      void this.runTask(getTask(taskId) || task);
    }
    return this.getStatus();
  }

  private schedule(delayMs = 1500) {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    if (!this.running || this.paused) return;
    this.loopTimer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick() {
    if (!this.running || this.paused) return;
    if (this.currentTaskId) return; // one task at a time
    const task = getNextAutonomousTask();
    if (!task) {
      this.schedule(3000);
      return;
    }
    await this.runTask(task);
    if (this.running && !this.paused) this.schedule(500);
  }

  private buildAutonomousApproval(workspaceRoot: string | null) {
    const root = workspaceRoot ? path.resolve(workspaceRoot) : null;
    return ({ toolCall }: { toolCall: { toolName: string; args?: any; dynamic?: boolean } }) => {
      const name = toolCall.toolName;
      if (toolCall.dynamic) return 'user-approval';

      // Step budget is enforced by stopWhen/loop guard too, but fail closed here.
      if (this.stepCount >= this.maxSteps) {
        return { type: 'denied' as const, reason: 'Autonomous step budget exceeded.' };
      }

      // Auto-approve read/network/cost by convention of tool names/groups we know.
      // We intentionally do not require a full static map here; unknown tools are denied.
      const readLike = new Set([
        'readFile', 'listDir', 'readClipboard', 'searchDocs', 'listIndexed',
        'searchProjectMemory', 'listProjectMemories', 'webSearch', 'fetchUrl',
        'advancedSearch', 'scrapePage', 'libraryDocs', 'searchImages', 'searchScholar',
        'searchPatents', 'listPages', 'getPage', 'findPages', 'relatedPages',
        'gitStatus', 'gitLog', 'gitDiffStat', 'grepSearch', 'getDocumentOutline',
        'readDocument', 'getDocumentCapability', 'listProjectFiles', 'readProjectFile',
        'listWindows', 'listCaptureTargets', 'captureScreenshot', 'getActiveWindow',
        'getCursorPosition', 'getAppState', 'wait', 'getTakeDetails', 'getMouseTelemetry',
        'listTasks', 'listProjects', 'getTask', 'getFocusStats', 'listBlocks',
        'listStudioTakes', 'listDocuments', 'listResearchRuns', 'listTerminalSessions',
        'listSoundLabSessions', 'listKnowledgePages', 'listCodeProjects', 'listChatSessions',
        'screenshotBrowser',
      ]);
      const writeLocalSafe = new Set([
        'writeClipboard', 'indexFile', 'indexPage', 'storeProjectMemory', 'downloadResource',
        'createNotebook', 'writeNotebook', 'writePage', 'appendToPage', 'startResearchRun',
        'recordSource', 'recordEvidence', 'completeResearchRun', 'createDocument',
        'appendBlocks', 'insertBlocksAt', 'addSteps', 'scheduleBlock', 'handToTerminal',
        'createTask', 'createTasks', 'createProject', 'createPlan', 'updatePlanItem',
        'moveMouse', 'click', 'doubleClick', 'typeText', 'setValue', 'pressKey', 'hotkey',
        'scroll', 'startDemoRecording', 'markHighlight', 'stopDemoRecording',
        'addKineticZoom', 'removeKineticZoom', 'addCanvasEffect', 'removeCanvasEffect',
        'cutSilenceOrRange', 'setCaptions', 'updateStyling', 'generateSocialKit',
        'openBrowser', 'navigateBrowser', 'clickSelector', 'typeSelector', 'evaluateBrowser',
        'closeBrowser',
      ]);
      const destructiveNeedsSandbox = new Set(['writeFile', 'deleteFile', 'runShell', 'replaceBlock']);

      if (readLike.has(name)) return 'not-applicable';
      if (name === 'textToSpeech' || name === 'transcribeAudio' || name === 'findImages') {
        return 'not-applicable';
      }
      if (destructiveNeedsSandbox.has(name)) {
        if (!root) return { type: 'denied' as const, reason: 'No workspace root; refusing unattended destructive tool.' };
        const targets = extractToolTargets(name, toolCall.args);
        // runShell: allow only when workspace-scoped cwd/path hints are present is hard; be conservative.
        if (name === 'runShell') {
          const cmd = String(toolCall.args?.command ?? '');
          // Deny obviously risky patterns.
          if (/\brm\s+-rf\s+\/|sudo\b|\bcurl\b[^\n]*\|\s*(sh|bash)\b/.test(cmd)) {
            return { type: 'denied' as const, reason: 'Shell command denied by autonomous safety policy.' };
          }
          return 'not-applicable';
        }
        for (const t of targets) {
          if (t && !t.includes('://') && !isPathInside(root, t)) {
            return { type: 'denied' as const, reason: `Path outside workspace sandbox: ${t}` };
          }
        }
        return 'not-applicable';
      }
      if (writeLocalSafe.has(name)) return 'not-applicable';

      // Conservative default for unknown/unclassified tools in autonomous mode.
      return { type: 'denied' as const, reason: `Tool not auto-approved in autonomous mode: ${name}` };
    };
  }

  private async runTask(task: Task) {
    this.currentTaskId = task.id;
    this.currentTaskTitle = task.title;
    this.stepCount = 0;
    this.emit({ type: 'task-started', taskId: task.id, title: task.title });
    this.emitStatus();

    const settings = getSettings();
    const project = task.project_id ? getProject(task.project_id) : null;
    const workspaceRoot = project?.repo_path || process.cwd();
    const planManager = new PlanManager((event) => {
      if (event.type === 'plan-created') {
        this.emit({
          type: 'step',
          taskId: task.id,
          message: `Plan created (${event.plan.items.length} steps)`,
        });
      } else if (event.type === 'plan-item-updated') {
        this.emit({
          type: 'step',
          taskId: task.id,
          message: `Plan item ${event.itemId}: ${event.status}`,
        });
      }
    });
    const approval = this.buildAutonomousApproval(workspaceRoot);
    this.abortController = new AbortController();

    try {
      updateTask(task.id, { status: 'active' });
      const model = resolveModel(settings.activeProvider, settings.activeModel);

      const instructions = [
        'You are Qeda Autonomous Operator running unattended on a single task.',
        `Task: ${task.title}`,
        task.description ? `Description: ${task.description}` : '',
        project ? `Project: ${project.name} (${project.id})` : '',
        `Workspace root (sandbox): ${workspaceRoot}`,
        `Safety budget: max ${this.maxSteps} tool steps. Be efficient and finish.`,
        'Create a short plan, execute it, and when complete summarize what was done.',
        'Do not ask the user questions; make reasonable assumptions and proceed safely.',
      ].filter(Boolean).join('\n');

      const tools = { ...allTools, ...createPlanTools(planManager) };
      const agent = new ToolLoopAgent({
        model: model as any,
        instructions,
        tools,
        toolApproval: approval as any,
        stopWhen: [isStepCount(this.maxSteps), planManager.stopCondition()],
        ...( { abortSignal: this.abortController.signal } as any ),
      } as any);

      this.emit({ type: 'step', taskId: task.id, message: 'Planning and executing task…' });
      const result: any = await (agent as any).generate({
        prompt: `Execute this task autonomously: ${task.title}\n\n${task.description || ''}`.trim(),
      });
      this.stepCount = Array.isArray(result?.steps) ? result.steps.length : this.stepCount;
      const text =
        typeof result?.text === 'string'
          ? result.text
          : Array.isArray(result?.response?.messages)
            ? String(result.response.messages.at(-1)?.content ?? '')
            : '';

      updateTask(task.id, { status: 'done' });
      await this.recordAudit(task, project?.id ?? null, text || 'Task completed.', true).catch(() => {});
      this.emit({ type: 'task-finished', taskId: task.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Keep task active for review/retry rather than losing it.
      updateTask(task.id, { status: 'active' });
      await this.recordAudit(task, project?.id ?? null, `Autonomous run failed: ${msg}`, false).catch(() => {});
      this.emit({ type: 'task-finished', taskId: task.id, ok: false, error: msg });
      this.emit({ type: 'error', error: msg });
    } finally {
      this.currentTaskId = null;
      this.currentTaskTitle = null;
      this.abortController = null;
      this.emitStatus();
    }
  }

  private async recordAudit(task: Task, projectId: string | null, summary: string, ok: boolean) {
    try {
      const title = `Autonomous Run — ${task.title}`.slice(0, 120);
      const markdown = [
        `# ${title}`,
        '',
        `- Task: ${task.title} (\`${task.id}\`)`,
        `- Status: ${ok ? 'done' : 'failed'}`,
        `- Time: ${nowIso()}`,
        projectId ? `- Project: ${projectId}` : '',
        '',
        '## Summary',
        '',
        summary || '(no summary)',
      ].filter(Boolean).join('\n');

      // Best-effort: reuse a single "Autonomous Runs" notebook when possible.
      const notebooks = listNotebooks();
      const notebook =
        notebooks.find((n) => n.title === 'Autonomous Runs' && n.project_id === (projectId ?? null)) ||
        notebooks.find((n) => n.title === 'Autonomous Runs') ||
        createNotebook('Autonomous Runs', 'Audit log for autonomous operator runs', 'bot', projectId);
      const page = createPage(notebook.id, title);
      const blocks = parseMarkdownToBlocks(markdown);
      savePageBlocks(page.id, blocks, { versionOrigin: 'ai' });
    } catch {
      // best-effort audit only
    }
  }
}

let instance: AutonomousOperator | null = null;

export function getAutonomousOperator(): AutonomousOperator {
  if (!instance) instance = new AutonomousOperator();
  return instance;
}
