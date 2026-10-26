/**
 * main/opencode/runtime-config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the private settings snapshot the OpenCode plugin reads at load time:
 * the Qeda step budget and the enabled Qeda MCP servers.
 *
 * MCP `env` values and HTTP headers can contain credentials, so the snapshot is
 * written mode 0600. The plugin is loaded once when OpenCode starts, so this
 * file is written when the user installs/updates the plugin. Changing MCP
 * servers or the step budget in Qeda requires re-running setup (the card says
 * so) and restarting OpenCode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import type { McpServerSettings } from '../../lib/builder-engine';
import {
  DEFAULT_BUILDER_MAX_STEPS,
  normalizeBuilderMaxSteps,
} from '../../lib/builder-engine';

/** Must match plugins/qeda-builder/package.json. */
export const QEDA_OPENCODE_PLUGIN_VERSION = '0.2.0';

export interface OpenCodeRuntimeMcpServer {
  /** Prefixed with `qeda-` so Qeda never clobbers a user-owned OpenCode server. */
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export interface OpenCodeRuntimeConfig {
  pluginVersion: string;
  maxSteps: number;
  mcpServers: OpenCodeRuntimeMcpServer[];
}

function cleanRecord(
  value: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).filter(
    ([key, entry]) => key.trim() && entry.trim(),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'server';
}

/**
 * Convert Qeda's enabled MCP settings into the plugin's runtime shape.
 * Invalid entries are skipped rather than failing registration; the Settings
 * test tool remains the place that reports a broken server.
 */
export function buildOpenCodeRuntimeConfig(input?: {
  maxSteps?: number;
  mcpServers?: McpServerSettings[];
}): OpenCodeRuntimeConfig {
  const usedNames = new Set<string>();
  const servers: OpenCodeRuntimeMcpServer[] = [];

  for (const server of input?.mcpServers ?? []) {
    if (!server.enabled) continue;

    const baseName = `qeda-${slug(server.name || server.id)}`;
    let name = baseName;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${baseName}-${suffix}`;
      suffix += 1;
    }

    if (server.transport === 'stdio') {
      const command = server.command?.trim();
      if (!command) continue;
      const env = cleanRecord(server.env);
      usedNames.add(name);
      servers.push({
        name,
        transport: 'stdio',
        command,
        ...(server.args && server.args.length > 0
          ? { args: [...server.args] }
          : {}),
        ...(server.cwd?.trim() ? { cwd: server.cwd.trim() } : {}),
        ...(env ? { env } : {}),
      });
      continue;
    }

    const url = server.url?.trim();
    if (!url) continue;
    const headers = cleanRecord(server.headers);
    usedNames.add(name);
    servers.push({
      name,
      transport: server.transport,
      url,
      ...(headers ? { headers } : {}),
    });
  }

  return {
    pluginVersion: QEDA_OPENCODE_PLUGIN_VERSION,
    maxSteps: normalizeBuilderMaxSteps(
      input?.maxSteps ?? DEFAULT_BUILDER_MAX_STEPS,
    ),
    mcpServers: servers,
  };
}

/** Write atomically with owner-only permissions; the file may contain headers. */
export function writeOpenCodeRuntimeConfig(
  file: string,
  config: OpenCodeRuntimeConfig,
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}
