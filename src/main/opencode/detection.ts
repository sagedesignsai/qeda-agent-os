/**
 * main/opencode/detection.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Detect an OpenCode installation and a running service.
 *
 * Reuses @opencode/client/service for service discovery (same as client.ts)
 * and a PATH/binary probe for the "installed but not running" case.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { Service, type Endpoint } from '@opencode/client/service';

const execFileAsync = promisify(execFile);

export type OpenCodeInstallState =
  | 'not-installed'
  | 'installed-not-running'
  | 'installed-unsupported'
  | 'running-unsupported'
  | 'connected'
  | 'error';

export interface OpenCodeDetection {
  state: OpenCodeInstallState;
  version: string | null;
  binaryPath: string | null;
  serviceUrl: string | null;
  message: string;
}

const CANDIDATE_PATHS = [
  path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
  path.join(os.homedir(), '.opencode', 'bin', 'opencode.exe'),
  ...(process.env.LOCALAPPDATA
    ? [
        path.join(
          process.env.LOCALAPPDATA,
          'Programs',
          'opencode',
          'opencode.exe',
        ),
      ]
    : []),
  '/usr/local/bin/opencode',
  '/usr/bin/opencode',
  '/opt/homebrew/bin/opencode',
];

async function findBinary(): Promise<string | null> {
  // PATH lookup first.
  try {
    const { stdout } = await execFileAsync(
      process.platform === 'win32' ? 'where.exe' : 'which',
      ['opencode'],
      {
        timeout: 3000,
      },
    );
    const p = stdout.split(/\r?\n/).map((line) => line.trim())[0];
    if (p) return p;
  } catch {
    // fall through
  }
  for (const candidate of CANDIDATE_PATHS) {
    try {
      const { stdout } = await execFileAsync(candidate, ['--version'], {
        timeout: 3000,
      });
      if (stdout.trim()) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function readVersion(binaryPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['--version'], {
      timeout: 3000,
    });
    const match = stdout.trim().match(/v?(\d+\.\d+\.\d+)/);
    return match ? match[1] : stdout.trim() || null;
  } catch {
    return null;
  }
}

/** The running service is authoritative; the binary on PATH may be older. */
async function readServiceVersion(endpoint: Endpoint): Promise<string | null> {
  try {
    const response = await fetch(`${endpoint.url}/api/info`, {
      headers: Service.headers(endpoint),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

export async function detectOpenCode(): Promise<OpenCodeDetection> {
  const binaryPath = await findBinary();
  if (!binaryPath) {
    return {
      state: 'not-installed',
      version: null,
      binaryPath: null,
      serviceUrl: null,
      message:
        'OpenCode is not installed. Install it to enable the OpenCode Builder engine.',
    };
  }

  const version = await readVersion(binaryPath);

  let endpoint: Endpoint | null;
  try {
    const discovered = await Service.discover();
    endpoint = discovered ?? null;
  } catch {
    endpoint = null;
  }

  const serviceVersion = endpoint ? await readServiceVersion(endpoint) : null;

  if (!endpoint) {
    if (!isOpenCodeVersionSupported(version)) {
      return {
        state: 'installed-unsupported',
        version,
        binaryPath,
        serviceUrl: null,
        message: `OpenCode ${version ?? 'unknown'} is installed, but Builder requires OpenCode 2.x. Upgrade OpenCode to continue.`,
      };
    }
    return {
      state: 'installed-not-running',
      version,
      binaryPath,
      serviceUrl: null,
      message:
        'OpenCode is installed but no service is running. Start it with `opencode serve --service`.',
    };
  }

  // The service process is authoritative; a stale binary on PATH must not make
  // a running v2 service look unsupported (or vice versa).
  const runningVersion = serviceVersion ?? version;
  if (!isOpenCodeVersionSupported(runningVersion)) {
    return {
      state: 'running-unsupported',
      version: runningVersion,
      binaryPath,
      serviceUrl: endpoint.url,
      message: `OpenCode ${runningVersion ?? 'unknown'} is not supported. Builder requires OpenCode 2.x.`,
    };
  }

  return {
    state: 'connected',
    version: runningVersion,
    binaryPath,
    serviceUrl: endpoint.url,
    message: `OpenCode ${runningVersion} is reachable.`,
  };
}

export function isOpenCodeVersionSupported(version: string | null): boolean {
  if (!version) return false;
  const major = Number(version.split('.')[0]);
  return Number.isFinite(major) && major === 2;
}
