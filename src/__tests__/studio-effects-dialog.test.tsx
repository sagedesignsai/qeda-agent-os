/**
 * __tests__/studio-effects-dialog.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Component tests for the Clip Effects & Keyframe Studio dialog:
 *   - Draft isolation (Cancel discards edits without mutating the clip)
 *   - Auto-K intensity keyframing + Apply commits effects & keyframes
 *   - Timeline keyframe insertion & deletion
 *   - Preview mode & chroma-key eyedropper availability
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClipEffectsStudioDialog } from '../components/studio/inspector/ClipEffectsStudioDialog';
import type { ClipEffect, StudioKeyframe, TimelineClip } from '@/lib/studio/types';

function makeClip(
  effects: ClipEffect[] = [],
  keyframes: StudioKeyframe[] = [],
): TimelineClip {
  return {
    id: 'clip-1',
    trackId: 'track-video',
    itemType: 'video',
    name: 'Demo Clip',
    startMs: 0,
    durationMs: 4000,
    sourceStartMs: 0,
    sourceDurationMs: 4000,
    payload: {
      mediaAssetId: 'asset-1',
      effects,
      keyframes,
    },
  } as unknown as TimelineClip;
}

describe('ClipEffectsStudioDialog', () => {
  it('renders preview controls, effect params, and keyframe timeline', () => {
    const effect: ClipEffect = {
      id: 'fx-1',
      type: 'chroma-key',
      intensity: 0.8,
      params: {},
      stackOrder: 0,
    };

    render(
      <ClipEffectsStudioDialog
        open={true}
        onOpenChange={jest.fn()}
        clip={makeClip([effect])}
        onUpdateClip={jest.fn()}
      />,
    );

    expect(
      screen.getByText(/Effects & Keyframes — Demo Clip/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Composite/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Isolated/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Sample key colour/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('⚙ Parameters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Auto-K/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Chroma Key · Intensity')).toBeInTheDocument();
  });

  it('keeps edits in a draft and discards them on Cancel', () => {
    const effect: ClipEffect = {
      id: 'fx-1',
      type: 'color-grade',
      intensity: 0.5,
      params: {},
      stackOrder: 0,
    };
    const onUpdateClip = jest.fn();
    const onOpenChange = jest.fn();

    render(
      <ClipEffectsStudioDialog
        open={true}
        onOpenChange={onOpenChange}
        clip={makeClip([effect])}
        onUpdateClip={onUpdateClip}
      />,
    );

    const intensityInput = screen.getByLabelText('Intensity');
    fireEvent.change(intensityInput, { target: { value: '0.9' } });
    fireEvent.blur(intensityInput);

    expect(onUpdateClip).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onUpdateClip).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('records a keyframe when Auto-K is enabled and commits on Apply', () => {
    const effect: ClipEffect = {
      id: 'fx-1',
      type: 'color-grade',
      intensity: 0.5,
      params: {},
      stackOrder: 0,
    };
    const onUpdateClip = jest.fn();
    const onOpenChange = jest.fn();

    render(
      <ClipEffectsStudioDialog
        open={true}
        onOpenChange={onOpenChange}
        clip={makeClip([effect])}
        onUpdateClip={onUpdateClip}
      />,
    );

    const intensityInput = screen.getByLabelText('Intensity');
    fireEvent.change(intensityInput, { target: { value: '0.85' } });
    fireEvent.blur(intensityInput);

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onUpdateClip).toHaveBeenCalledTimes(1);
    const [clipId, patch] = onUpdateClip.mock.calls[0];
    expect(clipId).toBe('clip-1');
    const savedKeyframes = patch.payload.keyframes as StudioKeyframe[];
    expect(savedKeyframes).toHaveLength(1);
    expect(savedKeyframes[0]).toMatchObject({
      property: 'effect:fx-1:intensity',
      timeMs: 0,
      value: 0.85,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('adds and deletes keyframes on timeline property rows', () => {
    const onUpdateClip = jest.fn();
    render(
      <ClipEffectsStudioDialog
        open={true}
        onOpenChange={jest.fn()}
        clip={makeClip([])}
        onUpdateClip={onUpdateClip}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Add keyframe for Opacity' }),
    );
    const diamond = screen.getByRole('button', {
      name: 'Opacity keyframe at 0ms',
    });
    expect(diamond).toBeInTheDocument();

    fireEvent.pointerDown(diamond);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete selected keyframe' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Opacity keyframe at 0ms' }),
    ).not.toBeInTheDocument();
  });

  it('applies a Film Look LUT preset to color-grade and saves shape mask on Apply', () => {
    const effect: ClipEffect = {
      id: 'fx-grade',
      type: 'color-grade',
      intensity: 1,
      params: {},
      stackOrder: 0,
    };
    const onUpdateClip = jest.fn();

    render(
      <ClipEffectsStudioDialog
        open={true}
        onOpenChange={jest.fn()}
        clip={makeClip([effect])}
        onUpdateClip={onUpdateClip}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Teal & Orange' }));
    fireEvent.click(screen.getByText('◐ Shape Mask'));
    fireEvent.click(screen.getByLabelText('Enable shape mask'));

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onUpdateClip).toHaveBeenCalledTimes(1);
    const [, patch] = onUpdateClip.mock.calls[0];
    const savedEffect = (patch.payload.effects as ClipEffect[])[0];
    expect(savedEffect.params).toMatchObject({
      temperature: 0.25,
      contrast: 1.18,
    });
    expect(patch.payload.mask).toMatchObject({
      enabled: true,
      shape: 'circle',
    });
  });
});
