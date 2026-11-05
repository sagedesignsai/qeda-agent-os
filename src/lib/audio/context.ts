/**
 * lib/audio/context.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The renderer's single AudioContext.
 *
 * One context for music, soundscapes and UI cues. Two contexts would mean two
 * clocks, two output latencies and no way to duck one against the other — which
 * is the whole point of the mixer. It is created lazily and never disposed on a
 * component unmount: playback is app-wide, so unmounting the page that started
 * it must not silence it.
 *
 * `resume()` must be called from a user gesture the first time. Chromium starts
 * a context suspended; a player that forgets this looks broken until the user
 * clicks something unrelated.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let context: AudioContext | null = null;

/** The shared context, or null in jsdom / when Web Audio is unavailable. */
export function getAudioContext(): AudioContext | null {
  if (context) return context;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

export function isAudioAvailable(): boolean {
  return getAudioContextCtor() !== null;
}

/** Resume after a user gesture. Returns false when there is no context. */
export async function resumeAudioContext(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

/** Test / app-quit teardown. Never called from a component unmount. */
export async function disposeAudioContext(): Promise<void> {
  const ctx = context;
  context = null;
  if (!ctx) return;
  try {
    await ctx.close();
  } catch {
    /* already closed */
  }
}

/** Current time, or 0 when there is no context. */
export function audioNow(): number {
  return context?.currentTime ?? 0;
}
