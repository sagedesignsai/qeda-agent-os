/**
 * main/blender/runner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Headless Blender batch runner for the Model Builder.
 * Blender is a required dependency (5.2 LTS). Resolution + version probe
 * failures are structured errors, never throws across the tool boundary.
 */

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { app } from 'electron';
import { getSettings } from '../ai/settings';
import { buildBlenderScript, type BlenderStyle } from './templates';
import { buildHarnessScript } from './harness-template';
import { glbDimensions, parseGlbMeta, type GlbMeta } from './glb-meta';

const execFileAsync = promisify(execFile);

export interface BlenderHealth {
  ok: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface BlenderJobResult {
  success: boolean;
  glbPath?: string;
  previewPath?: string;
  bytes?: number;
  error?: string;
  excerpt?: string;
  stderrTail?: string;
}

/** Machine-readable per-run report emitted by the harness postlude. */
export interface BlenderReport {
  tri_count: number;
  tri_budget: number;
  part_count: number;
  parts: Array<{
    name: string;
    tris: number;
    min: [number, number, number];
    max: [number, number, number];
  }>;
  seconds: number;
}

export interface BlenderJobInput {
  brief: string;
  style?: BlenderStyle;
  seed?: number;
  maxTriangles?: number;
  timeoutMs?: number;
}

export interface AuthoredBlenderJobInput {
  /** LLM-authored mesh-building bpy code (the PART). */
  part: string;
  brief: string;
  style?: BlenderStyle;
  seed?: number;
  maxTriangles?: number;
  timeoutMs?: number;
}

export type AuthoredBlenderJobResult = BlenderJobResult & {
  report?: BlenderReport;
  /** Parsed GLB metadata from the gate (triangles, bbox, parts). */
  meta?: GlbMeta;
};

export function candidateBlenderPaths(): string[] {
  const candidates = [
    process.env.QEDA_BLENDER_PATH,
    'blender', // PATH
    '/Applications/Blender.app/Contents/MacOS/Blender', // macOS
    '/usr/bin/blender',
    '/usr/local/bin/blender',
    'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
  ].filter((p): p is string => Boolean(p));
  return [...new Set(candidates)];
}

export function resolveBlenderPath(override?: string): string | undefined {
  const fromSettings = override ?? getSettings().blender?.path;
  if (fromSettings && existsSync(fromSettings)) return fromSettings;

  for (const candidate of candidateBlenderPaths()) {
    // Bare names rely on PATH lookup at spawn time.
    if (candidate === 'blender' || existsSync(candidate)) return candidate;
  }
  return fromSettings;
}

export async function probeBlender(): Promise<BlenderHealth> {
  const binary = resolveBlenderPath();
  if (!binary) {
    return { ok: false, error: 'Blender binary not found. Install Blender 5.2 LTS or set Settings → Blender → path.' };
  }
  try {
    const { stdout } = await execFileAsync(binary, ['--version'], {
      timeout: 15_000,
      encoding: 'utf8',
    });
    const firstLine = stdout.split('\n')[0]?.trim() ?? '';
    const major = /(\d+)\.(?:\d+)/.exec(firstLine)?.[1];
    if (major && Number(major) < 5) {
      return { ok: false, path: binary, version: firstLine, error: `Blender 5.x LTS required (found: ${firstLine}).` };
    }
    // Smoke: bpy import works headless.
    const { stdout: smoke } = await execFileAsync(
      binary,
      ['--background', '--python-expr', "import bpy; print('BPY_OK', bpy.app.version_string)"],
      { timeout: 30_000, encoding: 'utf8' },
    );
    if (!smoke.includes('BPY_OK')) {
      return { ok: false, path: binary, version: firstLine, error: 'Blender started but `import bpy` failed.' };
    }
    return { ok: true, path: binary, version: firstLine };
  } catch (error) {
    return {
      ok: false,
      path: binary,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function tail(text: string, max = 4096): string {
  return text.length > max ? text.slice(-max) : text;
}

/** Run one deterministic templated job. Never throws across the boundary. */
export async function runBlenderJob(input: BlenderJobInput): Promise<BlenderJobResult> {
  const health = await probeBlender();
  if (!health.ok || !health.path) {
    return { success: false, error: health.error ?? 'Blender unavailable.' };
  }

  const timeoutMs = input.timeoutMs ?? getSettings().blender?.timeoutMs ?? 90_000;
  const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const baseDir = path.join(app.getPath('userData'), 'blender-jobs', runId);
  const glbPath = path.join(baseDir, 'output.glb');
  const previewPath = path.join(baseDir, 'preview.png');
  const scriptPath = path.join(baseDir, 'job.py');

  try {
    await fs.mkdir(baseDir, { recursive: true });
    const script = buildBlenderScript({
      brief: input.brief,
      style: input.style ?? 'pbr',
      seed: input.seed ?? 1,
      maxTriangles: input.maxTriangles ?? 50_000,
      outputPath: glbPath,
      previewPath,
    });
    await fs.writeFile(scriptPath, script, 'utf8');

    const { stdout, stderr } = await execFileAsync(
      health.path,
      ['--background', '--python', scriptPath],
      {
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, BLENDER_HEADLESS: '1' },
      },
    );

    const combined = `${stdout}\n${stderr}`;
    if (!combined.includes('BLENDER_EXPORT_OK')) {
      return {
        success: false,
        error: 'Blender did not report BLENDER_EXPORT_OK.',
        excerpt: tail(combined),
        stderrTail: tail(stderr),
      };
    }

    const stat = await fs.stat(glbPath).catch(() => null);
    if (!stat || stat.size === 0) {
      return { success: false, error: 'Blender reported success but output.glb is missing or empty.', excerpt: tail(combined) };
    }
    if (stat.size > 25 * 1024 * 1024) {
      return { success: false, error: `Output GLB is ${(stat.size / 1024 / 1024).toFixed(1)} MB (cap 25 MB). Simplify the model.` };
    }

    // Minimal GLB magic + JSON chunk sanity. Full parse happens renderer-side
    // via gltf-structure.ts; this gate rejects truncated/corrupt files early.
    const head = await fs.readFile(glbPath).then((b) => b.subarray(0, 20)).catch(() => null);
    const magic = head?.subarray(0, 4).toString('ascii');
    if (magic !== 'glTF') {
      return { success: false, error: 'Output is not a valid GLB (bad magic).' };
    }

    const previewOk = await fs
      .stat(previewPath)
      .then((s) => s.size > 0)
      .catch(() => false);
    return {
      success: true,
      glbPath,
      previewPath: previewOk ? previewPath : undefined,
      bytes: stat.size,
      stderrTail: tail(stderr),
    };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string; code?: string };
    if (e.code === 'ETIMEDOUT') {
      return { success: false, error: `Blender timed out after ${Math.round(timeoutMs / 1000)}s.` };
    }
    return {
      success: false,
      error: e.message ?? String(error),
      excerpt: tail(`${e.stdout ?? ''}\n${e.stderr ?? ''}`),
      stderrTail: tail(e.stderr ?? ''),
    };
  } finally {
    // Keep the job dir for debugging briefly; it is tiny.
    void os.tmpdir();
  }
}

/** Safe-mode gate for the raw-code tool: block obviously dangerous imports. */
export function isRawScriptSafe(pythonCode: string): { ok: boolean; reason?: string } {
  const blocked = /\b(import\s+(os|subprocess|socket|shutil|sys)\b|from\s+(os|subprocess|socket|shutil)\s+import|os\.system|subprocess\.|__import__\s*\()/;
  if (blocked.test(pythonCode)) {
    return { ok: false, reason: 'Blocked: script imports os/subprocess/socket or calls shells. Use the templated asset tool instead.' };
  }
  if (pythonCode.length > 32_000) return { ok: false, reason: 'Script exceeds 32 KB.' };
  return { ok: true };
}

/**
 * Static gate for LLM-authored PART code. Stricter than `isRawScriptSafe`:
 * the harness owns scene setup/import/export/file access, so the PART may
 * not do any of that itself. v1 = strict regex (tokenizer gate is P3).
 */
export function isAuthoredPartSafe(part: string): {
  ok: boolean;
  reason?: string;
} {
  if (part.length > 32_000) {
    return { ok: false, reason: 'PART exceeds 32 KB. Simplify the geometry code.' };
  }
  const blocked: Array<[RegExp, string]> = [
    [/\bimport\s+(os|subprocess|socket|shutil|sys|requests|urllib|importlib|tempfile)\b/, 'blocked import (os/subprocess/socket/…)'],
    [/\bfrom\s+(os|subprocess|socket|shutil|sys|requests|urllib|importlib|tempfile)\s+[-a-zA-Z]*import\b/, 'blocked from-import (os/subprocess/socket/…)'],
    [/\bos\.|subprocess\.|shutil\./, 'OS/shell access'],
    [/__import__\s*\(/, '__import__ call'],
    [/\b(open|exec|eval|compile|input)\s*\(/, 'open/exec/eval/input call'],
    [/\bbpy\.ops\.(wm|file|screen|import_scene|export_scene)\./, 'harness-owned bpy.ops (wm/file/import/export)'],
    [/\bbpy\.(app|path|utils)\./, 'bpy.app/path/utils access'],
    [/\bwhile\b/, 'unbounded `while` loop (use `for`)'],
    // Bare calls only: a method call (`bpy.data.objects.remove(...)`,
    // `materials.remove(...)`, `list.remove(...)`) mutates a Blender
    // collection/list, not the filesystem — scene cleanup copied from the
    // harness/template must not trip this. Real filesystem access goes
    // through os/shutil, already blocked above.
    [/(?<![\w.])(mkdir|remove|rename|chmod|unlink)\s*\(/, 'filesystem mutation call'],
  ];
  for (const [pattern, label] of blocked) {
    if (pattern.test(part)) {
      return {
        ok: false,
        reason: `Blocked in PART code: ${label}. The harness owns scene setup, export, preview, and file access.`,
      };
    }
  }
  return { ok: true };
}

function parseReport(combined: string): BlenderReport | undefined {
  const match = /QEDA_REPORT (\{.*\})/.exec(combined);
  if (!match) return undefined;
  try {
    const raw = JSON.parse(match[1]) as Partial<BlenderReport>;
    if (typeof raw.tri_count !== 'number' || typeof raw.part_count !== 'number') {
      return undefined;
    }
    return {
      tri_count: raw.tri_count,
      tri_budget: raw.tri_budget ?? 0,
      part_count: raw.part_count,
      parts: Array.isArray(raw.parts) ? raw.parts : [],
      seconds: typeof raw.seconds === 'number' ? raw.seconds : 0,
    };
  } catch {
    return undefined;
  }
}

/** Read the GLB and run the structural gate (magic, meta, bounds). */
async function validateAuthoredGlb(
  glbPath: string,
  maxTriangles: number,
): Promise<{ ok: boolean; error?: string; meta?: GlbMeta; bytes?: number }> {
  const stat = await fs.stat(glbPath).catch(() => null);
  if (!stat || stat.size === 0) {
    return { ok: false, error: 'Authored job finished but output.glb is missing or empty.' };
  }
  if (stat.size > 25 * 1024 * 1024) {
    return {
      ok: false,
      error: `Output GLB is ${(stat.size / 1024 / 1024).toFixed(1)} MB (cap 25 MB). Reduce the budget/detail.`,
    };
  }
  const buffer = await fs.readFile(glbPath).catch(() => null);
  if (!buffer) return { ok: false, error: `Could not read ${glbPath}.` };
  const magic = buffer.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') {
    return { ok: false, error: 'Output is not a valid GLB (bad magic).' };
  }
  const meta = parseGlbMeta(buffer);
  if (!meta) {
    return { ok: false, error: 'Output GLB has an unreadable JSON chunk.' };
  }
  if (meta.trianglesKnown && meta.triangles > maxTriangles) {
    return {
      ok: false,
      error: `Triangle budget exceeded: GLB has ${meta.triangles} tris (budget ${maxTriangles}). Simplify the geometry or lower segment counts.`,
      meta,
    };
  }
  const dims = glbDimensions(meta);
  if (dims) {
    const maxDim = Math.max(dims.width, dims.height, dims.depth);
    if (maxDim > 500) {
      return {
        ok: false,
        error: `Model is ${maxDim.toFixed(1)} units across — plausibly a unit/scale error. Scale it to meters (keep the largest part under ~500m).`,
        meta,
      };
    }
    if (maxDim > 0 && maxDim < 0.001) {
      return {
        ok: false,
        error: `Model is smaller than ${maxDim} units — plausibly a scale error. Size it to meters.`,
        meta,
      };
    }
  }
  return { ok: true, meta, bytes: stat.size };
}

/**
 * Run one LLM-authored job in the deterministic harness. The PART was
 * authored by the model; the harness owns scene setup, grounding, export,
 * the preview render, and the QEDA_REPORT. Never throws across the boundary.
 */
export async function runAuthoredBlenderJob(
  input: AuthoredBlenderJobInput,
): Promise<AuthoredBlenderJobResult> {
  const gate = isAuthoredPartSafe(input.part);
  if (!gate.ok) {
    return { success: false, error: gate.reason };
  }

  const health = await probeBlender();
  if (!health.ok || !health.path) {
    return { success: false, error: health.error ?? 'Blender unavailable.' };
  }

  const maxTriangles =
    input.maxTriangles ?? getSettings().blender?.maxTriangles ?? 50_000;
  const timeoutMs = input.timeoutMs ?? getSettings().blender?.timeoutMs ?? 90_000;
  const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const baseDir = path.join(app.getPath('userData'), 'blender-jobs', runId);
  const glbPath = path.join(baseDir, 'output.glb');
  const previewPath = path.join(baseDir, 'preview.png');
  const scriptPath = path.join(baseDir, 'harness.py');

  try {
    await fs.mkdir(baseDir, { recursive: true });
    const script = buildHarnessScript({
      part: input.part,
      seed: input.seed ?? 1,
      maxTriangles,
      outputPath: glbPath,
      previewPath,
    });
    await fs.writeFile(scriptPath, script, 'utf8');

    const { stdout, stderr } = await execFileAsync(
      health.path,
      ['--background', '--python', scriptPath],
      {
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, BLENDER_HEADLESS: '1' },
      },
    );

    const combined = `${stdout}\n${stderr}`;
    if (!combined.includes('BLENDER_EXPORT_OK')) {
      // Surface the PART's own error so the authoring agent can fix its code.
      const partError = /QEDA_PART_ERROR (.*)/.exec(combined)?.[1];
      return {
        success: false,
        error: partError
          ? `PART failed: ${partError}`
          : 'Authored harness did not report BLENDER_EXPORT_OK.',
        report: parseReport(combined),
        excerpt: tail(combined),
        stderrTail: tail(stderr),
      };
    }

    const validation = await validateAuthoredGlb(glbPath, maxTriangles);
    if (!validation.ok) {
      return {
        success: false,
        error: validation.error,
        report: parseReport(combined),
        meta: validation.meta,
        excerpt: tail(combined),
      };
    }

    const previewStat = await fs
      .stat(previewPath)
      .then((s) => s.size > 0)
      .catch(() => false);

    return {
      success: true,
      glbPath,
      previewPath: previewStat ? previewPath : undefined,
      bytes: validation.bytes,
      report: parseReport(combined) ?? undefined,
      meta: validation.meta,
      stderrTail: tail(stderr),
    };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string; code?: string };
    if (e.code === 'ETIMEDOUT') {
      return { success: false, error: `Blender timed out after ${Math.round(timeoutMs / 1000)}s.` };
    }
    return {
      success: false,
      error: e.message ?? String(error),
      excerpt: tail(`${e.stdout ?? ''}\n${e.stderr ?? ''}`),
      stderrTail: tail(e.stderr ?? ''),
    };
  }
}

/** Run a user/LLM-authored raw script (gated). Mirrors runBlenderJob I/O. */
export async function runRawBlenderScript(pythonCode: string): Promise<BlenderJobResult> {
  const safe = isRawScriptSafe(pythonCode);
  if (!safe.ok) return { success: false, error: safe.reason };

  const health = await probeBlender();
  if (!health.ok || !health.path) return { success: false, error: health.error };

  const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const baseDir = path.join(app.getPath('userData'), 'blender-jobs', runId);
  const glbPath = path.join(baseDir, 'output.glb');
  const scriptPath = path.join(baseDir, 'job.py');
  try {
    await fs.mkdir(baseDir, { recursive: true });
    const wrapped = `${pythonCode}\n# Ensure export path for headless jobs\nprint("BLENDER_RAW_OK")\n`;
    await fs.writeFile(scriptPath, wrapped, 'utf8');
    const { stdout, stderr } = await execFileAsync(health.path, ['--background', '--python', scriptPath], {
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
    });
    const combined = `${stdout}\n${stderr}`;
    const stat = await fs.stat(glbPath).catch(() => null);
    if (!stat?.size) {
      return {
        success: false,
        error: 'Raw script finished but did not produce output.glb at the expected path. Export to the job stdout path or use the templated tool.',
        excerpt: tail(combined),
      };
    }
    return { success: true, glbPath, bytes: stat.size };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return { success: false, error: e.message ?? String(error), excerpt: tail(`${e.stdout ?? ''}\n${e.stderr ?? ''}`) };
  }
}
