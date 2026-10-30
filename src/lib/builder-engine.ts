/**
 * lib/builder-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-safe Builder engine configuration. The main process owns runtime
 * wiring; these types are the contract Settings and IPC share with the UI.
 *
 * Supported engines:
 *  - 'local': Native Qeda ToolLoopAgent with workspace coding tools + MCP
 *  - 'opencode': External OpenCode v2 attach-only client
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Which agent runtime powers Builder coding turns. */
export type BuilderEngine = 'local' | 'opencode';

/**
 * Default autonomy budget for one Local Builder turn.
 *
 * 50 steps was enough for a demo and not enough for real work: install, test,
 * fix, and re-test routinely crosses it. The cap still exists so a looping
 * model cannot run forever; it is a budget, not a target.
 */
export const DEFAULT_BUILDER_MAX_STEPS = 200;

/** Upper bound keeps a typo in Settings from producing an unbounded run. */
export const MAX_BUILDER_MAX_STEPS = 1_000;

/**
 * Default E2B template for the OpenCode sandbox engine.
 *
 * Pinned to the OpenCode 2 runtime Qeda's client speaks. Operators can override
 * it in Settings → Builder & MCP when their E2B account publishes a different
 * versioned alias.
 */
export const DEFAULT_E2B_SANDBOX_TEMPLATE = 'e2b/opencode:v2.0.24';

/** Normalize a persisted/user-entered step budget into the supported range. */
export function normalizeBuilderMaxSteps(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_BUILDER_MAX_STEPS;
  return Math.min(MAX_BUILDER_MAX_STEPS, Math.max(10, Math.floor(parsed)));
}

export type McpTransportKind = 'stdio' | 'http' | 'sse';

/**
 * One MCP server entry from settings. Secret values in `env` and `headers` are
 * encrypted at rest by the main process (same pattern as service API keys).
 */
export interface McpServerSettings {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransportKind;
  /** Stdio: executable (e.g. `npx`, `node`, or a binary on PATH). */
  command?: string;
  args?: string[];
  /** Optional working directory for the stdio child process. */
  cwd?: string;
  /** HTTP/SSE endpoint. */
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface McpToolSummary {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerStatus {
  id: string;
  name: string;
  enabled: boolean;
  state: 'connected' | 'connecting' | 'disabled' | 'error';
  toolsCount: number;
  tools?: McpToolSummary[];
  error?: string;
  lastChecked?: number;
}

export interface McpTestResult {
  success: boolean;
  message: string;
  tools: McpToolSummary[];
}

export function defaultBuilderEngine(): BuilderEngine {
  return 'local';
}

/** Pre-configured templates to make adding popular MCP servers fast and easy. */
export interface McpServerPreset {
  id: string;
  name: string;
  description: string;
  transport: McpTransportKind;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  notes?: string;
}

export const MCP_SERVER_PRESETS: McpServerPreset[] = [
  {
    id: 'github',
    name: 'GitHub MCP',
    description:
      'Inspect repos, PRs, issues, commits, and file contents directly via GitHub API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: '',
    },
    notes:
      'Requires a GitHub Personal Access Token (classic or fine-grained repo scope).',
  },
  {
    id: 'fetch',
    name: 'Fetch MCP',
    description:
      'Fetch and parse web pages or HTML content into markdown for the model.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
  },
  {
    id: 'memory',
    name: 'Memory Graph MCP',
    description: 'Persistent knowledge graph memory across agent sessions.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    id: 'sqlite',
    name: 'SQLite MCP',
    description: 'Query, analyze, and inspect local SQLite databases.',
    transport: 'stdio',
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-sqlite',
      '--db-path',
      'workspace.db',
    ],
  },
  {
    id: 'context7',
    name: 'Context7 Docs (SSE)',
    description:
      'Real-time library documentation and framework snippets via remote MCP.',
    transport: 'sse',
    url: 'https://mcp.context7.ai/sse',
    headers: {
      Authorization: '',
    },
    notes: 'Optional Context7 API Key for higher rate limits.',
  },
];
