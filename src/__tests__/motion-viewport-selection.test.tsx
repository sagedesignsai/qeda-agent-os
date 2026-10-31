/**
 * __tests__/motion-viewport-selection.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Viewport modifiers map to additive/toggle selection; blank-canvas clicks clear it.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { MotionViewport } from '@/components/motion/MotionViewport';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';

jest.mock('@/components/motion/scene/MotionSceneCanvas', () => ({
  MotionSceneCanvas: (props: {
    onSelectNode?: (
      id: string | null,
      modifiers?: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    ) => void;
  }) => (
    <div>
      <button onClick={() => props.onSelectNode?.('product')}>Select Product in viewport</button>
      <button onClick={() => props.onSelectNode?.('title', { shiftKey: true, ctrlKey: false, metaKey: false })}>
        Add Title in viewport
      </button>
      <button onClick={() => props.onSelectNode?.('product', { shiftKey: false, ctrlKey: true, metaKey: false })}>
        Toggle Product in viewport
      </button>
      <button onClick={() => props.onSelectNode?.(null)}>Clear viewport selection</button>
    </div>
  ),
}));

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

beforeEach(() => motionStore.loadDocument(createStarterMotionDocument('2026-01-01T00:00:00.000Z')));

describe('Motion viewport selection', () => {
  it('supports additive and toggle selection and clears on an empty-space click', () => {
    render(<MotionViewport />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Product in viewport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Title in viewport' }));
    expect(motionStore.getSnapshot().selection).toEqual({
      kind: 'node',
      nodeId: 'title',
      selectedNodeIds: ['product', 'title'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Product in viewport' }));
    expect(motionStore.getSnapshot().selection).toEqual({ kind: 'node', nodeId: 'title' });

    fireEvent.click(screen.getByRole('button', { name: 'Clear viewport selection' }));
    expect(motionStore.getSnapshot().selection).toBeNull();
  });
});
