/**
 * __tests__/motion-editor.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The editor shell composes the existing Motion timeline and op-backed panels.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { MotionEditor } from '@/components/motion/MotionEditor';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';

const mockMotionProject = {
  saveStatus: 'saved' as const,
  readOnly: false,
  saveNow: jest.fn().mockResolvedValue(true),
};

jest.mock('@/components/motion/MotionTimeline', () => ({
  MotionTimeline: () => <div data-testid="motion-timeline" />,
}));

jest.mock('@/components/motion/scene/MotionSceneCanvas', () => ({
  MotionSceneCanvas: (props: { doc: { scene: { nodes: unknown[] } } }) => (
    <div data-testid="motion-scene-canvas">{props.doc.scene.nodes.length} scene nodes</div>
  ),
}));

beforeAll(() => {
  window.electron = {
    ipc: {
      invoke: jest.fn().mockResolvedValue(null),
      on: jest.fn().mockReturnValue(() => {}),
    },
  } as unknown as typeof window.electron;

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverMock });
});

describe('Motion editor shell', () => {
  beforeEach(() => {
    motionStore.loadDocument(
      createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
    );
  });

  it('composes the scene, preview, timeline and inspector panels', () => {
    render(<MotionEditor canUndo={false} canRedo={false} motionProject={mockMotionProject} />);

    expect(screen.getByRole('button', { name: 'Hide scene panel' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Motion preview' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('motion-timeline')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Motion inspector' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('motion-scene-canvas')).toBeInTheDocument();
    expect(screen.getByText('7 scene nodes')).toBeInTheDocument();
    expect(screen.getByText('Document scene')).toBeInTheDocument();
    expect(screen.getByText('Live scene · scrubbing updates the preview')).toBeInTheDocument();
  });

  it('selects a scene track and edits it through the Motion op registry', () => {
    render(<MotionEditor canUndo={false} canRedo={false} motionProject={mockMotionProject} />);

    // Tracks live in the collapsible outline section at the bottom of the panel.
    fireEvent.click(screen.getByRole('button', { name: /^Tracks/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Product' }));
    const nameInput = screen.getByLabelText('Track name');
    expect(nameInput).toHaveValue('Product');

    fireEvent.change(nameInput, { target: { value: 'Hero device' } });
    fireEvent.blur(nameInput);

    expect(
      motionStore
        .getDocument()
        .timeline.tracks.find((track) => track.id === 'trk_product')?.name,
    ).toBe('Hero device');
  });

  it('renders schema-hinted object controls and commits edits through Motion ops', () => {
    render(<MotionEditor canUndo={false} canRedo={false} motionProject={mockMotionProject} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select scene object Product' }));
    // Device dimensions are node-specific hints, not appearance hints.
    fireEvent.click(screen.getByRole('button', { name: /Specific Node Controls/ }));
    const widthInput = screen.getByLabelText('Width');

    fireEvent.change(widthInput, { target: { value: '4.1' } });
    expect(
      motionStore
        .getDocument()
        .scene.nodes.find((node) => node.id === 'product')?.props.width,
    ).toBe(3.82);

    fireEvent.blur(widthInput);
    expect(
      motionStore
        .getDocument()
        .scene.nodes.find((node) => node.id === 'product')?.props.width,
    ).toBe(4.1);
  });

  it('binds a durable document asset to a surface through its node controls', () => {
    render(<MotionEditor canUndo={false} canRedo={false} motionProject={mockMotionProject} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select scene object Dashboard screen' }));
    fireEvent.click(screen.getByRole('button', { name: /Specific Node Controls/ }));

    // The asset picker is the import surface now that assets live in the
    // document; the starter bundle already contains the dashboard image.
    expect(screen.getByRole('button', { name: 'Image' })).toBeEnabled();
    expect(motionStore.getDocument().assets).toHaveLength(1);
  });

  it('collapses and restores the scene and inspector panels', () => {
    render(<MotionEditor canUndo={false} canRedo={false} motionProject={mockMotionProject} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide scene panel' }));
    expect(
      screen.getByRole('button', { name: 'Show scene panel' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide inspector' }));
    expect(
      screen.getByRole('button', { name: 'Show inspector' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show scene panel' }));
    expect(
      screen.getByRole('button', { name: 'Hide scene panel' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show inspector' }));
    expect(
      screen.getByRole('button', { name: 'Hide inspector' }),
    ).toBeInTheDocument();
  });
});
