/**
 * lib/trace/qa/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Measurable composition QA: lint issues, scene coverage, narration readiness,
 * review notes, motion taste and text/background contrast, plus the frame list a
 * contact sheet should show.
 *
 * This is deliberately separate from lint: lint answers "is the document
 * valid?", QA answers "is this cut ready to show?". It is pure and DOM-free, so
 * the panel and the copilot audit share one report.
 */

import { lintTraceProject } from '../lint';
import {
  DEFAULT_SCENE_BACKGROUND,
  TRACE_SCENE_TRANSITION_MS,
} from '../runtime/scenes';
import { stylePalette } from '../look';
import type { TraceElement, TraceProject } from '../types';

export type QaSeverity = 'error' | 'warning' | 'info';

export interface QaIssue {
  code: string;
  severity: QaSeverity;
  message: string;
  timeMs?: number;
  sceneId?: string;
  elementId?: string;
  fix?: string;
}

export interface QaFrame {
  timeMs: number;
  scene: string | null;
  label: string;
}

export interface QaMetrics {
  durationMs: number;
  sceneCount: number;
  elementCount: number;
  trackCount: number;
  keyframeCount: number;
  motionTrackCount: number;
  linearMotionTracks: number;
  totalNotes: number;
  unresolvedNotes: number;
  totalNarrationLines: number;
  measuredNarrationLines: number;
  hasStyle: boolean;
  hasCamera: boolean;
  lowContrastTexts: number;
}

export interface QaReport {
  ok: boolean;
  issues: QaIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  metrics: QaMetrics;
  frames: QaFrame[];
}

const MOTION_PROPERTIES = new Set(['x', 'y', 'scaleX', 'scaleY', 'rotation']);
const MAX_FRAMES = 9;

function clampTime(timeMs: number, durationMs: number): number {
  return Math.max(0, Math.min(Math.round(timeMs), Math.max(0, durationMs)));
}

/** Times a reviewer should see: each scene settled/mid, plus every note. */
export function framesForProject(
  project: TraceProject,
  limit = MAX_FRAMES,
): QaFrame[] {
  const durationMs = Math.max(0, project.durationMs);
  const scenes = project.storyboard?.scenes ?? [];
  const frames: QaFrame[] = [];

  if (scenes.length === 0) {
    frames.push(
      { timeMs: 0, scene: null, label: 'Opening frame' },
      {
        timeMs: clampTime(durationMs / 2, durationMs),
        scene: null,
        label: 'Midpoint',
      },
    );
  } else {
    for (const scene of scenes) {
      const settle =
        scene.transitionIn && scene.transitionIn !== 'cut'
          ? Math.min(TRACE_SCENE_TRANSITION_MS, Math.max(0, scene.durationMs - 1))
          : 0;
      frames.push({
        timeMs: clampTime(scene.startMs + settle, durationMs),
        scene: scene.name,
        label: `${scene.name} · settled`,
      });
      frames.push({
        timeMs: clampTime(
          scene.startMs + scene.durationMs / 2,
          durationMs,
        ),
        scene: scene.name,
        label: `${scene.name} · mid`,
      });
    }
  }

  for (const note of project.reviewNotes ?? []) {
    frames.push({
      timeMs: clampTime(note.timeMs, durationMs),
      scene:
        project.storyboard?.scenes.find((scene) => scene.id === note.sceneId)
          ?.name ?? null,
      label: `Note · ${note.resolved ? 'resolved' : 'open'}`,
    });
  }

  const unique = new Map<number, QaFrame>();
  for (const frame of frames.sort((a, b) => a.timeMs - b.timeMs)) {
    if (!unique.has(frame.timeMs)) unique.set(frame.timeMs, frame);
  }
  const ordered = [...unique.values()];
  if (ordered.length <= limit) return ordered;
  if (limit <= 1) return [ordered[0]];

  // Keep the spread: first, last, and evenly spaced samples between.
  return Array.from({ length: limit }, (_, index) => {
    const position = Math.round((index * (ordered.length - 1)) / (limit - 1));
    return ordered[position];
  });
}

/* ── Contrast ──────────────────────────────────────────────────────────────── */

function parseColor(input: string | undefined): [number, number, number] | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : hex[1];
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ];
  }
  const rgb = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/,
  );
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  const named: Record<string, [number, number, number]> = {
    white: [255, 255, 255],
    black: [0, 0, 0],
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
  };
  return named[value] ?? null;
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: [number, number, number]): number {
  return (
    0.2126 * channel(rgb[0]) +
    0.7152 * channel(rgb[1]) +
    0.0722 * channel(rgb[2])
  );
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(
  foreground: string,
  background: string,
): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const light = Math.max(luminance(fg), luminance(bg));
  const dark = Math.min(luminance(fg), luminance(bg));
  return (light + 0.05) / (dark + 0.05);
}

/* ── Report ────────────────────────────────────────────────────────────────── */

function sceneForElement(
  project: TraceProject,
  element: TraceElement,
): { background: string; sceneId?: string } {
  const scene = element.sceneId
    ? project.storyboard?.scenes.find((entry) => entry.id === element.sceneId)
    : project.storyboard?.scenes[0];
  return {
    background:
      scene?.background ??
      stylePalette(project.style).background ??
      DEFAULT_SCENE_BACKGROUND,
    ...(scene?.id ? { sceneId: scene.id } : {}),
  };
}

