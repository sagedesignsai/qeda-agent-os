/**
 * plugins/qeda-builder/src/opencode-plugin-api.d.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deliberately narrow ambient contract for the OpenCode v2.0.18 plugin API.
 *
 * The shipped plugin has no runtime SDK dependency, so this file is the whole
 * compile-time surface. Keep it aligned with
 * https://opencode.ai/v2/docs/build/plugins and the v2.0.18 package; the
 * integration smoke test validates the host contract end to end.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type PluginCleanup = () => Promise<void> | void;

export interface Plugin {
  id: string;
  setup(context: PluginContext): Promise<PluginCleanup | void> | PluginCleanup | void;
}

export interface Registration {
  dispose(): Promise<void>;
}

export interface PluginContext {
  readonly app: {
    readonly name: string;
    readonly version: string;
    readonly channel: string;
  };
  readonly location: {
    readonly directory: string;
    readonly project: {
      readonly id: string;
      readonly directory: string;
      readonly canonical: string;
    };
  };
  readonly options: Readonly<Record<string, unknown>>;
  readonly tool: {
    transform(callback: (editor: ToolEditor) => void): Promise<Registration>;
  };
  readonly agent: {
    transform(callback: (editor: AgentEditor) => void): Promise<Registration>;
  };
  readonly command: {
    transform(callback: (editor: CommandEditor) => void): Promise<Registration>;
  };
  readonly mcp: {
    transform(callback: (editor: McpEditor) => void): Promise<Registration>;
  };
  readonly session: {
    hook(
      name: 'prompt',
      callback: (event: SessionPromptEvent) => Promise<void> | void,
    ): Promise<Registration>;
    prompt(input: {
      sessionID: string;
      text: string;
      delivery: 'steer' | 'queue';
    }): Promise<unknown>;
  };
}

export interface ToolContext {
  readonly sessionID: string;
  readonly signal: AbortSignal;
  progress(update: Record<string, unknown>): Promise<void>;
}

export interface ToolResult {
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  options?: {
    namespace?: string;
    codemode?: boolean;
    pinned?: boolean;
  };
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolEditor {
  namespace(input: { name: string; description?: string }): void;
  add(input: ToolDefinition): void;
  remove(id: string): void;
}

export interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  system?: string;
  mode: 'subagent' | 'primary' | 'all';
  hidden: boolean;
  steps?: number;
  request: {
    settings: Record<string, unknown>;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  permissions: Array<{
    action: string;
    resource: string;
    effect: 'allow' | 'deny' | 'ask';
  }>;
}

export interface AgentEditor {
  update(id: string, update: (agent: AgentInfo) => void): void;
  default(id?: string): void;
}

export type McpServerConfig =
  | {
      type: 'local';
      command: string[];
      cwd?: string;
      environment?: Record<string, string>;
      disabled?: boolean;
    }
  | {
      type: 'remote';
      url: string;
      headers?: Record<string, string>;
      disabled?: boolean;
    };

export interface McpEditor {
  get(name: string): McpServerConfig | undefined;
  set(name: string, config: McpServerConfig): void;
}

export interface CommandInvocation {
  readonly sessionID: string;
  readonly prompt: { text: string };
  readonly delivery: 'steer' | 'queue';
}

export interface CommandEditor {
  add(input: {
    name: string;
    description?: string;
    execute(input: CommandInvocation): Promise<void>;
  }): void;
}

export interface SessionPromptEvent {
  readonly sessionID: string;
  readonly messageID: string;
  readonly prompt: { text: string };
  readonly delivery: 'steer' | 'queue';
}
