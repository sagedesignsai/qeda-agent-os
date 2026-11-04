/**
 * __tests__/motion-transform-controls.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The transform GUI stays a thin view over the same op registry: rotation is
 * authored in degrees but stored in radians, and linked scale edits one value
 * across all three axes in a single commit.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

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
  motionStore.setSelection({ kind: 'node', nodeId: 'product' });
});

describe('Motion transform GUI controls', () => {
  it('maps degree scrubs back to radians', () => {
    render(<MotionInspector />);

    const rotationY = screen.getByRole('spinbutton', { name: 'Rotation (degrees) Y' });
    fireEvent.change(rotationY, { target: { value: '45' } });
    fireEvent.blur(rotationY);

    const rotation = motionStore
      .getDocument()
      .scene.nodes.find((node) => node.id === 'product')?.transform.rotation;
    expect(rotation?.[1]).toBeCloseTo(Math.PI / 4, 6);
  });

  it('applies one scale axis to all three when the axes are linked', () => {
    render(<MotionInspector />);

    fireEvent.click(screen.getByRole('button', { name: 'Link scale axes' }));
    const scaleX = screen.getByRole('spinbutton', { name: 'Scale X' });
    fireEvent.change(scaleX, { target: { value: '2' } });
    fireEvent.blur(scaleX);

    const scale = motionStore
      .getDocument()
      .scene.nodes.find((node) => node.id === 'product')?.transform.scale;
    expect(scale).toEqual([2, 2, 2]);
  });
});
