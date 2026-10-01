/**
 * __tests__/studio-canvas-enhancements.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for Studio Canvas dynamic aspect ratios, background styling,
 * 60fps blank playback clock, and timeline keyboard navigation shortcuts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { StudioCanvas } from '../components/studio/StudioCanvas';
import { TimelineCanvasViewport } from '../components/studio/timeline/TimelineCanvasViewport';
import { timelineStore } from '../hooks/use-timeline-store';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio-types';

describe('Studio Canvas Enhancements', () => {
  beforeEach(() => {
    timelineStore.setTracksAndDuration(
      [
        {
          id: 'test-track-1',
          name: 'Video Track',
          type: 'video',
          muted: false,
          locked: false,
          visible: true,
          clips: [
            {
              id: 'clip-1',
              trackId: 'test-track-1',
              name: 'Demo Clip',
              startMs: 0,
              durationMs: 10000,
              sourceStartMs: 0,
              sourceDurationMs: 10000,
              color: '#6366f1',
            },
          ],
        },
      ],
      10000,
    );
    timelineStore.seek(5000, true);
    timelineStore.setPlaying(false);
  });

  describe('Dynamic Canvas Aspect Ratio', () => {
    it('configures 16:9 canvas with 1920x1080 bitmap dimensions', () => {
      render(
        <StudioCanvas
          videoUrl={null}
          styling={{ ...DEFAULT_STUDIO_STYLING, aspectRatio: '16:9' }}
          zooms={[]}
          captions={[]}
          currentTimeMs={0}
          isPlaying={false}
        />,
      );

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
      expect(canvas).toHaveAttribute('width', '1920');
      expect(canvas).toHaveAttribute('height', '1080');
    });

    it('configures 9:16 vertical canvas with 1080x1920 bitmap dimensions', () => {
      render(
        <StudioCanvas
          videoUrl={null}
          styling={{ ...DEFAULT_STUDIO_STYLING, aspectRatio: '9:16' }}
          zooms={[]}
          captions={[]}
          currentTimeMs={0}
          isPlaying={false}
        />,
      );

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
      expect(canvas).toHaveAttribute('width', '1080');
      expect(canvas).toHaveAttribute('height', '1920');
    });

    it('configures 1:1 square canvas with 1080x1080 bitmap dimensions', () => {
      render(
        <StudioCanvas
          videoUrl={null}
          styling={{ ...DEFAULT_STUDIO_STYLING, aspectRatio: '1:1' }}
          zooms={[]}
          captions={[]}
          currentTimeMs={0}
          isPlaying={false}
        />,
      );

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
      expect(canvas).toHaveAttribute('width', '1080');
      expect(canvas).toHaveAttribute('height', '1080');
    });

    it('configures 4:3 canvas with 1440x1080 bitmap dimensions', () => {
      render(
        <StudioCanvas
          videoUrl={null}
          styling={{ ...DEFAULT_STUDIO_STYLING, aspectRatio: '4:3' }}
          zooms={[]}
          captions={[]}
          currentTimeMs={0}
          isPlaying={false}
        />,
      );

      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
      expect(canvas).toHaveAttribute('width', '1440');
      expect(canvas).toHaveAttribute('height', '1080');
    });

    it('renders blank canvas message when no video is loaded', () => {
      render(
        <StudioCanvas
          videoUrl={null}
          styling={DEFAULT_STUDIO_STYLING}
          zooms={[]}
          captions={[]}
          currentTimeMs={0}
          isPlaying={false}
        />,
      );

      expect(screen.getByText('Blank Showcase Canvas')).toBeInTheDocument();
    });
  });

  describe('Blank Playback Clock', () => {
    it('advances playback clock via requestAnimationFrame when playing without videoUrl', () => {
      jest.useFakeTimers();
      const onTimeUpdate = jest.fn();

      render(
        <StudioCanvas
          videoUrl={null}
          styling={DEFAULT_STUDIO_STYLING}
          zooms={[]}
          captions={[]}
          currentTimeMs={1000}
          durationMs={5000}
          isPlaying={true}
          onTimeUpdate={onTimeUpdate}
        />,
      );

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(onTimeUpdate).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('Timeline Keyboard Shortcuts', () => {
    it('nudges playhead backward by 50ms on ArrowLeft and 1000ms with Shift', () => {
      render(<TimelineCanvasViewport videoUrl={null} />);

      timelineStore.seek(3000, true);

      // ArrowLeft (50ms)
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'ArrowLeft' }),
        );
      });
      expect(timelineStore.getState().currentTimeMs).toBe(2950);

      // Shift+ArrowLeft (1000ms)
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'ArrowLeft', shiftKey: true }),
        );
      });
      expect(timelineStore.getState().currentTimeMs).toBe(1950);
    });

    it('nudges playhead forward by 50ms on ArrowRight and 1000ms with Shift', () => {
      render(<TimelineCanvasViewport videoUrl={null} />);

      timelineStore.seek(3000, true);

      // ArrowRight (50ms)
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'ArrowRight' }),
        );
      });
      expect(timelineStore.getState().currentTimeMs).toBe(3050);

      // Shift+ArrowRight (1000ms)
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'ArrowRight', shiftKey: true }),
        );
      });
      expect(timelineStore.getState().currentTimeMs).toBe(4050);
    });

    it('jumps to beginning on Home and end of timeline on End', () => {
      render(<TimelineCanvasViewport videoUrl={null} />);

      timelineStore.seek(4000, true);

      // Home
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Home' }));
      });
      expect(timelineStore.getState().currentTimeMs).toBe(0);

      // End
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'End' }));
      });
      expect(timelineStore.getState().currentTimeMs).toBe(10000);
    });

    it('shuttles back 1000ms on KeyJ', () => {
      render(<TimelineCanvasViewport videoUrl={null} />);

      timelineStore.seek(4500, true);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
      });
      expect(timelineStore.getState().currentTimeMs).toBe(3500);
    });

    it('handles KeyK and KeyL play/pause toggles', () => {
      const onTogglePlay = jest.fn();
      render(
        <TimelineCanvasViewport videoUrl={null} onTogglePlay={onTogglePlay} />,
      );

      // When paused, KeyL starts playback
      act(() => {
        timelineStore.setPlaying(false);
      });
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
      });
      expect(onTogglePlay).toHaveBeenCalledTimes(1);

      // When playing, KeyK pauses playback
      act(() => {
        timelineStore.setPlaying(true);
      });
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' }));
      });
      expect(onTogglePlay).toHaveBeenCalledTimes(2);
    });

    it('triggers timeline undo and redo via Meta+Z and Meta+Shift+Z shortcuts', () => {
      render(<TimelineCanvasViewport videoUrl={null} />);

      // Select clip-1 and delete it
      act(() => {
        timelineStore.setSelectedClipId('clip-1');
        timelineStore.deleteSelectedClip();
      });

      const trackAfterDelete = timelineStore.getState().tracks.find((t) => t.id === 'test-track-1');
      expect(trackAfterDelete?.clips.length).toBe(0);
      expect(timelineStore.canUndo()).toBe(true);

      // Meta+Z -> undo deletion
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true }),
        );
      });

      const trackAfterUndo = timelineStore.getState().tracks.find((t) => t.id === 'test-track-1');
      expect(trackAfterUndo?.clips.length).toBe(1);
      expect(trackAfterUndo?.clips[0].id).toBe('clip-1');
      expect(timelineStore.canRedo()).toBe(true);

      // Meta+Shift+Z -> redo deletion
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true }),
        );
      });

      const trackAfterRedo = timelineStore.getState().tracks.find((t) => t.id === 'test-track-1');
      expect(trackAfterRedo?.clips.length).toBe(0);
    });
  });

  describe('Timeline Undo / Redo & Track Sync Engine', () => {
    it('manages undo/redo history stack on clip operations and notifies listeners', () => {
      const trackListener = jest.fn();
      const unsubscribe = timelineStore.subscribeTracks(trackListener);

      expect(timelineStore.canUndo()).toBe(false);
      expect(timelineStore.canRedo()).toBe(false);

      // Split clip at 5000ms (trackId, clipId, splitTimeMs)
      act(() => {
        timelineStore.splitClipAt('test-track-1', 'clip-1', 5000);
      });

      const tracksAfterSplit = timelineStore.getState().tracks[0].clips;
      expect(tracksAfterSplit.length).toBe(2);
      expect(timelineStore.canUndo()).toBe(true);
      expect(trackListener).toHaveBeenCalled();

      // Undo split
      act(() => {
        timelineStore.undo();
      });

      const tracksAfterUndo = timelineStore.getState().tracks[0].clips;
      expect(tracksAfterUndo.length).toBe(1);
      expect(timelineStore.canRedo()).toBe(true);

      // Redo split
      act(() => {
        timelineStore.redo();
      });

      const tracksAfterRedo = timelineStore.getState().tracks[0].clips;
      expect(tracksAfterRedo.length).toBe(2);

      unsubscribe();
    });
  });
});
