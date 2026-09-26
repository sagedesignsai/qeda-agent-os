/**
 * ipc/channels.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all IPC channel names and their payload types.
 *
 * Shared between main and renderer processes (renderer imports from preload.d.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UIMessage } from 'ai';
import type { Session } from '../db/sessions.js';
import type { AppSettings } from '../ai/settings.js';
import type {
  Notebook,
  Page,
  PageVersion,
  SearchHit,
} from '../db/workspace.js';
import type { Block } from '../../lib/markdown-blocks.js';
import type {
  ResearchRun,
  ResearchSourceWithEvidence,
} from '../db/research.js';
import type { ServiceStatus } from '../services/keys.js';
import type { TerminalSession, TerminalBlock } from '../db/terminal.js';
import type { Task } from '../db/tasks.js';

// Re-export the domain types so the renderer can import them from the channel
// contract module rather than reaching into the database layer.
export type { Notebook, Page, PageVersion, SearchHit };
export type { Block };
export type { ResearchRun, ResearchSourceWithEvidence };
export type { ServiceStatus };
export type { TerminalSession, TerminalBlock };
export type { Task };

/** A tool as advertised to the renderer by `tools:list`. */
export interface ToolInfo {
  name: string;
  description: string;
  requiresApproval: boolean;
}

/** A provider as advertised to the renderer by `providers:list`. */
export interface ProviderInfo {
  id: string;
  name: string;
  baseURL?: string;
  /** Curated free/free-tier coding models, best first. */
  freeModels: string[];
  /** Free-tier caveat shown in the Settings dialog. */
  note?: string;
  /** Whether a usable key is available. */
  apiKeySet: boolean;
  /** Where that key comes from – an env var name, the encrypted store, or none. */
  apiKeySource: 'settings' | 'environment' | null;
}

/** Page payload with derived metadata for the UI. */
export interface PageDetail {
  page: Page;
  blocks: Block[];
  markdown: string;
  tags: string[];
  backlinks: { id: string; title: string }[];
  outgoing: { id: string; title: string }[];
  related: { id: string; title: string }[];
  versions: PageVersion[];
}

export interface ResearchTrace {
  run: ResearchRun;
  sources: ResearchSourceWithEvidence[];
}

export type ChatContext = { pageId?: string; notebookId?: string };

export interface IpcChannels {
  // Session management
  'sessions:list': { req: void; res: Session[] };
  'sessions:create': { req: { title?: string }; res: Session };
  'sessions:delete': { req: { id: string }; res: void };
  'sessions:rename': { req: { id: string; title: string }; res: void };
  'sessions:messages': { req: { id: string }; res: UIMessage[] };
  /** Persist the renderer's reconstructed conversation (upsert by message id). */
  'sessions:save-messages': {
    req: { sessionId: string; messages: UIMessage[] };
    res: void;
  };

  // Settings
  'settings:get': {
    req: void;
    res: Omit<AppSettings, 'providers' | 'braveApiKey' | 'serviceKeys'> & {
      providers: Record<string, { apiKey?: boolean; baseURL?: string }>;
      braveApiKeySet: boolean;
      /** Which external services have a key set (never the value itself). */
      serviceKeysSet: Record<string, boolean>;
    };
  };
  'settings:save': { req: Partial<AppSettings>; res: void };

  // Providers
  'providers:list': { req: void; res: ProviderInfo[] };
  /** Live `/models` lookup, with curated free models as the fallback. */
  'providers:models': {
    req: { providerId: string };
    res: { models: string[]; error?: string };
  };

  // External services (search, scrape, docs, images, speech)
  /** Status of each registered external service, including whether a key is set. */
  'services:list': { req: void; res: ServiceStatus[] };

  // Tools
  'tools:list': { req: void; res: ToolInfo[] };
  /**
   * Execute a tool directly from the renderer.
   * Tools listed in `toolApprovalPolicy` prompt the user for confirmation in
   * the main process before running.
   */
  'tools:execute': {
    req: { toolName: string; params: Record<string, unknown> };
    res: unknown;
  };

