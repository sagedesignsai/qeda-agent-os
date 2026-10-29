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
  RecentPage,
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
import type {
  Project,
  ProjectStatus,
  ProjectRollup,
  ProjectOverview,
  ProjectFocusDay,
  ProjectLinkedCounts,
} from '../db/projects.js';
import type { CodeProject } from '../db/code-projects.js';
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
  StudioEffect,
  StudioOverlay,
  StudioVideoCrop,
  MouseTrackerEvent,
  StudioMediaProbe,
} from '../../lib/studio-types.js';
import { DEFAULT_STUDIO_STYLING } from '../../lib/studio-types.js';
import type {
  BuilderEngine,
  McpServerSettings,
  McpServerStatus,
  McpTestResult,
  McpToolSummary,
  McpTransportKind,
  McpServerPreset,
} from '../../lib/builder-engine.js';
import type {
  Contact,
  ContactChannel,
  ContactWithChannels,
  HarvestImportResult,
} from '../db/correspondence.js';
import type {
  AdvanceResult,
  Sequence,
  SequenceDetail,
  SequenceRunDetail,
} from '../db/sequences.js';
import type {
  AttentionRow,
  CorrespondenceEvent,
  DispatchInput,
  EscalationInput,
  EscalationResult,
  MessageAttachment,
  MessageDetail,
  MessageRecipient,
  MessageSummary,
  RecipientPatch,
  RecipientPick,
  RecipientWithContact,
  SaveMessageInput,
} from '../db/messages.js';
import type {
  HarvestChannelDraft,
  HarvestRowDraft,
  HarvestScanResult,
} from '../../lib/harvest.js';
import type {
  ChannelVerification,
  ContactChannelKind,
  ContactKind,
  ContactSource,
} from '../../lib/correspondence.js';
import {
  CHANNEL_LABELS,
  CONTACT_CHANNEL_KINDS,
  VERIFICATION_LABELS,
} from '../../lib/correspondence.js';

