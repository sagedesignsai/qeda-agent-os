/**
 * ai/mcp/manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Model Context Protocol (MCP) client pool and tool discovery manager.
 *
 * Owns the lifecycle of MCP connections for the Local Builder agent and Settings.
 * Supports:
 *   • stdio transport via @ai-sdk/mcp/mcp-stdio (spawning local CLI / npx servers)
 *   • http & sse transports via @ai-sdk/mcp (remote endpoints, e.g. Context7, GitHub)
 *
 * SAFETY & ERROR ISOLATION:
 * ─────────────────────────
 * If a single configured MCP server fails to boot (e.g. bad command or network
 * glitch), that error is logged and isolated to that server; the Local Builder
 * agent continues with the remaining tools rather than aborting the turn.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { Tool } from 'ai';
import { getSettings } from '../settings';
import type {
  McpServerSettings,
  McpServerStatus,
  McpTestResult,
  McpToolSummary,
} from '../../../lib/builder-engine';

interface ActiveClientEntry {
  client: Awaited<ReturnType<typeof createMCPClient>>;
  tools: Record<string, Tool>;
  toolSummaries: McpToolSummary[];
  server: McpServerSettings;
  connectedAt: number;
}

class McpManager {
  private activeClients = new Map<string, ActiveClientEntry>();

  /**
   * Instantiate an MCP client for a specific server definition, perform the
   * handshake, and discover its tools.
   */
  async connectServer(
    server: McpServerSettings,
  ): Promise<{
    client: Awaited<ReturnType<typeof createMCPClient>>;
    tools: Record<string, Tool>;
    toolSummaries: McpToolSummary[];
  }> {
    if (!server.enabled && server.enabled !== undefined) {
      throw new Error(`MCP server "${server.name}" (${server.id}) is disabled.`);
    }

    let client: Awaited<ReturnType<typeof createMCPClient>>;

    if (server.transport === 'stdio') {
      const command = server.command?.trim();
      if (!command) {
        throw new Error(
          `MCP server "${server.name}" requires a command (e.g. "npx" or "node").`,
        );
      }

      // Merge environment variables safely. Clean empty entries.
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      if (server.env) {
        for (const [k, v] of Object.entries(server.env)) {
          if (v) env[k] = v;
        }
      }

      const transport = new Experimental_StdioMCPTransport({
        command,
        args: server.args ?? [],
        env,
        cwd: server.cwd?.trim() || undefined,
      });

      client = await createMCPClient({
        clientName: 'qeda-desktop-builder',
        version: '1.0.0',
        transport,
      });
    } else if (server.transport === 'http' || server.transport === 'sse') {
      const url = server.url?.trim();
      if (!url) {
        throw new Error(
          `MCP server "${server.name}" requires an endpoint URL.`,
        );
      }

      const headers: Record<string, string> = {};
      if (server.headers) {
        for (const [k, v] of Object.entries(server.headers)) {
          if (v) headers[k] = v;
        }
      }

      client = await createMCPClient({
        clientName: 'qeda-desktop-builder',
        version: '1.0.0',
        transport: {
          type: server.transport,
          url,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        },
      });
    } else {
      throw new Error(
        `Unsupported MCP transport: ${(server as McpServerSettings).transport}`,
      );
    }

    // Retrieve AI SDK tools from the client
    const rawTools = await client.tools();
    const toolSummaries: McpToolSummary[] = [];

    // Also inspect listed tools for descriptions & schemas
    try {
      const listed = await client.listTools();
      if (listed && Array.isArray(listed.tools)) {
        for (const t of listed.tools) {
          toolSummaries.push({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema as Record<string, unknown> | undefined,
          });
        }
      }
    } catch {
      // Best effort: fallback to keying rawTools if listTools is unsupported
      for (const name of Object.keys(rawTools)) {
        toolSummaries.push({ name });
      }
    }

    return { client, tools: rawTools as Record<string, Tool>, toolSummaries };
  }

  /**
   * Connect to all enabled MCP servers and assemble a unified tools dictionary
   * for the Local Builder agent.
   */
  async loadToolsForEnabledServers(
    overrideServers?: McpServerSettings[],
  ): Promise<{
    tools: Record<string, Tool>;
    activeCount: number;
    summaries: Array<{ serverId: string; serverName: string; tools: McpToolSummary[] }>;
  }> {
    const servers =
      overrideServers ?? (getSettings().mcpServers ?? []).filter((s) => s.enabled);

    await this.closeAll();

    const mergedTools: Record<string, Tool> = {};
    const summaries: Array<{ serverId: string; serverName: string; tools: McpToolSummary[] }> = [];

    const connectPromises = servers.map(async (server) => {
      try {
        const { client, tools, toolSummaries } = await this.connectServer(server);
        this.activeClients.set(server.id, {
          client,
          tools,
          toolSummaries,
          server,
          connectedAt: Date.now(),
        });

        // Prefix or expose tools cleanly
        for (const [rawName, toolDef] of Object.entries(tools)) {
          // Normalize tool identifier to prevent collisions across servers
          const cleanServerId = server.id.replace(/[^a-zA-Z0-9_]/g, '_');
          const scopedKey = `mcp_${cleanServerId}_${rawName}`;
          mergedTools[scopedKey] = toolDef;
          // Also provide under original name if not already occupied
          if (!mergedTools[rawName]) {
            mergedTools[rawName] = toolDef;
          }
        }

        summaries.push({
          serverId: server.id,
          serverName: server.name,
          tools: toolSummaries,
        });
      } catch (err) {
        console.warn(
          `[McpManager] Failed to connect MCP server "${server.name}" (${server.id}):`,
          err instanceof Error ? err.message : String(err),
        );
      }
    });

    await Promise.all(connectPromises);

    return {
      tools: mergedTools,
      activeCount: this.activeClients.size,
      summaries,
    };
  }

  /**
   * One-off probe to test an MCP server configuration from the Settings dialog.
   * Connects, retrieves the tool list, and immediately closes the client.
   */
  async testServer(server: McpServerSettings): Promise<McpTestResult> {
    try {
      const { client, toolSummaries } = await this.connectServer({
        ...server,
        enabled: true,
      });

      // Cleanup test client immediately
      await client.close().catch(() => undefined);

      return {
        success: true,
        message: `Successfully connected to "${server.name}". Discovered ${toolSummaries.length} tool(s).`,
        tools: toolSummaries,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        tools: [],
      };
    }
  }

  /**
   * Return status and discovered tools for all currently configured MCP servers.
   */
  async getServerStatuses(): Promise<McpServerStatus[]> {
    const configured = getSettings().mcpServers ?? [];
    const statuses: McpServerStatus[] = [];

    for (const server of configured) {
      const active = this.activeClients.get(server.id);
      if (active) {
        statuses.push({
          id: server.id,
          name: server.name,
          enabled: server.enabled,
          state: 'connected',
          toolsCount: active.toolSummaries.length,
          tools: active.toolSummaries,
          lastChecked: active.connectedAt,
        });
      } else if (!server.enabled) {
        statuses.push({
          id: server.id,
          name: server.name,
          enabled: false,
          state: 'disabled',
          toolsCount: 0,
        });
      } else {
        // Configured as enabled but not currently in active pool; run quick probe
        try {
          const test = await this.testServer(server);
          statuses.push({
            id: server.id,
            name: server.name,
            enabled: true,
            state: test.success ? 'connected' : 'error',
            toolsCount: test.tools.length,
            tools: test.tools,
            error: test.success ? undefined : test.message,
            lastChecked: Date.now(),
          });
        } catch (cause) {
          statuses.push({
            id: server.id,
            name: server.name,
            enabled: true,
            state: 'error',
            toolsCount: 0,
            error: cause instanceof Error ? cause.message : String(cause),
            lastChecked: Date.now(),
          });
        }
      }
    }

    return statuses;
  }

  /**
   * Close all active MCP connections and release process / socket resources.
   */
  async closeAll(): Promise<void> {
    const clients = Array.from(this.activeClients.values());
    this.activeClients.clear();

    await Promise.all(
      clients.map(async ({ client }) => {
        try {
          await client.close();
        } catch {
          // Ignore cleanup errors
        }
      }),
    );
  }
}

export const mcpManager = new McpManager();
