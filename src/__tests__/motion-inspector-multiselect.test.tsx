/**
 * __tests__/motion-inspector-multiselect.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-node inspector edits must fan out through one operation batch and expose
 * mixed transform/property values instead of implying every selection matches.
 */

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { MotionInspector } from '@/components/motion/MotionInspector';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
});

beforeEach(() => {
  motionStore.setAutoKeyEnabled(false);
  motionStore.loadDocument(createStarterMotionDocument('2026-01-01T00:00:00.000Z'));
  motionStore.setSelection({
    kind: 'node',
    nodeId: 'product',
    selectedNodeIds: ['product', 'title'],
  });
});

describe('MotionInspector multi-selection', () => {
  it('shows mixed transforms and applies a transform edit to all selected nodes in one undo step', () => {
    render(<MotionInspector />);
    expect(screen.getByText('Mixed')).toBeInTheDocument();
    const positionX = screen.getByRole('spinbutton', { name: 'Position X' });
    fireEvent.change(positionX, { target: { value: '3.5' } });
    fireEvent.blur(positionX);

    const nodes = motionStore.getDocument().scene.nodes;
    expect(nodes.find((node) => node.id === 'product')?.transform.position[0]).toBe(3.5);
    expect(nodes.find((node) => node.id === 'title')?.transform.position[0]).toBe(3.5);
    expect(motionStore.getSnapshot().canUndo).toBe(true);
    act(() => motionStore.undo());
    expect(motionStore.getDocument().scene.nodes.find((node) => node.id === 'product')?.transform.position[0]).not.toBe(3.5);
    expect(motionStore.getDocument().scene.nodes.find((node) => node.id === 'title')?.transform.position[0]).not.toBe(3.5);
  });

  it('routes animatable inspector edits through Auto-key when enabled', () => {
    act(() => motionStore.setAutoKeyEnabled(true));
    motionStore.setSelection({ kind: 'node', nodeId: 'product' });
    render(<MotionInspector />);
    const positionX = screen.getByRole('spinbutton', { name: 'Position X' });
    fireEvent.change(positionX, { target: { value: '1.25' } });
    fireEvent.blur(positionX);

    const doc = motionStore.getDocument();
    expect(doc.scene.nodes.find((node) => node.id === 'product')?.transform.position[0]).toBe(0);
    const channel = doc.timeline.clips
      .flatMap((clip) => clip.channels)
      .find((item) => item.targetId === 'product' && item.property === 'position.x');
    expect(channel?.keyframes.some((key) => key.time === 0 && key.value === 1.25)).toBe(true);
    expect(motionStore.getSnapshot().canUndo).toBe(true);
    act(() => motionStore.setAutoKeyEnabled(false));
  });

  it('edits a custom cubic easing curve', () => {
    motionStore.setSelection({
      kind: 'keyframe',
      trackId: 'trk_product',
      placementId: 'plc_product',
      clipId: 'clip_product_spin',
      channelId: 'chn_product_lift',
      keyframeId: 'kf_product_lift_1',
    });
    motionStore.commit('Set test cubic easing', [{
      op: 'keyframe.setEasing',
      clipId: 'clip_product_spin',
      channelId: 'chn_product_lift',
      keyframeId: 'kf_product_lift_1',
      easing: { type: 'cubic', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
    }]);
    render(<MotionInspector />);
    const x1 = screen.getByRole('spinbutton', { name: 'Easing X1' });
    fireEvent.change(x1, { target: { value: '0.4' } });
    fireEvent.blur(x1);
    const key = motionStore.getDocument().timeline.clips
      .find((clip) => clip.id === 'clip_product_spin')
      ?.channels.find((channel) => channel.id === 'chn_product_lift')
      ?.keyframes.find((item) => item.id === 'kf_product_lift_1');
    expect(key?.easing).toMatchObject({ type: 'cubic', x1: 0.4 });
  });
});