// Re-export the domain types so the renderer can import them from the channel
// contract module rather than reaching into the database layer.
export type { Notebook, Page, PageVersion, SearchHit, RecentPage };
export type { Block };
export type { ResearchRun, ResearchSourceWithEvidence };
export type { ServiceStatus };
export type {
  BuilderEngine,
  McpServerSettings,
  McpServerStatus,
  McpTestResult,
  McpToolSummary,
  McpTransportKind,
  McpServerPreset,
};
export type { CodeProject };
export type { TerminalSession, TerminalBlock };
export type { Task };
export type { TaskStep, StepProgress };
export type { TaskBlock, TaskBlockWithTask };
export type { FocusSession, FocusStats };
export type {
  Project,
  ProjectStatus,
  ProjectRollup,
  ProjectOverview,
  ProjectFocusDay,
  ProjectLinkedCounts,
};
export type { GamificationState };
export type { PdfDocumentRecord, PdfDocumentSummary };
export type {
  Contact,
  ContactChannel,
  ContactWithChannels,
  HarvestImportResult,
};
export type { AdvanceResult, Sequence, SequenceDetail, SequenceRunDetail };
export type {
  AttentionRow,
  CorrespondenceEvent,
  EscalationInput,
  EscalationResult,
  MessageAttachment,
  MessageDetail,
  MessageRecipient,
  MessageSummary,
  RecipientWithContact,
  SaveMessageInput,
  DispatchInput,
  RecipientPatch,
  RecipientPick,
};
export type { HarvestChannelDraft, HarvestRowDraft, HarvestScanResult };
export type {
  ChannelVerification,
  ContactChannelKind,
  ContactKind,
  ContactSource,
};
export { CHANNEL_LABELS, CONTACT_CHANNEL_KINDS, VERIFICATION_LABELS };
export type {
  StudioTake,
  StudioTakeSummary,
  StudioStyling,
  StudioCut,
  StudioZoom,
  StudioCaption,
  StudioCaptionWord,
  StudioSocialKit,
  StudioEffect,
  StudioOverlay,
  StudioVideoCrop,
  MouseTrackerEvent,
  StudioMediaProbe,
};
export type {
  StudioEffectType,
  StudioOverlayKind,
  StudioAspectRatio,
  StudioCameraEasing,
  StudioCaptionStyle,
  StudioClipPayload,
  TrackType,
  TimelineClip,
  TimelineTrack,
} from '../../lib/studio-types.js';
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
import type {
  BuilderConnectionStatus,
  BuilderModelOption,
} from '../../lib/builder-types.js';
import type {
  BuilderSessionEvent,
  BuilderSessionStart,
  BuilderSessionState,
} from '../../lib/builder-session.js';
import type {
  BuilderWorkspace,
  BuilderFileNode,
  BuilderFileChange,
} from '../../lib/builder-workspace.js';
import type { BuilderPreviewStatus } from '../../lib/builder-preview.js';
export type {
  BuilderPreviewOwner,
  BuilderPreviewState,
  BuilderPreviewStatus,
} from '../../lib/builder-preview.js';
export type {
  BuilderConnectionStatus,
  BuilderConnectionState,
  BuilderModelOption,
} from '../../lib/builder-types.js';
export type {
  BuilderSessionEvent,
  BuilderSessionStart,
  BuilderSessionState,
  BuilderSessionSummary,
  BuilderFormReply,
} from '../../lib/builder-session.js';
export type {
  BuilderWorkspace,
  BuilderFile,
  BuilderFileChange,
  BuilderFileNode,
  BuilderChangeKind,
} from '../../lib/builder-workspace.js';
import type {
  AgentPlan,
  PlanItem,
  PlanItemStatus,
  AgentPlanEvent,
} from '../../lib/agent-plan.js';
export type { AgentPlan, PlanItem, PlanItemStatus, AgentPlanEvent };

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
  /** Environment variable names accepted for this provider. */
  apiKeyEnvs: string[];
  /** Whether a usable key is available. */
  apiKeySet: boolean;
  /** Where that key comes from – an env var name, the encrypted store, or none. */
  apiKeySource: 'settings' | 'environment' | null;
  /** The user-selected source, even when that source currently has no key. */
  apiKeyPreference: 'settings' | 'environment';
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
  /**
   * The task the user is currently focused on, when a surface passes one.
   * Injected into the agent system prompt so the agent knows what concrete
   * work is in play without having to call listTasks.
   */
  taskId?: string;
  /**
   * An in-progress research run, so the agent can continue it rather than
   * starting a new one.
   */
  researchRunId?: string;
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
  // OpenCode-powered coding Builder
  /** Inspect the registered local OpenCode service without starting/stopping it. */
  'builder:connection-status': {
    req: void;
    res: BuilderConnectionStatus;
  };
  // OpenCode installation + plugin management
  'opencode:detect': {
    req: void;
    res: import('../../main/opencode/detection').OpenCodeDetection;
  };
  'opencode:open-install-page': {
    req: void;
    res: void;
  };
  'opencode:register-plugin': {
    req: { mode: 'bundled' | 'published'; resourcePath?: string };
    res: import('../../main/opencode/registration').RegistrationResult;
  };
  'opencode:unregister-plugin': {
    req: { entry: string };
    res: import('../../main/opencode/registration').RegistrationResult;
  };
  'opencode:registered-plugins': {
    req: void;
    res: string[];
  };
  /**
   * Resolve a chosen folder to a canonical git repository and describe it.
   * Throws (rejects) with a user-facing message when it is not usable.
   */
  'builder:workspace-validate': {
    req: { directory: string };
    res: BuilderWorkspace;
  };
  /** Project-scoped codebases, separate from the legacy single repo_path. */
  'builder:code-projects:list': {
    req: { projectId: string };
    res: CodeProject[];
  };
  'builder:code-projects:register': {
    req: { projectId: string; directory: string };
    res: CodeProject;
  };
  'builder:code-projects:provision': {
    req: {
      projectId: string;
      parentDirectory: string;
      name: string;
      source: 'created' | 'clone';
      remoteUrl?: string;
    };
    res: CodeProject;
  };
  'builder:code-projects:index': {
    req: { codeProjectId: string };
    res: { indexedFiles: number; indexedChunks: number; skippedFiles: number };
  };
  'builder:code-projects:delete': {
    req: { codeProjectId: string };
    res: boolean;
  };
  /**
   * Create an OpenCode session bound to an explicit workspace directory.
   * The directory is re-validated here; a session is never created against
   * OpenCode's ambient default location.
   */
  'builder:session-create': {
    req: {
      directory: string;
      runInSandbox?: boolean;
      remoteUrl?: string;
    };
    res: BuilderSessionStart;
  };
  /** Re-attach state for the active session (identity, workspace, event buffer). */
  'builder:session-state': { req: void; res: BuilderSessionState };
  /** Submit one coding prompt to the active session. Streams over `builder:session-event`. */
  'builder:prompt': { req: { text: string }; res: void };
  /** Available models and the active session's model, from its OpenCode project. */
  'builder:models': {
    req: void;
    res: { models: BuilderModelOption[]; selected: BuilderModelOption | null };
  };
  /** Change the active session's model for subsequent turns. */
  'builder:model-select': {
    req: { providerID: string; modelID: string };
    res: void;
  };
  /** Abort the in-flight coding turn (the kill switch). */
  'builder:abort': { req: void; res: void };
  /** Submit a response to a Builder-owned permission request. */
  'builder:permission-reply': {
    req: { requestId: string; decision: 'once' | 'always' | 'reject' };
    res: void;
  };
  /** Submit or cancel a Builder-owned OpenCode form. */
  'builder:form-reply': {
    req: {
      formId: string;
      answer?: Record<string, string | number | boolean | string[]>;
      cancel?: boolean;
    };
    res: void;
  };
  /** Normalized live events for the active Builder-owned session. */
  'builder:session-event': BuilderSessionEvent;
  /**
   * Disconnect: release the active session without deleting its worktree or
   * persisted context, so `builder:session-state` can re-attach later.
   */
  'builder:session-detach': { req: void; res: void };
  /** Discard: stop the active session and delete its isolated worktree. */
  'builder:session-stop': { req: void; res: void };
  /**
   * Start a preview process Qeda owns, in the *active session's* workspace.
   * The directory is not a parameter: it is always the workspace main already
   * validated, so the renderer cannot point a spawn at an arbitrary repo.
   */
  'builder:preview-start': {
    req: { script?: string; command?: string } | void;
    res: BuilderPreviewStatus;
  };
  /** Stop the Qeda-owned preview process (never a detected one). */
  'builder:preview-stop': { req: void; res: BuilderPreviewStatus };
  /** Current preview state — the re-attach snapshot after a route change. */
  'builder:preview-status': { req: void; res: BuilderPreviewStatus };
  /** Open a preview URL in the user's own browser. */
  'builder:preview-open': { req: { url: string }; res: void };
  /** Fired on every preview state change (log lines included). */
  'builder:preview-changed': BuilderPreviewStatus;
  /**
   * Walk the active session's workspace directory and return a tree of files
   * that are tracked or untracked by git (i.e., not in .gitignore).
   * Returns an empty array when no session is bound.
   */
  'builder:workspace-files': { req: void; res: BuilderFileNode[] };
  /**
   * Return git diff --numstat + unified diff for every changed file in the
   * active session's workspace. Returns an empty array when there are no
   * changes or no session is bound.
   */
  'builder:workspace-changes': { req: void; res: BuilderFileChange[] };
  /**
   * Read a single file from the active workspace.
   * `filePath` is relative to the workspace root. Throws when the path
   * traverses outside the workspace or the file is binary.
   */
  'builder:workspace-file-read': {
    req: { filePath: string };
    res: { content: string; language?: string; truncated: boolean };
  };
  /**
   * Apply all agent changes from the worktree to the source repository's
   * working tree. The user still commits manually. Returns the list of
   * affected paths.
   */
  'builder:changes-keep': { req: void; res: { paths: string[] } };
  /**
   * Reset the worktree to HEAD, discarding all agent changes. Does not
   * remove the worktree — the session can continue.
   */
  'builder:changes-discard': { req: void; res: void };

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
      providers: Record<
        string,
        {
          apiKey?: boolean;
          apiKeySource?: 'settings' | 'environment';
          baseURL?: string;
        }
      >;
      /** Which external services have a key set (never the value itself). */
      serviceKeysSet: Record<string, boolean>;
      /** True once first-launch onboarding has been finished or skipped. */
      onboardingCompleted: boolean;
      /** Which agent runtime powers Builder coding turns. */
      builderEngine: BuilderEngine;
      /**
       * Configured MCP server list. Secret values in env/headers are stripped
       * (the renderer only needs names and enabled flags for display; keys are
       * never sent over IPC).
       */
      mcpServers: Array<
        Omit<McpServerSettings, 'env' | 'headers'> & {
          /** True when any env value is set (never the values themselves). */
          hasEnv: boolean;
          /** True when any header value is set (never the values themselves). */
          hasHeaders: boolean;
        }
      >;
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
   * Pass `null` with `explicitlyAllProjects` to persist a deliberate global
   * choice. A plain null clears a stale/automatic default and permits relaunch
   * default selection.
   */
  'settings:set-active-project': {
    req: { projectId: string | null; explicitlyAllProjects?: boolean };
    res: void;
  };

  // ── MCP server management ─────────────────────────────────────────────────
  /**
   * Return live connection status (connected/connecting/error/disabled) and
   * discovered tool counts for all configured MCP servers.
   * The Local Builder agent must be active for statuses to be live; otherwise
   * the manager performs a lightweight on-demand probe.
   */
  'mcp:statuses': { req: void; res: McpServerStatus[] };
  /**
   * One-off probe: connects to a specific server config, retrieves tools, and
   * immediately tears the connection down. Used by the Settings dialog's
   * "Test connection" action. Resolves with success=false (not rejects) on
   * connectivity errors.
   */
  'mcp:test-server': { req: McpServerSettings; res: McpTestResult };
  /**
   * Close all active MCP connections and reconnect enabled servers using the
   * latest settings. Called after saving a changed MCP server list.
   */
  'mcp:reload': { req: void; res: { activeCount: number } };

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
    req: {
      title: string;
      description?: string;
      icon?: string;
      projectId?: string | null;
    };
    res: Notebook;
  };
  'notebooks:update': {
    req: {
      id: string;
      title?: string;
      description?: string;
      icon?: string;
      project_id?: string | null;
    };
    res: void;
  };
  'notebooks:delete': { req: { id: string }; res: void };

  'pages:list': { req: { notebookId?: string }; res: Page[] };
  'pages:recent': { req: { limit?: number }; res: RecentPage[] };
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
  /** Pushed when the agent creates or updates its plan. */
  'agent:plan-event': { data: AgentPlanEvent };

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
    req: {
      sessionId: string;
      goal: string;
      /**
       * Optional task to mark `done` when the terminal agent successfully
       * completes the goal. The handler will call `tasks:changed` so the
       * Tasks page reflects the update without a manual refresh.
       */
      taskId?: string;
    };
    res: void;
  };
  /**
   * The terminal agent completed a goal that was linked to a task.
   * Carries the now-completed task id so the Tasks page can highlight it.
   */
  'terminal:goal-done': { sessionId: string; taskId: string };
  /** Pushed when the terminal agent creates or updates its plan. */
  'terminal:plan-event': { data: AgentPlanEvent };
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
  /**
   * The project detail page in one read: rollup, trailing focus trend, recent
   * tasks, and adjacent-work counts. `days` defaults to 14 in main.
   */
  'projects:overview': {
    req: { id: string; days?: number };
    res: ProjectOverview | null;
  };
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
  /** Persist a manual project order, e.g. after a drag. `sort_order` = index. */
  'projects:reorder': { req: { orderedIds: string[] }; res: void };
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
  /**
   * A task was created, updated, or deleted — re-fetch.
   * Mirrors `projects:changed` and `copilot:changed` so any surface
   * subscribed to this event stays consistent without polling.
   */
  'tasks:changed': void;
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
  /** Pushed when the focus copilot creates or updates its plan. */
  'copilot:plan-event': { data: AgentPlanEvent };
  /** The copilot may have changed tasks, blocks, or sessions — refresh. */
  'copilot:changed': void;

  /** Get current directory and Git context for the terminal composer. */
  'terminal:get-context-info': {
    req: { cwd?: string } | void;
    res: {
      cwd: string;
      gitBranch: string | null;
      gitRoot: string | null;
      changedFiles: number;
      additions: number;
      deletions: number;
    };
  };
  'terminal:list-directories': {
    req: { cwd: string };
    res: { parentDir: string | null; directories: string[] };
  };
  'terminal:set-session-cwd': {
    req: { sessionId: string; cwd: string };
    res: void;
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
    req: { projectId?: string | null; limit?: number; offset?: number } | void;
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
      effects?: StudioEffect[];
      overlays?: StudioOverlay[];
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
  /** Prompt OS save dialog for showcase export. */
  'studio:prompt-save-dialog': {
    req: {
      takeId: string;
      format: 'mp4' | 'gif' | 'webm';
      defaultTitle?: string;
    };
    res: { canceled: boolean; filePath?: string };
  };
  /** Save a chunk of rendered showcase composition video for export. */
  'studio:save-rendered-chunk': {
    req: {
      takeId: string;
      chunkBase64?: string;
      chunk?: ArrayBuffer | Uint8Array;
      isFirst?: boolean;
      isLast: boolean;
    };
    res: { ok: boolean; filePath: string };
  };
  /** Prepares native media: probe, dense-GOP intermediate, filmstrip sprite, and audio peaks. */
  'studio:prep-media': {
    req: { takeId: string; force?: boolean };
    res: {
      ok: boolean;
      probe?: StudioMediaProbe | null;
      optimizedPath?: string | null;
      filmstripPath?: string | null;
      waveformPath?: string | null;
      error?: string;
    };
  };
  /** Stream media prep progress updates. Declared as an event. */
  'studio:media-progress': {
    takeId: string;
    stage: 'probing' | 'optimizing' | 'filmstrip' | 'waveform' | 'ready' | 'error';
    progress: number;
    error?: string;
  };
  /** Fetches prepared media sidecars (audio peaks & filmstrip metadata). */
  'studio:get-media-sidecars': {
    req: { takeId: string };
    res: {
      probe?: StudioMediaProbe | null;
      peaks?: number[] | null;
      filmstripUrl?: string | null;
      filmstripMeta?: {
        tileW: number;
        tileH: number;
        cols: number;
        rows: number;
        intervalMs: number;
        totalTiles: number;
      } | null;
    };
  };
  /** Export video to MP4 or GIF via main process. */
  'studio:export-video': {
    req: {
      takeId: string;
      format: 'mp4' | 'gif' | 'webm';
      quality?: 'high' | 'medium';
      targetPath?: string;
      renderedVideoPath?: string;
    };
    res: { ok: boolean; filePath?: string; error?: string };
  };
  /** Open a file or folder in OS default file explorer. */
  'studio:open-path': {
    req: { path: string };
    res: boolean;
  };
  /** Get a streaming URL for a saved Studio take; media bytes never cross IPC. */
  'studio:read-video-data': {
    req: { takeId?: string };
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

  // ── Computer Use (screen capture + input) ──────────────────────────────────
  'computer-use:get-screen-size': { req: void; res: { width: number; height: number } };
  'computer-use:get-cursor-position': { req: void; res: { x: number; y: number } };
  'computer-use:move-mouse': { req: { x: number; y: number }; res: { ok: boolean } };
  'computer-use:click': {
    req: { x: number; y: number; button?: 'left' | 'right' | 'middle' };
    res: { ok: boolean };
  };
  'computer-use:double-click': { req: { x: number; y: number }; res: { ok: boolean } };
  'computer-use:type-text': { req: { text: string }; res: { ok: boolean } };
  'computer-use:press-key': {
    req: { key: string; modifiers?: string[] };
    res: { ok: boolean };
  };
  'computer-use:scroll': {
    req: { x: number; y: number; deltaX: number; deltaY: number };
    res: { ok: boolean };
  };
  'computer-use:capture-screenshot': {
    req: { sourceId?: string } | void;
    res: { dataUrl: string; width: number; height: number } | null;
  };
  'computer-use:get-active-window': { req: void; res: { title: string | null } };
  'computer-use:is-allowed': {
    req: void;
    res: { allowed: boolean; reason?: string; activeWindow: string | null };
  };
  'computer-use:wait': { req: { ms: number }; res: { ok: boolean } };
  /** Broadcast when computer-use state/settings change. */
  'computer-use:changed': void;
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
  /** Pushed when the studio copilot creates or updates its plan. */
  'studio-copilot:plan-event': { data: AgentPlanEvent };

  // ── Document Drafter (Professional Document Drafting Agent) ───────────────
  /**
   * Run one document drafter turn. Streams back over `document-drafter:stream-*`.
   * `context` is optional in full: an undefined context means "draft a new
   * document from scratch, no project and no task".
   */
  'document-drafter:chat': {
    req: {
      messages: UIMessage[];
      context?: {
        documentId?: string;
        projectId?: string;
        taskId?: string;
      };
    };
    res: void;
  };
  'document-drafter:stream-chunk': { data: string }; // JSON-serialised fullStream chunk
  'document-drafter:stream-done': { runId: string };
  /**
   * Emitted when the run stopped because it hit its step ceiling, NOT because the
   * model finished. `stream-done` still fires in this case — the run did end —
   * so this is an ADDITIONAL signal the renderer must surface, not a replacement.
   *
   * WHY this channel has to exist: the agent is capped at a fixed step budget
   * (`isStepCount(20)`), and the SDK exposes no `stepLimitReached` flag. A run
   * that dies on step 20 while writing block 14 of a Letter of Demand is
   * indistinguishable from a completed document unless something says otherwise
   * — the renderer's chat hook drops `finish` chunks, so `finishReason` never
   * reaches it. "Half-written legal instrument presented as finished" is the
   * worst failure mode this feature has, so it must be detectable from main.
   *
   * `steps` is what was actually consumed, `budget` the ceiling that was hit.
   */
  'document-drafter:stream-truncated': { steps: number; budget: number };
  'document-drafter:stream-error': { error: string };
  'document-drafter:stream-fallback': {
    fromProvider: string;
    fromModel: string;
    toProvider: string;
    toModel: string;
    reason: string;
  };
  /** Pushed when the document drafter creates or updates its plan. */
  'document-drafter:plan-event': { data: AgentPlanEvent };
  // NOTE: there is deliberately no 'document-drafter:changed' channel. The
  // drafter broadcasts the existing 'documents:changed' invalidation event,
  // which `use-documents.ts` already listens to — a second event would mean two
  // subscription sites and one of them would eventually be forgotten.

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
  /** Pushed when the soundlab copilot creates or updates its plan. */
  'soundlab-copilot:plan-event': { data: AgentPlanEvent };

  // ── Correspondence ─────────────────────────────────────────────────────────
  //
  // The registry, plus Harvest — the extraction path that stops a system like
  // this from failing at the first screen (nobody types 147 cells into a form).
  //
  // There is deliberately NO send channel here. v1 owns the intent, not the
  // delivery: `message-dispatch` (Phase 2) records that something left, when, and
  // on what clock. That is also what makes "an agent cannot send your legal
  // correspondence" a structural fact rather than a policy setting.
  /** Contacts with their channels, for one project scope or the whole registry. */
  'correspondence:contacts-list': {
    req: { projectId?: string | null } | void;
    res: ContactWithChannels[];
  };
  /** Create or patch a contact. */
  'correspondence:contact-save': {
    req: {
      id?: string;
      projectId?: string | null;
      kind?: ContactKind;
      name: string;
      role?: string;
      parentId?: string | null;
      notes?: string;
    };
    res: ContactWithChannels;
  };
  'correspondence:contact-delete': { req: { id: string }; res: boolean };
  /**
   * Create or patch one way of reaching a contact.
   *
   * Changing a channel's value re-opens its verification, because the previous
   * check was about the previous address.
   */
  'correspondence:channel-save': {
    req: {
      id?: string;
      contactId: string;
      kind: ContactChannelKind;
      value: string;
      label?: string;
      source?: ContactSource;
      confidence?: number | null;
    };
    res: ContactChannel;
  };
  'correspondence:channel-delete': { req: { id: string }; res: boolean };
  /** Record the outcome of checking a channel: confirmed, or bounced. */
  'correspondence:channel-set-verified': {
    req: { id: string; verified: ChannelVerification };
    res: ContactChannel | null;
  };
  /** Registry totals for the rail badge and the project card. */
  'correspondence:counts': {
    req: { projectId?: string | null } | void;
    res: { contacts: number; channels: number; unverified: number };
  };
  /**
   * Read a source and propose contacts from it. Writes nothing.
   *
   * Returns drafts for a review grid, so the round trip is scan → review → import
   * and the user's edit is the only thing that ever reaches the database.
   */
  'correspondence:harvest-scan': {
    req: {
      projectId?: string | null;
      source:
        | { kind: 'page'; pageId: string }
        | { kind: 'document'; documentId: string }
        | { kind: 'text'; text: string; label?: string };
      /** Run the model pass on top of the deterministic scan. Defaults to true. */
      useAgent?: boolean;
    };
    res: HarvestScanResult;
  };
  /** Write a reviewed harvest grid. Idempotent: re-importing merges. */
  'correspondence:harvest-import': {
    req: { projectId: string | null; rows: HarvestRowDraft[] };
    res: HarvestImportResult;
  };
  // ── Messages and their per-recipient state ────────────────────────────────
  //
  // A message is a record, and `message_recipients` is the state machine: one row
  // per body, each with its own absolute clock. `message-dispatch` is the only
  // verb that starts a clock, and it does not perform any transport — see
  // `db/messages.ts`. There is still no channel here that could send anything.
  /** Sent and logged items for one scope, with their counts. */
  'correspondence:messages-list': {
    req: { projectId?: string | null } | void;
    res: MessageSummary[];
  };
  'correspondence:message-get': {
    req: { id: string };
    res: MessageDetail | null;
  };
  /** Create or patch a message, including replacing its attachments. */
  'correspondence:message-save': {
    req: SaveMessageInput;
    res: MessageDetail;
  };
  'correspondence:message-delete': { req: { id: string }; res: boolean };
  /** Reconcile the queued recipient list. Dispatched recipients are never touched. */
  'correspondence:message-set-recipients': {
    req: { messageId: string; picks: RecipientPick[] };
    res: MessageDetail;
  };
  /**
   * Record that something was sent: stamps the time, starts each recipient's
   * clock, and writes one event per body. Performs no delivery.
   */
  'correspondence:message-dispatch': {
    req: DispatchInput;
    res: MessageDetail;
  };
  /** Log a reply, record a reference, move or clear a deadline, mark no response. */
  'correspondence:recipient-update': {
    req: { id: string; patch: RecipientPatch };
    res: RecipientWithContact | null;
  };
  /**
   * Turn "they went quiet" into a task, in the existing task manager, linked back.
   * Safe to repeat: a recipient that already has a chase task is reported, not
   * duplicated.
   */
  'correspondence:recipient-escalate': {
    req: EscalationInput;
    res: EscalationResult;
  };
  /**
   * The append-only trail for one recipient — every dispatch, reply, deadline
   * change and escalation, oldest last. Read on demand from the lane.
   */
  'correspondence:recipient-events': {
    req: { id: string };
    res: CorrespondenceEvent[];
  };
  /** What needs the user, most urgent first — the board's verb surface. */
  'correspondence:attention-list': {
    req: { projectId?: string | null } | void;
    res: AttentionRow[];
  };
  /**
   * Every deadline still running, including comfortable ones — the rail's read.
   * Wider than the attention list on purpose: an axis has to show the whole
   * situation, not only the parts that need a decision.
   */
  'correspondence:clocks': {
    req: { projectId?: string | null } | void;
    res: RecipientWithContact[];
  };
  'correspondence:message-counts': {
    req: { projectId?: string | null } | void;
    res: {
      messages: number;
      awaiting: number;
      overdue: number;
      nextDueAt: number | null;
    };
  };
  // ── Sequences ─────────────────────────────────────────────────────────────
  //
  // Wait → chase → escalate, as ordered steps. The runner is deterministic and
  // session-driven: `sequence-advance` is called with the user present, and a step
  // that came due while the app was closed is reported as stalled rather than fired.
  // Nothing here decides what to do next with a model.
  'correspondence:sequences-list': {
    req: { projectId?: string | null } | void;
    res: Sequence[];
  };
  /** Create a plan from an explicit step list (the UI sends a template's steps). */
  'correspondence:sequence-create': {
    req: {
      projectId?: string | null;
      name: string;
      description?: string;
      steps: Array<{
        kind: 'wait' | 'branch' | 'escalate' | 'task' | 'stop';
        title: string;
        config?: Record<string, unknown>;
      }>;
    };
    res: SequenceDetail;
  };
  'correspondence:sequence-get': {
    req: { id: string };
    res: SequenceDetail | null;
  };
  /** Attach a plan to a dispatched message. Materialises every step up front. */
  'correspondence:sequence-start': {
    req: { sequenceId: string; messageId: string; projectId?: string | null };
    res: SequenceRunDetail;
  };
  /** Where a plan stands — waiting, due, or stalled. */
  'correspondence:sequence-run': {
    req: { runId: string };
    res: SequenceRunDetail | null;
  };
  'correspondence:sequence-runs-for-message': {
    req: { messageId: string };
    res: SequenceRunDetail[];
  };
  /**
   * Advance exactly one named step. Called without `fireStepId` it fires nothing and
   * only reports where the plan stands — there is no watch-and-fire path, so a plan
   * can never advance while nobody asked.
   */
  'correspondence:sequence-advance': {
    req: { runId: string; fireStepId?: string };
    res: AdvanceResult;
  };
  'correspondence:sequence-stop': { req: { runId: string }; res: void };
  /** Plans with a step that came due while the app was closed. Read at startup. */
  'correspondence:sequence-stalled': {
    req: { projectId?: string | null } | void;
    res: SequenceRunDetail[];
  };

  /** The registry changed — re-fetch. Declared as an event (no req/res). */
  'correspondence:changed': void;

  // ── Correspondence Copilot ──────────────────────────────────────────────────
  /** Run one correspondence copilot turn. Streams back over `correspondence-copilot:stream-*`. */
  'correspondence-copilot:chat': {
    req: {
      messages: UIMessage[];
      context?: { projectId?: string };
    };
    res: void;
  };
  'correspondence-copilot:stream-chunk': string;
  'correspondence-copilot:stream-done': { runId: string };
  'correspondence-copilot:stream-error': { error: string };
  'correspondence-copilot:stream-fallback': {
    fromProvider: string;
    fromModel: string;
    toProvider: string;
    toModel: string;
    reason: string;
  };
  /** Pushed when the correspondence copilot creates or updates its plan. */
  'correspondence-copilot:plan-event': { data: AgentPlanEvent };

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
// OpenCode setup types (renderer-facing). Re-exported so the renderer never
// reaches into the main-process modules directly.
export type { OpenCodeDetection } from '../../main/opencode/detection';
export type { RegistrationResult } from '../../main/opencode/registration';
