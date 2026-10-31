/**
 * __tests__/motion-timeline-adapter.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Locks down trim-aware projection between Motion's clip-local data and canvas
 * timeline scene time without requiring a DOM or canvas implementation.
 */

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { applyMotionOp } from '@/lib/motion/ops';
import { toTimelineModel } from '@/lib/motion/timeline-adapter';

describe('Motion timeline adapter trim projection', () => {
  it('hides trimmed keys, counts them, and maps visible keys into scene time', () => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    const trimmed = applyMotionOp(doc, {
      op: 'placement.trim', trackId: 'trk_product', placementId: 'plc_product',
      start: 2, trimIn: 1, duration: 2,
    });
    const item = toTimelineModel(trimmed).items.find((candidate) => candidate.id === 'plc_product');

    expect(item?.duration).toBe(2);
    expect(item?.trimIn).toBe(1);
    expect(item?.sourceDuration).toBe(5);
    expect(item?.trimmedKeyCount).toBe(4);
    const liftChannel = item?.channels?.find((channel) => channel.id === 'chn_product_lift');
    expect(liftChannel?.keys.map((key) => key.time)).toEqual([2.4]);
  });
});
