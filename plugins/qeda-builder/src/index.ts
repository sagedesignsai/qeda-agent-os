/**
 * plugins/qeda-builder/src/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenCode v2 plugin that brings the OpenCode Builder engine to parity with
 * Qeda's Local engine:
 *
 *   • Qeda tools (preview, codebase index/status, project info, plan)
 *   • A `qeda-builder` primary agent with the Local engine's workflow prompt
 *   • Qeda's enabled MCP servers, mirrored into OpenCode
 *   • Session binding so the plugin can only call its own Qeda bridge
 *
 * The bridge token is read from a private Qeda-owned file per call, so it never
 * enters OpenCode's shared config and follows Qeda's per-session rotation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFile } from 'node:fs/promises';
import type {
  AgentInfo,
  CommandInvocation,
  McpServerConfig,
  Plugin as OpenCodePlugin,
  PluginContext,
  Registration,
  SessionPromptEvent,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from './opencode-plugin-api';

interface BridgeConfig {
  url: string;
  token: string;
  sessionId?: string;
}

interface RuntimeMcpServer {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

interface RuntimeConfig {
  pluginVersion?: string;
  maxSteps?: number;
  mcpServers?: RuntimeMcpServer[];
}

type JsonObject = Record<string, unknown>;

const TOOL_OPTIONS = {
  namespace: 'qeda',
  codemode: false,
} as const;

const QEDA_TOOL_NAMES = [
  'qeda_ping',
  'qeda_preview_status',
  'qeda_preview_start',
  'qeda_preview_stop',
  'qeda_index_codebase',
  'qeda_codebase_status',
  'qeda_project_info',
  'qeda_plan_create',
  'qeda_plan_update',
  'qeda_plan_status',
] as const;

const QEDA_AGENT_ID = 'qeda-builder';

const AGENT_SYSTEM_PROMPT = `
You are Qeda Builder, the coding agent for Qeda Desktop, running inside OpenCode.

## Working rules
1. You work in an isolated git worktree managed by Qeda. Never commit, push, or
   rewrite history unless the user explicitly asks. Qeda's Keep/Discard review
   owns the hand-off back to the source repository.
2. Inspect the existing code and project manifest before proposing changes.
   Match the project's own runtime, package manager, and conventions; do not
   assume Node.
3. Use OpenCode's native read/write/edit/bash/glob/grep tools for code work.
   Prefer targeted edits over wholesale rewrites.
4. When the workspace is empty or fresh, plan the layout, scaffold the manifest
   and meaningful dev/build/test scripts for the actual runtime, add the
   configuration and source files, install dependencies with the native shell,
   and tell the user how to run the project.
5. Use available MCP tools when they fit the task (for example docs, GitHub, or
   database servers supplied by Qeda or by the user).
6. Before starting a multi-step task, call \`qeda_plan_create\` with an ordered
   list of short, verb-first items. Call \`qeda_plan_update\` with
   \`in-progress\` before each item and \`done\` or \`failed\` when it finishes.
   Re-plan with \`qeda_plan_create\` when the scope changes.
7. Use \`qeda_project_info\` to learn which Qeda project and codebases this
   workspace belongs to. Use \`qeda_index_codebase\` when semantic indexing is
   needed, and \`qeda_codebase_status\` to check its state.
8. Use \`qeda_preview_start\`, \`qeda_preview_status\`, and \`qeda_preview_stop\`
   for the Qeda-owned preview dev server. It always runs in the active Builder
   worktree.
9. If a Qeda tool reports that its bridge is inactive, keep working with native
   tools and tell the user to start a Qeda Builder session. Do not invent tool
   results.
10. Explain shell commands before running them. Treat permission requests as
    blocking: wait for the user's decision.
`.trim();

async function readBridgeConfig(configPath: string): Promise<BridgeConfig> {
  const raw = await readFile(configPath, 'utf8');
  const value = JSON.parse(raw) as Partial<BridgeConfig>;
  if (
    typeof value.url !== 'string' ||
    !value.url.startsWith('http://127.0.0.1:') ||
    typeof value.token !== 'string' ||
    value.token.length < 32
  ) {
    throw new Error(
      'Qeda Builder bridge is not active. Start a Qeda Builder session first.',
    );
  }
  return value as BridgeConfig;
}

async function bridgeCall<T>(
  configPath: string,
  route: string,
  input: JsonObject,
  signal: AbortSignal | undefined,
  sessionID: string | undefined,
): Promise<T> {
  const bridge = await readBridgeConfig(configPath);
  const response = await fetch(`${bridge.url}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Qeda-Token': bridge.token,
    },
    body: JSON.stringify({
      ...input,
      ...(sessionID ? { qedaSessionID: sessionID } : {}),
    }),
    signal,
  });
  const text = await response.text();
  let result: unknown;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Qeda bridge returned a non-JSON response (HTTP ${response.status}).`,
    );
  }
  const payload = result as { error?: unknown };
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Qeda bridge returned HTTP ${response.status}`,
    );
  }
  return result as T;
}

async function readRuntimeConfig(
  configPath: string | undefined,
): Promise<RuntimeConfig> {
  if (!configPath) return {};
  try {
    const raw = await readFile(configPath, 'utf8');
    const value = JSON.parse(raw) as Record<string, unknown>;
    const maxSteps =
      typeof value.maxSteps === 'number' && Number.isFinite(value.maxSteps)
        ? Math.min(1000, Math.max(10, Math.trunc(value.maxSteps)))
        : undefined;
    const mcpServers = Array.isArray(value.mcpServers)
      ? value.mcpServers.filter(isRuntimeMcpServer)
      : [];
    return {
      pluginVersion:
        typeof value.pluginVersion === 'string'
          ? value.pluginVersion
          : undefined,
      maxSteps,
      mcpServers,
    };
  } catch {
    // A missing runtime file is normal before the first registration.
    return {};
  }
}

function isRuntimeMcpServer(value: unknown): value is RuntimeMcpServer {
  if (!value || typeof value !== 'object') return false;
  const server = value as Record<string, unknown>;
  return (
    typeof server.name === 'string' &&
    (server.transport === 'stdio' ||
      server.transport === 'http' ||
      server.transport === 'sse') &&
    (typeof server.command === 'string' || typeof server.url === 'string')
  );
}

function mapMcpServer(server: RuntimeMcpServer): McpServerConfig | null {
  if (server.transport === 'stdio') {
    const command = server.command?.trim();
    if (!command) return null;
    return {
      type: 'local',
      command: [command, ...(server.args ?? [])],
      ...(server.cwd ? { cwd: server.cwd } : {}),
      ...(server.env ? { environment: server.env } : {}),
      disabled: false,
    };
  }
  const url = server.url?.trim();
  if (!url) return null;
  return {
    type: 'remote',
    url,
    ...(server.headers ? { headers: server.headers } : {}),
    disabled: false,
  };
}

function qedaTool(
  definition: Omit<ToolDefinition, 'options'>,
): ToolDefinition {
  return { ...definition, options: TOOL_OPTIONS };
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function toolResult(content: string): ToolResult {
  return { content };
}

const plugin: OpenCodePlugin = {
  id: 'qeda.builder',
  async setup(ctx: PluginContext) {
    const appVersion = ctx.app.version.replace(/^v/, '');
    const major = Number(appVersion.split('.')[0]);
    if (!Number.isFinite(major) || major !== 2) {
      throw new Error(
        `Qeda Builder requires OpenCode 2.x; this server is ${ctx.app.version}.`,
      );
    }

    const bridgeConfigPath = ctx.options.bridgeConfigPath;
    if (typeof bridgeConfigPath !== 'string' || !bridgeConfigPath) {
      throw new Error(
        'Qeda Builder plugin is missing its bridgeConfigPath option.',
      );
    }
    const runtimeConfigPath =
      typeof ctx.options.runtimeConfigPath === 'string'
        ? ctx.options.runtimeConfigPath
        : undefined;
    const runtime = await readRuntimeConfig(runtimeConfigPath);
    const registrations: Registration[] = [];
    const keep = async (registration: Promise<Registration>) => {
      registrations.push(await registration);
    };

    const call = <T>(
      route: string,
      input: JsonObject,
      context: ToolContext,
    ): Promise<T> =>
      bridgeCall<T>(
        bridgeConfigPath,
        route,
        input,
        context.signal,
        context.sessionID,
      );

    await keep(
      ctx.tool.transform((editor) => {
        editor.namespace({
          name: 'qeda',
          description: 'Qeda Builder capabilities',
        });

        editor.add(
          qedaTool({
            name: 'ping',
            description:
              'Check whether the Qeda Builder bridge is reachable for this session.',
            input: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            execute: async (_input, context) => {
              const result = await call<{ reply: string }>(
                '/ping',
                { message: 'ping' },
                context,
              );
              return toolResult(result.reply);
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'preview_status',
            description:
              'Get the status of the Qeda-owned preview dev server for this Builder session.',
            input: {
              type: 'object',
              properties: {
                directory: { type: 'string' },
              },
              additionalProperties: false,
            },
            execute: async (input, context) => {
              const result = await call<unknown>(
                '/preview/status',
                asObject(input),
                context,
              );
              return toolResult(JSON.stringify(result));
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'preview_start',
            description:
              "Start Qeda's preview dev server in the active Builder worktree.",
            input: {
              type: 'object',
              properties: {
                directory: { type: 'string' },
                script: { type: 'string' },
                command: { type: 'string' },
              },
              additionalProperties: false,
            },
            execute: async (input, context) => {
              const result = await call<{ url?: string | null; state?: string }>(
                '/preview/start',
                asObject(input),
                context,
              );
              return toolResult(
                result.url
                  ? `Preview running at ${result.url}`
                  : `Preview ${result.state ?? 'started'}.`,
              );
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'preview_stop',
            description: "Stop Qeda's preview dev server.",
            input: {
              type: 'object',
              properties: {
                directory: { type: 'string' },
              },
              additionalProperties: false,
            },
            execute: async (input, context) => {
              await call('/preview/stop', asObject(input), context);
              return toolResult('Preview stopped.');
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'index_codebase',
            description:
              'Index a linked Qeda codebase for semantic search. Resolves the codebase from the current workspace when codeProjectId is omitted.',
            input: {
              type: 'object',
              properties: {
                codeProjectId: { type: 'string' },
                directory: { type: 'string' },
              },
              additionalProperties: false,
            },
            execute: async (input, context) => {
              const result = await call<{
                indexedFiles: number;
                indexedChunks: number;
                skippedFiles: number;
              }>('/index', asObject(input), context);
              return toolResult(
                `Indexed ${result.indexedFiles} files into ${result.indexedChunks} chunks (${result.skippedFiles} skipped).`,
              );
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'codebase_status',
            description:
              'Read the Qeda indexing status of the workspace codebase.',
            input: {
              type: 'object',
              properties: {
                codeProjectId: { type: 'string' },
                directory: { type: 'string' },
              },
              additionalProperties: false,
            },
            execute: async (input, context) => {
              const result = await call<unknown>(
                '/index/status',
                asObject(input),
                context,
              );
              return toolResult(JSON.stringify(result));
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'project_info',
            description:
              'Find the Qeda project and linked codebases for a workspace directory.',
            input: {
              type: 'object',
              properties: {
                directory: { type: 'string' },
              },
              additionalProperties: false,
            },
            execute: async (input, context) => {
              const result = await call<unknown>(
                '/project/info',
                asObject(input),
                context,
              );
              return toolResult(JSON.stringify(result));
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'plan_create',
            description:
              'Create or replace the visible Qeda plan for this turn. Call this before starting a multi-step task.',
            input: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                    },
                    required: ['id', 'title'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['items'],
              additionalProperties: false,
            },
            execute: async (input, context) => {
              const result = await call<{ plan?: unknown }>(
                '/plan/create',
                asObject(input),
                context,
              );
              return toolResult(JSON.stringify(result.plan ?? result));
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'plan_update',
            description:
              'Update one item in the visible Qeda plan as work starts or finishes.',
            input: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['pending', 'in-progress', 'done', 'failed'],
                },
              },
              required: ['id', 'status'],
              additionalProperties: false,
            },
            execute: async (input, context) => {
              const result = await call<{ updated?: boolean }>(
                '/plan/update',
                asObject(input),
                context,
              );
              return toolResult(
                result.updated === false
                  ? 'No matching plan item; create the plan first.'
                  : 'Plan item updated.',
              );
            },
          }),
        );

        editor.add(
          qedaTool({
            name: 'plan_status',
            description: 'Read the current visible Qeda plan.',
            input: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            execute: async (_input, context) => {
              const result = await call<{ plan?: unknown }>(
                '/plan/status',
                {},
                context,
              );
              return toolResult(JSON.stringify(result.plan ?? null));
            },
          }),
        );
      }),
    );

    if (ctx.agent && typeof ctx.agent.transform === 'function') {
      await keep(
        ctx.agent.transform((editor) => {
          editor.update(QEDA_AGENT_ID, (agent: AgentInfo) => {
            agent.name = 'Qeda Builder';
            agent.description =
              "Qeda's coding agent with preview, indexing, project, and plan tools.";
            agent.mode = 'primary';
            agent.hidden = false;
            agent.system = AGENT_SYSTEM_PROMPT;
            agent.steps = runtime.maxSteps;
            if (!agent.request) {
              agent.request = { settings: {}, headers: {}, body: {} };
            }
            const permissions = Array.isArray(agent.permissions)
              ? agent.permissions
              : [];
            const seen = new Set(
              permissions.map(
                (permission) =>
                  `${permission.action}\u0000${permission.resource}\u0000${permission.effect}`,
              ),
            );
            for (const action of QEDA_TOOL_NAMES) {
              const key = `${action}\u0000*\u0000allow`;
              if (!seen.has(key)) {
                seen.add(key);
                permissions.push({
                  action,
                  resource: '*',
                  effect: 'allow',
                });
              }
            }
            agent.permissions = permissions;
          });
        }),
      );
    }

    if (
      runtime.mcpServers &&
      runtime.mcpServers.length > 0 &&
      ctx.mcp &&
      typeof ctx.mcp.transform === 'function'
    ) {
      await keep(
        ctx.mcp.transform((editor) => {
          for (const server of runtime.mcpServers ?? []) {
            // Qeda only owns names it prefixed. Never clobber a user's server.
            if (editor.get(server.name)) continue;
            const config = mapMcpServer(server);
            if (config) editor.set(server.name, config);
          }
        }),
      );
    }

    if (ctx.command && typeof ctx.command.transform === 'function') {
      await keep(
        ctx.command.transform((editor) => {
          editor.add({
            name: 'qeda-preview',
            description: 'Start the Qeda preview server for this workspace.',
            execute: async ({ sessionID, prompt, delivery }) => {
              await ctx.session.prompt({
                sessionID,
                text: `Check the Qeda preview status, then start it with qeda_preview_start if it is not running. ${prompt.text}`,
                delivery,
              });
            },
          });
          editor.add({
            name: 'qeda-plan',
            description: 'Create a visible Qeda plan for this task.',
            execute: async ({ sessionID, prompt, delivery }) => {
              await ctx.session.prompt({
                sessionID,
                text: `First call qeda_plan_create with an ordered task list, then carry out this request: ${prompt.text}`,
                delivery,
              });
            },
          });
          editor.add({
            name: 'qeda-index',
            description: 'Index this workspace codebase for Qeda search.',
            execute: async ({ sessionID, prompt, delivery }) => {
              await ctx.session.prompt({
                sessionID,
                text: `Call qeda_project_info for this workspace, then qeda_index_codebase for the matching codebase. ${prompt.text}`,
                delivery,
              });
            },
          });
        }),
      );
    }

    if (ctx.session && typeof ctx.session.hook === 'function') {
      await keep(
        ctx.session.hook('prompt', async (event: SessionPromptEvent) => {
          try {
            await bridgeCall(
              bridgeConfigPath,
              '/session/bind',
              {
                sessionID: event.sessionID,
                directory: ctx.location.directory,
              },
              AbortSignal.timeout(5000),
              event.sessionID,
            );
          } catch {
            // The bridge may not exist until Qeda starts a Builder session.
            // Tool calls surface the actionable error.
          }
        }),
      );
    }

    return async () => {
      for (let index = registrations.length - 1; index >= 0; index -= 1) {
        await registrations[index].dispose().catch(() => undefined);
      }
    };
  },
};

export default plugin;
