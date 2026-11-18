import { nanoid } from 'nanoid';
import type {
  StudioSignInDecision,
  StudioSignInOutcome,
  StudioSignInRequest,
} from '../lib/studio/types.js';

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

interface PendingSignIn {
  resolve: (outcome: StudioSignInOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface StudioSignInHandoffOptions {
  sendRequest: (request: StudioSignInRequest) => void;
  sendExpired: (requestId: string) => void;
  timeoutMs?: number;
  now?: () => number;
  createId?: () => string;
}

/** Bridges a main-process tool call to an explicit confirmation in Studio. */
export class StudioSignInHandoff {
  private readonly pending = new Map<string, PendingSignIn>();
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(private readonly options: StudioSignInHandoffOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? nanoid;
  }

  request(browserId: string): Promise<StudioSignInOutcome> {
    if (this.pending.size > 0) {
      throw new Error('A sign-in confirmation is already waiting in Studio.');
    }

    const requestId = this.createId();
    const request: StudioSignInRequest = {
      requestId,
      browserId,
      expiresAt: this.now() + this.timeoutMs,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.finish(requestId, 'expired'),
        this.timeoutMs,
      );
      this.pending.set(requestId, { resolve, timer });
      try {
        this.options.sendRequest(request);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  reply(
    requestId: string,
    decision: StudioSignInDecision,
  ): { accepted: boolean } {
    const outcome = decision === 'continue' ? 'confirmed' : 'cancelled';
    return { accepted: this.finish(requestId, outcome) };
  }

  cancelAll(): void {
    for (const requestId of this.pending.keys()) {
      this.finish(requestId, 'cancelled');
    }
  }

  private finish(
    requestId: string,
    outcome: StudioSignInOutcome,
  ): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (outcome === 'expired') this.options.sendExpired(requestId);
    pending.resolve(outcome);
    return true;
  }
}
