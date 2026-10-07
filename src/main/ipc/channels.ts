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
import type { TaskStep, StepProgress } from '../db/task-steps.js';
import type { TaskBlock, TaskBlockWithTask } from '../db/task-blocks.js';
import type { FocusSession, FocusStats } from '../db/focus-sessions.js';
import type { Project, ProjectStatus, ProjectRollup } from '../db/projects.js';
import type { GamificationState } from '../../lib/gamification.js';
import type { PdfDocumentRecord, PdfDocumentSummary } from '../db/documents.js';
import type {
  StudioTake,
  StudioTakeSummary,
  StudioStyling,
  StudioCut,
  StudioZoom,
  StudioCaption,
  StudioCaptionWord,
  StudioSocialKit,
  MouseTrackerEvent,
} from '../../lib/studio-types.js';
import { DEFAULT_STUDIO_STYLING } from '../../lib/studio-types.js';

// Re-export the domain types so the renderer can import them from the channel
// contract module rather than reaching into the database layer.
export type { Notebook, Page, PageVersion, SearchHit };
export type { Block };
export type { ResearchRun, ResearchSourceWithEvidence };
export type { ServiceStatus };
export type { TerminalSession, TerminalBlock };
export type { Task };
export type { TaskStep, StepProgress };
export type { TaskBlock, TaskBlockWithTask };
export type { FocusSession, FocusStats };
export type { Project, ProjectStatus, ProjectRollup };
export type { GamificationState };
export type { PdfDocumentRecord, PdfDocumentSummary };
export type {
  StudioTake,
  StudioTakeSummary,
  StudioStyling,
  StudioCut,
  StudioZoom,
  StudioCaption,
  StudioCaptionWord,
  StudioSocialKit,
  MouseTrackerEvent,
};
export { DEFAULT_STUDIO_STYLING };

import type {
  SoundLabSession,
  SoundLabSessionWithTracks,
  SoundLabTrack,
} from '../../lib/soundlab-types.js';
export type { SoundLabSession, SoundLabSessionWithTracks, SoundLabTrack };

import type { SerperImage, ImageFormatFilter } from '../services/serper.js';
import type { DownloadResourceResult } from '../services/downloader.js';
export type { SerperImage, ImageFormatFilter, DownloadResourceResult };

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

export type ChatContext = {
  pageId?: string;
  notebookId?: string;
  /** The project this turn is scoped to, when the surface carries `?project=`. */
  projectId?: string;
};

/**
 * The turn's operating mode, declared by the caller.
 *
 * WHY THIS IS A PAYLOAD FIELD AND NOT A GUESS: the mode used to come from
 * `detectMode()`, a regex over the latest user message. That made a single
 * wording decision a point of failure — rephrase the generated prompt and the
 * notebook protocol silently never fires, and a follow-up turn ("now do the
 * same for Redis") carries no mode keyword at all, so it degrades to a plain
 * chat. A surface that *knows* it is generating a notebook now says so.
 *
 * Omit it for free-form chat and the heuristic still applies as a fallback.
 */
export type AgentIntent = 'chat' | 'research' | 'notebook';

export interface IpcChannels {
  // Session management
  'sessions:list': {
    req: { projectId?: string | null } | void;
    res: Session[];
  };
  'sessions:create': {
    req: { title?: string; projectId?: string | null };
    res: Session;
  };
  'sessions:delete': { req: { id: string }; res: boolean };
  'sessions:rename': { req: { id: string; title: string }; res: void };
  'sessions:set-project': {
    req: { id: string; projectId: string | null };
    res: void;
  };
  'sessions:messages': { req: { id: string }; res: UIMessage[] };
  /** Persist the renderer's reconstructed conversation (upsert by message id). */
  'sessions:save-messages': {
    req: { sessionId: string; messages: UIMessage[] };
    res: void;
  };
  /**
   * A session was created, renamed, deleted, or moved between projects.
   *
   * Needed because the rail reads sessions in two places — the main menu's
   * recents list and the ChatMenu conversation list — and both show the same
   * rows; without this a deleted conversation stays on screen until something
   * forces a remount. Same broadcast shape as `projects:changed`.
   */
  'sessions:changed': void;

