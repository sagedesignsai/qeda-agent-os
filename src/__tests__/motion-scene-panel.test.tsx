/**
 * __tests__/motion-scene-panel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The hierarchy must render nesting, selection, collapse, and the animated badge
 * from the document alone — no viewport required.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { MotionScenePanel } from '@/components/motion/MotionScenePanel';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverMock });
});

beforeEach(() => {
  motionStore.loadDocument(createStarterMotionDocument('2026-01-01T00:00:00.000Z'));
});

describe('MotionScenePanel hierarchy', () => {
  it('renders nodes depth-first with children under their parent', () => {
    render(<MotionScenePanel />);
    const names = screen
      .getAllByRole('button', { name: /^Select scene object / })
      .map((row) => row.getAttribute('aria-label'));

    expect(names).toEqual([
      'Select scene object Camera',
      'Select scene object Product',
      'Select scene object Dashboard screen',
      'Select scene object Title',
      'Select scene object Ambient light',
      'Select scene object Key light',
      'Select scene object Accent light',
    ]);
  });

  it('collapses a parent without dropping the parent row', () => {
    render(<MotionScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Product' }));

    expect(screen.queryByRole('button', { name: 'Select scene object Dashboard screen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select scene object Product' })).toBeInTheDocument();
  });

  it('selects a node when its row is clicked', () => {
    render(<MotionScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Select scene object Title' }));

    expect(motionStore.getSnapshot().selection).toEqual({ kind: 'node', nodeId: 'title' });
  });

  it('marks animated nodes with a visible dot', () => {
    render(<MotionScenePanel />);
    const row = screen.getByRole('button', { name: 'Select scene object Product' });
    expect(row.querySelector('[aria-label="Animated"]')).not.toBeNull();
  });
});
