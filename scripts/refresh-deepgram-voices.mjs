/**
 * scripts/refresh-deepgram-voices.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Regenerate the committed Deepgram Aura voice snapshot.
 *
 * `GET /v1/models` needs no API key. The snapshot exists only so a first-run
 * offline install shows a populated voice picker; the live endpoint remains
 * authoritative at runtime.
 *
 * Usage: node scripts/refresh-deepgram-voices.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS_URL = 'https://api.deepgram.com/v1/models';
const GENDERS = new Set(['feminine', 'masculine', 'neutral']);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(
  root,
  'src/lib/tts/catalogs/deepgram-voices.ts',
);

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function normalize(model) {
  const id = model.canonical_name?.trim();
  if (!id || id.startsWith('flux-')) return null;

  const metadata = model.metadata ?? {};
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag) => typeof tag === 'string')
    : [];
  const gender = tags.find((tag) => GENDERS.has(tag));
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
    tags: tags.filter((tag) => !GENDERS.has(tag)),
    useCases: Array.isArray(metadata.use_cases) ? metadata.use_cases : [],
    ...(metadata.sample ? { previewUrl: metadata.sample } : {}),
    ...(metadata.image ? { avatarUrl: metadata.image } : {}),
    ...(metadata.color ? { color: metadata.color } : {}),
    ...(model.architecture === 'aura' ? { legacy: true } : {}),
  };
}

function sortVoices(voices) {
  return voices.sort((a, b) => {
    if (Boolean(a.legacy) !== Boolean(b.legacy)) return a.legacy ? 1 : -1;
    if (a.locale !== b.locale) return a.locale.localeCompare(b.locale);
    return a.name.localeCompare(b.name);
  });
}

const response = await fetch(MODELS_URL, {
  headers: { Accept: 'application/json' },
});
if (!response.ok) {
  throw new Error(`Deepgram models request failed (HTTP ${response.status}).`);
}
const data = await response.json();
const voices = sortVoices(
  (data.tts ?? [])
    .filter(
      (model) =>
        model.architecture === 'aura' || model.architecture === 'aura-2',
    )
    .map(normalize)
    .filter(Boolean),
);
if (voices.length === 0) throw new Error('Deepgram returned no Aura voices.');

const lines = [
  '/**',
  ' * lib/tts/catalogs/deepgram-voices.ts',
  ' * ─────────────────────────────────────────────────────────────────────────────',
  ' * Offline fallback for the Deepgram Aura catalog.',
  ' *',
  ' * Generated from GET https://api.deepgram.com/v1/models (no API key required).',
  ' * The live endpoint remains authoritative; this file only prevents a first-run',
  ' * offline install from showing an empty voice picker.',
  ' *',
  ' * Refresh with: node scripts/refresh-deepgram-voices.mjs',
  ' * ─────────────────────────────────────────────────────────────────────────────',
  ' */',
  '',
  "import type { TtsVoice } from '../types';",
  '',
  `export const DEEPGRAM_VOICE_SNAPSHOT_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};`,
  '',
  'export const DEEPGRAM_VOICE_SNAPSHOT: TtsVoice[] = [',
  ...voices.map((voice) => `  ${JSON.stringify(voice)},`),
  '];',
  '',
];

await fs.writeFile(target, lines.join('\n'), 'utf8');
console.log(`Wrote ${voices.length} voices to ${path.relative(root, target)}.`);
