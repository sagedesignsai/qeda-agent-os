/**
 * components/soundlab/pianoroll/PianoRollCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas-based piano roll editor for melodic patterns. Features:
 *   - Vertical piano keyboard (MIDI C1–C7, 72 notes)
 *   - Horizontal beat grid with 1/4, 1/8, 1/16 snap modes
 *   - Click to add notes, drag body to move, drag right edge to resize
 *   - Delete key removes selected note
 *   - Velocity editor strip at the bottom
 *   - All mutations go through soundLabStore for undo/redo
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type MouseEvent,
} from 'react';
import { soundLabStore, useSoundLabState } from '@/hooks/use-soundlab-store';
import type { SoundLabTrack, SoundLabPattern, SoundLabNote } from '@/lib/soundlab-types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ── Layout constants ──────────────────────────────────────────────────────────

const PIANO_W = 52;        // Width of the keyboard strip
const NOTE_H  = 12;        // Height of one pitch row (px)
const VELOCITY_H = 48;     // Velocity editor height
const RULER_H = 20;        // Beat ruler height
const TOTAL_PITCHES = 72;  // C1 (24) → C7 (96)
const MIDI_MIN = 24;       // C1
const MIDI_MAX = 95;       // B6

// ── Pitch helpers ─────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
const noteName = (pitch: number) => `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;

function pitchToY(pitch: number): number {
  // pitch 95 (B6) → y=0, pitch 24 (C1) → y=max
  return (MIDI_MAX - pitch) * NOTE_H;
}

function yToPitch(y: number): number {
  return Math.round(MIDI_MAX - y / NOTE_H);
}

// ── Beat math ─────────────────────────────────────────────────────────────────

type Snap = '1/4' | '1/8' | '1/16';

function snapBeat(beat: number, snap: Snap): number {
  const div = snap === '1/4' ? 4 : snap === '1/8' ? 8 : 16;
  return Math.round(beat * div) / div;
}

function defaultDuration(snap: Snap): number {
  return snap === '1/4' ? 1 : snap === '1/8' ? 0.5 : 0.25;
}

// ── Draw helpers ──────────────────────────────────────────────────────────────

function drawPianoRoll(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pxPerBeat: number,
  scrollBeat: number,
  notes: SoundLabNote[],
  selectedNoteId: string | null,
  patternBeats: number,
) {
  ctx.clearRect(0, 0, w, h);

  // Background lanes
  for (let p = MIDI_MAX; p >= MIDI_MIN; p--) {
    const y = RULER_H + pitchToY(p);
    ctx.fillStyle = isBlack(p) ? '#131316' : '#1a1a1f';
    ctx.fillRect(PIANO_W, y, w - PIANO_W, NOTE_H);
    // Row divider
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(PIANO_W, y + NOTE_H - 1, w - PIANO_W, 1);
  }

  // Beat grid lines
  const visibleBeats = (w - PIANO_W) / pxPerBeat;
  const beatStart = Math.floor(scrollBeat);
  const beatEnd = Math.ceil(scrollBeat + visibleBeats);
  for (let b = beatStart; b <= beatEnd; b++) {
    const x = PIANO_W + (b - scrollBeat) * pxPerBeat;
    ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, RULER_H, 1, h - RULER_H - VELOCITY_H);
  }

  // Pattern length boundary
  const patternEndX = PIANO_W + (patternBeats - scrollBeat) * pxPerBeat;
  ctx.fillStyle = 'rgba(99,102,241,0.15)';
  ctx.fillRect(PIANO_W, RULER_H, Math.max(0, patternEndX - PIANO_W), h - RULER_H - VELOCITY_H);

  // Beat ruler
  ctx.fillStyle = '#111113';
  ctx.fillRect(PIANO_W, 0, w - PIANO_W, RULER_H);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  for (let b = beatStart; b <= beatEnd; b++) {
    const x = PIANO_W + (b - scrollBeat) * pxPerBeat;
    if (b % 4 === 0) ctx.fillText(`${b / 4 + 1}`, x + 2, 13);
  }

  // Note blocks
  for (const note of notes) {
    const x = PIANO_W + (note.startBeat - scrollBeat) * pxPerBeat;
    const y = RULER_H + pitchToY(note.pitch);
    const nw = Math.max(4, note.durationBeats * pxPerBeat - 1);
    const isSelected = note.id === selectedNoteId;

    ctx.fillStyle = isSelected ? '#818cf8' : '#6366f1';
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect?.(x, y + 1, nw, NOTE_H - 2, 2) ?? ctx.rect(x, y + 1, nw, NOTE_H - 2);
    ctx.fill();

    // Resize handle
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x + nw - 3, y + 2, 2, NOTE_H - 4);
  }

  // Piano keyboard
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, PIANO_W, h);
  for (let p = MIDI_MAX; p >= MIDI_MIN; p--) {
    const y = RULER_H + pitchToY(p);
    const black = isBlack(p);
    ctx.fillStyle = black ? '#222' : '#e8e8ec';
    ctx.fillRect(1, y + 1, PIANO_W - 4, NOTE_H - 2);
    if (!black && p % 12 === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(noteName(p), PIANO_W - 6, y + NOTE_H - 2);
    }
  }

  // Velocity strip background
  const velY = h - VELOCITY_H;
  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(0, velY, w, VELOCITY_H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, velY, w, 1);

  // Velocity bars
  for (const note of notes) {
    const x = PIANO_W + (note.startBeat - scrollBeat) * pxPerBeat;
    const barH = Math.round(note.velocity * (VELOCITY_H - 6));
    const isSelected = note.id === selectedNoteId;
    ctx.fillStyle = isSelected ? '#818cf8' : '#4f46e5';
    ctx.fillRect(x, velY + VELOCITY_H - barH - 3, Math.max(3, pxPerBeat * note.durationBeats - 2), barH);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PianoRollCanvasProps {
  track: SoundLabTrack | null;
  pattern: SoundLabPattern | null;
}

type DragMode = 'none' | 'move' | 'resize' | 'velocity';

interface DragState {
  mode: DragMode;
  noteId: string;
  startX: number;
  startY: number;
  origStartBeat: number;
  origDuration: number;
  origVelocity: number;
}

export function PianoRollCanvas({ track, pattern }: PianoRollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<Snap>('1/8');
  const [pxPerBeat] = useState(40);
  const [scrollBeat, setScrollBeat] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const { tracks } = useSoundLabState();

  const notes = pattern?.notes ?? [];
  const patternBeats = pattern?.lengthBeats ?? 8;
  const canvasH = RULER_H + TOTAL_PITCHES * NOTE_H + VELOCITY_H;

  // ── Draw ────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawPianoRoll(ctx, canvas.width, canvas.height, pxPerBeat, scrollBeat, notes, selectedNoteId, patternBeats);
  }, [notes, pxPerBeat, scrollBeat, selectedNoteId, patternBeats]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ── Hit-test helpers ─────────────────────────────────────────────────────

  const hitNote = useCallback((x: number, y: number): { note: SoundLabNote; resize: boolean } | null => {
    if (!pattern) return null;
    for (const note of [...notes].reverse()) {
      const nx = PIANO_W + (note.startBeat - scrollBeat) * pxPerBeat;
      const ny = RULER_H + pitchToY(note.pitch);
      const nw = Math.max(4, note.durationBeats * pxPerBeat - 1);
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + NOTE_H) {
        const resize = x >= nx + nw - 6;
        return { note, resize };
      }
    }
    return null;
  }, [notes, pxPerBeat, scrollBeat, pattern]);

  const hitVelocityBar = useCallback((x: number, y: number): SoundLabNote | null => {
    if (!pattern) return null;
    const velY = canvasH - VELOCITY_H;
    if (y < velY) return null;
    for (const note of notes) {
      const nx = PIANO_W + (note.startBeat - scrollBeat) * pxPerBeat;
      const nw = Math.max(3, note.durationBeats * pxPerBeat - 2);
      if (x >= nx && x <= nx + nw) return note;
    }
    return null;
  }, [notes, pxPerBeat, scrollBeat, pattern, canvasH]);

  // ── Mouse events ─────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    if (!track || !pattern) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Velocity strip drag
    const velNote = hitVelocityBar(x, y);
    if (velNote) {
      dragRef.current = {
        mode: 'velocity',
        noteId: velNote.id,
        startX: x,
        startY: y,
        origStartBeat: velNote.startBeat,
        origDuration: velNote.durationBeats,
        origVelocity: velNote.velocity,
      };
      return;
    }

    // Note hit
    const hit = hitNote(x, y);
    if (hit) {
      setSelectedNoteId(hit.note.id);
      dragRef.current = {
        mode: hit.resize ? 'resize' : 'move',
        noteId: hit.note.id,
        startX: x,
        startY: y,
        origStartBeat: hit.note.startBeat,
        origDuration: hit.note.durationBeats,
        origVelocity: hit.note.velocity,
      };
      return;
    }

    // Add note on empty space (not in velocity strip or piano keyboard)
    if (x > PIANO_W && y > RULER_H && y < canvasH - VELOCITY_H) {
      const beat = snapBeat(Math.max(0, (x - PIANO_W) / pxPerBeat + scrollBeat), snap);
      const pitch = Math.max(MIDI_MIN, Math.min(MIDI_MAX, yToPitch(y - RULER_H)));
      const dur = defaultDuration(snap);
      const note: SoundLabNote = {
        id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        pitch,
        startBeat: beat,
        durationBeats: dur,
        velocity: 0.8,
      };
      soundLabStore.addNote(track.id, pattern.id, note);
      setSelectedNoteId(note.id);
    }
  }, [track, pattern, hitNote, hitVelocityBar, pxPerBeat, scrollBeat, snap, canvasH]);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || !track || !pattern) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = (x - drag.startX) / pxPerBeat;
    const dy = y - drag.startY;

    if (drag.mode === 'move') {
      const newBeat = snapBeat(Math.max(0, drag.origStartBeat + dx), snap);
      const newPitch = Math.max(MIDI_MIN, Math.min(MIDI_MAX, yToPitch(drag.startY - RULER_H) - Math.round(dy / NOTE_H)));
      soundLabStore.updateNote(track.id, pattern.id, drag.noteId, { startBeat: newBeat, pitch: newPitch });
    } else if (drag.mode === 'resize') {
      const newDur = Math.max(defaultDuration(snap), snapBeat(drag.origDuration + dx, snap));
      soundLabStore.updateNote(track.id, pattern.id, drag.noteId, { durationBeats: newDur });
    } else if (drag.mode === 'velocity') {
      const velY = canvasH - VELOCITY_H;
      const fraction = Math.max(0, Math.min(1, (canvasH - 3 - y) / (VELOCITY_H - 6)));
      soundLabStore.updateNote(track.id, pattern.id, drag.noteId, { velocity: fraction });
    }
  }, [track, pattern, pxPerBeat, snap, canvasH]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ── Delete key ───────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Backspace' || e.code === 'Delete') && selectedNoteId && track && pattern) {
        e.preventDefault();
        soundLabStore.removeNote(track.id, pattern.id, selectedNoteId);
        setSelectedNoteId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedNoteId, track, pattern]);

  // ── Scroll ───────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    setScrollBeat((b) => Math.max(0, b + delta / pxPerBeat));
  }, [pxPerBeat]);

  // ── Canvas width ──────────────────────────────────────────────────────────

  const canvasW = Math.max(800, PIANO_W + patternBeats * pxPerBeat + 120);

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!track || !pattern) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select an instrument track and pattern to open the Piano Roll.
        </p>
      </div>
    );
  }

  const trackTypeOk = track.type === 'instrument';
  if (!trackTypeOk) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Piano Roll is for instrument tracks. Use Step Sequencer for drum tracks.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-card/40 px-3 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Piano Roll
        </span>
        <span className="text-[10px] text-muted-foreground/60">—</span>
        <span className="text-[10px] text-muted-foreground/80 font-mono">{pattern.name}</span>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground mr-1">Snap</span>
        <ToggleGroup
          type="single"
          value={snap}
          onValueChange={(v) => v && setSnap(v as Snap)}
          size="sm"
        >
          {(['1/4', '1/8', '1/16'] as Snap[]).map((s) => (
            <ToggleGroupItem key={s} value={s} className="h-5 px-1.5 text-[10px]">
              {s}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Canvas */}
      <ScrollArea className="flex-1">
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          className="block cursor-crosshair"
          style={{ height: canvasH }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
