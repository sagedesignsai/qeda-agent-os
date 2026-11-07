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

export interface BlenderJobInput {
  brief: string;
  style?: BlenderStyle;
  seed?: number;
  maxTriangles?: number;
  timeoutMs?: number;
}

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
