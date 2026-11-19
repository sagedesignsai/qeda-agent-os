/**
 * main/tts/voices.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Deepgram voice catalog.
 *
 * `GET /v1/models` is unauthenticated and returns rich TTS metadata (display
 * name, accent, age, tags, use cases, hosted sample WAV, avatar, color). That is
 * strictly better than hardcoding the docs table, and it means the Studio voice
 * picker can audition voices before a key is configured.
 *
 * Resolution order: fresh live fetch → on-disk cache → bundled snapshot. The
 * returned `source` lets the UI explain a stale or offline catalog.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  TtsVoice,
  TtsVoiceCatalog,
  TtsVoiceQuery,
} from '../../lib/tts/types.js';
import {
  DEEPGRAM_VOICE_SNAPSHOT,
  DEEPGRAM_VOICE_SNAPSHOT_GENERATED_AT,
} from '../../lib/tts/catalogs/deepgram-voices.js';
import { ttsVoiceCachePath } from './paths.js';

const DEEPGRAM_MODELS_URL = 'https://api.deepgram.com/v1/models';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GENDER_TAGS = new Set(['feminine', 'masculine', 'neutral']);

interface DeepgramModelMetadata {
  accent?: string;
  age?: string;
  color?: string;
  display_name?: string | null;
  image?: string;
  sample?: string;
  tags?: string[];
  use_cases?: string[];
}

interface DeepgramModel {
  name?: string;
  canonical_name?: string;
  architecture?: string;
  languages?: string[];
  metadata?: DeepgramModelMetadata;
}

interface DeepgramModelsResponse {
  tts?: DeepgramModel[];
}

interface VoiceCacheFile {
  fetchedAt: number;
  voices: TtsVoice[];
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function normalizeVoice(model: DeepgramModel): TtsVoice | null {
  const id = model.canonical_name?.trim();
  if (!id) return null;
  // Flux voices are a separate endpoint (`/v2/speak`) and adapter; never mix
  // them into the Aura picker.
  if (id.startsWith('flux-')) return null;

  const metadata = model.metadata ?? {};
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const gender = tags.find((tag) => GENDER_TAGS.has(tag));
  const languages = Array.isArray(model.languages) ? model.languages : [];

  return {
    id,
    provider: 'deepgram',
    name: metadata.display_name || capitalize(model.name ?? id),
    family: model.architecture ?? 'aura-2',
    language: languages[0] ?? 'en',
    locale: languages[1] ?? languages[0] ?? 'en-US',
    ...(gender ? { gender } : {}),
    ...(metadata.age ? { age: metadata.age } : {}),
    ...(metadata.accent ? { accent: metadata.accent } : {}),
    tags: tags.filter((tag) => !GENDER_TAGS.has(tag)),
    useCases: Array.isArray(metadata.use_cases) ? metadata.use_cases : [],
    ...(metadata.sample ? { previewUrl: metadata.sample } : {}),
    ...(metadata.image ? { avatarUrl: metadata.image } : {}),
    ...(metadata.color ? { color: metadata.color } : {}),
    ...(model.architecture === 'aura' ? { legacy: true } : {}),
  };
}

function sortVoices(voices: TtsVoice[]): TtsVoice[] {
  return [...voices].sort((a, b) => {
    if (Boolean(a.legacy) !== Boolean(b.legacy)) return a.legacy ? 1 : -1;
    if (a.locale !== b.locale) return a.locale.localeCompare(b.locale);
    return a.name.localeCompare(b.name);
  });
}

function filterVoices(voices: TtsVoice[], query?: TtsVoiceQuery): TtsVoice[] {
  if (!query) return voices;
  const search = query.search?.trim().toLowerCase();
  return voices.filter((voice) => {
    if (query.provider && voice.provider !== query.provider) return false;
    if (query.family && voice.family !== query.family) return false;
    if (query.gender && voice.gender !== query.gender) return false;
    if (query.language) {
      const language = query.language.toLowerCase();
      if (
        voice.language.toLowerCase() !== language &&
        !voice.locale.toLowerCase().startsWith(`${language}-`) &&
        voice.locale.toLowerCase() !== language
      ) {
        return false;
      }
    }
    if (search) {
      const haystack = [
        voice.id,
        voice.name,
        voice.accent ?? '',
        voice.gender ?? '',
        voice.locale,
        ...voice.tags,
        ...voice.useCases,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

async function readCache(provider: 'deepgram'): Promise<VoiceCacheFile | null> {
  try {
    const raw = await fs.readFile(ttsVoiceCachePath(provider), 'utf8');
    const parsed = JSON.parse(raw) as VoiceCacheFile;
    if (!Array.isArray(parsed.voices)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(
  provider: 'deepgram',
  file: VoiceCacheFile,
): Promise<void> {
  try {
    const cachePath = ttsVoiceCachePath(provider);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(file), 'utf8');
  } catch {
    // A cache write failure must not fail a successful catalog fetch.
  }
}

async function fetchDeepgramVoices(
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<TtsVoice[]> {
  const response = await fetchImpl(DEEPGRAM_MODELS_URL, {
    headers: { Accept: 'application/json' },
    signal: signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Deepgram models request failed (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as DeepgramModelsResponse;
  const voices = (data.tts ?? [])
    .filter(
      (model) =>
        model.architecture === 'aura' || model.architecture === 'aura-2',
    )
    .map(normalizeVoice)
    .filter((voice): voice is TtsVoice => voice !== null);
  if (voices.length === 0) {
    throw new Error('Deepgram returned no Aura voices.');
  }
  return sortVoices(voices);
}

export async function loadDeepgramVoices(opts?: {
  refresh?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Optional picker filters; the cache always stores the full catalog. */
  query?: TtsVoiceQuery;
}): Promise<TtsVoiceCatalog> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const filter = opts?.query;
  const cached = await readCache('deepgram');
  const fresh =
    cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS ? cached : null;

  if (fresh && !opts?.refresh) {
    return {
      voices: filterVoices(fresh.voices, filter),
      fetchedAt: fresh.fetchedAt,
      source: 'cache',
    };
  }

  try {
    const voices = await fetchDeepgramVoices(fetchImpl, opts?.signal);
    const fetchedAt = Date.now();
    await writeCache('deepgram', { fetchedAt, voices });
    return {
      voices: filterVoices(voices, filter),
      fetchedAt,
      source: 'live',
    };
  } catch {
    if (cached) {
      return {
        voices: filterVoices(cached.voices, filter),
        fetchedAt: cached.fetchedAt,
        source: 'cache',
      };
    }
    return {
      voices: filterVoices(DEEPGRAM_VOICE_SNAPSHOT, filter),
      fetchedAt: Date.parse(DEEPGRAM_VOICE_SNAPSHOT_GENERATED_AT) || null,
      source: 'bundled',
    };
  }
}

/** Resolve one voice from the catalog without requiring a network round-trip. */
export async function findDeepgramVoice(
  voiceId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<TtsVoice | null> {
  const catalog = await loadDeepgramVoices(opts);
  return catalog.voices.find((voice) => voice.id === voiceId) ?? null;
}
