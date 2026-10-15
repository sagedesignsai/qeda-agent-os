/**
 * main/builder/local-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native ToolLoopAgent implementation for Qeda's Builder system.
 *
 * Provides an autonomous coding engine alternative to OpenCode, equipped with:
 *   • Workspace-scoped file & search tools (reading, writing, editing, grep, git)
 *   • Safe, supervised shell execution inside the workspace directory
 *   • Dynamic Model Context Protocol (MCP) server tools from active clients
 *   • Isolated git worktree sandboxing (with safe fallback to repo root)
 *   • Live event streaming matching the normalized BuilderSessionEvent contract
 *   • Interactive permission approvals (Allow once / Always / Reject)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isStepCount, ToolLoopAgent, type ModelMessage } from 'ai';
import path from 'node:path';
import type {
  BuilderModelOption,
  BuilderSessionEvent,
  BuilderSessionStart,
  BuilderSessionSummary,
  BuilderWorkspace,
} from '../ipc/channels';
import type { BuilderPermissionDecision } from '../../lib/builder-interactions';
import { getSettings } from '../ai/settings';
import { resolveModel } from '../ai/provider';
import { mcpManager } from '../ai/mcp/manager';
import {
  createBuilderWorktree,
  inspectBuilderWorkspace,
  removeBuilderWorktree,
} from './workspace';
import { createWorkspaceCodingTools } from './tools/coding-tools';

const STEP_BUDGET = 50;

const CODING_INSTRUCTIONS = `
You are Qeda's Local Builder Agent, an expert software engineer pair-programming inside the user's workspace.

## Core Directives
1. **Analyze First**: Read existing code, project manifests (\`package.json\`, config files), and git status before proposing changes. Understand the architecture, conventions, and style of the project.
2. **Scaffold Node Projects From Scratch**: When opening an empty or fresh project:
   - Plan the project layout clearly.
   - Scaffold \`package.json\` with meaningful scripts (\`dev\`, \`build\`, \`test\`).
   - Scaffold configuration files (\`tsconfig.json\`, \`.gitignore\`, linter/Vite/Next configs).
   - Write clean, modular source files (e.g. \`src/index.ts\` or \`src/App.tsx\`).
   - Run \`npm install\` via \`runShellCommand\` to install dependencies.
   - Inform the user how to test or launch the dev server.
3. **Surgical Precision**:
   - Prefer \`editFile\` for targeted modifications to existing files.
   - Use \`writeFile\` when creating new files or replacing small self-contained modules.
   - Keep changes concise, clean, and well-typed.
4. **Verified Execution**:
   - Run \`runShellCommand\` for build steps, tests, or installing npm packages.
   - Explain what shell command you are about to run so the user can review and approve it.
5. **Leverage MCP Tools**:
   - If MCP tools (e.g. GitHub, Fetch, SQLite, Context7 Docs) are present, use them proactively to fetch external APIs, read docs, or inspect databases.
`.trim();

export interface LocalBuilderSessionOptions {
  workspaceDirectory: string;
  onEvent: (event: BuilderSessionEvent) => void;
  preferredModel?: { providerId: string; modelId: string };
}

export class LocalBuilderSession {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  private workspace: BuilderWorkspace;
  private worktreePath: string | null = null;
  private onEvent: (event: BuilderSessionEvent) => void;
  private eventSeq = 0;
  private messages: ModelMessage[] = [];
  private activeAbortController: AbortController | null = null;
  private pendingPermissions = new Map<
    string,
    {
      resolve: (decision: BuilderPermissionDecision) => void;
      reject: (err: unknown) => void;
    }
  >();

  private activeProvider: string;
  private activeModel: string;
  private running = false;

  constructor(
    id: string,
    workspace: BuilderWorkspace,
    worktreePath: string | null,
    onEvent: (event: BuilderSessionEvent) => void,
    modelTarget?: { providerId: string; modelId: string },
  ) {
    this.id = id;
    this.title = `Builder · ${workspace.name}`;
    this.createdAt = Date.now();
    this.workspace = { ...workspace, worktreePath };
    this.worktreePath = worktreePath;
    this.onEvent = onEvent;

    const settings = getSettings();
    this.activeProvider = modelTarget?.providerId ?? settings.activeProvider;
    this.activeModel = modelTarget?.modelId ?? settings.activeModel;
  }

  getSummary(): BuilderSessionSummary {
    return {
      id: this.id,
      title: this.title,
      createdAt: this.createdAt,
    };
  }

  getWorkspace(): BuilderWorkspace {
    return {
      ...this.workspace,
      worktreePath: this.worktreePath,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  private emit(
    partial:
      | { type: 'user-prompt'; text: string }
      | { type: 'text-delta'; messageId: string; delta: string }
      | { type: 'tool-started'; callId: string; name: string; input: unknown }
      | { type: 'tool-input'; callId: string; input: unknown }
      | { type: 'tool-progress'; callId: string; metadata: Record<string, unknown> }
      | { type: 'tool-completed'; callId: string; output: string }
      | { type: 'tool-failed'; callId: string; error: string }
      | { type: 'permission'; request: any }
      | { type: 'status'; status: 'running' | 'idle' | 'interrupted' | 'failed' }
      | { type: 'file-changed'; path: string }
      | { type: 'error'; message: string },
  ): void {
    const event: BuilderSessionEvent = {
      sessionId: this.id,
      eventId: `local-${Date.now()}-${++this.eventSeq}`,
      createdAt: Date.now(),
      ...partial,
    } as BuilderSessionEvent;

    this.onEvent(event);
  }

  /**
   * Submit one coding prompt to the Local ToolLoopAgent.
   */
  async prompt(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Write a prompt before sending.');
    if (this.running) {
      throw new Error('A coding turn is already in progress.');
    }

    this.running = true;
    this.emit({ type: 'user-prompt', text: trimmed });
    this.emit({ type: 'status', status: 'running' });

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const effectiveDir = this.worktreePath ?? this.workspace.directory;

    try {
      // 1. Prepare Workspace Coding Tools
      const codingTools = createWorkspaceCodingTools({
        workspaceDirectory: effectiveDir,
        onFileChanged: (filePath) => {
          this.emit({ type: 'file-changed', path: filePath });
        },
        requestPermission: ({ toolName, description, details }) => {
          const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return new Promise<BuilderPermissionDecision>((resolve, reject) => {
            this.pendingPermissions.set(requestId, { resolve, reject });
            this.emit({
              type: 'permission',
              request: {
                id: requestId,
                type: 'command',
                title: `Permission needed: ${toolName}`,
                pattern: description,
                metadata: details,
              },
            });
          });
        },
      });

      // 2. Load Enabled MCP Tools
      const { tools: mcpTools, activeCount } =
        await mcpManager.loadToolsForEnabledServers();

      const allTools = {
        ...codingTools,
        ...mcpTools,
      };

      // 3. Resolve AI Model
      const model = resolveModel(this.activeProvider, this.activeModel);

      const instructions = [
        CODING_INSTRUCTIONS,
        `\n## Active Workspace`,
        `- Directory: ${effectiveDir}`,
        `- Worktree Sandboxed: ${this.worktreePath ? 'Yes' : 'No'}`,
        `- Available MCP Tools: ${activeCount} active server(s)`,
      ].join('\n');

      const agent = new ToolLoopAgent({
        model: model as any,
        instructions,
        tools: allTools,
        stopWhen: isStepCount(STEP_BUDGET),
      });

      // 4. Stream Agent Turn
      this.messages.push({
        role: 'user',
        content: trimmed,
      });

      const messageId = `msg-${Date.now()}`;
      const result = await agent.stream({
        messages: this.messages,
        abortSignal: abortController.signal,
      });

      let assistantResponseText = '';

      for await (const part of result.fullStream) {
        if (abortController.signal.aborted) break;

        switch (part.type) {
          case 'text-delta':
            assistantResponseText += part.text;
            this.emit({
              type: 'text-delta',
              messageId,
              delta: part.text,
            });
            break;

          case 'tool-call':
            this.emit({
              type: 'tool-started',
              callId: part.toolCallId,
              name: part.toolName,
              input: part.input,
            });
            this.emit({
              type: 'tool-input',
              callId: part.toolCallId,
              input: part.input,
            });
            break;

          case 'tool-result':
            this.emit({
              type: 'tool-completed',
              callId: part.toolCallId,
              output:
                typeof part.output === 'string'
                  ? part.output
                  : JSON.stringify(part.output, null, 2),
            });
            break;

          case 'error':
            this.emit({
              type: 'error',
              message:
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error),
            });
            break;
        }
      }

      if (assistantResponseText) {
        this.messages.push({
          role: 'assistant',
          content: assistantResponseText,
        });
      }

      this.running = false;
      this.emit({ type: 'status', status: 'idle' });
    } catch (error) {
      this.running = false;
      if (abortController.signal.aborted) {
        this.emit({ type: 'status', status: 'interrupted' });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.emit({ type: 'error', message });
        this.emit({ type: 'status', status: 'failed' });
        throw error;
      }
    } finally {
      this.activeAbortController = null;
    }
  }

  /**
   * Handle user permission decisions (Allow once / Always / Reject).
   */
  replyPermission(requestId: string, decision: BuilderPermissionDecision): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;

    this.pendingPermissions.delete(requestId);
    pending.resolve(decision);

    this.emit({
      type: 'interaction-resolved' as any,
      interactionId: requestId,
      interactionType: 'permission',
    });
  }

  /**
   * Interrupt active in-flight turn.
   */
  abort(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    for (const [id, pending] of this.pendingPermissions.entries()) {
      pending.resolve('reject');
      this.pendingPermissions.delete(id);
    }
    this.running = false;
    this.emit({ type: 'status', status: 'interrupted' });
  }

  /**
   * Change model for subsequent turns.
   */
  setModel(providerId: string, modelId: string): void {
    if (this.running) {
      throw new Error('Wait for the current turn to finish before switching models.');
    }
    this.activeProvider = providerId;
    this.activeModel = modelId;
  }

  getModel(): { providerID: string; id: string; name: string } {
    return {
      providerID: this.activeProvider,
      id: this.activeModel,
      name: `${this.activeProvider} · ${this.activeModel}`,
    };
  }

  /**
   * Teardown session and remove isolated worktree.
   */
  async stop(): Promise<void> {
    this.abort();
    const worktree = this.worktreePath;
    const repo = this.workspace.directory;
    this.worktreePath = null;

    if (worktree && repo) {
      await removeBuilderWorktree(repo, worktree).catch(() => undefined);
    }
  }
}

/**
 * Factory for creating and initializing a LocalBuilderSession.
 */
export async function createLocalBuilderSession(
  options: LocalBuilderSessionOptions,
): Promise<{
  session: LocalBuilderSession;
  summary: BuilderSessionSummary;
  workspace: BuilderWorkspace;
}> {
  const { workspaceDirectory, onEvent, preferredModel } = options;

  // Auto-init git if folder is empty or not yet a git repo (supports Node projects from ground up!)
  const workspace = await inspectBuilderWorkspace(workspaceDirectory, {
    autoInit: true,
  });

  const sessionId = `local-sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Create isolated git worktree
  let worktreePath: string | null = null;
  try {
    worktreePath = await createBuilderWorktree(workspace.directory, sessionId);
  } catch (error) {
    console.warn(
      '[LocalBuilder] Worktree isolation failed, running directly in repo root:',
      error instanceof Error ? error.message : String(error),
    );
  }

  const session = new LocalBuilderSession(
    sessionId,
    workspace,
    worktreePath,
    onEvent,
    preferredModel,
  );

  return {
    session,
    summary: session.getSummary(),
    workspace: session.getWorkspace(),
  };
}
