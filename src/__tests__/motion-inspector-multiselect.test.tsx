/**
 * __tests__/motion-inspector-multiselect.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-node inspector edits must fan out through one operation batch and expose
 * mixed transform/property values instead of implying every selection matches.
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
});

beforeEach(() => {
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
    motionStore.undo();
    expect(motionStore.getDocument().scene.nodes.find((node) => node.id === 'product')?.transform.position[0]).not.toBe(3.5);
    expect(motionStore.getDocument().scene.nodes.find((node) => node.id === 'title')?.transform.position[0]).not.toBe(3.5);
  });
});
