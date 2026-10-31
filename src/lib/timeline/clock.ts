/**
 * lib/timeline/clock.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A playback clock the timeline kit and any renderer can share.
 *
 * Time is *injected*: `tick(nowMs)` is the only thing that advances it. The
 * animation-frame loop adapters call that with `performance.now()`; the offline
 * renderer calls it with a fixed frame timestamp instead, which is what makes a
 * deterministic render possible from the same code path.
 *
 * Listeners are notified outside React on purpose — the canvas repaints the
 * playhead from here, so playback causes zero component renders.
 */

import type { TimelineClock } from './types';

type Scheduler = (callback: (nowMs: number) => void) => number;
type Canceller = (handle: number) => void;

export type PlaybackClockOptions = {
  duration: () => number;
  playMode?: () => 'once' | 'loop' | 'ping-pong';
  /** Loop playback inside the loop range (or the whole document). */
  loopRange?: () => { start: number; end: number } | null;
  schedule?: Scheduler;
  cancel?: Canceller;
  now?: () => number;
  onChange?: () => void;
};

const defaultSchedule: Scheduler = (callback) => {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(() => callback(Date.now()), 16) as unknown as number;
};

const defaultCancel: Canceller = (handle) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
};

export class PlaybackClock implements TimelineClock {
  private time = 0;
  private playing = false;
  private listeners = new Set<() => void>();
  private handle: number | null = null;
  private lastNow: number | null = null;
  private direction: 1 | -1 = 1;
  private readonly options: PlaybackClockOptions;

  constructor(options: PlaybackClockOptions) {
    this.options = options;
  }

  getTime(): number {
    return this.time;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private duration(): number {
    return Math.max(0, this.options.duration());
  }

  seek(time: number): void {
    const duration = this.duration();
    const next = Math.min(Math.max(0, time), duration);
    if (next === this.time) return;
    this.time = next;
    this.emit();
  }

  play(): void {
    if (this.playing) return;
    const duration = this.duration();
    if (duration <= 0) return;
    const mode = this.options.playMode?.() ?? 'once';
    const range = this.options.loopRange?.() ?? null;
    const start = range?.start ?? 0;
    const end = range?.end ?? duration;
    if (mode === 'once' && this.time >= duration) this.time = 0;
    else if (mode === 'loop' && this.time >= end) this.time = start;
    else if (mode === 'ping-pong' && this.time >= end) this.direction = -1;
    else if (mode === 'ping-pong' && this.time <= start) this.direction = 1;
    this.playing = true;
    this.lastNow = null;
    this.emit();
    this.scheduleNext();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.lastNow = null;
    if (this.handle !== null) {
      (this.options.cancel ?? defaultCancel)(this.handle);
      this.handle = null;
    }
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /**
   * Advance from an external timestamp. Exposed so a renderer can own the frame
   * loop: the clock never reads the wall clock itself.
   */
  tick(nowMs: number): void {
    const duration = this.duration();
    const last = this.lastNow;
    this.lastNow = nowMs;
    if (!this.playing || last === null) return;

    const delta = Math.max(0, (nowMs - last) / 1000);
    if (delta === 0) return;

    const mode = this.options.playMode?.() ?? 'once';
    let next = this.time + delta * (mode === 'ping-pong' ? this.direction : 1);
    const range = this.options.loopRange?.() ?? null;
    const start = mode === 'once' ? 0 : (range?.start ?? 0);
    const end = mode === 'once' ? duration : (range?.end ?? duration);
    if (mode === 'loop' && end > start) {
      if (next > end) next = start + ((next - end) % (end - start));
    } else if (mode === 'ping-pong' && end > start) {
      while (next > end || next < start) {
        if (next > end) {
          next = end - (next - end);
          this.direction = -1;
        } else if (next < start) {
          next = start + (start - next);
          this.direction = 1;
        }
      }
    } else if (next >= end) {
      next = end;
      this.time = end;
      this.playing = false;
      this.emit();
      return;
    }

    this.time = Math.min(Math.max(next, 0), duration);
    this.emit();
  }

  private scheduleNext(): void {
    if (!this.playing) return;
    this.handle = (this.options.schedule ?? defaultSchedule)((nowMs) => {
      this.handle = null;
      this.tick(nowMs);
      if (this.playing) this.scheduleNext();
    });
  }

  dispose(): void {
    this.pause();
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
    this.options.onChange?.();
  }
}
