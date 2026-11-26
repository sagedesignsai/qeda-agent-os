/**
 * __tests__/studio-scenes-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene scope controls: switcher, story strip and create dialog. These are the
 * primary entry points for the scene model, so their interactions are pinned.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { StudioSceneSelector } from '../components/studio/scenes/StudioSceneSelector';
import { StudioSceneStrip } from '../components/studio/scenes/StudioSceneStrip';
import { StudioSceneDialog } from '../components/studio/scenes/StudioSceneDialog';
import type { StudioScene } from '@/lib/studio/types';

// cmdk observes its list box; jsdom does not implement ResizeObserver.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// cmdk scrolls the active item into view.
Element.prototype.scrollIntoView = jest.fn();

const scenes: StudioScene[] = [
  { id: 'scene-a', name: 'Intro', durationMs: 3000, tracks: [] },
  { id: 'scene-b', name: 'Demo', durationMs: 7000, tracks: [] },
  { id: 'scene-c', name: 'Outro', durationMs: 2500, tracks: [] },
];

describe('Studio scene controls', () => {
  it('switches scenes from the selector menu', () => {
    const onSelectScene = jest.fn();
    render(
      <TooltipProvider>
      <StudioSceneSelector
        scenes={scenes}
        activeSceneId="scene-a"
        onSelectScene={onSelectScene}
        onAddScene={jest.fn()}
        onDuplicateScene={jest.fn()}
        onRenameScene={jest.fn()}
        onDeleteScene={jest.fn()}
        onExportScene={jest.fn()}
      />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText(/scene 1: intro/i));
    fireEvent.click(screen.getByText('Outro'));

    expect(onSelectScene).toHaveBeenCalledWith('scene-c');
  });

  it('cycles scenes with Alt+[ and Alt+]', () => {
    const onSelectScene = jest.fn();
    render(
      <TooltipProvider>
      <StudioSceneSelector
        scenes={scenes}
        activeSceneId="scene-b"
        onSelectScene={onSelectScene}
        onAddScene={jest.fn()}
        onDuplicateScene={jest.fn()}
        onRenameScene={jest.fn()}
        onDeleteScene={jest.fn()}
        onExportScene={jest.fn()}
      />
      </TooltipProvider>,
    );

    fireEvent.keyDown(window, { key: ']', altKey: true });
    expect(onSelectScene).toHaveBeenLastCalledWith('scene-c');

    fireEvent.keyDown(window, { key: '[', altKey: true });
    expect(onSelectScene).toHaveBeenLastCalledWith('scene-a');
  });

  it('shows the story order and total duration', () => {
    const onSelectScene = jest.fn();
    render(
      <TooltipProvider>
      <StudioSceneStrip
        scenes={scenes}
        activeSceneId="scene-a"
        totalDurationMs={12500}
        onSelectScene={onSelectScene}
        onReorderScene={jest.fn()}
        onAddScene={jest.fn()}
        onToggleStoryPlayback={jest.fn()}
      />
      </TooltipProvider>,
    );

    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('12.5s')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/scene 2: demo/i));
    expect(onSelectScene).toHaveBeenCalledWith('scene-b');
  });

  it('creates a scene from the intro template', () => {
    const onSubmit = jest.fn();
    render(
      <StudioSceneDialog
        open
        mode="add"
        initialName="Scene 2"
        sceneCount={1}
        onOpenChange={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Opening' },
    });
    fireEvent.click(screen.getByRole('button', { name: /intro/i }));
    fireEvent.click(screen.getByRole('button', { name: /add scene/i }));

    expect(onSubmit).toHaveBeenCalledWith('Opening', 'intro');
  });
});