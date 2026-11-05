/**
 * __tests__/music-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Render coverage for the music surfaces, with IPC mocked at the bridge.
 *
 * These tests deliberately stop at "the right data reaches the right controls".
 * Audio is the engine's job and is covered by the pure queue/crossfade tests;
 * what breaks here is a missing channel, a stale selector, or a dock that
 * disappears while a session is running.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Music from '../renderer/pages/Music';
import { GlobalAudioDock } from '../components/music/GlobalAudioDock';
import { QueuePanel } from '../components/music/QueuePanel';
import { useMusicStore } from '../stores/music-store';
import { useFocusStore } from '../stores/focus-store';
import type { MusicTrack } from '../lib/music/types';
import type { Task } from '../main/ipc/channels';

// Radix's ScrollArea/Slider observe their box; jsdom has no ResizeObserver.
// A no-op is sufficient for these render-level assertions.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
});

const TRACK: MusicTrack = {
  id: 'track-1',
  folder_id: 'folder-1',
  path: '/music/xtal.mp3',
  title: 'Xtal',
  artist: 'Aphex Twin',
  album: 'Selected Ambient Works 85–92',
  album_artist: 'Aphex Twin',
  genre: 'Ambient',
  year: 1992,
  track_no: 1,
  disc_no: 1,
  duration_ms: 300_000,
  bitrate: 320_000,
  codec: 'MPEG 1 Layer 3',
  size: 1024,
  mtime: 1_700_000_000,
  added_at: 1_700_000_000,
  last_seen_at: 1_700_000_000,
  missing_at: null,
  has_art: 0,
};

const TASK: Task = {
  id: 'task-1',
  project_id: 'inbox',
  title: 'Write executive summary',
  description: '',
  status: 'active',
  priority: 1,
  position: 0,
  estimate_mins: 25,
  due_at: null,
  pomodoro_count: 0,
  created_at: 1000,
  updated_at: 1000,
};

function mockBridge() {
  const invoke = jest.fn(async (channel: string) => {
    switch (channel) {
      case 'music:folders-list':
        return [
          {
            id: 'folder-1',
            path: '/music',
            added_at: 1,
            last_scan_at: null,
            track_count: 1,
          },
        ];
      case 'music:playlists-list':
        return [];
      case 'music:facets':
        return {
          artists: [{ name: 'Aphex Twin', count: 1 }],
          albums: [
            {
              name: 'Selected Ambient Works 85–92',
              artist: 'Aphex Twin',
              count: 1,
            },
          ],
        };
      case 'music:library-query':
        return { rows: [TRACK], total: 1 };
      case 'music:playlist-tracks':
        return [];
      case 'music:state-get':
        return null;
      case 'music:tracks-by-ids':
        return [];
      default:
        return undefined;
    }
  });

  Object.defineProperty(window, 'electron', {
    writable: true,
    value: {
      ipc: {
        invoke,
        on: () => () => {},
      },
    },
  });

  return invoke;
}

beforeEach(() => {
  mockBridge();
  useMusicStore.setState({
    queue: [],
    index: -1,
    playing: false,
    positionMs: 0,
    durationMs: 0,
    hydrated: true,
    hydrating: false,
    error: null,
  });
  useFocusStore.setState({
    focusedTask: null,
    displayMode: 'closed',
    lastEvent: null,
  });
});

describe('music library UI', () => {
  it('renders indexed tracks from the library query', async () => {
    render(
      <MemoryRouter initialEntries={['/music']}>
        <Music />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Xtal')).toBeInTheDocument();
    expect(screen.getByText('Aphex Twin — Selected Ambient Works 85–92')).toBeInTheDocument();
  });

  it('renders the queue with the current track', () => {
    useMusicStore.setState({
      queue: [TRACK],
      index: 0,
      durationMs: TRACK.duration_ms,
    });

    render(<QueuePanel />);

    expect(screen.getByText('Xtal')).toBeInTheDocument();
    expect(screen.getByText(/1 track/)).toBeInTheDocument();
  });

  it('keeps the focus session and transport in one dock', async () => {
    useMusicStore.setState({
      queue: [TRACK],
      index: 0,
      durationMs: TRACK.duration_ms,
    });
    useFocusStore.setState({
      focusedTask: TASK,
      displayMode: 'floating',
      timer: {
        phase: 'work',
        secondsLeft: 1495,
        running: true,
        completed: 0,
        phaseTotal: 1500,
      },
    });

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <GlobalAudioDock />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Xtal')).toBeInTheDocument();
    expect(screen.getByText('Write executive summary')).toBeInTheDocument();
    expect(screen.getByText('24:55')).toBeInTheDocument();
  });
});
