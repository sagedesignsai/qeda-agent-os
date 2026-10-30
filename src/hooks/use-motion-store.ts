/**
 * hooks/use-motion-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor state for Motion: the document, the selection, the viewport, and the
 * op history. Structural changes notify React; the playhead does not — it lives
 * on the clock and is painted by the canvas, so playback causes zero renders.
 *
 * Undo is a stack of whole documents, not inverse ops. Documents are small,
 * immutable and structurally shared, and an op log that can be replayed is the
 * agent-facing contract — the undo stack is a UI convenience on top of it.
 */

import { useSyncExternalStore } from 'react';

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { applyMotionOps, batchRisk, type MotionOpRequest } from '@/lib/motion/ops';
import type { MotionDocument, MotionSelection } from '@/lib/motion/types';
import { PlaybackClock } from '@/lib/timeline/clock';
import type { TimelineView } from '@/lib/timeline/types';

const HISTORY_LIMIT = 200;

export type MotionPendingApproval = {
  label: string;
  ops: MotionOpRequest[];
};

export type MotionSnapshot = {
  doc: MotionDocument;
  selection: MotionSelection;
  view: TimelineView;
  canUndo: boolean;
  canRedo: boolean;
  pendingApproval: MotionPendingApproval | null;
};

export type MotionCommitOptions = { approved?: boolean };

export type MotionCommitResult = {
  status: 'applied' | 'unchanged' | 'pending' | 'rejected';
  document: MotionDocument;
  error?: Error;
};

export class MotionStore {
  private doc: MotionDocument;
  private selection: MotionSelection = null;
  private view: TimelineView = { pxPerSecond: 90, scrollSeconds: 0 };
  private past: MotionDocument[] = [];
  private future: MotionDocument[] = [];
  private pendingApproval: MotionPendingApproval | null = null;
  private listeners = new Set<() => void>();
  private snapshot: MotionSnapshot;

  readonly clock: PlaybackClock;

  constructor(doc: MotionDocument = createStarterMotionDocument()) {
    this.doc = doc;
    this.clock = new PlaybackClock({
      duration: () => this.doc.timeline.duration,
      loopRange: () =>
        this.doc.timeline.loop.enabled
          ? { start: this.doc.timeline.loop.start, end: this.doc.timeline.loop.end }
          : null,
    });
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): MotionSnapshot => this.snapshot;

  getDocument(): MotionDocument {
    return this.doc;
  }

  seek(time: number): void {
    this.clock.seek(time);
  }

  play(): void {
    this.clock.play();
  }

  pause(): void {
    this.clock.pause();
  }

  togglePlay(): void {
    this.clock.toggle();
  }

  setSelection(selection: MotionSelection): void {
    if (sameSelection(this.selection, selection)) return;
    this.selection = selection;
    this.emit();
  }

  setView(view: TimelineView): void {
    if (view.pxPerSecond === this.view.pxPerSecond && view.scrollSeconds === this.view.scrollSeconds) {
      return;
    }
    this.view = view;
    this.emit();
  }

  /**
   * Apply ops. Destructive batches are held for approval instead of applied —
   * the return value says whether the document changed.
   */
  commit(label: string, ops: MotionOpRequest[], options: MotionCommitOptions = {}): MotionCommitResult {
    if (ops.length === 0) return { status: 'unchanged', document: this.doc };

    let risk: ReturnType<typeof batchRisk>;
    try {
      risk = batchRisk(ops);
    } catch (error) {
      return { status: 'rejected', document: this.doc, error: error instanceof Error ? error : new Error(String(error)) };
    }
    if (risk === 'destructive' && !options.approved) {
      this.pendingApproval = { label, ops };
      this.emit();
      return { status: 'pending', document: this.doc };
    }

    let next: MotionDocument;
    try {
      next = applyMotionOps(this.doc, ops, { now: new Date().toISOString() });
    } catch (error) {
      return { status: 'rejected', document: this.doc, error: error instanceof Error ? error : new Error(String(error)) };
    }
    if (next === this.doc) {
      this.pendingApproval = null;
      this.emit();
      return { status: 'unchanged', document: this.doc };
    }
    this.past = [...this.past.slice(-(HISTORY_LIMIT - 1)), this.doc];
    this.future = [];
    this.doc = next;
    this.pendingApproval = null;
    this.clampPlayhead();
    this.emit();
    return { status: 'applied', document: this.doc };
  }

  confirmPending(): MotionCommitResult | undefined {
    const pending = this.pendingApproval;
    if (!pending) return undefined;
    this.pendingApproval = null;
    const result = this.commit(pending.label, pending.ops, { approved: true });
    if (result.status === 'rejected') this.pendingApproval = pending;
    this.emit();
    return result;
  }

  cancelPending(): void {
    if (!this.pendingApproval) return;
    this.pendingApproval = null;
    this.emit();
  }

  undo(): void {
    const previous = this.past[this.past.length - 1];
    if (!previous) return;
    this.future = [this.doc, ...this.future].slice(0, HISTORY_LIMIT);
    this.past = this.past.slice(0, -1);
    this.doc = { ...previous, revision: this.doc.revision + 1 };
    this.clampPlayhead();
    this.emit();
  }

  redo(): void {
    const next = this.future[0];
    if (!next) return;
    this.past = [...this.past.slice(-(HISTORY_LIMIT - 1)), this.doc];
    this.future = this.future.slice(1);
    this.doc = { ...next, revision: this.doc.revision + 1 };
    this.clampPlayhead();
    this.emit();
  }

  /** Replace the document wholesale (project open). Resets history. */
  loadDocument(doc: MotionDocument): void {
    this.doc = doc;
    this.past = [];
    this.future = [];
    this.selection = null;
    this.pendingApproval = null;
    this.clock.pause();
    this.clock.seek(0);
    this.emit();
  }

  dispose(): void {
    this.clock.dispose();
    this.listeners.clear();
  }

  private clampPlayhead(): void {
    const duration = this.doc.timeline.duration;
    if (this.clock.getTime() > duration) this.clock.seek(duration);
  }

  private buildSnapshot(): MotionSnapshot {
    return {
      doc: this.doc,
      selection: this.selection,
      view: this.view,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      pendingApproval: this.pendingApproval,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
}

function sameSelection(a: MotionSelection, b: MotionSelection): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'node' && b.kind === 'node') return a.nodeId === b.nodeId;
  if (a.kind === 'track' && b.kind === 'track') return a.trackId === b.trackId;
  if (a.kind === 'placement' && b.kind === 'placement') {
    return a.placementId === b.placementId && a.trackId === b.trackId;
  }
  if (a.kind === 'keyframe' && b.kind === 'keyframe') {
    return a.keyframeId === b.keyframeId && a.placementId === b.placementId;
  }
  return false;
}

export const motionStore = new MotionStore();

export function useMotionSnapshot(): MotionSnapshot {
  return useSyncExternalStore(motionStore.subscribe, motionStore.getSnapshot, motionStore.getSnapshot);
}
