/**
 * components/soundlab/timeline/SoundLabTimelineCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas-based arrangement timeline. Draws track lanes, clip blocks, ruler,
 * and the 60fps playhead without triggering React re-renders during playback
 * (subscribeTime bypasses the React tree entirely).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { soundLabStore, useSoundLabState, useSoundLabTracks } from '@/hooks/use-soundlab-store';
import type { SoundLabTrack, SoundLabClip } from '@/lib/soundlab-types';
import { BRAINWAVE_BAND_META } from '@/lib/soundlab-types';

const RULER_H = 24;
const LANE_H  = 44;
const SNAP_SUBDIVISIONS = 4; // snap to quarter-beat

// ── Coordinate helpers ────────────────────────────────────────────────────────

function beatToPx(beat: number, pxPerBeat: number, scrollBeat: number): number {
  return (beat - scrollBeat) * pxPerBeat;
}

function pxToBeat(px: number, pxPerBeat: number, scrollBeat: number): number {
  return px / pxPerBeat + scrollBeat;
}

function snapBeat(beat: number): number {
  return Math.round(beat * SNAP_SUBDIVISIONS) / SNAP_SUBDIVISIONS;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Canvas draw ───────────────────────────────────────────────────────────────

function drawFrame(
  ctx2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  tracks: SoundLabTrack[],
  durationBeats: number,
  pxPerBeat: number,
  scrollBeat: number,
  playheadBeat: number,
  selectedClipId: string | null,
  theme: { bg: string; border: string; text: string; ruler: string },
) {
  ctx2d.clearRect(0, 0, w, h);

  // Background
  ctx2d.fillStyle = theme.bg;
  ctx2d.fillRect(0, 0, w, h);

  // Ruler background
  ctx2d.fillStyle = theme.ruler;
  ctx2d.fillRect(0, 0, w, RULER_H);

  // Beat / bar grid lines + ruler labels
  const totalBeats = durationBeats;
  const startBeat = Math.floor(scrollBeat);
  const endBeat   = Math.ceil(pxToBeat(w, pxPerBeat, scrollBeat));

  ctx2d.font = '9px monospace';
  ctx2d.textBaseline = 'middle';

  for (let b = startBeat; b <= endBeat; b++) {
    const x = beatToPx(b, pxPerBeat, scrollBeat);
    const isBar = b % 4 === 0;

    ctx2d.strokeStyle = isBar ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx2d.lineWidth = isBar ? 1 : 0.5;
    ctx2d.beginPath();
    ctx2d.moveTo(x, RULER_H);
    ctx2d.lineTo(x, h);
    ctx2d.stroke();

    if (isBar) {
      ctx2d.fillStyle = 'rgba(255,255,255,0.35)';
      ctx2d.fillText(`${b / 4 + 1}`, x + 3, RULER_H / 2);
    }
  }

  // Track lanes + clips
  tracks.forEach((track, ti) => {
    const y = RULER_H + ti * LANE_H;

    // Lane bg
    ctx2d.fillStyle = ti % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.04)';
    ctx2d.fillRect(0, y, w, LANE_H);

    // Lane bottom border
    ctx2d.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, y + LANE_H);
    ctx2d.lineTo(w, y + LANE_H);
    ctx2d.stroke();

    // Clips
    for (const clip of track.clips) {
      const cx = beatToPx(clip.startBeat, pxPerBeat, scrollBeat);
      const cw = clip.durationBeats * pxPerBeat;
      if (cx + cw < 0 || cx > w) continue;

      const isSelected = clip.id === selectedClipId;
      const color = track.color ?? '#6366f1';

      // Clip body
      ctx2d.fillStyle = hexToRgba(color, isSelected ? 0.55 : 0.35);
      ctx2d.beginPath();
      (ctx2d as CanvasRenderingContext2D & { roundRect?: (...a: unknown[]) => void }).roundRect?.(cx, y + 3, Math.max(4, cw - 1), LANE_H - 6, 4) ?? ctx2d.rect(cx, y + 3, Math.max(4, cw - 1), LANE_H - 6);
      ctx2d.fill();

      // Clip border
      ctx2d.strokeStyle = hexToRgba(color, isSelected ? 0.9 : 0.6);
      ctx2d.lineWidth = isSelected ? 1.5 : 1;
      ctx2d.stroke();

      // Clip name label
      if (cw > 28) {
        const pattern = track.patterns.find((p) => p.id === clip.patternId);
        if (pattern) {
          ctx2d.fillStyle = 'rgba(255,255,255,0.8)';
          ctx2d.font = '9px sans-serif';
          ctx2d.fillText(pattern.name, cx + 5, y + LANE_H / 2 + 1, cw - 10);
        }
      }
    }
  });

  // Playhead
  const px = beatToPx(playheadBeat, pxPerBeat, scrollBeat);
  if (px >= 0 && px <= w) {
    ctx2d.strokeStyle = '#ef4444';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(px, 0);
    ctx2d.lineTo(px, h);
    ctx2d.stroke();

    // Playhead triangle
    ctx2d.fillStyle = '#ef4444';
    ctx2d.beginPath();
    ctx2d.moveTo(px - 5, 0);
    ctx2d.lineTo(px + 5, 0);
    ctx2d.lineTo(px, 8);
    ctx2d.fill();
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SoundLabTimelineCanvasProps {
  pxPerBeat: number;
  scrollBeat: number;
  onScrollBeatChange: (beat: number) => void;
}

export function SoundLabTimelineCanvas({
  pxPerBeat,
  scrollBeat,
  onScrollBeatChange,
}: SoundLabTimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const tracksRef = useRef<SoundLabTrack[]>([]);
  const stateRef = useRef(soundLabStore.getState());

  const tracks = useSoundLabTracks();
  const { selectedClipId, session } = useSoundLabState();
  const totalBeats = session?.durationBeats ?? 128;

  tracksRef.current = tracks;
  stateRef.current = soundLabStore.getState();

  // Canvas height = ruler + one lane per track
  const canvasH = RULER_H + Math.max(tracks.length, 4) * LANE_H;

  // ── RAF draw loop ─────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const w = canvas.width;
    const h = canvas.height;

    drawFrame(
      ctx2d, w, h,
      tracksRef.current,
      totalBeats,
      pxPerBeat,
      scrollBeat,
      playheadRef.current,
      stateRef.current.selectedClipId,
      {
        bg: '#09090b',
        border: 'rgba(255,255,255,0.06)',
        text: 'rgba(255,255,255,0.6)',
        ruler: '#111113',
      },
    );
  }, [pxPerBeat, scrollBeat, totalBeats]);

  // Subscribe to high-frequency playhead updates
  useEffect(() => {
    return soundLabStore.subscribeTime((beat) => {
      playheadRef.current = beat;
    });
  }, []);

  // RAF loop
  useEffect(() => {
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // ── Interaction: click to place / select clip ─────────────────────────────

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const clickBeat = snapBeat(pxToBeat(x, pxPerBeat, scrollBeat));
      const trackIdx = Math.floor((y - RULER_H) / LANE_H);
      if (trackIdx < 0 || trackIdx >= tracksRef.current.length) return;

      const track = tracksRef.current[trackIdx];
      if (!track) return;

      // Check if we clicked an existing clip
      const hit = track.clips.find(
        (c) => clickBeat >= c.startBeat && clickBeat <= c.startBeat + c.durationBeats,
      );

      if (hit) {
        soundLabStore.setSelectedTrack(track.id);
        soundLabStore.setSelectedClip(hit.id);
        soundLabStore.setSelectedPattern(hit.patternId);
        return;
      }

      // Place selected pattern as new clip
      const state = soundLabStore.getState();
      const selectedPattern = (() => {
        for (const t of tracksRef.current) {
          const p = t.patterns.find((p) => p.id === state.selectedPatternId);
          if (p && t.id === track.id) return p;
        }
        return track.patterns[0] ?? null;
      })();

      if (selectedPattern) {
        const newClip: SoundLabClip = {
          id: `clip-${Date.now().toString(36)}`,
          trackId: track.id,
          patternId: selectedPattern.id,
          startBeat: Math.max(0, clickBeat),
          durationBeats: selectedPattern.lengthBeats,
        };
        soundLabStore.addClip(track.id, newClip);
      }
    },
    [pxPerBeat, scrollBeat],
  );

  // ── Scroll ────────────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      const newScroll = Math.max(0, scrollBeat + delta / pxPerBeat);
      onScrollBeatChange(Math.min(newScroll, totalBeats - 1));
    },
    [pxPerBeat, scrollBeat, totalBeats, onScrollBeatChange],
  );

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={canvasH}
      className="w-full cursor-crosshair"
      style={{ height: canvasH, display: 'block' }}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
}
