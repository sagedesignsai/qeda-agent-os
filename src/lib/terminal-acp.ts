import type {
  PermissionOption,
  SessionUpdate,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';

export type CodingCliProvider = 'opencode' | 'cline' | 'kiro';

export type CodingCliAvailability = Record<CodingCliProvider, string | null>;

export type AcpSessionStatus =
  | 'starting'
  | 'ready'
  | 'running'
  | 'error'
  | 'stopped';

export type AcpTerminalEvent =
  | { type: 'status'; status: AcpSessionStatus; message?: string }
  | { type: 'prompt'; text: string }
  | { type: 'update'; update: SessionUpdate }
  | {
      type: 'permission-request';
      requestId: string;
      title: string;
      toolCall: ToolCallUpdate;
      options: PermissionOption[];
    }
  | {
      type: 'permission-resolved';
      requestId: string;
      decision: 'selected' | 'cancelled';
    }
  | { type: 'log'; text: string }
  | { type: 'error'; message: string };

export interface AcpSessionSnapshot {
  provider: CodingCliProvider;
  status: AcpSessionStatus;
  events: AcpTerminalEvent[];
  pendingPermissions: Extract<
    AcpTerminalEvent,
    { type: 'permission-request' }
  >[];
}