  // ── Workspace ─────────────────────────────────────────────────────────────
  'notebooks:list': { req: void; res: Notebook[] };
  'notebooks:create': {
    req: { title: string; description?: string; icon?: string };
    res: Notebook;
  };
  'notebooks:update': {
    req: { id: string; title?: string; description?: string; icon?: string };
    res: void;
  };
  'notebooks:delete': { req: { id: string }; res: void };

  'pages:list': { req: { notebookId?: string }; res: Page[] };
  'pages:get': { req: { id: string }; res: PageDetail | null };
  'pages:create': {
    req: { notebookId: string; title: string; parentPageId?: string | null };
    res: Page;
  };
  'pages:rename': { req: { id: string; title: string }; res: void };
  'pages:move': {
    req: { id: string; parentPageId: string | null; notebookId?: string };
    res: void;
  };
  'pages:delete': { req: { id: string }; res: void };
  /** Save the block list produced by the editor (single write choke point). */
  'pages:save-blocks': { req: { id: string; blocks: Block[]; title?: string }; res: void };
  'pages:search': { req: { query: string; limit?: number }; res: SearchHit[] };
  'pages:restore-version': { req: { versionId: string }; res: boolean };
  'workspace:tags': { req: void; res: { name: string; count: number }[] };

  // ── Research ──────────────────────────────────────────────────────────────
  'research:trace': { req: { runId: string }; res: ResearchTrace | null };
  'research:list': { req: { pageId?: string; notebookId?: string }; res: ResearchRun[] };

  // ── Agent chat (streaming via IPC event emitter) ──────────────────────────
  'agent:chat': {
    req: { sessionId: string; messages: UIMessage[]; context?: ChatContext };
    res: void;
  };

  // Streamed events pushed from main → renderer during a chat turn
  'agent:stream-chunk': { data: string }; // JSON-serialised fullStream chunk
  'agent:stream-done': { sessionId: string };
  'agent:stream-error': { error: string };
  /** The active provider could not serve the turn; another one took over. */
  'agent:stream-fallback': {
    fromProvider: string;
    fromModel: string;
    toProvider: string;
    toModel: string;
    reason: string;
  };

  // ── Agentic terminal ────────────────────────────────────────────────────────
  'terminal:sessions-list': { req: void; res: TerminalSession[] };
  'terminal:session-create': {
    req: { title?: string };
    res: TerminalSession;
  };
  'terminal:session-delete': { req: { id: string }; res: void };
  'terminal:session-rename': { req: { id: string; title: string }; res: void };
  'terminal:blocks-get': {
    req: { sessionId: string };
    res: TerminalBlock[];
  };
  'terminal:block-update': {
    req: {
      id: string;
      patch: Partial<
        Pick<
          TerminalBlock,
          'status' | 'output' | 'exit_code' | 'explanation' | 'command' | 'duration_ms'
        >
      >;
    };
    res: void;
  };

  /**
   * Run an agentic goal. The agent emits:
   *   terminal:block-proposed   – new command ready for approval
   *   terminal:block-running    – command is executing
   *   terminal:block-done       – output + exit code arrived
   *   terminal:agent-done       – full goal complete
   *   terminal:agent-error      – unrecoverable failure
   */
  'terminal:run-goal': {
    req: { sessionId: string; goal: string };
    res: void;
  };
  /** Approve a pending command block (runs the command). */
  'terminal:approve': { req: { sessionId: string; blockId: string }; res: void };
  /** Reject a pending command block (marks it skipped). */
  'terminal:reject': { req: { sessionId: string; blockId: string }; res: void };
  /** Ask the agent to explain the output of a finished block. */
  'terminal:explain': {
    req: { blockId: string };
    res: { explanation: string };
  };
  /**
   * Run a command the user typed (or a re-run) directly, bypassing the agent
   * planner. Consent is implicit because the user authored the command, so no
   * approval gate is involved. Emits terminal:block-proposed + block-update-event
   * exactly like an agent command so the UI path is identical.
   */
  'terminal:execute-command': {
    req: { sessionId: string; command: string; cwd?: string };
    res: void;
  };
  /** Re-run a previously completed block as a new block. */
  'terminal:rerun-block': {
    req: { sessionId: string; blockId: string };
    res: void;
  };
  /**
   * Ask the model to diagnose a failed block and propose a replacement command.
   * The command is returned for review — it is never executed by this handler.
   */
  'terminal:suggest-fix': {
    req: { blockId: string };
    res: { diagnosis: string; command: string };
  };

