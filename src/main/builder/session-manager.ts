/**
 * builder/session-manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsulates all per-session state for a single Builder workspace.
 *
 * Previously, ~15 module-level variables in handlers/builder.ts tracked one
 * session at a time. Each BuilderSessionManager instance owns its own event
 * buffer, preview, engine runtime, plan manager, and persist timer. The IPC
 * handler holds a Map<string, BuilderSessionManager> keyed by session ID,
 * enabling multiple concurrent sessions.
 *
 * The manager is engine-agnostic: it works for local, OpenCode, and sandbox
 * sessions. Engine-specific logic (bridge routes, event subscription) is
 * delegated back to the IPC handler via callbacks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BuilderPreview } from './preview';
import { PlanManager } from '../ai/plan-manager';
import type { BuilderRuntime } from './client';
import type { LocalBuilderSession } from './local-engine';
import type { E2bSandboxHandle } from '../sandbox/e2b.js';
import type { ModelMessage } from 'ai';
import type { BuilderPreviewStatus } from '../../lib/builder-preview';
import type { BuilderWorkspace } from '../../lib/builder-workspace';
import type {
  BuilderSessionEvent,
  BuilderSessionState,
  BuilderSessionSummary,
} from '../../lib/builder-session';
import type { AgentPlan, PlanItemStatus } from '../../lib/agent-plan';
import type { BrowserWindow } from 'electron';

/** Upper bound on buffered events so a long session cannot grow unbounded. */
const EVENT_BUFFER_LIMIT = 2_000;
/** Only the newest events are persisted; older history is not worth the bytes. */
const PERSISTED_EVENT_LIMIT = 500;

function parseStoredArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export interface BuilderSessionManagerOptions {
  /** Called to broadcast an event to the renderer. */
  onBroadcast: (event: BuilderSessionEvent) => void;
  /** Called to persist the session context (messages + events). */
  onPersistContext: (messagesJson?: string, eventsJson?: string) => void;
  /** Main window for preview status broadcasts. */
  mainWindow: BrowserWindow;
}

export class BuilderSessionManager {
  sessionId = '';
  session: BuilderSessionSummary | null = null;
  workspace: BuilderWorkspace | null = null;
  worktreePath: string | null = null;
  engine: 'local' | 'opencode' | 'opencode-sandbox' | null = null;

  opencodeRuntime: BuilderRuntime | null = null;
  localSession: LocalBuilderSession | null = null;
  sandbox: E2bSandboxHandle | null = null;
  sandboxLocalDir: string | null = null;

  eventController: AbortController | null = null;
  eventBuffer: BuilderSessionEvent[] = [];
  running = false;
  localEventSeq = 0;
  persistTimer: ReturnType<typeof setTimeout> | null = null;
  planManager: PlanManager | null = null;

  preview: BuilderPreview;

  private onBroadcast: (event: BuilderSessionEvent) => void;
  private onPersistContext: (messagesJson?: string, eventsJson?: string) => void;
  private mainWindow: BrowserWindow;

  constructor(options: BuilderSessionManagerOptions) {
    this.onBroadcast = options.onBroadcast;
    this.onPersistContext = options.onPersistContext;
    this.mainWindow = options.mainWindow;

    this.preview = new BuilderPreview();
    this.preview.subscribe((status: BuilderPreviewStatus) => {
      if (!this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow.webContents.send('builder:preview-changed', status);
      }
    });
  }

  /**
   * Generate a unique local event ID for this session.
   */
  localEvent(
    rest:
      | { type: 'user-prompt'; text: string }
      | { type: 'status'; status: 'running' | 'interrupted' }
      | { type: 'error'; message: string }
      | { type: 'plan-created'; plan: AgentPlan }
      | {
          type: 'plan-item-updated';
          itemId: string;
          status: PlanItemStatus;
        },
  ): BuilderSessionEvent {
    return {
      sessionId: this.session?.id ?? 'unknown',
      eventId: `local-${Date.now()}-${++this.localEventSeq}`,
      createdAt: Date.now(),
      ...rest,
    } as BuilderSessionEvent;
  }

  /**
   * Broadcast an event to the renderer and update internal state.
   */
  broadcast(event: BuilderSessionEvent) {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > EVENT_BUFFER_LIMIT) {
      this.eventBuffer.splice(0, this.eventBuffer.length - EVENT_BUFFER_LIMIT);
    }
    if (event.type === 'status') {
      this.running = event.status === 'running' || event.status === 'retrying';
    }
    this.onBroadcast(event);

    if (
      event.type === 'status' &&
      (event.status === 'idle' ||
        event.status === 'interrupted' ||
        event.status === 'failed')
    ) {
      this.flushPersistedContext();
    } else {
      this.schedulePersistedContext();
    }
  }

  /** Persist the current session context immediately. */
  flushPersistedContext() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.session) return;
    this.onPersistContext(
      this.localSession
        ? JSON.stringify(this.localSession.getMessages())
        : undefined,
      JSON.stringify(this.eventBuffer.slice(-PERSISTED_EVENT_LIMIT)),
    );
  }

  /** Schedule a debounced persist. */
  schedulePersistedContext() {
    if (!this.session || this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPersistedContext();
    }, 300);
    this.persistTimer.unref?.();
  }

  /** Get the current session state for re-attach. */
  getSessionState(): BuilderSessionState {
    return {
      session: this.session,
      workspace: this.workspace,
      events: this.eventBuffer,
    };
  }

  /** Get the active builder directory (worktree or workspace). */
  activeBuilderDirectory(): string | null {
    return this.worktreePath ?? this.workspace?.directory ?? null;
  }

  /** Reset or create the plan manager for this session. */
  resetPlanManager() {
    this.planManager = new PlanManager((event) => {
      if (!this.session) return;
      this.broadcast(this.localEvent(event));
    });
  }

  /** Require the plan manager, creating it if needed. */
  requirePlanManager(): PlanManager {
    if (!this.planManager) this.resetPlanManager();
    return this.planManager as PlanManager;
  }

  /**
   * Stop this session: discard worktree, clear DB, release resources.
   * Returns the previous state for the caller to handle cleanup.
   */
  stop(): BuilderSessionManager {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.eventController?.abort();
    this.eventController = null;
    this.preview.stop().catch(() => undefined);

    this.opencodeRuntime = null;
    this.localSession = null;
    this.session = null;
    this.workspace = null;
    this.worktreePath = null;
    this.engine = null;
    this.sandbox = null;
    this.sandboxLocalDir = null;
    this.eventBuffer = [];
    this.running = false;
    this.planManager = null;

    return this;
  }

  /**
   * Detach this session: preserve worktree and DB, release running processes.
   * Returns the previous state for the caller to handle cleanup.
   */
  detach(): BuilderSessionManager {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.eventController?.abort();
    this.eventController = null;
    this.preview.stop().catch(() => undefined);
    this.flushPersistedContext();

    const prevLocal = this.localSession;

    this.opencodeRuntime = null;
    this.localSession = null;
    this.session = null;
    this.workspace = null;
    this.worktreePath = null;
    this.engine = null;
    this.sandbox = null;
    this.sandboxLocalDir = null;
    this.eventBuffer = [];
    this.running = false;
    this.planManager = null;

    // Return the previous local session so the caller can abort it.
    if (prevLocal) {
      prevLocal.abort();
    }

    return this;
  }

  /** Dispose of the preview instance. */
  dispose() {
    this.preview.dispose();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
  }

  /** Get the worktree parent directory path. */
  static getWorktreeParentDirectory(): string {
    return path.join(app.getPath('userData'), 'builder-worktrees');
  }
}

export { parseStoredArray };
