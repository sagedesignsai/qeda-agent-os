/**
 * __tests__/motion-inspector-sections.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The inspector is an accordion: Transform, Appearance, node-specific controls
 * and Output each own a collapsible section, and only one stays open so the
 * panel never becomes a long scroll of unrelated fields.
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

const section = (name: string | RegExp) => screen.getByRole('button', { name });

describe('Motion inspector sections', () => {
  it('opens only Transform for a node selection', () => {
    render(<MotionInspector />);

    expect(screen.getByRole('spinbutton', { name: 'Position X' })).toBeInTheDocument();
    expect(screen.queryByText('Opacity')).not.toBeInTheDocument();
    expect(screen.queryByText('Width')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Resolution')).not.toBeInTheDocument();
  });

  it('closes Transform when Appearance opens, and vice versa', () => {
    render(<MotionInspector />);

    fireEvent.click(section(/Appearance/));

    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Position X' })).not.toBeInTheDocument();

    fireEvent.click(section(/^Transform/));
    expect(screen.getByRole('spinbutton', { name: 'Position X' })).toBeInTheDocument();
    expect(screen.queryByText('Opacity')).not.toBeInTheDocument();
  });

  it('keeps node-specific controls separate from Appearance', () => {
    render(<MotionInspector />);

    fireEvent.click(section(/Specific Node Controls/));

    expect(screen.getByLabelText('Width')).toBeInTheDocument();
    expect(screen.queryByText('Opacity')).not.toBeInTheDocument();
  });

  it('lets the open section collapse without opening another', () => {
    render(<MotionInspector />);

    fireEvent.click(section(/^Transform/));

    expect(screen.queryByRole('spinbutton', { name: 'Position X' })).not.toBeInTheDocument();
    expect(screen.queryByText('Opacity')).not.toBeInTheDocument();
  });

  it('opens Output alone when nothing is selected', () => {
    motionStore.setSelection(null);
    render(<MotionInspector />);

    expect(screen.getByLabelText('Resolution')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Position X' })).not.toBeInTheDocument();
  });
});
