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

jest.mock('@/components/motion/MotionTimeline', () => ({
  MotionTimeline: () => <div data-testid="motion-timeline" />,
}));

jest.mock('@/components/motion/scene/MotionSceneCanvas', () => ({
  MotionSceneCanvas: (props: { doc: { scene: { nodes: unknown[] } } }) => (
    <div data-testid="motion-scene-canvas">{props.doc.scene.nodes.length} scene nodes</div>
  ),
}));

describe('Motion editor shell', () => {
  beforeEach(() => {
    motionStore.loadDocument(
      createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
    );
  });

  it('composes the scene, preview, timeline and inspector panels', () => {
    render(<MotionEditor />);

    expect(screen.getByRole('tab', { name: 'Scene' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Assets' })).toBeInTheDocument();
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
    render(<MotionEditor />);

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

  it('imports media assets and attaches them to the active screen', () => {
    render(<MotionEditor />);

    fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const file = new File(['image-bytes'], 'hero.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    fireEvent.change(input);

    expect(motionStore.getDocument().assets).toHaveLength(1);
    expect(motionStore.getDocument().assets[0]?.name).toBe('hero.png');
    expect(
      motionStore
        .getDocument()
        .scene.nodes.find((node) => node.id === 'screen_dashboard')?.props.source,
    ).toContain('data:image/png;base64,');
  });

  it('collapses and restores the scene and inspector panels', () => {
    render(<MotionEditor />);

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
