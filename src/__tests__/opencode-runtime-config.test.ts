/**
 * __tests__/opencode-runtime-config.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The plugin reads its step budget and MCP servers from a snapshot written at
 * registration. These tests pin the mapping rules (prefix, disabled/invalid
 * filtering, collision handling, permissions) without booting OpenCode.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildOpenCodeRuntimeConfig,
  writeOpenCodeRuntimeConfig,
} from '@/main/opencode/runtime-config';

describe('OpenCode runtime config', () => {
  it('mirrors enabled MCP servers with a qeda- prefix and collision suffix', () => {
    const config = buildOpenCodeRuntimeConfig({
      maxSteps: 5000,
      mcpServers: [
        {
          id: 'docs',
          name: 'Docs',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'docs'],
          env: { TOKEN: 'secret', EMPTY: ' ' },
        },
        {
          id: 'docs-2',
          name: 'Docs',
          enabled: true,
          transport: 'sse',
          url: 'https://mcp.example.test',
          headers: { Authorization: 'Bearer x' },
        },
        {
          id: 'off',
          name: 'Off',
          enabled: false,
          transport: 'stdio',
          command: 'never',
        },
        {
          id: 'broken',
          name: 'Broken',
          enabled: true,
          transport: 'stdio',
        },
      ],
    });

    expect(config.maxSteps).toBe(1000);
    expect(config.pluginVersion).toBe('0.2.0');
    expect(config.mcpServers).toEqual([
      {
        name: 'qeda-docs',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'docs'],
        env: { TOKEN: 'secret' },
      },
      {
        name: 'qeda-docs-2',
        transport: 'sse',
        url: 'https://mcp.example.test',
        headers: { Authorization: 'Bearer x' },
      },
    ]);
  });

  it('writes an owner-only snapshot', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-runtime-'));
    const file = path.join(dir, 'runtime.json');
    try {
      writeOpenCodeRuntimeConfig(
        file,
        buildOpenCodeRuntimeConfig({ maxSteps: 10 }),
      );
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).maxSteps).toBe(10);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
