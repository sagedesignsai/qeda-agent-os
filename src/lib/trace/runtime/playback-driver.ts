/**
 * lib/trace/runtime/playback-driver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Nova Trace playback engine.
 *
 * Responsibilities:
 *  - own the compiled GSAP timeline clock,
 *  - drive the direct DOM renderer at display refresh rate,
 *  - update the playhead / timecode / mini progress without React renders,
 *  - commit the authoritative playhead to the store only when playback pauses.
 *
 * A RAF fallback covers the window before the stage SVG mounts, and any host
 * (e.g. the public player) that has no GSAP timeline yet.
 *
 * Adapted from sagedesigns-os lib/motion/runtime/playback-driver.ts.
 */

import { gsap } from 'gsap';

import type { TraceProject } from '../types';
import { getTraceRuntimeBridge, requireTraceRuntimeBridge } from './bridge';
import { syncTraceDomAtTime } from './dom-renderer';
import { compileProjectToGsap } from './gsap-compiler';

let activeTimeline: gsap.core.Timeline | null = null;
let animationFrameId: number | null = null;
let lastTimestamp = 0;
let currentPlaybackTimeMs = 0;
let compiledForDuration = -1;

export function hasCompiledTraceTimeline(): boolean {
  return activeTimeline !== null;
}

export function getPlaybackTimeMs(): number {
  return currentPlaybackTimeMs;
}

function activeProject(): TraceProject | null {
  return getTraceRuntimeBridge()?.getProject() ?? null;
}

export function getOrCompileTraceTimeline(): gsap.core.Timeline | null {
  if (typeof window === 'undefined') return null;
  const project = activeProject();
  if (!project) return null;

  if (activeTimeline) return activeTimeline;

  const compiled = compileProjectToGsap(project, {
    autoPlay: false,
    loop: false,
    onUpdate: (_progress, timeMs) => {
      currentPlaybackTimeMs = timeMs;
      syncTraceDomAtTime(timeMs, activeProject());
    },
    onComplete: () => {
      const bridge = getTraceRuntimeBridge();
      if (!bridge) return;
      if (bridge.getPlayback().isLooping) {
        activeTimeline?.time(0);
        activeTimeline?.play();
        return;
      }
      stopTracePlayback({ commit: false });
      bridge.setPlaying(false);
      bridge.commitTime(project.durationMs);
      seekTracePlayback(project.durationMs, { commit: false });
    },
    onReverseComplete: () => {
      const bridge = getTraceRuntimeBridge();
      if (!bridge) return;
      if (bridge.getPlayback().isLooping) {
        activeTimeline?.time(project.durationMs / 1000);
        activeTimeline?.reverse();
        return;
      }
      stopTracePlayback({ commit: false });
      bridge.setPlaying(false);
      bridge.commitTime(0);
      seekTracePlayback(0, { commit: false });
    },
  });

  activeTimeline = compiled.timeline;
  activeTimeline.repeat(0);
  compiledForDuration = project.durationMs;
  return activeTimeline;
}

