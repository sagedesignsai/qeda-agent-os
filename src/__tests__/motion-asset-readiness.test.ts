/**
 * __tests__/motion-asset-readiness.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The export barrier is only useful if every tracked load releases its token,
 * including on failure. The wait loop itself is exercised by the export window.
 */

import {
  pendingMotionAssetCount,
  trackMotionAsset,
} from '@/lib/motion/asset-readiness';

describe('motion asset readiness registry', () => {
  it('counts a tracked load until it settles', async () => {
    let release!: () => void;
    const pending = trackMotionAsset(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    expect(pendingMotionAssetCount()).toBe(1);
    release();
    await pending;
    expect(pendingMotionAssetCount()).toBe(0);
  });

  it('releases the token when a load rejects', async () => {
    const failing = trackMotionAsset(Promise.reject(new Error('missing asset')));
    await expect(failing).rejects.toThrow('missing asset');
    expect(pendingMotionAssetCount()).toBe(0);
  });
});