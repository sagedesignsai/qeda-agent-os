/**
 * main/opencode/registration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Installs Qeda's self-contained OpenCode v2 plugin under the user's OpenCode
 * config directory and registers its directory in the v2 `plugins` setting.
 * Existing config values are preserved, and malformed config is never replaced.
 *
 * The plugin entry also points at Qeda's runtime settings snapshot (step budget
 * and enabled MCP servers) so the plugin can configure its agent and MCP
 * servers when OpenCode loads it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  QEDA_OPENCODE_PLUGIN_VERSION,
  writeOpenCodeRuntimeConfig,
  type OpenCodeRuntimeConfig,
} from './runtime-config';

export interface RegisterPluginOptions {
  mode: 'bundled' | 'published';
  resourcePath?: string;
  bridgeConfigPath?: string;
  runtimeConfigPath?: string;
  runtimeConfig?: OpenCodeRuntimeConfig;
}

export interface RegistrationResult {
  ok: boolean;
  configPath: string;
  pluginEntry: string;
  added: boolean;
  message: string;
}

function configDirectory(): string {
  if (process.env.QEDA_OPENCODE_CONFIG_DIR) {
    return path.resolve(process.env.QEDA_OPENCODE_CONFIG_DIR);
  }
  const base =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'opencode');
}

function configFile(): string {
  const dir = configDirectory();
  if (fs.existsSync(path.join(dir, 'opencode.json')))
    return path.join(dir, 'opencode.json');
  return path.join(dir, 'opencode.jsonc');
}

function stripTrailingCommas(source: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === ',') {
      let next = i + 1;
      while (next < source.length && /\s/.test(source[next])) next += 1;
      if (source[next] === '}' || source[next] === ']') continue;
    }
    output += char;
  }
  return output;
}

function stripJsonComments(source: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      output += '\n';
    } else if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/'))
        i += 1;
      i += 1;
    } else {
      output += char;
    }
  }
  return stripTrailingCommas(output);
}

function readConfig(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(raw));
  } catch (error) {
    throw new Error(
      `Cannot safely update invalid OpenCode config ${file}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Cannot safely update OpenCode config ${file}: expected an object.`,
    );
  }
  return parsed as Record<string, unknown>;
}

function writeConfig(file: string, config: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const backup = `${file}.qeda.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  }
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
}

function pluginDirectory(): string {
  return path.join(configDirectory(), 'plugins', 'qeda-builder');
}

function entryFor(directory: string): string {
  return pathToFileURL(directory).href;
}

export function getBundledPluginSource(resourcesPath: string): string {
  return path.join(resourcesPath, 'opencode-plugins', 'qeda-builder');
}

function installPlugin(sourceDirectory: string): string {
  const destination = pluginDirectory();
  const source = path.resolve(sourceDirectory);
  const sourceIndex = path.join(source, 'index.js');
  if (!fs.existsSync(sourceIndex)) {
    throw new Error(`Bundled Qeda Builder plugin is missing: ${sourceIndex}`);
  }
  const installedManifest = path.join(destination, 'package.json');
  if (fs.existsSync(destination) && fs.readdirSync(destination).length > 0) {
    let isQedaInstall = false;
    try {
      const manifest = JSON.parse(
        fs.readFileSync(installedManifest, 'utf8'),
      ) as {
        name?: string;
      };
      isQedaInstall = manifest.name === 'qeda-builder-plugin';
    } catch {
      // Treat an unrecognized directory as user-owned and leave it untouched.
    }
    if (!isQedaInstall) {
      throw new Error(
        `The Qeda plugin destination already contains user files: ${destination}`,
      );
    }
  }
  fs.mkdirSync(destination, { recursive: true });
  // Keep the per-user copy self-contained: the bundled resource directory may
  // not contain a manifest (extraResources copies only the compiled entry).
  for (const file of fs.readdirSync(source)) {
    if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
    fs.copyFileSync(path.join(source, file), path.join(destination, file));
  }
  fs.writeFileSync(
    path.join(destination, 'package.json'),
    JSON.stringify(
      {
        name: 'qeda-builder-plugin',
        private: true,
        version: QEDA_OPENCODE_PLUGIN_VERSION,
        type: 'module',
        main: './index.js',
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  return destination;
}

function pluginEntries(config: Record<string, unknown>): unknown[] {
  const current = config.plugins;
  const legacy = config.plugin;
  if (current !== undefined && !Array.isArray(current)) {
    throw new Error(
      'Cannot safely update OpenCode config: "plugins" must be an array.',
    );
  }
  if (legacy !== undefined && !Array.isArray(legacy)) {
    throw new Error(
      'Cannot safely migrate OpenCode config: legacy "plugin" must be an array.',
    );
  }
  const combined = [
    ...(Array.isArray(legacy) ? legacy : []),
    ...(Array.isArray(current) ? current : []),
  ];
  return combined.filter((entry, index) =>
    typeof entry === 'string'
      ? combined.indexOf(entry) === index
      : combined.findIndex((candidate) => candidate === entry) === index,
  );
}

/** Resolve a config entry (string or `{ package }`) to a filesystem path. */
function entryPath(value: unknown): string | null {
  if (typeof value === 'string') {
    if (!value.startsWith('file:')) return null;
    try {
      return path.resolve(fileURLToPath(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const pkg = (value as { package?: unknown }).package;
  return typeof pkg === 'string' ? entryPath(pkg) : null;
}

function matchesEntry(
  value: unknown,
  entry: string,
  directory: string,
): boolean {
  if (value === entry) return true;
  if (typeof value === 'object' && value !== null) {
    const pkg = (value as { package?: unknown }).package;
    if (pkg === entry) return true;
  }
  const resolved = entryPath(value);
  return resolved !== null && resolved === path.resolve(directory);
}

export function registerPlugin(
  options: RegisterPluginOptions,
): RegistrationResult {
  const file = configFile();
  let entry = '@qeda/opencode-builder';
  try {
    if (options.mode !== 'bundled') {
      throw new Error(
        'Published Qeda Builder plugin is not available; use the bundled plugin.',
      );
    }
    if (!options.resourcePath)
      throw new Error('Bundled plugin resource directory was not provided.');
    if (!options.bridgeConfigPath)
      throw new Error('Qeda bridge config path was not provided.');

    // Validate the config before touching the install or runtime files.
    const config = readConfig(file);
    const entries = pluginEntries(config);
    const installedDirectory = installPlugin(options.resourcePath);
    entry = entryFor(installedDirectory);

    if (options.runtimeConfigPath && options.runtimeConfig) {
      writeOpenCodeRuntimeConfig(
        options.runtimeConfigPath,
        options.runtimeConfig,
      );
    }

    const nextEntry = {
      package: entry,
      options: {
        bridgeConfigPath: options.bridgeConfigPath,
        ...(options.runtimeConfigPath
          ? { runtimeConfigPath: options.runtimeConfigPath }
          : {}),
      },
    };
    const wasRegistered = entries.some((item) =>
      matchesEntry(item, entry, installedDirectory),
    );
    // Remove every prior Qeda entry (including v1 string entries and legacy
    // duplicates), then append the canonical v2 object entry once.
    const nextEntries = entries.filter(
      (item) => !matchesEntry(item, entry, installedDirectory),
    );
    nextEntries.push(nextEntry);
    config.plugins = nextEntries;
    delete config.plugin;
    if (!config.$schema) config.$schema = 'https://opencode.ai/config.json';
    writeConfig(file, config);
    return {
      ok: true,
      configPath: file,
      pluginEntry: entry,
      added: !wasRegistered,
      message: wasRegistered
        ? 'Qeda Builder plugin updated.'
        : 'Qeda Builder plugin installed and registered.',
    };
  } catch (error) {
    return {
      ok: false,
      configPath: file,
      pluginEntry: entry,
      added: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function entryDirectory(entry: string): string {
  return entryPath(entry) ?? path.resolve(entry);
}

export function isRegistered(entry: string): boolean {
  try {
    const config = readConfig(configFile());
    return pluginEntries(config).some((item) =>
      matchesEntry(item, entry, entryDirectory(entry)),
    );
  } catch {
    return false;
  }
}

export function unregisterPlugin(entry: string): RegistrationResult {
  const file = configFile();
  try {
    const config = readConfig(file);
    const entries = pluginEntries(config);
    const next = entries.filter(
      (item) => !matchesEntry(item, entry, entryDirectory(entry)),
    );
    const removed = next.length !== entries.length;
    if (removed) {
      config.plugins = next;
      delete config.plugin;
      writeConfig(file, config);
    }
    return {
      ok: true,
      configPath: file,
      pluginEntry: entry,
      added: false,
      message: removed ? 'Unregistered.' : 'Not registered.',
    };
  } catch (error) {
    return {
      ok: false,
      configPath: file,
      pluginEntry: entry,
      added: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function readRegisteredPlugins(): string[] {
  try {
    const config = readConfig(configFile());
    return pluginEntries(config)
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object')
          return String((item as { package?: unknown }).package ?? '');
        return '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
