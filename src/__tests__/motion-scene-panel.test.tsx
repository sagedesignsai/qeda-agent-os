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
import { buildMotionSceneCreation } from '@/lib/motion/scene-create';

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

  it('navigates the visible hierarchy with arrow keys', () => {
    render(<MotionScenePanel />);
    const product = screen.getByRole('button', { name: 'Select scene object Product' });
    product.focus();

    fireEvent.keyDown(product, { key: 'ArrowRight' });
    const dashboard = screen.getByRole('button', {
      name: 'Select scene object Dashboard screen',
    });
    expect(dashboard).toHaveFocus();
    expect(motionStore.getSnapshot().selection).toEqual({
      kind: 'node',
      nodeId: 'screen_dashboard',
    });

    fireEvent.keyDown(dashboard, { key: 'ArrowLeft' });
    expect(product).toHaveFocus();
    expect(motionStore.getSnapshot().selection).toEqual({ kind: 'node', nodeId: 'product' });
  });

  it('renames a node on double-click and commits the edit through an op', () => {
    render(<MotionScenePanel />);
    const product = screen.getByRole('button', { name: 'Select scene object Product' });
    fireEvent.doubleClick(product);
    const input = screen.getByRole('textbox', { name: 'Rename Product' });
    fireEvent.change(input, { target: { value: 'Tablet rig' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(motionStore.getDocument().scene.nodes.find((node) => node.id === 'product')?.name).toBe(
      'Tablet rig',
    );
    expect(motionStore.getSnapshot().canUndo).toBe(true);
  });

  it('supports shift-range and modifier-toggle node selection', () => {
    render(<MotionScenePanel />);
    const product = screen.getByRole('button', { name: 'Select scene object Product' });
    const title = screen.getByRole('button', { name: 'Select scene object Title' });
    const dashboard = screen.getByRole('button', { name: 'Select scene object Dashboard screen' });
    fireEvent.click(product);
    fireEvent.click(title, { shiftKey: true });

    expect(motionStore.getSnapshot().selection).toEqual({
      kind: 'node',
      nodeId: 'title',
      selectedNodeIds: ['product', 'screen_dashboard', 'title'],
    });
    expect(product).toHaveAttribute('aria-pressed', 'true');
    expect(dashboard).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(dashboard, { ctrlKey: true });
    expect(motionStore.getSnapshot().selection).toEqual({
      kind: 'node',
      nodeId: 'title',
      selectedNodeIds: ['product', 'title'],
    });
  });

  it('duplicates the selected subtree with its animation through the op registry', () => {
    render(<MotionScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Product' }));

    const doc = motionStore.getDocument();
    const copy = doc.scene.nodes.find((node) => node.name === 'Product Copy');
    expect(copy).toBeDefined();
    expect(doc.scene.nodes.some((node) => node.parentId === copy?.id)).toBe(true);
    expect(doc.timeline.clips.some((clip) => clip.name === 'Product spin Copy')).toBe(true);
  });

  it('marks animated nodes with a visible dot', () => {
    render(<MotionScenePanel />);
    const row = screen.getByRole('button', { name: 'Select scene object Product' });
    expect(row.querySelector('[aria-label="Animated"]')).not.toBeNull();
  });
});

describe('MotionScenePanel scenes list', () => {
  const seedSecondScene = () => {
    const doc = motionStore.getDocument();
    const creation = buildMotionSceneCreation(doc, false);
    motionStore.commit(creation.label, [creation.op]);
    const scenes = motionStore.getDocument().scenes;
    return scenes[scenes.length - 1];
  };

  it('lists every scene and highlights the active one', () => {
    seedSecondScene();
    // `scene.add` focuses the newly created scene.
    const activeName = motionStore.getDocument().scenes.find(
      (scene) => scene.id === motionStore.getDocument().activeSceneId,
    )?.name;

    render(<MotionScenePanel />);

    const activeRow = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-current') === 'true');
    expect(activeRow).toHaveTextContent(activeName ?? '');
    // Accessible name concatenates the visible spans: "Scene 11 · 6.0s".
    expect(screen.getByRole('button', { name: /Scene 1/ })).toBeInTheDocument();
  });

  it('switches the active scene when a scene row is clicked', () => {
    const added = seedSecondScene();

    render(<MotionScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(added.name) }));

    const doc = motionStore.getDocument();
    expect(doc.activeSceneId).toBe(added.id);
    // The legacy scene/timeline aliases must follow the switch so the viewport
    // and timeline render the newly selected scene, not the old one.
    expect(doc.scene.nodes).toEqual(added.nodes);
    expect(doc.timeline.duration).toBe(added.timeline.duration);
  });

  it('adds a scene from the scenes list header', () => {
    render(<MotionScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }));

    expect(motionStore.getDocument().scenes).toHaveLength(2);
  });
});
