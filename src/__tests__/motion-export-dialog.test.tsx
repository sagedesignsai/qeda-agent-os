/**
 * __tests__/motion-export-dialog.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The dialog must block on preflight and pass the same range/preset the user saw.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { MotionExportDialog } from '@/components/motion/export/MotionExportDialog';
import type { MotionExportState } from '@/hooks/use-motion-export';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { createMotionTemplate } from '@/lib/motion/templates';

function exportState(overrides: Partial<MotionExportState> = {}): MotionExportState {
  return {
    progress: null,
    error: null,
    busy: false,
    start: jest.fn(async () => null),
    cancel: jest.fn(async () => undefined),
    dismiss: jest.fn(),
    ...overrides,
  };
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverMock });
});

describe('MotionExportDialog', () => {
  const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');

  it('starts the full-scene export with the selected preset', async () => {
    const state = exportState();
    render(<MotionExportDialog doc={doc} state={state} onClose={() => {}} />);

    expect(screen.getByText(/1920 × 1080 · 30 fps · 6.00s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(state.start).toHaveBeenCalledWith({
      document: doc,
      presetId: 'launch-1080p',
      range: { start: 0, end: 6 },
    });
  });

  it('disables export when preflight blocks on a missing asset', () => {
    const model = createMotionTemplate('model-reveal');
    render(<MotionExportDialog doc={model} state={exportState()} onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByText(/Referenced media asset/)).toBeInTheDocument();
  });

  it('shows live progress and cancels a running job', () => {
    const cancel = jest.fn(async () => undefined);
    const state = exportState({
      busy: true,
      cancel,
      progress: { jobId: 'rnd_abc', phase: 'render', frame: 45, frameCount: 180, fraction: 0.25 },
    });
    render(<MotionExportDialog doc={doc} state={state} onClose={() => {}} />);

    expect(screen.getByText('Rendering frames')).toBeInTheDocument();
    expect(screen.getByText('45 / 180 frames')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel export' }));
    expect(cancel).toHaveBeenCalled();
  });
});
