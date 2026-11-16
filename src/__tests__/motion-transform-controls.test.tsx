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
  // jsdom 26 has no PointerEvent, so testing-library falls back to Event and
  // drops clientX/clientY. MouseEvent carries both.
  class PointerEventMock extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    configurable: true,
    writable: true,
    value: PointerEventMock,
  });
});

beforeEach(() => {
  motionStore.setAutoKeyEnabled(false);
  motionStore.loadDocument(createStarterMotionDocument('2026-01-01T00:00:00.000Z'));
  motionStore.setSelection({ kind: 'node', nodeId: 'product' });
});

/** Radix activates tabs on mousedown, not click. */
function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }));
}

describe('Motion transform GUI controls', () => {
  it('shows one transform control surface at a time', () => {
    render(<MotionInspector />);

    expect(screen.getByRole('spinbutton', { name: 'Position X' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Rotation (degrees) Y' })).not.toBeInTheDocument();

    selectTab('Rotation');

    expect(screen.getByRole('spinbutton', { name: 'Rotation (degrees) Y' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Position X' })).not.toBeInTheDocument();
  });

  it('maps degree scrubs back to radians', () => {
    render(<MotionInspector />);

    selectTab('Rotation');
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

    selectTab('Scale');
    fireEvent.click(screen.getByRole('button', { name: 'Link scale axes' }));
    const scaleX = screen.getByRole('spinbutton', { name: 'Scale X' });
    fireEvent.change(scaleX, { target: { value: '2' } });
    fireEvent.blur(scaleX);

    const scale = motionStore
      .getDocument()
      .scene.nodes.find((node) => node.id === 'product')?.transform.scale;
    expect(scale).toEqual([2, 2, 2]);
  });

  it('scales one axis when an edge handle is dragged', () => {
    render(<MotionInspector />);
    selectTab('Scale');

    const canvas = screen.getByRole('application', { name: 'Scale canvas' });
    canvas.getBoundingClientRect = () =>
      ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0 }) as DOMRect;

    const handle = screen.getByRole('button', { name: 'Scale handle right' });
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 160, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 160, clientY: 140, pointerId: 1 });

    const scale = motionStore
      .getDocument()
      .scene.nodes.find((node) => node.id === 'product')?.transform.scale;
    // 60px of a 200px box at 1.5 units per width = +0.45 on X only.
    expect(scale?.[0]).toBeCloseTo(1.45, 2);
    expect(scale?.[1]).toBe(1);
    expect(scale?.[2]).toBe(1);
  });

  it('keeps keyboard scale edits uniform while linked and resets on double-click', () => {
    render(<MotionInspector />);
    selectTab('Scale');
    fireEvent.click(screen.getByRole('button', { name: 'Link scale axes' }));

    const canvas = screen.getByRole('application', { name: 'Scale canvas' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });

    const product = () => motionStore.getDocument().scene.nodes.find((node) => node.id === 'product');
    expect(product()?.transform.scale).toEqual([1.01, 1.01, 1.01]);

    fireEvent.doubleClick(canvas);
    expect(product()?.transform.scale).toEqual([1, 1, 1]);
  });
});
