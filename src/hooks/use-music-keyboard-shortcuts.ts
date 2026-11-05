/**
 * hooks/use-music-keyboard-shortcuts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Keyboard shortcuts for the music page: playback controls, search focus,
 * and help. Extracted so the page component stays thin.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import type { MusicTrack } from '@/lib/music/types';

export interface UseMusicKeyboardShortcutsOptions {
  searchInputRef: React.MutableRefObject<HTMLInputElement | null>;
  currentTrack: MusicTrack | null;
  visibleTracks: MusicTrack[];
  toggle: () => Promise<void>;
  playTracks: (tracks: MusicTrack[], index: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
}

export function useMusicKeyboardShortcuts({
  searchInputRef,
  currentTrack,
  visibleTracks,
  toggle,
  playTracks,
  next,
  previous,
}: UseMusicKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in an input or textarea
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        // Allow Cmd+K (search) even in text fields
        if (!(event.metaKey || event.ctrlKey) || event.key !== 'k') {
          return;
        }
      }

      // Cmd/Ctrl+K: Focus search
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Space: Play/pause (if a track is available)
      if (event.code === 'Space' && currentTrack) {
        event.preventDefault();
        void toggle();
        return;
      }

      // Shift+Space: Play first visible track
      if (event.shiftKey && event.code === 'Space' && visibleTracks.length > 0) {
        event.preventDefault();
        void playTracks(visibleTracks, 0);
        return;
      }

      // Right arrow: Next track
      if (event.key === 'ArrowRight' && !event.shiftKey && currentTrack) {
        event.preventDefault();
        void next();
        return;
      }

      // Left arrow: Previous track
      if (event.key === 'ArrowLeft' && !event.shiftKey && currentTrack) {
        event.preventDefault();
        void previous();
        return;
      }

      // '?': Show help (or could show shortcuts)
      if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        toast.info(
          '🎵 Keyboard Shortcuts\n\nCmd+K: Search\nSpace: Play/Pause\nShift+Space: Play first\n→: Next\n←: Previous',
        );
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, visibleTracks, toggle, playTracks, next, previous, searchInputRef]);
}
