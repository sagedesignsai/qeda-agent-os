/**
 * __tests__/motion-scene-selector.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The timeline header owns scene switching: one menu with the full scene list
 * (index + duration), management actions, and Alt+[ / Alt+] cycling.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MotionSceneSelector } from '@/components/motion/MotionSceneSelector';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { buildMotionSceneCreation } from '@/lib/motion/scene-create';

// Radix (Popover) needs pointer capture and layout shims in jsdom.
beforeAll(() => {
  window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
});

beforeEach(() =>
  motionStore.loadDocument(
    createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
  ),
);

function addScene() {
  const creation = buildMotionSceneCreation(motionStore.getDocument(), false);
  motionStore.commit(creation.label, [creation.op]);
  return creation.sceneId;
}

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /Scene selector/ }));
  return screen.findByRole('option', { name: /New scene/ });
}

describe('MotionSceneSelector', () => {
  it('shows the active scene, its position, and its duration', () => {
    addScene();
    render(<MotionSceneSelector />);

    const trigger = screen.getByRole('button', { name: /Scene selector/ });
    expect(trigger).toHaveTextContent('Scene 2');
    expect(trigger).toHaveTextContent('2/2');
    expect(trigger).toHaveTextContent('s');
  });

  it('switches scenes from the menu', async () => {
    const firstSceneId = motionStore.getDocument().scenes[0].id;
    addScene();
    render(<MotionSceneSelector />);

    await openMenu();
    fireEvent.click(screen.getByRole('option', { name: /Scene 1/ }));

    await waitFor(() =>
      expect(motionStore.getDocument().activeSceneId).toBe(firstSceneId),
    );
    expect(
      screen.getByRole('button', { name: /Scene selector/ }),
    ).toHaveTextContent('Scene 1');
  });

  it('creates a scene from the menu', async () => {
    render(<MotionSceneSelector />);

    await openMenu();
    fireEvent.click(screen.getByRole('option', { name: /New scene/ }));

    await waitFor(() =>
      expect(motionStore.getDocument().scenes).toHaveLength(2),
    );
  });

  it('cycles scenes with Alt+[ and Alt+]', () => {
    const firstSceneId = motionStore.getDocument().scenes[0].id;
    const secondSceneId = addScene();
    expect(motionStore.getDocument().activeSceneId).toBe(secondSceneId);

    render(<MotionSceneSelector />);

    fireEvent.keyDown(window, { key: '[', altKey: true });
    expect(motionStore.getDocument().activeSceneId).toBe(firstSceneId);

    fireEvent.keyDown(window, { key: ']', altKey: true });
    expect(motionStore.getDocument().activeSceneId).toBe(secondSceneId);
  });
});
