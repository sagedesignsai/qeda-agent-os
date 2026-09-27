/**
 * hooks/use-focus-audio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React binding for the focus soundscape engine.
 *
 * Lives at the page level (not inside the focus overlay) so a soundscape keeps
 * playing while the user navigates the board — losing the audio the moment you
 * close a dialog would defeat the point.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SOUND_CONFIG,
  FocusAudioEngine,
  type FocusSoundConfig,
} from '@/lib/focus-audio';

export interface UseFocusAudioReturn {
  config: FocusSoundConfig;
  playing: boolean;
  /** Start with the current (or a supplied) config. */
  start: (config?: FocusSoundConfig) => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;
  /** Patch the config; applies live when playing. */
  setConfig: (patch: Partial<FocusSoundConfig>) => void;
}

export function useFocusAudio(): UseFocusAudioReturn {
  const engineRef = useRef<FocusAudioEngine | null>(null);
  const [config, setConfigState] = useState<FocusSoundConfig>(
    DEFAULT_SOUND_CONFIG,
  );
  const [playing, setPlaying] = useState(false);

  const engine = useCallback((): FocusAudioEngine => {
    if (!engineRef.current) engineRef.current = new FocusAudioEngine();
    return engineRef.current;
  }, []);

  // Release the AudioContext when the page unmounts.
  useEffect(
    () => () => {
      void engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  const start = useCallback(
    async (override?: FocusSoundConfig) => {
      await engine().start(override ?? config);
      setPlaying(true);
    },
    [config, engine],
  );

  const stop = useCallback(() => {
    engine().stop();
    setPlaying(false);
  }, [engine]);

  const toggle = useCallback(async () => {
    if (engine().isPlaying) {
      engine().stop();
      setPlaying(false);
      return;
    }
    await engine().start(config);
    setPlaying(true);
  }, [config, engine]);

  const setConfig = useCallback((patch: Partial<FocusSoundConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      engineRef.current?.update(next);
      return next;
    });
  }, []);

  return { config, playing, start, stop, toggle, setConfig };
}