  // Settings
  'settings:get': {
    req: void;
    res: Omit<AppSettings, 'providers' | 'serviceKeys'> & {
      providers: Record<string, { apiKey?: boolean; baseURL?: string }>;
      /** Which external services have a key set (never the value itself). */
      serviceKeysSet: Record<string, boolean>;
      /** True once first-launch onboarding has been finished or skipped. */
      onboardingCompleted: boolean;
    };
  };
  'settings:save': { req: Partial<AppSettings>; res: void };
  /**
   * Settings were written — re-read them.
   *
   * Needed because the readouts that display the active provider/model live in
   * components that mounted long before the Settings dialog opened (the sidebar
   * footer, the composer indicator), so a local state update inside the dialog
   * cannot reach them. Same broadcast shape as `projects:changed`.
   */
  'settings:changed': void;
  /**
   * Record the project the user is working in, so a fresh launch restores it.
   *
   * Separate from `settings:save` on purpose: that channel is the Settings
   * dialog's, and it saves per-section with a merge that would drag unrelated
   * provider state along. The active project is set by a sidebar click, not by
   * the dialog, and should not require opening Settings.
   *
   * Pass `null` to clear it.
   */
  'settings:set-active-project': {
    req: { projectId: string | null };
    res: void;
  };

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

  // ── Serper Resource Search & Download ───────────────────────────────────────
  'serper:search-images': {
    req: {
      query: string;
      count?: number;
      formatFilter?: ImageFormatFilter;
      country?: string;
    };
    res: {
      success: boolean;
      total: number;
      images: SerperImage[];
      error?: string;
    };
  };
  'serper:download-asset': {
    req: {
      url: string;
      projectId?: string;
      studioTakeId?: string;
      filename?: string;
      targetFolder?: string;
      overwrite?: boolean;
    };
    res: DownloadResourceResult;
  };

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
  'pages:save-blocks': {
    req: { id: string; blocks: Block[]; title?: string };
    res: void;
  };
  'pages:search': { req: { query: string; limit?: number }; res: SearchHit[] };
  'pages:restore-version': { req: { versionId: string }; res: boolean };
  'workspace:tags': { req: void; res: { name: string; count: number }[] };

  // ── Research ──────────────────────────────────────────────────────────────
  'research:trace': { req: { runId: string }; res: ResearchTrace | null };
  'research:list': {
    req: { pageId?: string; notebookId?: string };
    res: ResearchRun[];
  };

