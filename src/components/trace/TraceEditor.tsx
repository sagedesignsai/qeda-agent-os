/**
 * components/trace/TraceEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Nova Trace editor shell.
 *
 * Owns the wiring between the store and the playback engine:
 *  - `isPlaying` starts/stops the GSAP clock,
 *  - a document change invalidates the compiled clock and re-syncs the stage,
 *  - a committed playhead seeks the engine,
 *  - global shortcuts act on the current selection.
 *
 * Panels read the store directly, which keeps this file about composition
 * instead of prop plumbing.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronUpIcon,
  DownloadIcon,
  Loader2Icon,
  Redo2Icon,
  SaveIcon,
  Undo2Icon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TraceElementsTree } from '@/components/trace/TraceElementsTree';
import { TraceInspector } from '@/components/trace/TraceInspector';
import { TraceStage } from '@/components/trace/TraceStage';
import { TraceTimeline } from '@/components/trace/TraceTimeline';
import { ExportDialog } from '@/components/trace/dialogs/ExportDialog';
import {
  ensureTraceTimelineMatchesProject,
  invalidateTraceTimeline,
  resyncTraceStageAtCurrentTime,
  seekTracePlayback,
  startTracePlayback,
  stopTracePlayback,
} from '@/lib/trace/runtime/playback-driver';
import { getElementPosition, positionPatch } from '@/lib/trace/resolve';
import { useTraceStore } from '@/stores/trace-store';

export type TraceEditorProps = {
  onSave: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}

export function TraceEditor({ onSave }: TraceEditorProps) {
  const navigate = useNavigate();
  const project = useTraceStore((state) => state.project);
  const dirty = useTraceStore((state) => state.dirty);
  const saveState = useTraceStore((state) => state.saveState);
  const saveError = useTraceStore((state) => state.saveError);
  const playback = useTraceStore((state) => state.playback);
  const selection = useTraceStore((state) => state.selection);
  const canUndo = useTraceStore((state) => state.canUndo);
  const canRedo = useTraceStore((state) => state.canRedo);

  const undo = useTraceStore((state) => state.undo);
  const redo = useTraceStore((state) => state.redo);
  const dispatch = useTraceStore((state) => state.dispatch);
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  const selectElement = useTraceStore((state) => state.selectElement);
  const togglePlay = useTraceStore((state) => state.togglePlay);
  const setLooping = useTraceStore((state) => state.setLooping);
  const setAutoKeyframe = useTraceStore((state) => state.setAutoKeyframe);
  const setTimelineCollapsed = useTraceStore(
    (state) => state.setTimelineCollapsed,
  );
  const setPlayhead = useTraceStore((state) => state.setPlayhead);

  const [exportOpen, setExportOpen] = useState(false);

  // ── Playback engine wiring ────────────────────────────────────────────────
  useEffect(() => {
    if (!project) return;
    ensureTraceTimelineMatchesProject(project);
    invalidateTraceTimeline();
    resyncTraceStageAtCurrentTime();
    // Recompiling kills the clock, so resume immediately if the edit landed
    // during playback.
    if (useTraceStore.getState().playback.isPlaying) startTracePlayback();
  }, [project]);

  useEffect(() => {
    if (playback.isPlaying) startTracePlayback();
    else stopTracePlayback();
  }, [playback.isPlaying]);

  useEffect(() => {
    seekTracePlayback(playback.currentTimeMs, { commit: false });
  }, [playback.currentTimeMs]);

  useEffect(
    () => () => {
      stopTracePlayback({ commit: false });
      invalidateTraceTimeline();
    },
    [],
  );

  const nudge = useCallback(
    (deltaX: number, deltaY: number) => {
      const elementId = useTraceStore.getState().selection.selectedElementId;
      const state = useTraceStore.getState();
      const element = elementId ? state.project?.elements[elementId] : null;
      if (!element) return;
      const position = getElementPosition(
        element,
        state.playback.currentTimeMs,
      );
      updateAttributes(
        element.id,
        positionPatch(
          element,
          {
            x: Math.round(position.x + deltaX),
            y: Math.round(position.y + deltaY),
          },
          state.playback.currentTimeMs,
        ),
      );
    },
    [updateAttributes],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.code === 'KeyS') {
        event.preventDefault();
        onSave();
        return;
      }
      if (modifier && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && event.code === 'KeyD') {
        event.preventDefault();
        const elementId = useTraceStore.getState().selection.selectedElementId;
        if (elementId) {
          dispatch([
            {
              type: 'duplicateElement',
              id: elementId,
              offset: { x: 20, y: 20 },
            },
          ]);
        }
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const state = useTraceStore.getState();
        const selectedKeyframes = state.selection.selectedKeyframeIds;
        if (selectedKeyframes.length > 0) {
          event.preventDefault();
          for (const key of selectedKeyframes) {
            const [elementId, , keyframeId] = key.split(':');
            const element = state.project?.elements[elementId];
            const track = element?.tracks.find((entry) =>
              entry.keyframes.some((keyframe) => keyframe.id === keyframeId),
            );
            if (element && track) {
              state.deleteKeyframe(element.id, track.property, keyframeId);
            }
          }
          return;
        }
        const elementId = state.selection.selectedElementId;
        if (elementId) {
          event.preventDefault();
          dispatch([{ type: 'deleteElement', id: elementId }]);
        }
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const state = useTraceStore.getState();
        if (state.selection.selectedElementId) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          nudge(event.key === 'ArrowLeft' ? -step : step, 0);
        } else {
          event.preventDefault();
          const frame = 1000 / Math.max(1, state.project?.fps ?? 60);
          setPlayhead(
            state.playback.currentTimeMs +
              (event.key === 'ArrowLeft' ? -frame : frame),
          );
        }
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const state = useTraceStore.getState();
        if (!state.selection.selectedElementId) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        nudge(0, event.key === 'ArrowUp' ? -step : step);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, nudge, onSave, redo, setPlayhead, togglePlay, undo]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-[#070b14] text-sm text-slate-500">
        No Trace project is open.
      </div>
    );
  }

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Save failed'
        : dirty
          ? 'Unsaved'
          : 'Saved';

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#070b14] text-slate-200">
      <header className="flex items-center gap-2 border-b border-white/10 bg-[#080e1a] px-2 py-1.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={() => navigate('/trace')}
          aria-label="Back to Trace projects"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-100">
            {project.name}
          </p>
          <p className="font-mono text-[9px] text-slate-500">
            {project.width}×{project.height} ·{' '}
            {(project.durationMs / 1000).toFixed(1)}s · {project.fps}fps
          </p>
        </div>

        <div
          className={
            'ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ' +
            (saveState === 'error'
              ? 'bg-rose-500/15 text-rose-300'
              : dirty
                ? 'bg-amber-500/10 text-amber-300'
                : 'bg-emerald-500/10 text-emerald-300')
          }
        >
          {saveState === 'saving' ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <CheckIcon className="size-3" />
          )}
          {saveLabel}
        </div>

        <div className="ml-2 flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
          >
            <Undo2Icon className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
          >
            <Redo2Icon className="size-3.5" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              'h-7 px-2 text-[10px] ' +
              (playback.autoKeyframe
                ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200'
                : 'text-slate-400 hover:bg-white/10 hover:text-white')
            }
            onClick={() => setAutoKeyframe(!playback.autoKeyframe)}
            title="Automatically add keyframes to animated properties"
          >
            Auto-K
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              'h-7 px-2 text-[10px] ' +
              (playback.isLooping
                ? 'text-sky-300 hover:bg-white/10'
                : 'text-slate-400 hover:bg-white/10')
            }
            onClick={() => setLooping(!playback.isLooping)}
          >
            Loop
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-white/10 bg-white/5 text-[10px] text-slate-200 hover:bg-white/10"
            onClick={() => setExportOpen(true)}
          >
            <DownloadIcon className="size-3.5" />
            Export
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 bg-sky-500 px-2.5 text-[10px] font-medium text-slate-950 hover:bg-sky-400"
            onClick={onSave}
            disabled={saveState === 'saving'}
          >
            <SaveIcon className="size-3.5" />
            Save
          </Button>
          <Badge
            variant="outline"
            className="ml-1 hidden border-white/10 text-[9px] text-slate-500 md:inline-flex"
          >
            {Object.keys(project.elements).length} layers
          </Badge>
        </div>
      </header>

      {saveError ? (
        <p
          role="alert"
          className="border-b border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[10px] text-rose-300"
        >
          {saveError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <TraceElementsTree />
        <TraceStage
          project={project}
          timeMs={playback.currentTimeMs}
          selectedElementId={selection.selectedElementId}
          onSelectElement={selectElement}
          onMoveElement={(elementId, position) => {
            const state = useTraceStore.getState();
            const element = state.project?.elements[elementId];
            if (!element) return;
            updateAttributes(
              elementId,
              positionPatch(element, position, state.playback.currentTimeMs),
            );
          }}
          isPlaying={playback.isPlaying}
        />
        <TraceInspector />
      </div>

      {playback.isTimelineCollapsed ? (
        <div className="flex items-center justify-between border-t border-white/10 bg-[#080e1a] px-3 py-1">
          <span className="font-mono text-[10px] text-slate-500">
            Timeline collapsed · {Math.round(playback.currentTimeMs)}ms
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10px] text-slate-300 hover:bg-white/10"
            onClick={() => setTimelineCollapsed(false)}
          >
            <ChevronUpIcon className="size-3" />
            Show timeline
          </Button>
        </div>
      ) : (
        <div className="h-[246px] shrink-0">
          <TraceTimeline />
        </div>
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}
