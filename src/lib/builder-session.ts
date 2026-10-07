/**
 * lib/builder-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-safe Builder session summaries and normalized live activity events.
 * OpenCode client payloads are translated into these shapes in the main process.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  BuilderFormRequest,
  BuilderPermissionRequest,
} from './builder-interactions';
import type { BuilderWorkspace } from './builder-workspace';

export interface BuilderSessionSummary {
  id: string;
  title: string;
  createdAt: number;
}

/** A created session together with the workspace it is bound to. */
export interface BuilderSessionStart {
  session: BuilderSessionSummary;
  workspace: BuilderWorkspace;
}

/**
 * Snapshot the renderer needs to re-attach after a route change or reload.
 * `events` is the main process's buffered feed for the active session, so the
 * activity surfaces can be rebuilt without replaying the OpenCode turn.
 */
export interface BuilderSessionState {
  session: BuilderSessionSummary | null;
  workspace: BuilderWorkspace | null;
  events: BuilderSessionEvent[];
}

interface BuilderSessionEventBase {
  sessionId: string;
  eventId: string;
  createdAt: number;
}

export type BuilderSessionEvent =
  /**
   * The user's own prompt, echoed into the feed so a re-attached renderer can
   * rebuild the conversation from the buffered events alone (OpenCode's event
   * stream only carries assistant output and tool activity).
   */
  | (BuilderSessionEventBase & {
      type: 'user-prompt';
      text: string;
    })
  | (BuilderSessionEventBase & {
      type: 'text-delta';
      messageId: string;
      delta: string;
    })
  | (BuilderSessionEventBase & {
      type: 'tool-started';
      callId: string;
      name: string;
      input: unknown;
    })
  | (BuilderSessionEventBase & {
      type: 'tool-input';
      callId: string;
      input: unknown;
    })
  | (BuilderSessionEventBase & {
      type: 'tool-progress';
      callId: string;
      metadata: Record<string, unknown>;
    })
  | (BuilderSessionEventBase & {
      type: 'tool-completed';
      callId: string;
      output: string;
    })
  | (BuilderSessionEventBase & {
      type: 'tool-failed';
      callId: string;
      error: string;
    })
  | (BuilderSessionEventBase & {
      type: 'permission';
      request: BuilderPermissionRequest;
    })
  | (BuilderSessionEventBase & {
      type: 'form';
      form: BuilderFormRequest;
    })
  | (BuilderSessionEventBase & {
      type: 'interaction-resolved';
      interactionId: string;
      interactionType: 'form' | 'permission';
    })
  | (BuilderSessionEventBase & {
      type: 'status';
      status: 'running' | 'idle' | 'interrupted' | 'retrying' | 'failed';
      message?: string;
    })
  | (BuilderSessionEventBase & {
      type: 'file-changed';
      path: string;
    })
  | (BuilderSessionEventBase & {
      type: 'error';
      message: string;
    });

export interface BuilderFormReply {
  formId: string;
  answer?: Record<string, string | number | boolean | string[]>;
  cancel?: boolean;
}
