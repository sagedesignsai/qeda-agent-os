import { spawn, type ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import * as acp from '@agentclientprotocol/sdk';
import { nanoid } from 'nanoid';
import { buildExecutionEnv } from '../ai/shell-env.js';
import { getSettings } from '../ai/settings.js';
import { normalizeTerminalSettings } from '../../lib/terminal-settings.js';
import { updateTerminalSession } from '../db/terminal.js';
import type {
  AcpSessionSnapshot,
  AcpTerminalEvent,
  CodingCliProvider,
} from '../../lib/terminal-acp.js';
import {
  CODING_CLI_PROFILES,
  discoverCodingClis,
} from './coding-cli.js';

const MAX_EVENTS_PER_SESSION = 600;

interface PendingPermission {
  options: acp.PermissionOption[];
  resolve: (response: acp.RequestPermissionResponse) => void;
}

interface AcpSessionRecord {
  sessionId: string;
  provider: CodingCliProvider;
  cwd: string;
  child: ChildProcess;
  connection: acp.ClientConnection;
  activeSession: acp.ActiveSession;
  status: AcpSessionSnapshot['status'];
  events: AcpTerminalEvent[];
  pendingPermissions: Map<string, PendingPermission>;
  turnRunning: boolean;
  stopRequested: boolean;
}

interface PendingStart {
  promise: Promise<void>;
  controller: AbortController;
}

export class AcpManager {
  private readonly sessions = new Map<string, AcpSessionRecord>();
  private readonly starting = new Map<string, PendingStart>();

  constructor(private window: BrowserWindow) {}

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  discover(env = buildExecutionEnv()): Record<CodingCliProvider, string | null> {
    return discoverCodingClis(
      env,
      normalizeTerminalSettings(getSettings().terminal).codingCliPaths,
    );
  }

  getState(sessionId: string): AcpSessionSnapshot | null {
    const record = this.sessions.get(sessionId);
    if (!record) return null;
    return {
      provider: record.provider,
      status: record.status,
      events: [...record.events],
      pendingPermissions: record.events.filter(
        (event): event is Extract<AcpTerminalEvent, { type: 'permission-request' }> =>
          event.type === 'permission-request' &&
          record.pendingPermissions.has(event.requestId),
      ),
    };
  }

  async startOrPrompt(opts: {
    sessionId: string;
    provider: CodingCliProvider;
    cwd: string;
    prompt: string;
  }): Promise<void> {
    if (this.starting.has(opts.sessionId)) {
      throw new Error('The coding CLI is still starting for this terminal session.');
    }

    const controller = new AbortController();
    const promise = this.startOrPromptOnce(opts, controller.signal);
    const pendingStart = { promise, controller };
    this.starting.set(opts.sessionId, pendingStart);
    try {
      await promise;
    } finally {
      if (this.starting.get(opts.sessionId) === pendingStart) {
        this.starting.delete(opts.sessionId);
      }
    }
  }

  private async startOrPromptOnce(
    opts: {
      sessionId: string;
      provider: CodingCliProvider;
      cwd: string;
      prompt: string;
    },
    signal: AbortSignal,
  ): Promise<void> {
    const prompt = opts.prompt.trim();
    if (!prompt) throw new Error('Enter a prompt before starting the coding CLI.');

    if (signal.aborted) throw new Error('Coding CLI startup was cancelled.');
    let record = this.sessions.get(opts.sessionId);
    if (!record || record.status === 'stopped' || record.status === 'error') {
      if (record) {
        await this.stop(opts.sessionId);
        this.sessions.delete(opts.sessionId);
      }
      record = await this.createSession(opts, signal);
    } else if (record.provider !== opts.provider) {
      throw new Error(
        'This terminal session is already connected to a different coding CLI. Stop it before switching providers.',
      );
    } else if (path.resolve(record.cwd) !== path.resolve(opts.cwd)) {
      throw new Error(
        'This ACP session is tied to a different working directory. Stop it before changing directories.',
      );
    }

    if (record.turnRunning) {
      throw new Error('The coding CLI is already processing a prompt.');
    }

    void this.runPrompt(record, prompt);
  }

  async cancel(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) {
      this.starting.get(sessionId)?.controller.abort();
      return;
    }
    await record.connection.agent.notify(acp.methods.agent.session.cancel, {
      sessionId: record.activeSession.sessionId,
    });
    this.cancelPendingPermissions(record);
  }

  respondToPermission(
    sessionId: string,
    requestId: string,
    optionId?: string,
  ): void {
    const record = this.sessions.get(sessionId);
    const pending = record?.pendingPermissions.get(requestId);
    if (!record || !pending) {
      throw new Error('This ACP permission request is no longer active.');
    }

    if (!optionId) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
      record.pendingPermissions.delete(requestId);
      this.emit(record, {
        type: 'permission-resolved',
        requestId,
        decision: 'cancelled',
      });
      return;
    }

    if (!pending.options.some((option) => option.optionId === optionId)) {
      throw new Error('The selected permission option is invalid.');
    }

    pending.resolve({
      outcome: { outcome: 'selected', optionId },
    });
    record.pendingPermissions.delete(requestId);
    this.emit(record, {
      type: 'permission-resolved',
      requestId,
      decision: 'selected',
    });
  }

  async stop(sessionId: string): Promise<void> {
    const pendingStart = this.starting.get(sessionId);
    if (pendingStart) pendingStart.controller.abort();
    const record = this.sessions.get(sessionId);
    if (!record) {
      try {
        await pendingStart?.promise;
      } catch (error) {
        if (!pendingStart?.controller.signal.aborted) throw error;
      }
      return;
    }

    record.stopRequested = true;
    this.cancelPendingPermissions(record);
    record.connection.close();
    if (record.child.exitCode === null && !record.child.killed) {
      record.child.kill('SIGTERM');
      setTimeout(() => {
        if (record.child.exitCode === null) record.child.kill('SIGKILL');
      }, 2500);
    }
    record.status = 'stopped';
    this.emit(record, { type: 'status', status: 'stopped' });
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(
        new Set([...this.sessions.keys(), ...this.starting.keys()]),
        (sessionId) => this.stop(sessionId),
      ),
    );
  }

  private async createSession(opts: {
    sessionId: string;
    provider: CodingCliProvider;
    cwd: string;
    prompt: string;
  }, signal: AbortSignal): Promise<AcpSessionRecord> {
    const env = buildExecutionEnv(opts.sessionId, opts.cwd);
    const profile = CODING_CLI_PROFILES[opts.provider];
    const executable = this.discover(env)[opts.provider];
    if (!executable) {
      throw new Error(
        `${profile.executable} was not found using the configured executable path or login-shell PATH. Check the Terminal settings or install it, then retry.`,
      );
    }

    const child = spawn(executable, [...profile.args], {
      cwd: opts.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (!child.stdin || !child.stdout) {
      child.kill();
      throw new Error('Could not open ACP stdio pipes for the coding CLI.');
    }

    let record: AcpSessionRecord | null = null;
    let rejectProcessExit: ((error: Error) => void) | null = null;
    const processExit = new Promise<never>((_resolve, reject) => {
      rejectProcessExit = reject;
    });
    child.once('error', (error) => {
      if (record) this.fail(record, error);
      rejectProcessExit?.(error);
    });
    const abortStartup = () => {
      const error = new Error('Coding CLI startup was cancelled.');
      rejectProcessExit?.(error);
      child.kill('SIGTERM');
    };
    if (signal.aborted) abortStartup();
    else signal.addEventListener('abort', abortStartup, { once: true });
    child.once('exit', (code, signal) => {
      const error = new Error(
        `Coding CLI exited during ACP startup with ${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}.`,
      );
      if (record && !record.stopRequested) {
        if (code !== 0) {
          this.fail(record, error);
        } else {
          record.status = 'stopped';
          this.emit(record, { type: 'status', status: 'stopped' });
        }
      }
      rejectProcessExit?.(error);
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const pendingPermissions = new Map<string, PendingPermission>();

    const app = acp
      .client({ name: 'Qeda' })
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        if (
          !record ||
          params.sessionId !== record.activeSession.sessionId
        ) {
          return;
        }
        this.emit(record, { type: 'update', update: params.update });
      })
      .onRequest(
        acp.methods.client.session.requestPermission,
        ({ params, requestId }) =>
          new Promise<acp.RequestPermissionResponse>((resolve) => {
            if (!record) {
              resolve({ outcome: { outcome: 'cancelled' } });
              return;
            }
            const id = String(requestId ?? nanoid());
            pendingPermissions.set(id, {
              options: params.options,
              resolve,
            });
            this.emit(record, {
              type: 'permission-request',
              requestId: id,
              title: params.toolCall.title ?? 'Agent action',
              toolCall: params.toolCall,
              options: params.options,
            });
          }),
      );
    const connection = app.connect(stream);
    let startupTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      startupTimeout = setTimeout(() => {
        const error = new Error('The coding CLI did not finish ACP startup in time.');
        rejectProcessExit?.(error);
        child.kill('SIGTERM');
      }, 30_000);
      const activeSession = await Promise.race([
        (async () => {
          await connection.agent.request(acp.methods.agent.initialize, {
            protocolVersion: acp.PROTOCOL_VERSION,
            clientInfo: {
              name: 'Qeda',
              version: process.env.QEDA_VERSION ?? '0.0.0',
            },
            clientCapabilities: { plan: {} },
          });
          return connection.agent
            .buildSession(path.resolve(opts.cwd))
            .start();
        })(),
        processExit,
      ]);

      const activeRecord: AcpSessionRecord = {
        sessionId: opts.sessionId,
        provider: opts.provider,
        cwd: opts.cwd,
        child,
        connection,
        activeSession,
        status: 'ready',
        events: [],
        pendingPermissions,
        turnRunning: false,
        stopRequested: false,
      };
      record = activeRecord;
      this.sessions.set(opts.sessionId, activeRecord);
      void this.drainUpdates(activeRecord);
      child.stderr?.on('data', (data: Buffer) => {
        this.emit(activeRecord, { type: 'log', text: data.toString() });
      });
      this.emit(activeRecord, { type: 'status', status: 'ready' });
      return activeRecord;
    } catch (error) {
      connection.close(error);
      child.kill();
      throw error;
    } finally {
      signal.removeEventListener('abort', abortStartup);
      if (startupTimeout) clearTimeout(startupTimeout);
    }
  }

  private async runPrompt(
    record: AcpSessionRecord,
    prompt: string,
  ): Promise<void> {
    record.turnRunning = true;
    record.status = 'running';
    this.emit(record, { type: 'prompt', text: prompt });
    this.emit(record, { type: 'status', status: 'running' });
    try {
      const promptRequest = record.activeSession.prompt(prompt);
      const result = await Promise.race([
        promptRequest.then(
          (response) => ({ kind: 'response' as const, response }),
          (error: unknown) => ({ kind: 'error' as const, error }),
        ),
        record.connection.closed.then(() => ({ kind: 'closed' as const })),
      ]);

      if (result.kind === 'error') throw result.error;
      if (result.kind === 'closed') {
        if (!record.stopRequested) {
          throw new Error('The coding CLI closed its ACP connection.');
        }
      } else {
        this.emit(record, {
          type: 'status',
          status: 'ready',
          message: `Turn finished: ${result.response.stopReason}.`,
        });
      }

      this.cancelPendingPermissions(record);
      if (!record.stopRequested) record.status = 'ready';
    } catch (error) {
      this.fail(record, error);
    } finally {
      record.turnRunning = false;
    }
  }

  private async drainUpdates(record: AcpSessionRecord): Promise<void> {
    try {
      while (!record.stopRequested) {
        await record.activeSession.nextUpdate();
      }
    } catch (error) {
      if (!record.stopRequested) this.fail(record, error);
    }
  }

  private cancelPendingPermissions(record: AcpSessionRecord): void {
    for (const [requestId, pending] of record.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
      this.emit(record, {
        type: 'permission-resolved',
        requestId,
        decision: 'cancelled',
      });
    }
    record.pendingPermissions.clear();
  }

  private fail(record: AcpSessionRecord, error: unknown): void {
    if (record.status === 'error' || record.stopRequested) return;
    const message = error instanceof Error ? error.message : String(error);
    record.status = 'error';
    this.cancelPendingPermissions(record);
    record.connection.close(error);
    if (record.child.exitCode === null && !record.child.killed) {
      record.child.kill('SIGTERM');
    }
    this.emit(record, { type: 'error', message });
    this.emit(record, { type: 'status', status: 'error', message });
  }

  private emit(record: AcpSessionRecord, event: AcpTerminalEvent): void {
    record.events.push(event);
    if (record.events.length > MAX_EVENTS_PER_SESSION) {
      record.events.splice(0, record.events.length - MAX_EVENTS_PER_SESSION);
    }
    if (event.type === 'status') {
      updateTerminalSession(record.sessionId, {
        status:
          event.status === 'running'
            ? 'running'
            : event.status === 'error'
              ? 'error'
              : 'idle',
      });
    }
    if (!this.window.isDestroyed()) {
      this.window.webContents.send('terminal:acp-event', {
        sessionId: record.sessionId,
        event,
      });
    }
  }
}
