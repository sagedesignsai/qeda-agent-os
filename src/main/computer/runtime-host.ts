/**
 * computer/runtime-host.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the lifecycle of a native OS accessibility sidecar (JSON-RPC over
 * stdio). Currently targets Linux via runtime/linux.py (AT-SPI).
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import readline from 'node:readline';

export interface RuntimeRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface RuntimeResponse {
  id: number;
  result?: unknown;
  error?: { code?: string | number; message: string };
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface RuntimeHostOptions {
  requestTimeoutMs?: number;
  command?: string;
  args?: string[];
  cwd?: string;
}

export class RuntimeHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private startPromise: Promise<void> | null = null;
  private readonly requestTimeoutMs: number;
  private readonly command: string;
  private readonly args: string[];
  private readonly cwd?: string;

  constructor(options: RuntimeHostOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.command = options.command ?? 'python3';
    const defaultScript = resolveLinuxRuntimeScript();
    this.args = options.args ?? [defaultScript];
    this.cwd = options.cwd;
  }

  isRunning(): boolean {
    return !!this.child && !this.child.killed;
  }

  async ensureStarted(): Promise<void> {
    if (this.isRunning()) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async start(): Promise<void> {
    this.stop();

    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    this.child = child;

    const rl = readline.createInterface({ input: child.stdout });
    this.rl = rl;
    rl.on('line', (line) => this.onLine(line));

    child.stderr?.on('data', () => {
      // Best-effort: stderr is noisy in AT-SPI environments; keep it out of
      // protocol handling. Hook points can be added for diagnostics later.
    });

    child.on('exit', (code, signal) => {
      const err = new Error(
        `computer-use sidecar exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`,
      );
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(err);
      }
      this.pending.clear();
      if (this.child === child) {
        this.child = null;
        this.rl?.close();
        this.rl = null;
      }
    });

    child.on('error', (e) => {
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(e instanceof Error ? e : new Error(String(e)));
      }
      this.pending.clear();
    });

    // Handshake: a lightweight ping so callers fail fast on broken runtimes.
    await this.request('handshake', {}, 10_000).catch((e) => {
      this.stop();
      throw e;
    });
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: RuntimeResponse;
    try {
      msg = JSON.parse(trimmed) as RuntimeResponse;
    } catch {
      return; // ignore non-protocol output
    }
    if (typeof msg?.id !== 'number') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new Error(msg.error.message || 'Sidecar request failed'));
    } else {
      pending.resolve(msg.result);
    }
  }

  async request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<any> {
    await this.ensureStarted();
    const child = this.child;
    if (!child?.stdin.writable) {
      throw new Error('computer-use sidecar is not available');
    }

    const id = this.nextId++;
    const payload: RuntimeRequest = { id, method, params };
    const timeout = timeoutMs ?? this.requestTimeoutMs;

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Sidecar request timed out: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        child.stdin.write(`${JSON.stringify(payload)}\n`);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  stop(): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Sidecar stopped'));
    }
    this.pending.clear();
    this.rl?.close();
    this.rl = null;
    if (this.child && !this.child.killed) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
    }
    this.child = null;
  }
}

export function resolveLinuxRuntimeScript(): string {
  // Dev: source tree path. Packaged builds may need resource-path resolution;
  // callers can override via RuntimeHostOptions.args.
  const candidates = [
    path.join(process.cwd(), 'src', 'main', 'computer', 'runtime', 'linux.py'),
    path.join(__dirname, 'runtime', 'linux.py'),
    path.join(__dirname, 'computer', 'runtime', 'linux.py'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

let singleton: RuntimeHost | null = null;

export function getRuntimeHost(): RuntimeHost {
  if (!singleton) singleton = new RuntimeHost();
  return singleton;
}
