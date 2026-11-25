/**
 * __tests__/studio-effect-params.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Contract tests for the schema-driven effect parameter editor.
 *
 * The editor is the only way users reach static effect params (exposure, key
 * colour, blur distance, …), so these tests pin two things: every schema
 * parameter is rendered, and an edit writes a normalised param set back to the
 * clip without dropping the other values.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { EffectParamsEditorSection } from '../components/studio/inspector/sections/EffectParamsEditorSection';
import type { ClipEffect, TimelineClip } from '@/lib/studio/types';

function makeClip(effect: ClipEffect): TimelineClip {
  return {
    id: 'clip-1',
    trackId: 'track-video',
    itemType: 'video',
    name: 'Clip',
    startMs: 0,
    durationMs: 5000,
    sourceStartMs: 0,
    sourceDurationMs: 5000,
    payload: { mediaAssetId: 'asset-1', effects: [effect] },
  } as unknown as TimelineClip;
}

function chromaKeyEffect(): ClipEffect {
  return {
    id: 'fx-1',
    type: 'chroma-key',
    intensity: 1,
    params: {},
    stackOrder: 0,
  };
}

describe('EffectParamsEditorSection', () => {
  it('renders every schema control for a chroma key', () => {
    const effect = chromaKeyEffect();
    render(
      <EffectParamsEditorSection
        clip={makeClip(effect)}
        effect={effect}
        onUpdateClip={jest.fn()}
      />,
    );

    expect(screen.getByText('⚙ Parameters')).toBeInTheDocument();
    for (const label of [
      'Key Colour',
      'Tolerance',
      'Edge Softness',
      'Spill Suppression',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Key Colour hex')).toHaveValue('#00ff00');
  });

  it('writes a normalised param set when a number changes', () => {
    const effect = chromaKeyEffect();
    const onUpdateClip = jest.fn();
    render(
      <EffectParamsEditorSection
        clip={makeClip(effect)}
        effect={effect}
        onUpdateClip={onUpdateClip}
      />,
    );

    const tolerance = screen.getByLabelText('Tolerance');
    fireEvent.change(tolerance, { target: { value: '0.5' } });
    fireEvent.blur(tolerance);

    expect(onUpdateClip).toHaveBeenCalledTimes(1);
    const [clipId, patch] = onUpdateClip.mock.calls[0];
    expect(clipId).toBe('clip-1');
    const updated = (patch.payload.effects as ClipEffect[])[0];
    expect(updated.params).toMatchObject({
      keyColor: '#00ff00',
      tolerance: 0.5,
      softness: 0.12,
      spill: 0.6,
    });
  });

  it('updates a colour parameter', () => {
    const effect = chromaKeyEffect();
    const onUpdateClip = jest.fn();
    render(
      <EffectParamsEditorSection
        clip={makeClip(effect)}
        effect={effect}
        onUpdateClip={onUpdateClip}
      />,
    );

    const hex = screen.getByLabelText('Key Colour hex');
    fireEvent.change(hex, { target: { value: '#0000ff' } });
    fireEvent.blur(hex);

    const [, patch] = onUpdateClip.mock.calls[0];
    const updated = (patch.payload.effects as ClipEffect[])[0];
    expect(updated.params.keyColor).toBe('#0000ff');
  });

  it('renders nothing for an effect with no schema', () => {
    const effect = {
      id: 'fx-zoom',
      type: 'zoom',
      intensity: 1,
      params: {},
      stackOrder: 0,
    } as unknown as ClipEffect;
    const { container } = render(
      <EffectParamsEditorSection
        clip={makeClip(effect)}
        effect={effect}
        onUpdateClip={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