/** Invalidate the compiled clock after a document mutation. */
export function invalidateTraceTimeline(): void {
  if (activeTimeline) {
    activeTimeline.kill();
    activeTimeline = null;
    compiledForDuration = -1;
  }
  if (animationFrameId !== null && typeof window !== 'undefined') {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  lastTimestamp = 0;
}

function tickFallback(timestamp: number): void {
  const bridge = getTraceRuntimeBridge();
  if (!bridge) return;

  const project = activeProject();
  const playback = bridge.getPlayback();
  if (!project || !playback.isPlaying) {
    animationFrameId = null;
    lastTimestamp = 0;
    return;
  }

  if (!lastTimestamp) lastTimestamp = timestamp;
  const delta = (timestamp - lastTimestamp) * (playback.playbackSpeed || 1);
  lastTimestamp = timestamp;

  const duration = project.durationMs;
  const reverse = playback.playbackDirection === 'reverse';

  currentPlaybackTimeMs += reverse ? -delta : delta;
  if (currentPlaybackTimeMs >= duration) {
    if (playback.isLooping) {
      currentPlaybackTimeMs %= duration;
    } else {
      currentPlaybackTimeMs = duration;
      bridge.setPlaying(false);
      bridge.commitTime(duration);
      syncTraceDomAtTime(duration, project);
      animationFrameId = null;
      lastTimestamp = 0;
      return;
    }
  } else if (currentPlaybackTimeMs <= 0) {
    if (playback.isLooping) {
      currentPlaybackTimeMs = duration;
    } else {
      currentPlaybackTimeMs = 0;
      bridge.setPlaying(false);
      bridge.commitTime(0);
      syncTraceDomAtTime(0, project);
      animationFrameId = null;
      lastTimestamp = 0;
      return;
    }
  }

  syncTraceDomAtTime(currentPlaybackTimeMs, project);
  animationFrameId = requestAnimationFrame(tickFallback);
}

export function startTracePlayback(): void {
  const bridge = requireTraceRuntimeBridge();
  const project = bridge.getProject();
  if (!project) return;

  const playback = bridge.getPlayback();
  let startTime = playback.currentTimeMs;

  if (playback.playbackDirection === 'reverse') {
    if (startTime <= 0) startTime = project.durationMs;
  } else if (startTime >= project.durationMs) {
    startTime = 0;
  }
  currentPlaybackTimeMs = startTime;

  const timeline = getOrCompileTraceTimeline();
  if (timeline) {
    timeline.repeat(playback.isLooping ? -1 : 0);
    timeline.timeScale(playback.playbackSpeed || 1);
    timeline.time(startTime / 1000);
    if (playback.playbackDirection === 'reverse') timeline.reverse();
    else timeline.play();

    syncTraceDomAtTime(startTime, project);
    return;
  }

  if (animationFrameId !== null) return;
  lastTimestamp = 0;
  animationFrameId = requestAnimationFrame(tickFallback);
}

export function stopTracePlayback(options: { commit?: boolean } = {}): void {
  const commit = options.commit !== false;

  if (activeTimeline) {
    activeTimeline.pause();
    currentPlaybackTimeMs = activeTimeline.time() * 1000;
  }

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  lastTimestamp = 0;

  if (commit) {
    const bridge = getTraceRuntimeBridge();
    bridge?.commitTime(currentPlaybackTimeMs);
    syncTraceDomAtTime(currentPlaybackTimeMs, bridge?.getProject() ?? null);
  }
}

/** Seek the clock, the stage DOM and the transport UI. */
export function seekTracePlayback(
  timeMs: number,
  options: { commit?: boolean } = {},
): void {
  const bridge = getTraceRuntimeBridge();
  const project = bridge?.getProject() ?? null;
  const duration = project?.durationMs ?? 0;
  const target = Math.min(
    Math.max(0, Number.isFinite(timeMs) ? timeMs : 0),
    duration,
  );

  currentPlaybackTimeMs = target;

  const timeline = getOrCompileTraceTimeline();
  if (timeline) timeline.time(target / 1000);

  syncTraceDomAtTime(target, project);
  if (options.commit) bridge?.commitTime(target);
}

export function setTracePlaybackSpeed(speed: number): void {
  activeTimeline?.timeScale(speed);
}

export function setTracePlaybackLoop(loop: boolean): void {
  activeTimeline?.repeat(loop ? -1 : 0);
}

/**
 * Keeps the compiled clock honest when the document's duration changes while a
 * timeline is already compiled for another length.
 */
export function ensureTraceTimelineMatchesProject(
  project: TraceProject | null,
): void {
  if (!project) return;
  if (activeTimeline && compiledForDuration !== project.durationMs)
    invalidateTraceTimeline();
}

/** Re-sync the SVG after a React render at a committed playhead. */
export function resyncTraceStageAtCurrentTime(): void {
  const bridge = getTraceRuntimeBridge();
  const project = bridge?.getProject() ?? null;
  const time = bridge?.getPlayback().currentTimeMs ?? 0;
  currentPlaybackTimeMs = time;
  syncTraceDomAtTime(time, project);
}
