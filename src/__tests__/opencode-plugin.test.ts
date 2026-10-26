/**
 * __tests__/opencode-plugin.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Contract tests for the bundled OpenCode v2 plugin. The host API is faked at
 * the transform boundary; this catches the two failures that are invisible from
 * Qeda's side: tools registered without their `qeda` namespace/`codemode: false`
 * and an agent/MCP registration that never happened.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import plugin from '../../plugins/qeda-builder/src/index';
import type {
  AgentEditor,
  AgentInfo,
  CommandEditor,
  McpEditor,
  McpServerConfig,
  PluginContext,
  PluginCleanup,
  Registration,
  SessionPromptEvent,
  ToolDefinition,
  ToolEditor,
} from '../../plugins/qeda-builder/src/opencode-plugin-api';

interface FakeHost {
  context: PluginContext;
  tools: Map<string, ToolDefinition>;
  commands: string[];
  mcp: Map<string, McpServerConfig>;
  agent: AgentInfo | null;
  promptHook: ((event: SessionPromptEvent) => Promise<void> | void) | null;
  disposed: number;
}

function fakeHost(options: {
  bridgeConfigPath: string;
  runtimeConfigPath: string;
  version?: string;
}): FakeHost {
  const tools = new Map<string, ToolDefinition>();
  const commands: string[] = [];
  const mcp = new Map<string, McpServerConfig>();
  const state: FakeHost = {
    tools,
    commands,
    mcp,
    agent: null,
    promptHook: null,
    disposed: 0,
    context: {} as PluginContext,
  };
  const registration = (): Registration => ({
    dispose: async () => {
      state.disposed += 1;
    },
  });

  const toolEditor: ToolEditor = {
    namespace: () => undefined,
    add: (tool) => {
      tools.set(tool.name, tool);
    },
    remove: () => undefined,
  };
  const agentEditor: AgentEditor = {
    update: (_id, update) => {
      const agent: AgentInfo = {
        id: 'qeda-builder',
        name: '',
        mode: 'subagent',
        hidden: true,
        request: { settings: {}, headers: {}, body: {} },
        permissions: [],
      };
      update(agent);
      state.agent = agent;
    },
    default: () => undefined,
  };
  const commandEditor: CommandEditor = {
    add: ({ name }) => {
      commands.push(name);
    },
  };
  const mcpEditor: McpEditor = {
    get: (name) => mcp.get(name),
    set: (name, config) => {
      mcp.set(name, config);
    },
  };

  state.context = {
    app: {
      name: 'opencode',
      version: options.version ?? '2.0.18',
      channel: 'latest',
    },
    location: {
      directory: '/repo',
      project: { id: 'p1', directory: '/repo', canonical: '/repo' },
    },
    options: {
      bridgeConfigPath: options.bridgeConfigPath,
      runtimeConfigPath: options.runtimeConfigPath,
    },
    tool: {
      transform: async (callback) => {
        callback(toolEditor);
        return registration();
      },
    },
    agent: {
      transform: async (callback) => {
        callback(agentEditor);
        return registration();
      },
    },
    command: {
      transform: async (callback) => {
        callback(commandEditor);
        return registration();
      },
    },
    mcp: {
      transform: async (callback) => {
        callback(mcpEditor);
        return registration();
      },
    },
    session: {
      hook: async (_name, callback) => {
        state.promptHook = callback;
        return registration();
      },
      prompt: async () => undefined,
    },
  };
  return state;
}

describe('Qeda OpenCode plugin contract', () => {
  let tmpDir: string;
  let bridgeConfigPath: string;
  let runtimeConfigPath: string;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-plugin-'));
    bridgeConfigPath = path.join(tmpDir, 'bridge.json');
    runtimeConfigPath = path.join(tmpDir, 'runtime.json');
    fs.writeFileSync(
      bridgeConfigPath,
      JSON.stringify({
        url: 'http://127.0.0.1:4567',
        token: 't'.repeat(48),
        sessionId: 's1',
      }),
    );
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        pluginVersion: '0.2.0',
        maxSteps: 150,
        mcpServers: [
          {
            name: 'qeda-docs',
            transport: 'stdio',
            command: 'npx',
            args: ['-y', 'docs-server'],
            env: { DOCS_TOKEN: 'secret' },
          },
          {
            name: 'qeda-remote',
            transport: 'http',
            url: 'https://mcp.example.test',
            headers: { Authorization: 'Bearer token' },
          },
        ],
      }),
    );
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ reply: 'pong (qeda)', plan: null }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('registers namespaced, directly visible Qeda tools', async () => {
    const host = fakeHost({ bridgeConfigPath, runtimeConfigPath });
    const cleanup = (await plugin.setup(host.context)) as PluginCleanup;
    expect(cleanup).toBeDefined();

    expect([...host.tools.keys()].sort()).toEqual(
      [
        'ping',
        'preview_status',
        'preview_start',
        'preview_stop',
        'index_codebase',
        'codebase_status',
        'project_info',
        'plan_create',
        'plan_update',
        'plan_status',
      ].sort(),
    );
    for (const tool of host.tools.values()) {
      expect(tool.options).toEqual({ namespace: 'qeda', codemode: false });
    }

    const ping = host.tools.get('ping');
    const result = await ping!.execute(
      {},
      {
        sessionID: 's1',
        signal: new AbortController().signal,
        progress: async () => undefined,
      },
    );
    expect(result.content).toBe('pong (qeda)');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/ping',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Qeda-Token': 't'.repeat(48) }),
        body: JSON.stringify({ message: 'ping', qedaSessionID: 's1' }),
      }),
    );
  });

  it('registers the Qeda parity agent and mirrors enabled MCP servers', async () => {
    const host = fakeHost({ bridgeConfigPath, runtimeConfigPath });
    await plugin.setup(host.context);

    expect(host.agent).not.toBeNull();
    expect(host.agent!.mode).toBe('primary');
    expect(host.agent!.hidden).toBe(false);
    expect(host.agent!.steps).toBe(150);
    expect(host.agent!.system).toContain('qeda_plan_create');
    expect(host.agent!.system).toContain('isolated git worktree');
    expect(host.agent!.system).toContain('scaffold the manifest');
    expect(
      host.agent!.permissions.some(
        (permission) =>
          permission.action === 'qeda_preview_start' &&
          permission.effect === 'allow',
      ),
    ).toBe(true);

    expect(host.mcp.get('qeda-docs')).toEqual({
      type: 'local',
      command: ['npx', '-y', 'docs-server'],
      environment: { DOCS_TOKEN: 'secret' },
      disabled: false,
    });
    expect(host.mcp.get('qeda-remote')).toEqual({
      type: 'remote',
      url: 'https://mcp.example.test',
      headers: { Authorization: 'Bearer token' },
      disabled: false,
    });
    expect(host.commands.sort()).toEqual([
      'qeda-index',
      'qeda-plan',
      'qeda-preview',
    ]);
  });

  it('binds a prompt to the active Qeda bridge session', async () => {
    const host = fakeHost({ bridgeConfigPath, runtimeConfigPath });
    await plugin.setup(host.context);
    await host.promptHook!({
      sessionID: 's1',
      messageID: 'm1',
      prompt: { text: 'hello' },
      delivery: 'queue',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/session/bind',
      expect.objectContaining({
        body: JSON.stringify({
          sessionID: 's1',
          directory: '/repo',
          qedaSessionID: 's1',
        }),
      }),
    );
  });

  it('disposes every registration and refuses a non-v2 host', async () => {
    const host = fakeHost({ bridgeConfigPath, runtimeConfigPath });
    const cleanup = (await plugin.setup(host.context)) as PluginCleanup;
    await cleanup();
    expect(host.disposed).toBeGreaterThanOrEqual(4);

    const oldHost = fakeHost({
      bridgeConfigPath,
      runtimeConfigPath,
      version: '1.18.0',
    });
    await expect(plugin.setup(oldHost.context)).rejects.toThrow(
      'requires OpenCode 2.x',
    );
  });
});
