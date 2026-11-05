/**
 * ipc/channels.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC channel type definitions for SoundLab.
 *
 * Every channel name with its request/response types. Re-exports domain types
 * so the renderer can import them from a single place without reaching into
 * the database layer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UIMessage } from 'ai';
import type {
  SoundLabSession,
  SoundLabSessionWithTracks,
  SoundLabTrack,
} from '../../lib/soundlab-types.js';
export type { SoundLabSession, SoundLabSessionWithTracks, SoundLabTrack };

import type { AgentPlanEvent } from '../../lib/agent-plan.js';
export type { AgentPlanEvent };

export interface IpcChannels {
  // ── SoundLab CRUD ────────────────────────────────────────────────────────
  'soundlab:list': {
    req: { projectId?: string | null } | void;
    res: SoundLabSession[];
  };
  'soundlab:get': {
    req: { id: string };
    res: SoundLabSessionWithTracks | null;
  };
  'soundlab:save': {
    req: SoundLabSessionWithTracks;
    res: { id: string };
  };
  'soundlab:delete': {
    req: { id: string };
    res: { ok: boolean };
  };
  /** Broadcast when any session changes (created, updated, deleted). */
  'soundlab:changed': void;

  // ── SoundLab Copilot ─────────────────────────────────────────────────────
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
  'soundlab-copilot:stream-chunk': { data: string };
  'soundlab-copilot:stream-done': { runId: string };
  'soundlab-copilot:stream-error': { error: string };
  'soundlab-copilot:stream-fallback': {
    fromProvider: string;
    fromModel: string;
    toProvider: string;
    toModel: string;
    reason: string;
  };
  'soundlab-copilot:plan-event': { data: AgentPlanEvent };
}

export type ChannelName = keyof IpcChannels;
