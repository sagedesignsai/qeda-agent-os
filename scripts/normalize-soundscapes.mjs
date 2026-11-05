#!/usr/bin/env node
/**
 * scripts/normalize-soundscapes.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off normaliser for the bundled focus ambience.
 *
 * WHY
 * ───
 * The field recordings arrived at wildly different lengths (3 s to 157 s). Looped
 * as-is, wind repeated every three seconds and the long stems decoded to tens of
 * megabytes of PCM each. Every output here is ~12–24 s, and the loop seam is
 * crossfaded against itself, so the engine can set `source.loop = true` without
 * a click or a memory spike.
 *
 * Inputs live outside the renderer (`assets/focus-sound-stems/`) so they are not
 * bundled; only the generated loops are imported by `lib/soundscape/layers.ts`.
 *
 * USAGE
 * ─────
 *   node scripts/normalize-soundscapes.mjs
 *   node scripts/normalize-soundscapes.mjs --source=assets/focus-sound-stems \
 *                                          --out=src/renderer/focus-audio/loops
 *
 * Requires ffmpeg/ffprobe on PATH. Re-running is safe: outputs are overwritten.
 * Adjust a row below to choose a different window; nothing here is automatic
 * because "the interesting 24 seconds" is an editorial choice, not a heuristic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }),
);

const sourceDir = path.resolve(
  process.cwd(),
  args.get('source') ?? 'assets/focus-sound-stems',
);
const outDir = path.resolve(
  process.cwd(),
  args.get('out') ?? 'src/renderer/focus-audio/loops',
);

/**
 * `target` is the loop length in seconds. `start` chooses the window for long
 * recordings; short ones are time-stretched to the target instead of repeated,
 * because repeating a 3 s clip is exactly the artefact this script exists to
 * remove. Wind stays shorter on purpose: stretching 3 s to 24 s stops sounding
 * like wind.
 */
const STEMS = [
  { file: 'distant_thunder.ogg', target: 22, start: 0 },
  { file: 'drizzle.ogg', target: 24, start: 0 },
  { file: 'forest_after_rain.ogg', target: 24, start: 2 },
  { file: 'heavy_rain.ogg', target: 24, start: 0 },
  { file: 'roof_rain.ogg', target: 24, start: 20 },
  { file: 'small_stream.ogg', target: 24, start: 20 },
  { file: 'stream.ogg', target: 20, start: 0 },
  { file: 'terrace_downpour.ogg', target: 24, start: 40 },
  { file: 'thunder.ogg', target: 20, start: 0 },
  { file: 'wind.ogg', target: 12, start: 0 },
];

const SAMPLE_RATE = 44_100;

function probeDuration(file) {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      file,
    ],
    { encoding: 'utf8' },
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read a duration from ${file}`);
  }
  return duration;
}

/**
 * ffmpeg's atempo is a speed multiplier and accepts 0.5–2.0. `factor` here is
 * target/source, so a source that is too short needs a value *below* 1; long
 * stretches are chained.
 */
function tempoFilters(factor) {
  let remaining = 1 / factor;
  const filters = [];
  while (remaining < 0.5001) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (remaining < 0.9999) {
    filters.push(`atempo=${remaining.toFixed(4)}`);
  }
  return filters;
}

function buildFilter(duration, target, start) {
  const factor = duration < target ? (target / duration) * 1.002 : 1;
  const tempo = tempoFilters(factor);
  const seam = Math.min(1.5, target / 6);
  const windowStart = duration < target ? 0 : start;
  const head = tempo.length ? `[0:a]${tempo.join(',')},` : '[0:a]';

  return [
    // Normalise length first, then cut the loop window.
    `${head}atrim=start=${windowStart}:duration=${target},asetpts=PTS-STARTPTS,asplit=3[main][tail][head]`,
    // Fade the tail into the head, then append that seam to the middle. The
    // result is target - seam seconds and both ends belong to the same material.
    `[main]atrim=start=${seam}:end=${target - seam},asetpts=PTS-STARTPTS[m]`,
    `[tail]atrim=start=${target - seam},asetpts=PTS-STARTPTS[t]`,
    `[head]atrim=end=${seam},asetpts=PTS-STARTPTS[h]`,
    `[t][h]acrossfade=d=${seam}:c1=tri:c2=tri[seam]`,
    `[m][seam]concat=n=2:v=0:a=1[out]`,
  ].join(';');
}

if (!existsSync(sourceDir)) {
  console.error(
    `Source directory not found: ${sourceDir}\n` +
      'The unnormalised stems live in assets/focus-sound-stems/.',
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

for (const stem of STEMS) {
  const input = path.join(sourceDir, stem.file);
  if (!existsSync(input)) {
    console.error(`Missing source stem: ${input}`);
    process.exitCode = 1;
    continue;
  }

  const duration = probeDuration(input);
  const output = path.join(outDir, stem.file);
  const target = stem.target;

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      input,
      '-filter_complex',
      buildFilter(duration, target, stem.start),
      '-map',
      '[out]',
      '-ar',
      String(SAMPLE_RATE),
      '-c:a',
      'libvorbis',
      '-q:a',
      '4',
      output,
    ],
    { stdio: 'inherit' },
  );

  console.log(
    `${stem.file}: ${duration.toFixed(2)}s → ${probeDuration(output).toFixed(2)}s loop`,
  );
}
