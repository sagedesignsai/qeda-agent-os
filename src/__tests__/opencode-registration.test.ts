/**
 * __tests__/opencode-registration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verify safe, repeatable installation and registration of the OpenCode v2
 * plugin without touching the developer's real OpenCode config.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isRegistered,
  readRegisteredPlugins,
  registerPlugin,
  unregisterPlugin,
} from '@/main/opencode/registration';
import { buildOpenCodeRuntimeConfig } from '@/main/opencode/runtime-config';

describe('OpenCode v2 plugin registration', () => {
  let tmpDir: string;
  let sourceDir: string;
  let bridgeConfigPath: string;
  let runtimeConfigPath: string;
  const runtimeConfig = buildOpenCodeRuntimeConfig({
    maxSteps: 150,
    mcpServers: [
      {
        id: 'docs',
        name: 'Docs',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      },
    ],
  });

  const register = () =>
    registerPlugin({
      mode: 'bundled',
      resourcePath: sourceDir,
      bridgeConfigPath,
      runtimeConfigPath,
      runtimeConfig,
    });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-reg-'));
    sourceDir = path.join(tmpDir, 'bundle');
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'index.js'), 'export default {};\n');
    bridgeConfigPath = path.join(tmpDir, 'user-data', 'bridge.json');
    runtimeConfigPath = path.join(tmpDir, 'user-data', 'runtime.json');
    process.env.QEDA_OPENCODE_CONFIG_DIR = path.join(tmpDir, 'config');
  });

  afterEach(() => {
    delete process.env.QEDA_OPENCODE_CONFIG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs a plugin directory and registers v2 package/options config idempotently', () => {
    const first = register();
    expect(first.ok).toBe(true);
    expect(first.added).toBe(true);
    expect(isRegistered(first.pluginEntry)).toBe(true);
    const installed = new URL(first.pluginEntry);
    expect(fs.existsSync(path.join(installed.pathname, 'index.js'))).toBe(true);

    const configPath = path.join(
      tmpDir,
      'config',
      fs.existsSync(path.join(tmpDir, 'config', 'opencode.json'))
        ? 'opencode.json'
        : 'opencode.jsonc',
    );
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.plugins).toEqual([
      {
        package: first.pluginEntry,
        options: { bridgeConfigPath, runtimeConfigPath },
      },
    ]);
    expect(readRegisteredPlugins()).toEqual([first.pluginEntry]);

    const storedRuntime = JSON.parse(
      fs.readFileSync(runtimeConfigPath, 'utf8'),
    );
    expect(storedRuntime.maxSteps).toBe(150);
    expect(storedRuntime.pluginVersion).toBe('0.2.0');
    expect(storedRuntime.mcpServers).toEqual([
      {
        name: 'qeda-docs',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      },
    ]);
    expect(fs.statSync(runtimeConfigPath).mode & 0o777).toBe(0o600);

    const second = register();
    expect(second.ok).toBe(true);
    expect(second.added).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(configPath, 'utf8')).plugins,
    ).toHaveLength(1);
  });

  it('preserves existing JSONC config and makes a one-time backup', () => {
    const dir = path.join(tmpDir, 'config');
    fs.mkdirSync(dir);
    const file = path.join(dir, 'opencode.jsonc');
    fs.writeFileSync(
      file,
      '{\n  // keep user settings\n  "$schema": "https://opencode.ai/config.json",\n  "model": "provider/model",\n  "note": "literal ,} stays",\n  "plugins": ["existing-plugin",],\n}\n',
    );

    register();
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(parsed.model).toBe('provider/model');
    expect(parsed.note).toBe('literal ,} stays');
    expect(parsed.plugins).toContain('existing-plugin');
    expect(parsed.plugins).toHaveLength(2);
    expect(fs.existsSync(`${file}.qeda.bak`)).toBe(true);
    const originalBackup = fs.readFileSync(`${file}.qeda.bak`, 'utf8');
    register();
    expect(fs.readFileSync(`${file}.qeda.bak`, 'utf8')).toBe(originalBackup);
  });

  it('migrates legacy v1 plugin entries into the v2 plugins array', () => {
    const dir = path.join(tmpDir, 'config');
    fs.mkdirSync(dir);
    const file = path.join(dir, 'opencode.jsonc');
    fs.writeFileSync(
      file,
      JSON.stringify({ plugin: ['existing-v1-plugin'], lsp: true }),
    );

    register();
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(parsed.plugin).toBeUndefined();
    expect(parsed.plugins).toContain('existing-v1-plugin');
    expect(parsed.lsp).toBe(true);
  });

  it('refuses malformed config without replacing it', () => {
    const dir = path.join(tmpDir, 'config');
    fs.mkdirSync(dir);
    const file = path.join(dir, 'opencode.jsonc');
    fs.writeFileSync(file, '{ definitely not json');
    const result = register();
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('{ definitely not json');
  });

  it('refuses to overwrite a user-owned plugin directory', () => {
    const dir = path.join(tmpDir, 'config', 'plugins', 'qeda-builder');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'mine.js'), '// user file\n');
    const result = register();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('user files');
    expect(fs.existsSync(path.join(dir, 'mine.js'))).toBe(true);
  });

  it('replaces a legacy string entry instead of duplicating it', () => {
    const dir = path.join(tmpDir, 'config');
    fs.mkdirSync(dir);
    const file = path.join(dir, 'opencode.jsonc');
    const legacyEntry = new URL(
      `file://${path.join(dir, 'plugins', 'qeda-builder')}`,
    ).href;
    fs.writeFileSync(file, JSON.stringify({ plugins: [legacyEntry, 'other'] }));

    const result = register();
    expect(result.added).toBe(false);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(parsed.plugins).toHaveLength(2);
    expect(
      parsed.plugins.filter((entry: unknown) => entry === legacyEntry),
    ).toHaveLength(0);
    expect(parsed.plugins).toContainEqual({
      package: result.pluginEntry,
      options: { bridgeConfigPath, runtimeConfigPath },
    });
  });

  it('unregisters only the Qeda plugin entry', () => {
    const file = path.join(tmpDir, 'config', 'opencode.jsonc');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify({ plugins: ['other'] }));
    const result = register();
    expect(unregisterPlugin(result.pluginEntry).ok).toBe(true);
    expect(readRegisteredPlugins()).toEqual(['other']);
    expect(isRegistered(result.pluginEntry)).toBe(false);
  });

  it('does not register an unpublished npm package', () => {
    const result = registerPlugin({
      mode: 'published',
      bridgeConfigPath,
      runtimeConfigPath,
      runtimeConfig,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not available');
  });
});
