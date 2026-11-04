/**
 * __tests__/motion-timeline-key-copy.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Keyframe copy/paste keeps relative offsets and authors new keys through the
 * same op registry used by other timeline edits.
 */

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MotionTimeline } from '@/components/motion/MotionTimeline';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';

jest.mock('@/components/timeline/CanvasTimeline', () => ({
  CanvasTimeline: () => <div data-testid="timeline-canvas" />,
}));
jest.mock('@/components/timeline/TimelineRowHeaders', () => ({
  TimelineRowHeaders: () => <div data-testid="timeline-row-headers" />,
}));

beforeEach(() => {
  motionStore.setAutoKeyEnabled(false);
  motionStore.loadDocument(createStarterMotionDocument('2026-01-01T00:00:00.000Z'));
  motionStore.seek(2);
  motionStore.setSelection({
    kind: 'keyframe',
    trackId: 'trk_product',
    placementId: 'plc_product',
    clipId: 'clip_product_spin',
    channelId: 'chn_product_lift',
    keyframeId: 'kf_product_lift_1',
  });
});

/** jsdom has no PointerEvent, so open the Radix menus from the keyboard. */
async function openMenu(name: string) {
  const trigger = screen.getByRole('button', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('menu');
}

describe('Motion timeline keyframe clipboard', () => {
  it('copies keys and pastes them at the playhead with one new undoable op batch', async () => {
    render(<MotionTimeline />);

    // Auto-key is a checkbox in the transport settings menu.
    await openMenu('Timeline settings');
    const autoKey = screen.getByRole('menuitemcheckbox', { name: 'Auto-key' });
    expect(autoKey).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(autoKey);
    expect(motionStore.getSnapshot().autoKeyEnabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    // Copy and paste are items in the Keyframe menu.
    await openMenu('Keyframe');
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy Keyframe/ }));
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    act(() => {
      motionStore.setSelection({ kind: 'placement', trackId: 'trk_product', placementId: 'plc_product' });
    });

    await openMenu('Keyframe');
    fireEvent.click(screen.getByRole('menuitem', { name: /Paste Keyframe/ }));

    const clip = motionStore.getDocument().timeline.clips.find((item) => item.id === 'clip_product_spin');
    const channel = clip?.channels.find((item) => item.id === 'chn_product_lift');
    expect(channel?.keyframes.some((key) => Math.abs(key.time - 2) < 1e-6 && key.value === 0.12)).toBe(true);
    expect(motionStore.getSnapshot().canUndo).toBe(true);
  });
});