  // ── Agent chat (streaming via IPC event emitter) ──────────────────────────
  'agent:chat': {
    req: {
      sessionId: string;
      messages: UIMessage[];
      context?: ChatContext;
      /**
       * Declared operating mode. Omitted for free-form chat, where the
       * main-side heuristic still infers one from the message text.
       */
      intent?: AgentIntent;
    };
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
  'terminal:sessions-list': {
    req: { projectId?: string | null } | void;
    res: TerminalSession[];
  };
  'terminal:session-get': { req: { id: string }; res: TerminalSession | null };
  'terminal:session-create': {
    req: {
      title?: string;
      goal?: string;
      cwd?: string;
      project_id?: string | null;
    };
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
          | 'status'
          | 'output'
          | 'exit_code'
          | 'explanation'
          | 'command'
          | 'duration_ms'
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
  'terminal:approve': {
    req: { sessionId: string; blockId: string };
    res: void;
  };
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
  /** Stop / cancel an active running command block (SIGINT/Ctrl+C). */
  'terminal:stop-command': {
    req: { blockId: string };
    res: { stopped: boolean };
  };
  /** Open an external URL in the user's default browser. */
  'terminal:open-url': {
    req: { url: string };
    res: void;
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
  /** Terminal session status changed (idle / running / done / error). */
  'terminal:session-status': {
    sessionId: string;
    status: TerminalSession['status'];
  };
  /** Terminal session title changed. */
  'terminal:session-renamed': { sessionId: string; title: string };
  /** Terminal sessions list changed (created, deleted, etc). */
  'terminal:sessions-changed': void;

  // ── Projects (the productivity spine) ────────────────────────────────────────
  'projects:list': {
    req: { status?: ProjectStatus; includeArchived?: boolean } | void;
    res: Project[];
  };
  'projects:rollups': {
    req: { status?: ProjectStatus; includeArchived?: boolean } | void;
    res: ProjectRollup[];
  };
  'projects:get': { req: { id: string }; res: Project | null };
  'projects:create': {
    req: {
      name: string;
      description?: string;
      status?: ProjectStatus;
      color?: string;
      icon?: string;
      deadline?: number | null;
      repo_path?: string | null;
      notebook_id?: string | null;
    };
    res: Project;
  };
  'projects:update': {
    req: { id: string } & Partial<
      Pick<
        Project,
        | 'name'
        | 'description'
        | 'status'
        | 'color'
        | 'icon'
        | 'deadline'
        | 'repo_path'
        | 'notebook_id'
        | 'sort_order'
      >
    >;
    res: void;
  };
  /** Delete a project; its tasks are re-homed to the Inbox. */
  'projects:delete': { req: { id: string }; res: boolean };
  /** A project was created/updated/deleted — re-fetch.
   *  Declared as an event (no req/res). */
  'projects:changed': void;

  /** Prompt the user to select a directory on the local machine via native OS dialog. */
  'dialog:open-directory': {
    req: { defaultPath?: string; title?: string } | void;
    res: string | null;
  };

  // ── ADHD task manager ───────────────────────────────────────────────────────
  'tasks:list': {
    req: { status?: Task['status']; projectId?: string | null };
    res: Task[];
  };
  'tasks:create': {
    req: Pick<Task, 'title'> &
      Partial<
        Pick<
          Task,
          'description' | 'priority' | 'due_at' | 'status' | 'project_id'
        >
      >;
    res: Task;
  };
  'tasks:update': {
    req: { id: string } & Partial<
      Pick<
        Task,
        | 'title'
        | 'description'
        | 'status'
        | 'priority'
        | 'due_at'
        | 'position'
        | 'project_id'
      >
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

  // ── Focus system · breakdown steps ──────────────────────────────────────────
  'tasks:steps-list': { req: { taskId: string }; res: TaskStep[] };
  'tasks:step-add': { req: { taskId: string; title: string }; res: TaskStep };
  'tasks:step-toggle': { req: { id: string; done: boolean }; res: void };
  'tasks:step-delete': { req: { id: string }; res: void };
  /** Step progress keyed by task id, for board badges. */
  'tasks:steps-progress': { req: void; res: Record<string, StepProgress> };

  // ── Focus system · time blocking ────────────────────────────────────────────
  'tasks:blocks-list': {
    req: { from?: number; to?: number; projectId?: string | null } | void;
    res: TaskBlockWithTask[];
  };
  'tasks:block-create': {
    req: {
      task_id?: string | null;
      project_id?: string | null;
      title?: string;
      start_at: number;
      end_at: number;
    };
    res: TaskBlock;
  };
  'tasks:block-update': {
    req: { id: string } & Partial<
      Pick<TaskBlock, 'title' | 'start_at' | 'end_at' | 'status' | 'project_id'>
    >;
    res: void;
  };
  'tasks:block-delete': { req: { id: string }; res: void };

  // ── Focus system · sessions & stats ─────────────────────────────────────────
  'focus:session-create': {
    req: {
      task_id?: string | null;
      kind?: FocusSession['kind'];
      planned_sec?: number;
      actual_sec?: number;
      completed?: boolean;
      started_at?: number;
      ended_at?: number | null;
    };
    res: FocusSession;
  };
  'focus:sessions-list': {
    req: { from?: number; to?: number } | void;
    res: FocusSession[];
  };
  'focus:stats': { req: void; res: FocusStats };
  // ── Gamification & Dopamine System ──────────────────────────────────────────
  'gamification:get-state': { req: void; res: GamificationState };
  'gamification:award-xp': {
    req: { amount: number; source: string; entityId?: string };
    res: { state: GamificationState; leveledUp: boolean };
  };
  'gamification:use-shield': { req: void; res: GamificationState };
  'gamification:updated': { state: GamificationState; leveledUp: boolean };

  // ── Native Reminders & OS Notifications ─────────────────────────────────────
  'notifications:notify': {
    req: {
      title: string;
      body: string;
      silent?: boolean;
      /** Renderer path to open when the notification is clicked (just shows the window if absent). */
      navigateTo?: string;
    };
    res: boolean;
  };

  // ── AI focus copilot ────────────────────────────────────────────────────────
  /** Break a task into a checklist, persisting the steps. */
  'tasks:breakdown': {
    req: { taskId: string };
    res: { steps: TaskStep[]; note: string };
  };
  /** Turn a brain dump into real tasks, creating them. */
  'tasks:brain-dump': {
    req: { text: string };
    res: { tasks: Task[]; note: string };
  };
  /** Propose (and persist) a realistic day of time blocks. */
  'tasks:plan-day': {
    req: { day?: number; workStartMin?: number; workEndMin?: number } | void;
    res: { blocks: TaskBlock[]; note: string };
  };

  // ── Focus copilot (agent chat, streaming via IPC events) ─────────────────
  /** Run one copilot turn. Streams back over `copilot:stream-*`. */
  'copilot:chat': {
    req: { messages: UIMessage[]; context?: { projectId?: string } };
    res: void;
  };
  'copilot:stream-chunk': { data: string }; // JSON-serialised fullStream chunk
  'copilot:stream-done': { runId: string };
  'copilot:stream-error': { error: string };
  'copilot:stream-fallback': {
    fromProvider: string;
    fromModel: string;
    toProvider: string;
    toModel: string;
    reason: string;
  };
  /** The copilot may have changed tasks, blocks, or sessions — refresh. */
  'copilot:changed': void;

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
  /** PTY was automatically assigned to a newly created session on first command. */
  'pty:session-assigned': { ptyId: string; sessionId: string; title: string };

  // ── Document Studio (React-PDF document composer) ─────────────────────────
  /** List composed documents, optionally scoped by project. */
  'documents:list': {
    req: { projectId?: string | null } | void;
    res: PdfDocumentSummary[];
  };
  /** Retrieve a full composed document record by ID. */
  'documents:get': {
    req: { id: string };
    res: PdfDocumentRecord | null;
  };
  /** Save or update a document record. */
  'documents:save': {
    req: {
      id: string;
      projectId?: string | null;
      title: string;
      description?: string;
      templateId?: string;
      dataJson: string;
    };
    res: PdfDocumentRecord;
  };
  /** Delete a document by ID. */
  'documents:delete': {
    req: { id: string };
    res: boolean;
  };
  /** Export a document to a native PDF file on disk via save dialog. */
  'documents:export-file': {
    req: {
      id: string;
      format: 'pdf' | 'json';
      filename?: string;
      pdfBase64?: string;
      dataJson?: string;
    };
    res: { ok: boolean; filePath?: string; error?: string };
  };
  /** Use AI Copilot to generate a structured content block for a document. */
  'documents:ai-generate-block': {
    req: { prompt: string; blockType?: string; context?: string };
    res: { block: unknown; note?: string };
  };
  /** Broadcast when any document changes, created or deleted. */
  'documents:changed': void;

  // ── Studio (Showcase Video Generator & Recorder) ─────────────────────────
  /** List capture sources (screens and windows) via desktopCapturer. */
  'studio:list-sources': {
    req: { types?: ('screen' | 'window')[] } | void;
    res: Array<{
      id: string;
      name: string;
      thumbnailDataUrl: string;
      displayId?: string;
      appIcon?: string;
    }>;
  };
  /** List saved showcase takes, optionally scoped by project. */
  'studio:list-takes': {
    req: { projectId?: string | null } | void;
    res: StudioTakeSummary[];
  };
  /** Retrieve a full take record by ID. */
  'studio:get-take': {
    req: { id: string };
    res: StudioTake | null;
  };
  /** Save or update a showcase take record. */
  'studio:save-take': {
    req: {
      id: string;
      projectId?: string | null;
      title?: string;
      description?: string | null;
      sourceType?: 'screen' | 'window';
      sourceName?: string | null;
      durationMs?: number;
      videoPath?: string;
      audioPath?: string | null;
      mouseEventsPath?: string | null;
      cuts?: StudioCut[];
      zooms?: StudioZoom[];
      captions?: StudioCaption[];
      styling?: StudioStyling;
      socialKit?: StudioSocialKit | null;
    };
    res: StudioTake;
  };
  /** Delete a showcase take by ID. */
  'studio:delete-take': {
    req: { id: string };
    res: boolean;
  };
  /** Start global mouse telemetry tracker. */
  'studio:start-mouse-tracker': {
    req: { takeId: string } | void;
    res: { ok: boolean };
  };
  /** Stop global mouse telemetry tracker and write event log. */
  'studio:stop-mouse-tracker': {
    req: { takeId: string };
    res: { ok: boolean; count: number; filePath: string };
  };
  /** Save recorded media blob chunks to a local video file. */
  'studio:save-recording-chunk': {
    req: {
      takeId: string;
      chunkBase64: string;
      isFirst?: boolean;
      isLast: boolean;
      mimeType?: string;
      durationMs?: number;
    };
    res: { ok: boolean; videoPath: string; durationMs: number };
  };
  /** Retrieve mouse telemetry events for a take. */
  'studio:get-mouse-events': {
    req: { takeId: string };
    res: MouseTrackerEvent[];
  };
  /** Run autonomous Magic Draft processing (silence trimming, kinetic zoom curves, captions). */
  'studio:process-draft': {
    req: { takeId: string; force?: boolean };
    res: StudioTake;
  };
  /** Generate AI Social Release Kit (changelog, tweet thread, release notes). */
  'studio:generate-social-kit': {
    req: { takeId: string };
    res: StudioSocialKit;
  };
  /** Export video to MP4 or GIF via main process. */
  'studio:export-video': {
    req: {
      takeId: string;
      format: 'mp4' | 'gif' | 'webm';
      quality?: 'high' | 'medium';
    };
    res: { ok: boolean; filePath?: string; error?: string };
  };
  /** Open a file or folder in OS default file explorer. */
  'studio:open-path': {
    req: { path: string };
    res: boolean;
  };
  /** Retrieve video or media file as base64 data URL for player rendering. */
  'studio:read-video-data': {
    req: { takeId?: string; filePath?: string };
    res: string | null;
  };
  /** Create a fresh blank studio showcase project with canvas styling and empty tracks. */
  'studio:create-blank-take': {
    req: { projectId?: string | null; title?: string } | void;
    res: StudioTake;
  };
  /** Open native OS file picker to import video/audio/image assets. */
  'studio:import-media': {
    req?: { types?: ('video' | 'audio' | 'image')[] };
    res: {
      canceled: boolean;
      files: Array<{
        name: string;
        path: string;
        sizeBytes: number;
        type: 'video' | 'audio' | 'image';
      }>;
    };
  };
  /** Broadcast when any take changes, created, updated or deleted. */
  'studio:changed': void;

  // ── SoundLab (Brain Entrainment DAW) ──────────────────────────────────────
  /** List saved sessions, optionally scoped by project. */
  'soundlab:list': {
    req: { projectId?: string | null } | void;
    res: SoundLabSession[];
  };
  /** Fetch a full session including all tracks. */
  'soundlab:get': {
    req: { id: string };
    res: SoundLabSessionWithTracks | null;
  };
  /** Upsert a session and all its tracks atomically. */
  'soundlab:save': {
    req: SoundLabSessionWithTracks;
    res: { id: string };
  };
  /** Hard-delete a session (tracks cascade). */
  'soundlab:delete': {
    req: { id: string };
    res: { ok: boolean };
  };
  /** Broadcast when any session changes (created, updated, deleted). */
  'soundlab:changed': void;

  // ── Studio Copilot (Autonomous Video Director Agent) ─────────────────────
  /** Run one studio copilot turn. Streams back over `studio-copilot:stream-*`. */
  'studio-copilot:chat': {
    req: {
      messages: UIMessage[];
      context: {
        takeId: string;
        projectId?: string;
        currentTimeMs?: number;
      };
    };
    res: void;
  };
  'studio-copilot:stream-chunk': { data: string }; // JSON-serialised fullStream chunk
  'studio-copilot:stream-done': { runId: string };
  'studio-copilot:stream-error': { error: string };
  'studio-copilot:stream-fallback': {
    fromProvider: string;
    fromModel: string;
    toProvider: string;
    toModel: string;
    reason: string;
  };

  // ── SoundLab Copilot (Autonomous Neuro-Acoustic Producer Agent) ──────────
  /** Run one SoundLab copilot turn. Streams back over `soundlab-copilot:stream-*`. */
  'soundlab-copilot:chat': {
    req: {
      messages: UIMessage[];
      context: {
        sessionId: string;
        projectId?: string;
        currentBeat?: number;
      };
    };
    res: void;
  };
  'soundlab-copilot:stream-chunk': { data: string }; // JSON-serialised fullStream chunk
  'soundlab-copilot:stream-done': { runId: string };
  'soundlab-copilot:stream-error': { error: string };
  'soundlab-copilot:stream-fallback': {
    fromProvider: string;
    fromModel: string;
    toProvider: string;
    toModel: string;
    reason: string;
  };

  // ── Native shell integration ────────────────────────────────────────────────
  /** Navigate the app router to a path. Sent by tray, menu, notifications, deep links. */
  'ui:navigate': { path: string };
  /** The OS is suspending — long-running timers (focus) should pause cleanly. */
  'power:suspended': void;
  /** Hold or release a power-save blocker so OS throttling can't stall a focus session. */
  'focus:set-power-blocker': {
    req: { enabled: boolean };
    res: { active: boolean };
  };
}

export type ChannelName = keyof IpcChannels;
