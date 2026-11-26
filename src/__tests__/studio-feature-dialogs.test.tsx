/**
 * __tests__/studio-feature-dialogs.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration tests for the advanced Studio feature entry points:
 *   - Blend mode picker → apply
 *   - Text animator settings → apply
 *   - Shape editor path/trim → apply
 *   - Effect picker → selection
 *   - Command bar visibility driven by the selected clip type
 *   - Universal keyframes on caption/overlay tracks
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { BlendModeDialog } from '../components/studio/features/BlendModeDialog';
import { TextAnimatorDialog } from '../components/studio/features/TextAnimatorDialog';
import { ShapeEditorDialog } from '../components/studio/features/ShapeEditorDialog';
import { EffectPickerDialog } from '../components/studio/features/EffectPickerDialog';
import { StudioCommandBar } from '../components/studio/StudioCommandBar';
import { timelineStore } from '../hooks/use-timeline-store';
import { keyframeUiRowProperties } from '../lib/studio/timeline/keyframes-ui';
import { studioTextAnimatorUnitState } from '../lib/studio/render/text-style';
import type { TimelineClip, TimelineTrack } from '@/lib/studio/types';

function captionClip(patch: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip-caption',
    trackId: 'layer-captions',
    itemType: 'text',
    name: 'Caption',
    startMs: 1000,
    durationMs: 4000,
    sourceStartMs: 0,
    sourceDurationMs: 4000,
    payload: { text: 'Hello world' },
    ...patch,
  } as TimelineClip;
}

function captionTrack(clip: TimelineClip): TimelineTrack {
  return {
    id: 'layer-captions',
    type: 'captions',
    name: 'Text',
    locked: false,
    visible: true,
    clips: [clip],
  };
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }) as MediaQueryList);
  window.PointerEvent = window.MouseEvent as unknown as typeof PointerEvent;
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
});

beforeEach(() => {
  timelineStore.setTracksAndDuration([], 10000);
});

describe('BlendModeDialog', () => {
  it('applies the chosen blend mode', () => {
    const onApply = jest.fn();
    render(
      <BlendModeDialog
        open
        onOpenChange={jest.fn()}
        clipName="Clip"
        value="multiply"
        onApply={onApply}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Multiply' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Screen' }));
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    expect(onApply).toHaveBeenCalledWith('screen');
  });
});

describe('TextAnimatorDialog', () => {
  it('applies mode, character duration and easing', () => {
    const onApply = jest.fn();
    render(
      <TextAnimatorDialog
        open
        onOpenChange={jest.fn()}
        clipName="Caption"
        text="Hello"
        value={undefined}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Slide Up' }));
    fireEvent.change(
      screen.getByLabelText(/Character duration in milliseconds/i),
      { target: { value: '240' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    expect(onApply).toHaveBeenCalledWith({
      mode: 'slide-up',
      charDurationMs: 240,
      easing: 'ease-out',
    });
  });
});

describe('ShapeEditorDialog', () => {
  it('applies path, fill, stroke and trim values', () => {
    const onApply = jest.fn();
    render(
      <ShapeEditorDialog
        open
        onOpenChange={jest.fn()}
        clipName="Shape"
        value={{
          shapeKind: 'rect',
          pathData: 'M 0 0 L 100 0 L 100 100 Z',
          fill: '#ffffff',
          stroke: { color: '#000000', width: 2 },
          trim: { start: 0, end: 1, offset: 0 },
        }}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Trim start/i), {
      target: { value: '0.25' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        shapeKind: 'rect',
        pathData: 'M 0 0 L 100 0 L 100 100 Z',
        fill: '#ffffff',
        stroke: { color: '#000000', width: 2 },
        trim: expect.objectContaining({ start: 0.25, end: 1 }),
      }),
    );
  });
});

describe('EffectPickerDialog', () => {
  it('hands the selected effect to the caller', () => {
    const onSelect = jest.fn();
    render(
      <EffectPickerDialog
        open
        onOpenChange={jest.fn()}
        clipName="Clip"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Spotlight Focus' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Effect/i }));
    expect(onSelect).toHaveBeenCalledWith('spotlight');
  });
});

describe('StudioCommandBar feature commands', () => {
  it('shows blend, text and keyframe commands for a caption clip', () => {
    const clip = captionClip({
      payload: {
        text: 'Hello world',
        keyframes: [
          { id: 'kf-1', timeMs: 0, property: 'x', value: 0, easing: 'linear' },
        ],
      },
    });
    render(
      <StudioCommandBar
        open
        onOpenChange={jest.fn()}
        selectedClip={clip}
        selectedTrack={captionTrack(clip)}
        onOpenBlendMode={jest.fn()}
        onOpenTextAnimator={jest.fn()}
        onAddKeyframe={jest.fn()}
        onClearKeyframes={jest.fn()}
        onShowShapesTab={jest.fn()}
      />,
    );

    expect(screen.getByText(/Set Blend Mode/)).toBeInTheDocument();
    expect(screen.getByText(/Text Animation/)).toBeInTheDocument();
    expect(screen.getByText(/Add Position Keyframe/)).toBeInTheDocument();
    expect(screen.getByText(/Clear Clip Keyframes/)).toBeInTheDocument();
  });

  it('hides text animation for a video-only selection', () => {
    const clip = captionClip({
      itemType: 'video',
      payload: { mediaAssetId: 'asset-1' },
    });
    render(
      <StudioCommandBar
        open
        onOpenChange={jest.fn()}
        selectedClip={clip}
        selectedTrack={{
          ...captionTrack(clip),
          type: 'video',
        }}
        onOpenBlendMode={jest.fn()}
      />,
    );

    expect(screen.queryByText(/Text Animation/)).not.toBeInTheDocument();
  });
});

describe('Text animator renderer states', () => {
  it('reveals typewriter units instantly with no motion', () => {
    expect(studioTextAnimatorUnitState('typewriter', 0.5, 1, 4)).toEqual({
      alpha: 1,
      rise: 0,
      revealed: true,
    });
    expect(studioTextAnimatorUnitState('typewriter', 0.5, 3, 4)).toEqual({
      alpha: 0,
      rise: 0,
      revealed: false,
    });
  });

  it('fades words over their own slot instead of truncating text', () => {
    expect(
      studioTextAnimatorUnitState('fade-words', 0.5, 0, 4),
    ).toMatchObject({ alpha: 1, rise: 0 });
    expect(
      studioTextAnimatorUnitState('fade-words', 0.6, 3, 4).alpha,
    ).toBe(0);
  });

  it('slides and fades characters for slide-up', () => {
    const mid = studioTextAnimatorUnitState('slide-up', 0.6, 2, 4);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    expect(mid.rise).toBeCloseTo(1 - mid.alpha);
  });
});

describe('Universal keyframes for visual tracks', () => {
  it('exposes transform properties for caption and overlay tracks', () => {
    expect(keyframeUiRowProperties('captions')).toEqual(
      expect.arrayContaining(['x', 'y', 'scale', 'rotation', 'opacity']),
    );
    expect(keyframeUiRowProperties('overlays')).toEqual(
      expect.arrayContaining(['x', 'y', 'scale', 'rotation', 'opacity']),
    );
  });

  it('stores a caption position keyframe through the timeline store', () => {
    const clip = captionClip();
    const track = captionTrack(clip);
    timelineStore.setTracksAndDuration([track], 10000);
    timelineStore.seek(1500);

    act(() => {
      timelineStore.addClipKeyframe(clip.id, 'x', 500, 120);
    });

    expect(
      timelineStore
        .findClip(clip.id)
        ?.clip.payload?.keyframes?.find((keyframe) => keyframe.property === 'x')
        ?.value,
    ).toBe(120);
  });
});