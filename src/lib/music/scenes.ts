/**
 * lib/music/scenes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A "scene" is the unit the user actually chooses: a soundscape mix, an optional
 * music source, a crossfade length and a ducking amount. Built-ins live in code
 * so they cannot drift between the DB and the player; user scenes live in
 * `music_scenes` and are merged on top.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  AudioSceneConfig,
  MusicScene,
  SoundscapeLayerId,
  SoundscapeState,
} from './types';

export const DEFAULT_SOUNDSCAPE_STATE: SoundscapeState = {
  layers: { rain: { volume: 0.32 } },
  noise: 'brown',
  noiseVolume: 0.18,
  toneMode: 'off',
  carrierHz: 220,
  beatHz: 10,
  toneVolume: 0.14,
  pulseDepth: 0.8,
  masterVolume: 0.75,
};

export function emptySoundscape(): SoundscapeState {
  return {
    layers: {},
    noise: null,
    noiseVolume: 0.2,
    toneMode: 'off',
    carrierHz: 220,
    beatHz: 10,
    toneVolume: 0.14,
    pulseDepth: 0.8,
    masterVolume: 0.75,
  };
}

export function layer(
  id: SoundscapeLayerId,
  volume: number,
): Partial<Record<SoundscapeLayerId, { volume: number }>> {
  return { [id]: { volume } };
}

export const BUILTIN_SCENES: MusicScene[] = [
  {
    id: 'deep-work',
    name: 'Deep work',
    builtin: true,
    created_at: 0,
    updated_at: 0,
    config: {
      soundscape: {
        ...emptySoundscape(),
        noise: 'brown',
        noiseVolume: 0.22,
        layers: layer('rain', 0.22),
      },
      music: null,
      crossfadeSec: 4,
      duckDb: -9,
    },
  },
  {
    id: 'rain-room',
    name: 'Rain room',
    builtin: true,
    created_at: 0,
    updated_at: 0,
    config: {
      soundscape: {
        ...emptySoundscape(),
        layers: { rain: { volume: 0.4 }, thunder: { volume: 0.16 } },
      },
      music: null,
      crossfadeSec: 5,
      duckDb: -7,
    },
  },
  {
    id: 'forest-focus',
    name: 'Forest focus',
    builtin: true,
    created_at: 0,
    updated_at: 0,
    config: {
      soundscape: {
        ...emptySoundscape(),
        layers: { forest: { volume: 0.36 }, stream: { volume: 0.2 } },
      },
      music: null,
      crossfadeSec: 4,
      duckDb: -8,
    },
  },
  {
    id: 'late-night',
    name: 'Late night',
    builtin: true,
    created_at: 0,
    updated_at: 0,
    config: {
      soundscape: {
        ...emptySoundscape(),
        layers: { drizzle: { volume: 0.28 }, distant_thunder: { volume: 0.12 } },
        noise: 'pink',
        noiseVolume: 0.1,
      },
      music: null,
      crossfadeSec: 6,
      duckDb: -10,
    },
  },
];

export const DEFAULT_SCENE = BUILTIN_SCENES[0];

export function findScene(
  scenes: MusicScene[],
  id: string | null | undefined,
): MusicScene {
  if (!id) return DEFAULT_SCENE;
  return scenes.find((scene) => scene.id === id) ?? DEFAULT_SCENE;
}

/** Validate a scene config that came out of JSON (DB or import). */
export function normalizeSceneConfig(value: unknown): AudioSceneConfig {
  const fallback = DEFAULT_SCENE.config;
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<AudioSceneConfig>;
  const soundscape = candidate.soundscape;
  return {
    soundscape:
      soundscape && typeof soundscape === 'object'
        ? { ...DEFAULT_SOUNDSCAPE_STATE, ...soundscape }
        : fallback.soundscape,
    music: candidate.music ?? null,
    crossfadeSec:
      typeof candidate.crossfadeSec === 'number'
        ? Math.max(0, Math.min(12, candidate.crossfadeSec))
        : fallback.crossfadeSec,
    duckDb:
      typeof candidate.duckDb === 'number'
        ? Math.max(-30, Math.min(0, candidate.duckDb))
        : fallback.duckDb,
  };
}
