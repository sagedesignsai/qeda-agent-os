/**
 * lib/music/engine/music-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Two-element music engine on the shared mixer.
 *
 * Why two `<audio>` elements: Chromium inserts a small gap between consecutive
 * `src` changes, which is audible on continuous mixes. Keeping the next track
 * loaded in an idle element lets the transition be a real equal-power fade.
 *
 * Each element gets exactly one `MediaElementAudioSourceNode`, created on first
 * use and reused forever — a second call for the same element throws. Routing
 * through Web Audio also means the music and the soundscape share one master
 * compressor, and the soundscape can be ducked against actual playback state
 * rather than a timer guess.
 *
 * No React in this file. The store is the only caller.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getAudioContext, resumeAudioContext } from '../../audio/context';
import { getMixer, rampGain, type AudioMixer } from '../../audio/mixer';
import { equalPowerFade } from '../crossfade';
import { musicMediaUrl } from '../media';
import type { MusicPlaybackSnapshot, MusicTrack } from '../types';

interface EngineHandlers {
  onSnapshot?: (snapshot: MusicPlaybackSnapshot) => void;
  onEnded?: () => void;
  onError?: (trackId: string, message: string) => void;
}

interface ElementRuntime {
  element: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode | null;
}

const FADE_POINTS = 24;

function createElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  const element = document.createElement('audio');
  element.preload = 'auto';
  // Not appended: an unattached media element still plays.
  return element;
}

export class MusicEngine {
  private mixer: AudioMixer | null = null;
  private runtimes: [ElementRuntime, ElementRuntime] | null = null;
  private active: 0 | 1 = 0;
  private handlers: EngineHandlers = {};
  private currentTrack: MusicTrack | null = null;
  private volume = 0.8;
  private muted = false;
  private fading = false;
  /**
   * Playback intent, not element state.
   *
   * `element.paused` is a lagging signal: a pause ramps the gain down before
   * calling `pause()`, and a fresh `play()` is still at `currentTime === 0`.
   * Reporting element state made the store flip back to "playing" during a
   * pause ramp (and briefly to "paused" on every start). The intent is what the
   * UI and the ducking stage actually care about.
   */
  private playingIntent = false;

  setHandlers(handlers: EngineHandlers): void {
    this.handlers = handlers;
  }

  get snapshot(): MusicPlaybackSnapshot {
    const runtime = this.activeRuntime();
    const element = runtime?.element;
    return {
      playing: this.playingIntent,
      positionMs: element ? element.currentTime * 1000 : 0,
      durationMs: element && Number.isFinite(element.duration)
        ? element.duration * 1000
        : (this.currentTrack?.duration_ms ?? 0),
    };
  }

  get isFading(): boolean {
    return this.fading;
  }

  private ensureGraph(): [ElementRuntime, ElementRuntime] | null {
    if (this.runtimes) return this.runtimes;
    const ctx = getAudioContext();
    const mixer = getMixer();
    if (!ctx || !mixer) return null;
    const first = createElement();
    const second = createElement();
    if (!first || !second) return null;

    const build = (element: HTMLAudioElement, initial: number): ElementRuntime => {
      const gain = ctx.createGain();
      gain.gain.value = initial;
      gain.connect(mixer.music);
      return { element, gain, source: null };
    };

    const runtimes: [ElementRuntime, ElementRuntime] = [
      build(first, 0),
      build(second, 0),
    ];
    this.mixer = mixer;
    this.runtimes = runtimes;
    for (const runtime of runtimes) {
      runtime.element.addEventListener('timeupdate', () => this.emitSnapshot());
      runtime.element.addEventListener('ended', () => {
        if (this.fading) return;
        this.emitSnapshot();
        this.handlers.onEnded?.();
      });
      runtime.element.addEventListener('error', () => {
        const trackId = this.currentTrack?.id;
        if (trackId) this.handlers.onError?.(trackId, 'This file could not be played');
      });
    }
    return runtimes;
  }

  /** Wire an element into Web Audio once. */
  private connect(runtime: ElementRuntime): void {
    if (runtime.source) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaElementSource(runtime.element);
      runtime.source = source;
      source.connect(runtime.gain);
    } catch {
      // Already connected (e.g. a hot reload re-created the engine while the
      // element survived). Falling back to direct output is better than silence.
      runtime.source = null;
    }
  }

  private activeRuntime(): ElementRuntime | null {
    return this.runtimes ? this.runtimes[this.active] : null;
  }

  private idleRuntime(): ElementRuntime | null {
    return this.runtimes ? this.runtimes[this.active === 0 ? 1 : 0] : null;
  }

  private emitSnapshot(): void {
    this.handlers.onSnapshot?.(this.snapshot);
  }

  private setGain(runtime: ElementRuntime, value: number, seconds = 0.05): void {
    rampGain(runtime.gain, this.muted ? 0 : value, seconds);
  }

  /** Load a track into the active element and optionally start it. */
  async load(track: MusicTrack, autoplay: boolean): Promise<void> {
    const runtimes = this.ensureGraph();
    if (!runtimes) return;
    const runtime = runtimes[this.active];
    this.connect(runtime);
    await resumeAudioContext();
    this.currentTrack = track;
    this.playingIntent = false;
    runtime.element.src = musicMediaUrl(track.id);
    runtime.element.load();
    this.setGain(runtime, 0, 0.01);
    if (autoplay) await this.play();
    this.emitSnapshot();
  }

  async play(): Promise<void> {
    const runtime = this.activeRuntime();
    if (!runtime || !this.currentTrack) return;
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') await ctx.resume();
    try {
      await runtime.element.play();
    } catch {
      // Autoplay policy: the caller's click should have resumed the context,
      // but a failed play is not a crash.
      return;
    }
    this.playingIntent = true;
    this.setGain(runtime, this.volume, 0.25);
    this.emitSnapshot();
  }

  pause(): void {
    const runtime = this.activeRuntime();
    // Clear the intent first: the ramp below keeps the element running for
    // another beat, and a snapshot in that window must not report "playing".
    this.playingIntent = false;
    if (!runtime) return;
    this.setGain(runtime, 0, 0.12);
    // Pause after the ramp so a pause does not click.
    window.setTimeout(() => runtime.element.pause(), 120);
    this.emitSnapshot();
  }

  seek(positionMs: number): void {
    const runtime = this.activeRuntime();
    if (!runtime) return;
    const seconds = Math.max(0, positionMs / 1000);
    try {
      runtime.element.currentTime = seconds;
    } catch {
      /* metadata not ready */
    }
    this.emitSnapshot();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    const runtime = this.activeRuntime();
    if (runtime) this.setGain(runtime, this.volume, 0.05);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const runtime = this.activeRuntime();
    if (runtime) this.setGain(runtime, this.volume, 0.05);
  }

  /**
   * Fade from the active element to `track` in the idle element. Returns false
   * when the next file cannot start, in which case the current track keeps
   * playing and the caller can surface an error.
   */
  async crossfadeTo(track: MusicTrack, seconds: number): Promise<boolean> {
    const runtimes = this.ensureGraph();
    if (!runtimes) return false;
    if (this.fading) return false;
    const outgoing = runtimes[this.active];
    const incoming = this.idleRuntime();
    if (!incoming) return false;

    this.connect(incoming);
    incoming.element.src = musicMediaUrl(track.id);
    incoming.element.load();
    this.setGain(incoming, 0, 0.01);

    try {
      await resumeAudioContext();
      await incoming.element.play();
    } catch {
      return false;
    }

    this.fading = true;
    this.playingIntent = true;
    const fade = Math.max(0.05, seconds);
    this.scheduleFade(outgoing, incoming, fade);

    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), fade * 1000 + 40);
    });

    this.fading = false;
    this.setGain(outgoing, 0, 0.02);
    outgoing.element.pause();
    outgoing.element.removeAttribute('src');
    outgoing.element.load();
    this.active = this.active === 0 ? 1 : 0;
    this.currentTrack = track;
    this.setGain(incoming, this.volume, 0.02);
    this.emitSnapshot();
    return true;
  }

  /** Load a track into the idle element so a later crossfade starts instantly. */
  preload(track: MusicTrack): void {
    const idle = this.idleRuntime();
    if (!idle) return;
    if (idle.element.getAttribute('src') === musicMediaUrl(track.id)) return;
    idle.element.src = musicMediaUrl(track.id);
    idle.element.load();
  }

  /** Stop both elements. Keeps the decoded/cached browser state untouched. */
  stop(): void {
    this.fading = false;
    this.playingIntent = false;
    for (const runtime of this.runtimes ?? []) {
      this.setGain(runtime, 0, 0.05);
      runtime.element.pause();
    }
    this.emitSnapshot();
  }

  dispose(): void {
    this.stop();
    for (const runtime of this.runtimes ?? []) {
      runtime.element.removeAttribute('src');
      runtime.element.load();
      runtime.source?.disconnect();
      runtime.gain.disconnect();
    }
    this.runtimes = null;
    this.currentTrack = null;
    this.mixer = null;
  }

  private scheduleFade(
    outgoing: ElementRuntime,
    incoming: ElementRuntime,
    seconds: number,
  ): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const outCurve = new Float32Array(FADE_POINTS);
    const inCurve = new Float32Array(FADE_POINTS);
    for (let i = 0; i < FADE_POINTS; i++) {
      const gains = equalPowerFade(i / (FADE_POINTS - 1));
      outCurve[i] = gains.out * (this.muted ? 0 : this.volume);
      inCurve[i] = gains.in * (this.muted ? 0 : this.volume);
    }
    try {
      outgoing.gain.gain.cancelScheduledValues(now);
      outgoing.gain.gain.setValueCurveAtTime(outCurve, now, seconds);
      incoming.gain.gain.cancelScheduledValues(now);
      incoming.gain.gain.setValueCurveAtTime(inCurve, now, seconds);
    } catch {
      // Some browsers reject overlapping curves; fall back to targets.
      rampGain(outgoing.gain, 0, seconds, ctx);
      rampGain(incoming.gain, this.volume, seconds, ctx);
    }
  }
}

let singleton: MusicEngine | null = null;

export function getMusicEngine(): MusicEngine {
  if (!singleton) singleton = new MusicEngine();
  return singleton;
}

/** Test hook. */
export function resetMusicEngine(): void {
  singleton?.dispose();
  singleton = null;
}
