/**
 * __tests__/soundlab-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Component unit tests for SoundLab DAW UI: SoundLabTransportBar,
 * SoundLabSessionLibrary, and specialized track cards.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '../components/ui/tooltip';
import { SoundLabTransportBar } from '../components/soundlab/SoundLabTransportBar';
import { SoundLabSessionLibrary } from '../components/soundlab/SoundLabSessionLibrary';
import { EntrainmentTrackCard } from '../components/soundlab/EntrainmentTrackCard';
import { soundLabStore } from '../hooks/use-soundlab-store';
import { buildDefaultTracks } from '../lib/soundlab-types';
import type { SoundLabSessionWithTracks, SoundLabTrack } from '../lib/soundlab-types';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('SoundLabTransportBar', () => {
  const session: SoundLabSessionWithTracks = {
    id: 'test-sess',
    projectId: null,
    title: 'Alpha Flow',
    bpm: 120,
    keySignature: 'C',
    targetBand: 'alpha',
    durationBeats: 64,
    loopEnabled: false,
    loopStartBeat: 0,
    loopEndBeat: 32,
    createdAt: 1000,
    updatedAt: 1000,
    tracks: buildDefaultTracks('test-sess', 'alpha'),
  };

  beforeEach(() => {
    soundLabStore.loadSession(session);
  });

  it('renders transport controls and bpm readout', () => {
    const onPlay = jest.fn().mockResolvedValue(undefined);
    const onPause = jest.fn();
    const onStop = jest.fn();

    render(
      <TooltipProvider>
        <SoundLabTransportBar
          saveStatus="idle"
          onPlay={onPlay}
          onPause={onPause}
          onStop={onStop}
        />
      </TooltipProvider>,
    );

    const bpmInput = screen.getByDisplayValue('120');
    expect(bpmInput).toBeInTheDocument();

    // Trigger BPM change
    fireEvent.change(bpmInput, { target: { value: '128' } });
    expect(soundLabStore.getState().session?.bpm).toBe(128);
  });

  it('invokes onPlay when play button is clicked', async () => {
    const onPlay = jest.fn().mockResolvedValue(undefined);
    const onPause = jest.fn();
    const onStop = jest.fn();

    render(
      <TooltipProvider>
        <SoundLabTransportBar
          saveStatus="idle"
          onPlay={onPlay}
          onPause={onPause}
          onStop={onStop}
        />
      </TooltipProvider>,
    );

    const buttons = screen.getAllByRole('button');
    // First button is play/pause
    fireEvent.click(buttons[0]);
    expect(onPlay).toHaveBeenCalled();
  });
});

describe('SoundLabSessionLibrary', () => {
  const sessions = [
    {
      id: 'sess-alpha',
      projectId: null,
      title: 'Morning Focus',
      bpm: 115,
      keySignature: 'D',
      targetBand: 'alpha' as const,
      durationBeats: 64,
      loopEnabled: false,
      loopStartBeat: 0,
      loopEndBeat: 32,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  it('renders session card with title and bpm', () => {
    const onCreate = jest.fn().mockResolvedValue('new-id');
    const onDelete = jest.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SoundLabSessionLibrary
          sessions={sessions}
          onCreate={onCreate}
          onDelete={onDelete}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Morning Focus')).toBeInTheDocument();
    expect(screen.getByText('115 BPM')).toBeInTheDocument();
    expect(screen.getByText('New Session')).toBeInTheDocument();
  });

  it('opens template dialog when clicking New Session', () => {
    const onCreate = jest.fn().mockResolvedValue('new-id');
    const onDelete = jest.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SoundLabSessionLibrary
          sessions={sessions}
          onCreate={onCreate}
          onDelete={onDelete}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('New Session'));
    expect(screen.getByText('Choose a brain state goal or start from scratch.')).toBeInTheDocument();
    expect(screen.getByText('Deep Focus')).toBeInTheDocument();
  });
});

describe('EntrainmentTrackCard', () => {
  const entrainmentTrack: SoundLabTrack = {
    id: 'ent-1',
    sessionId: 'test-sess',
    type: 'entrainment',
    name: 'Alpha Tone',
    sortOrder: 1,
    muted: false,
    solo: false,
    volume: 0.8,
    pan: 0,
    color: '#8b5cf6',
    config: {
      mode: 'binaural',
      band: 'alpha',
      carrierHz: 210,
      beatHz: 10,
      amDepth: 0.8,
    },
    patterns: [],
    clips: [],
    automation: [],
  };

  it('renders mode pills and frequency controls', () => {
    render(
      <TooltipProvider>
        <EntrainmentTrackCard track={entrainmentTrack} isSelected={false} />
      </TooltipProvider>,
    );

    expect(screen.getByText('BIN')).toBeInTheDocument();
    expect(screen.getByText('ISO')).toBeInTheDocument();
    expect(screen.getByText('MON')).toBeInTheDocument();
    expect(screen.getByText('AME')).toBeInTheDocument();
    expect(screen.getByText('Carr.')).toBeInTheDocument();
    expect(screen.getByText('Beat')).toBeInTheDocument();
    expect(screen.getByText('210Hz')).toBeInTheDocument();
    expect(screen.getByText('10.0Hz')).toBeInTheDocument();
  });
});
