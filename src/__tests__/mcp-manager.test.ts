/**
 * __tests__/mcp-manager.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests McpManager lifecycle, parameter validation, connection pooling, and
 * error isolation for tool discovery.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { mcpManager } from '../main/ai/mcp/manager';
import type { McpServerSettings } from '../lib/builder-engine';

import { createMCPClient } from '@ai-sdk/mcp';

let mockSettingsServers: McpServerSettings[] = [];

jest.mock('../main/ai/settings', () => ({
  getSettings: jest.fn(() => ({
    mcpServers: mockSettingsServers,
  })),
}));

describe('McpManager', () => {
  beforeEach(() => {
    mockSettingsServers = [];
    (createMCPClient as jest.Mock).mockImplementation(async () => ({
      tools: jest.fn().mockResolvedValue({
        mock_tool: {
          description: 'A mock MCP tool',
          parameters: {},
          execute: jest.fn(),
        },
      }),
      listTools: jest.fn().mockResolvedValue({
        tools: [
          {
            name: 'mock_tool',
            description: 'A mock MCP tool',
            inputSchema: { type: 'object' },
          },
        ],
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(async () => {
    await mcpManager.closeAll();
  });

  describe('parameter validation', () => {
    it('throws when connecting a disabled server', async () => {
      const server: McpServerSettings = {
        id: 's1',
        name: 'Disabled Server',
        enabled: false,
        transport: 'stdio',
        command: 'npx',
      };

      await expect(mcpManager.connectServer(server)).rejects.toThrow(
        /is disabled/,
      );
    });

    it('throws when stdio server has no command', async () => {
      const server: McpServerSettings = {
        id: 's2',
        name: 'No Command Server',
        enabled: true,
        transport: 'stdio',
        command: '   ',
      };

      await expect(mcpManager.connectServer(server)).rejects.toThrow(
        /requires a command/,
      );
    });

    it('throws when http server has no url', async () => {
      const server: McpServerSettings = {
        id: 's3',
        name: 'No URL Server',
        enabled: true,
        transport: 'http',
        url: '',
      };

      await expect(mcpManager.connectServer(server)).rejects.toThrow(
        /requires an endpoint URL/,
      );
    });

    it('throws when transport kind is unsupported', async () => {
      const server = {
        id: 's4',
        name: 'Unknown Transport',
        enabled: true,
        transport: 'grpc' as unknown,
      } as McpServerSettings;

      await expect(mcpManager.connectServer(server)).rejects.toThrow(
        /Unsupported MCP transport/,
      );
    });
  });

  describe('connection and tool aggregation', () => {
    it('connects a stdio server and discovers tools', async () => {
      const server: McpServerSettings = {
        id: 's-stdio',
        name: 'Local Git Server',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-git'],
      };

      const result = await mcpManager.connectServer(server);
      expect(result).toBeDefined();
      expect(result.tools).toHaveProperty('mock_tool');
      expect(result.toolSummaries).toHaveLength(1);
      expect(result.toolSummaries[0].name).toBe('mock_tool');
    });

    it('tests a server and returns McpTestResult', async () => {
      const server: McpServerSettings = {
        id: 's-test',
        name: 'Test Server',
        enabled: true,
        transport: 'http',
        url: 'https://mcp.example.com/api',
      };

      const testResult = await mcpManager.testServer(server);
      expect(testResult.success).toBe(true);
      expect(testResult.tools).toHaveLength(1);
      expect(testResult.tools[0].name).toBe('mock_tool');
    });

    it('aggregates tools across multiple enabled servers and isolates failures', async () => {
      const goodServer: McpServerSettings = {
        id: 'good',
        name: 'Good Server',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
      };

      const badServer: McpServerSettings = {
        id: 'bad',
        name: 'Failing Server',
        enabled: true,
        transport: 'http',
        url: '', // will throw
      };

      const { tools, activeCount, summaries } =
        await mcpManager.loadToolsForEnabledServers([goodServer, badServer]);

      // Good server tools are loaded despite bad server error
      expect(activeCount).toBe(1);
      expect(tools).toHaveProperty('mcp_good_mock_tool');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].serverId).toBe('good');
    });

    it('reports server statuses correctly', async () => {
      const servers: McpServerSettings[] = [
        {
          id: 'active-1',
          name: 'Active 1',
          enabled: true,
          transport: 'stdio',
          command: 'node',
        },
        {
          id: 'disabled-1',
          name: 'Disabled 1',
          enabled: false,
          transport: 'http',
          url: 'https://api.example.com',
        },
      ];

      mockSettingsServers = servers;
      await mcpManager.loadToolsForEnabledServers(servers);
      const statuses = await mcpManager.getServerStatuses();

      expect(statuses).toHaveLength(2);
      const activeStatus = statuses.find((s) => s.id === 'active-1');
      const disabledStatus = statuses.find((s) => s.id === 'disabled-1');

      expect(activeStatus?.state).toBe('connected');
      expect(activeStatus?.toolsCount).toBe(1);
      expect(disabledStatus?.state).toBe('disabled');
      expect(disabledStatus?.toolsCount).toBe(0);
    });
  });
});
