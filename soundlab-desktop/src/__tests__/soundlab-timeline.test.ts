/**
 * __tests__/soundlab-timeline.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure coordinate and snapping math used by the SoundLab timeline and piano roll.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  beatToPx,
  pxToBeat,
  snapTimelineBeat,
} from '@/components/soundlab/timeline/SoundLabTimelineCanvas';
import {
  pitchToY,
  yToPitch,
  snapPianoRollBeat,
} from '@/components/soundlab/pianoroll/PianoRollCanvas';

describe('SoundLab timeline coordinates', () => {
  it('maps beats to pixels and back with horizontal scroll applied', () => {
    const px = beatToPx(8, 24, 2);
    expect(px).toBe(144);
    expect(pxToBeat(px, 24, 2)).toBe(8);
  });

  it('snaps timeline clicks to quarter-beat subdivisions', () => {
    expect(snapTimelineBeat(3.12)).toBe(3);
    expect(snapTimelineBeat(3.14)).toBe(3.25);
  });
});

describe('SoundLab piano-roll coordinates', () => {
  it('maps MIDI pitch to rows and back', () => {
    for (const pitch of [24, 36, 60, 69, 95]) {
      expect(yToPitch(pitchToY(pitch))).toBe(pitch);
    }
  });

  it('snaps notes to quarter, eighth, and sixteenth-note grids', () => {
    expect(snapPianoRollBeat(1.38, '1/4')).toBe(1.5);
    expect(snapPianoRollBeat(1.3, '1/8')).toBe(1.25);
    expect(snapPianoRollBeat(1.3, '1/16')).toBe(1.3125);
  });
});
