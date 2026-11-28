/**
 * lib/motion/asset-readiness.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks asynchronous work that must finish before an export frame is captured.
 *
 * A fixed settle delay is not a readiness signal: a 20 MB GLB can take longer
 * than the delay, and a cached texture can finish in one frame. This registry
 * lets renderers report their real loads, and the export window waits for the
 * registry and Three's shared loading manager to go quiet.
 */

const pending = new Set<symbol>();
let generation = 0;

/** Register a promise as renderer-blocking work. Never rejects the caller. */
export function trackMotionAsset<T>(work: Promise<T>): Promise<T> {
  const token = Symbol('motion-asset');
  pending.add(token);
  generation += 1;
  return work.finally(() => {
    pending.delete(token);
    generation += 1;
  });
}

/** Number of loads currently in flight. Exposed for diagnostics and tests. */
export function pendingMotionAssetCount(): number {
  return pending.size;
}

type AnimationFrameHost = {
  requestAnimationFrame?: (callback: () => void) => number;
};

function nextFrame(): Promise<void> {
  const host = globalThis as AnimationFrameHost;
  if (typeof host.requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    host.requestAnimationFrame?.(() => resolve());
  });
}

/** Three's LoadingManager carries counters that its public type omits. */
type LoadingManagerCounters = {
  itemsLoaded?: number;
  itemsTotal?: number;
};

let managerPromise: Promise<LoadingManagerCounters | null> | null = null;

async function managerBusy(): Promise<boolean> {
  managerPromise ??= import('three')
    .then(({ DefaultLoadingManager }) => DefaultLoadingManager as unknown as LoadingManagerCounters)
    .catch(() => null);
  const manager = await managerPromise;
  if (!manager) return false;
  return (
    typeof manager.itemsTotal === 'number' &&
    typeof manager.itemsLoaded === 'number' &&
    manager.itemsTotal > manager.itemsLoaded
  );
}

/**
 * Resolve when no tracked load is pending and Three's loading manager has been
 * idle for `stableFrames` consecutive frames. Returns false on timeout rather
 * than blocking an export forever on a dead request.
 */
export async function waitForMotionAssets(options: {
  timeoutMs?: number;
  /** Frames that must be idle in a row. Two also lets React commit loaded state. */
  stableFrames?: number;
  /** Do not trust an empty registry before render effects have had a chance to run. */
  minFrames?: number;
} = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const stableFrames = Math.max(1, options.stableFrames ?? 3);
  const minFrames = Math.max(0, options.minFrames ?? 3);
  const started = Date.now();
  let frames = 0;
  let stable = 0;
  let lastGeneration = -1;

  while (Date.now() - started < timeoutMs) {
    await nextFrame();
    frames += 1;
    const busy = pending.size > 0 || (await managerBusy());
    if (!busy && generation === lastGeneration) stable += 1;
    else stable = 0;
    lastGeneration = generation;
    if (frames >= minFrames && stable >= stableFrames) return true;
  }

  return pending.size === 0 && !(await managerBusy());
}