  // Streamed events pushed from main → renderer during a terminal agent run
  /** A new command block has been proposed and is waiting for approval. */
  'terminal:block-proposed': TerminalBlock;
  /** A command block status changed (running / done / error / skipped). */
  'terminal:block-update-event': Partial<TerminalBlock> & { id: string };
  /** The terminal agent finished the goal. */
  'terminal:agent-done': { sessionId: string; summary: string };
  /** The terminal agent hit an unrecoverable error. */
  'terminal:agent-error': { sessionId: string; error: string };

  // ── ADHD task manager ───────────────────────────────────────────────────────
  'tasks:list': { req: { status?: Task['status'] }; res: Task[] };
  'tasks:create': {
    req: Pick<Task, 'title'> &
      Partial<Pick<Task, 'description' | 'priority' | 'due_at' | 'status'>>;
    res: Task;
  };
  'tasks:update': {
    req: { id: string } & Partial<
      Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'due_at' | 'position'>
    >;
    res: void;
  };
  'tasks:delete': { req: { id: string }; res: void };
  'tasks:increment-pomodoro': { req: { id: string }; res: void };
  /** Ask the agent to suggest a prioritized task order. */
  'tasks:prioritize': {
    req: void;
    res: { orderedIds: string[]; reasoning: string };
  };
  /** Get current working directory and git branch for rich prompt (Warp Pillar 2). */
  'terminal:get-context-info': {
    req: { cwd?: string } | void;
    res: { cwd: string; gitBranch: string | null };
  };

  // ── Raw PTY shell (Shell Mode & Shell Integration) ─────────────────────────
  /**
   * Spawn a new PTY shell. Returns the ptyId used for all subsequent calls.
   * The shell defaults to $SHELL or /bin/bash.
   */
  'pty:create': {
    req: {
      cols: number;
      rows: number;
      cwd?: string;
      shell?: string;
      sessionId?: string;
      enableShellIntegration?: boolean;
    };
    res: { ptyId: string };
  };
  /** Send input text/bytes to a running PTY. */
  'pty:write': {
    req: { ptyId: string; data: string };
    res: void;
  };
  /** Notify the PTY of a terminal resize (columns × rows). */
  'pty:resize': {
    req: { ptyId: string; cols: number; rows: number };
    res: void;
  };
  /** Kill a PTY and clean up. */
  'pty:kill': {
    req: { ptyId: string };
    res: void;
  };

  // Streamed events pushed from PTY → renderer
  /** Output data chunk from the PTY process (raw bytes as UTF-8 string). */
  'pty:data': { ptyId: string; data: string };
  /** PTY process exited. */
  'pty:exit': { ptyId: string; exitCode: number };
  /** OSC 133 semantic command started in shell. */
  'pty:block-started': { ptyId: string; command: string; cwd?: string };
  /** OSC 133 semantic command completed with metadata. */
  'pty:block-completed': {
    ptyId: string;
    blockId: string;
    command: string;
    output: string;
    exitCode: number;
    durationMs: number;
    cwd?: string;
  };
  /** OSC 7 working directory change. */
  'pty:cwd-changed': { ptyId: string; cwd: string };
}

export type ChannelName = keyof IpcChannels;
