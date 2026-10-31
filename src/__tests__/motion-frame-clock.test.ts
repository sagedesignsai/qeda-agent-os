/**
 * __tests__/motion-frame-clock.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The demand-rendered preview must request an initial frame as well as subscribe
 * to playback updates, or a new project can remain on the WebGL clear color.
 */

import { subscribeMotionFrameClock } from '@/components/motion/scene/motion-frame-clock';

describe('Motion frame clock subscription', () => {
  it('requests the initial frame and removes the playback listener on cleanup', () => {
    const invalidate = jest.fn();
    const listener = jest.fn();
    const unsubscribe = jest.fn();
    const clock = {
      subscribe: jest.fn((callback: () => void) => {
        listener.mockImplementation(callback);
        return unsubscribe;
      }),
    };

    const cleanup = subscribeMotionFrameClock(clock, invalidate);
    expect(invalidate).toHaveBeenCalledTimes(1);
    clock.subscribe.mock.calls[0][0]();
    expect(invalidate).toHaveBeenCalledTimes(2);
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