export function qaTraceProject(project: TraceProject): QaReport {
  const issues: QaIssue[] = [];
  const elements = Object.values(project.elements);
  const scenes = project.storyboard?.scenes ?? [];
  const notes = project.reviewNotes ?? [];

  // Lint is the validity floor; QA adds readiness checks on top.
  const lint = lintTraceProject(project);
  for (const diagnostic of lint.diagnostics) {
    issues.push({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.timeMs !== undefined
        ? { timeMs: diagnostic.timeMs }
        : {}),
      ...(diagnostic.sceneId ? { sceneId: diagnostic.sceneId } : {}),
      ...(diagnostic.elementId ? { elementId: diagnostic.elementId } : {}),
      ...(diagnostic.fix ? { fix: diagnostic.fix } : {}),
    });
  }

  // Scene coverage.
  if (scenes.length > 0) {
    const last = scenes[scenes.length - 1];
    const covered = last.startMs + last.durationMs;
    if (covered < project.durationMs - 1) {
      issues.push({
        code: 'QA_SCENE_GAP',
        severity: 'warning',
        message: `${Math.round(project.durationMs - covered)}ms at the end of the canvas has no scene.`,
        fix: 'Extend the last scene or shorten the canvas so every frame belongs to a scene.',
      });
    }
    if (covered > project.durationMs + 1) {
      issues.push({
        code: 'QA_SCENE_OVERRUN',
        severity: 'warning',
        message: `Scenes run ${Math.round(covered - project.durationMs)}ms past the canvas duration.`,
        fix: 'Shorten the final scene or extend the canvas.',
      });
    }
  }

  // Narration readiness.
  const narrationLines = project.narration?.lines ?? [];
  const measuredNarrationLines = narrationLines.filter(
    (line) => typeof line.durationMs === 'number' && line.durationMs > 0,
  ).length;
  const unmeasured = narrationLines.length - measuredNarrationLines;
  if (unmeasured > 0) {
    issues.push({
      code: 'QA_NARRATION_UNMEASURED',
      severity: 'warning',
      message: `${unmeasured} narration line(s) have no measured voice duration.`,
      fix: 'Run generateNarrationVoice, then setNarration so picture follows the measured audio.',
    });
  }
  const missingAssets = narrationLines.filter(
    (line) =>
      typeof line.durationMs === 'number' &&
      line.durationMs > 0 &&
      !line.ttsAssetId,
  ).length;
  if (missingAssets > 0) {
    issues.push({
      code: 'QA_NARRATION_MISSING_ASSET',
      severity: 'warning',
      message: `${missingAssets} measured narration line(s) have no voice asset.`,
      fix: 'Regenerate the voice for those lines; exports will be silent without it.',
    });
  }

  // Open review notes are part of readiness, not validity.
  const unresolved = notes.filter((note) => !note.resolved);
  for (const note of unresolved) {
    issues.push({
      code: 'QA_REVIEW_NOTE_OPEN',
      severity: 'info',
      message: `Open review note at ${Math.round(note.timeMs)}ms: ${note.text}`,
      timeMs: note.timeMs,
      ...(note.sceneId ? { sceneId: note.sceneId } : {}),
      ...(note.elementId ? { elementId: note.elementId } : {}),
      fix: 'Address the note, then mark it resolved.',
    });
  }

  // Large text contrast against the scene background.
  let lowContrastTexts = 0;
  for (const element of elements) {
    if (element.type !== 'text') continue;
    const fontSize = Number(element.attributes?.fontSize ?? 24);
    if (fontSize < 40) continue;
    const fill = element.attributes?.fill;
    if (typeof fill !== 'string' || fill.startsWith('url(') || fill === 'none') {
      continue;
    }
    const scene = sceneForElement(project, element);
    const ratio = contrastRatio(fill, scene.background);
    if (ratio === null || ratio >= 3) continue;
    lowContrastTexts += 1;
    issues.push({
      code: 'QA_TEXT_CONTRAST',
      severity: 'warning',
      message: `"${element.name}" has ${ratio.toFixed(1)}:1 contrast against the scene background (needs 3:1 for large text).`,
      elementId: element.id,
      ...(scene.sceneId ? { sceneId: scene.sceneId } : {}),
      fix: 'Raise the text/background contrast, or put the text on a card with its own fill.',
    });
  }

  // Motion metrics (lint already emits the taste warnings).
  let trackCount = 0;
  let keyframeCount = 0;
  let motionTrackCount = 0;
  let linearMotionTracks = 0;
  for (const element of elements) {
    for (const track of element.tracks ?? []) {
      trackCount += 1;
      keyframeCount += track.keyframes?.length ?? 0;
      if (!MOTION_PROPERTIES.has(track.property)) continue;
      motionTrackCount += 1;
      if ((track.keyframes ?? []).some((keyframe) => keyframe.easing === 'linear')) {
        linearMotionTracks += 1;
      }
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter(
    (issue) => issue.severity === 'warning',
  ).length;
  const infoCount = issues.filter((issue) => issue.severity === 'info').length;

  issues.sort((a, b) => {
    const order: Record<QaSeverity, number> = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return {
    ok: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount,
    metrics: {
      durationMs: project.durationMs,
      sceneCount: scenes.length,
      elementCount: elements.length,
      trackCount,
      keyframeCount,
      motionTrackCount,
      linearMotionTracks,
      totalNotes: notes.length,
      unresolvedNotes: unresolved.length,
      totalNarrationLines: narrationLines.length,
      measuredNarrationLines,
      hasStyle: Boolean(project.style),
      hasCamera: Boolean(project.camera),
      lowContrastTexts,
    },
    frames: framesForProject(project),
  };
}