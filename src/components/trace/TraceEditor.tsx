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

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronUpIcon,
  DownloadIcon,
  FolderSearchIcon,
  Loader2Icon,
  Redo2Icon,
  SaveIcon,
  SparklesIcon,
  Undo2Icon,
  UploadIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProjectFileBrowserDialog } from '@/components/projects/ProjectFileBrowserDialog';
import { TraceElementsTree } from '@/components/trace/TraceElementsTree';
import { TraceInspector } from '@/components/trace/TraceInspector';
import { TraceStage } from '@/components/trace/TraceStage';
import { TraceTimeline } from '@/components/trace/TraceTimeline';
import { ExportDialog } from '@/components/trace/dialogs/ExportDialog';
import { TraceCopilotSheet } from '@/components/trace/copilot';
import {
  ensureTraceTimelineMatchesProject,
  invalidateTraceTimeline,
  resyncTraceStageAtCurrentTime,
  seekTracePlayback,
  startTracePlayback,
  stopTracePlayback,
} from '@/lib/trace/runtime/playback-driver';
import { getElementPosition, positionPatch } from '@/lib/trace/resolve';
import { topmostSelectedIds } from '@/lib/trace/hierarchy';
import {
  groupSelectedElements,
  ungroupSelectedElements,
} from '@/components/trace/grouping';
import {
  serializePathData,
  serializePointsString,
} from '@/lib/trace/path/model';
import { useTraceStore } from '@/stores/trace-store';
import { parseSvgToFragment } from '@/lib/trace/parser';
import type {
  ProjectFileSelection,
  ProjectFileTextResult,
} from '@/lib/project-files';

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
  const { projectId } = useParams();
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
  const selectAllElements = useTraceStore((state) => state.selectAllElements);
  const togglePlay = useTraceStore((state) => state.togglePlay);
  const setLooping = useTraceStore((state) => state.setLooping);
  const setAutoKeyframe = useTraceStore((state) => state.setAutoKeyframe);
  const setTimelineCollapsed = useTraceStore(
    (state) => state.setTimelineCollapsed,
  );
  const setPlayhead = useTraceStore((state) => state.setPlayhead);
  const startPathEdit = useTraceStore((state) => state.startPathEdit);
  const endPathEdit = useTraceStore((state) => state.endPathEdit);

  const [exportOpen, setExportOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<
    string | null
  >(null);
  const [projectFilesOpen, setProjectFilesOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportSvg = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  /**
   * Parse SVG markup and insert it as one named layer.
   *
   * Shared by the OS file picker and the project file browser, so an SVG that
   * lives in the repo behaves exactly like one dragged in from the desktop.
   */
  const importSvgContent = useCallback(
    (content: string, fileName: string) => {
      try {
        const fragment = parseSvgToFragment(content);

        // Create a container group so the import appears as a single named
        // layer in the Scene Panel, matching the sagedesigns-os behavior.
        const layerName = fileName.replace(/\.svg$/i, '');
        const currentProject = useTraceStore.getState().project;
        const groupOriginX = Math.round(
          (fragment.width || currentProject?.width || 800) / 2,
        );
        const groupOriginY = Math.round(
          (fragment.height || currentProject?.height || 600) / 2,
        );
        const groupId = `group-svg-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 6)}`;

        const ops: any[] = [
          {
            type: 'addElement',
            element: {
              id: groupId,
              type: 'group',
              name: layerName,
              x: groupOriginX,
              y: groupOriginY,
            },
          },
          {
            type: 'insertFragment',
            fragment,
            name: layerName,
            groupId,
          },
        ];

        // Merge imported defs (gradients, filters, etc.) into the project
        if (fragment.defs && fragment.defs.trim()) {
          const currentDefs = currentProject?.defs ?? '';
          const merged = currentDefs
            ? currentDefs + '\n' + fragment.defs.trim()
            : fragment.defs.trim();
          ops.push({ type: 'setDefs', defs: merged });
        }

        const result = dispatch(ops);

        if (result && result.diff.added.length > 0) {
          useTraceStore.getState().selectElement(groupId);
        }
      } catch (err: any) {
        console.error('Failed to import SVG:', err);
        alert(`Failed to import SVG: ${err.message}`);
      }
    },
    [dispatch],
  );

  const handleImportFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) importSvgContent(content, file.name);
      };
      reader.readAsText(file);
      // Reset input so the same file can be imported again
      e.target.value = '';
    },
    [importSvgContent],
  );

  /**
   * Import an SVG chosen from the project's browsable files.
   *
   * The catalog id is resolved in main by `project-files:read-text`, so the
   * renderer never needs the absolute path.
   */
  const handleProjectFileImport = useCallback(
    async (files: ProjectFileSelection[]) => {
      const file = files[0];
      if (!file) return;
      try {
        const result = await window.electron.ipc.invoke<ProjectFileTextResult>(
          'project-files:read-text',
          { projectId: file.projectId, fileId: file.id },
        );
        importSvgContent(result.text, file.name);
      } catch (err) {
        console.error('Failed to read project SVG:', err);
        alert(
          `Failed to import SVG: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
    [importSvgContent],
  );

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

  const nudge = useCallback((deltaX: number, deltaY: number) => {
    const state = useTraceStore.getState();
    const ids =
      state.selection.selectedElementIds.length > 0
        ? state.selection.selectedElementIds
        : state.selection.selectedElementId
          ? [state.selection.selectedElementId]
          : [];
    if (ids.length === 0) return;

    const timeMs = state.playback.currentTimeMs;
    const entries: Array<{
      elementId: string;
      patch: Record<string, unknown>;
    }> = [];

    for (const elementId of ids) {
      const element = state.project?.elements[elementId];
      if (!element || element.locked) continue;
      const position = getElementPosition(element, timeMs);
      entries.push({
        elementId,
        patch: positionPatch(
          element,
          {
            x: Math.round(position.x + deltaX),
            y: Math.round(position.y + deltaY),
          },
          timeMs,
        ),
      });
    }

    if (entries.length > 0) {
      useTraceStore.getState().updateAttributesMany(entries);
    }
  }, []);

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
      if (modifier && event.code === 'KeyA') {
        event.preventDefault();
        selectAllElements();
        return;
      }
      if (modifier && event.code === 'KeyG') {
        event.preventDefault();
        if (event.shiftKey) ungroupSelectedElements();
        else groupSelectedElements();
        return;
      }
      if (modifier && event.code === 'KeyD') {
        event.preventDefault();
        const state = useTraceStore.getState();
        const project = state.project;
        if (!project) return;
        const ids = topmostSelectedIds(
          project,
          state.selection.selectedElementIds,
        );
        if (ids.length === 0) return;
        const result = dispatch(
          ids.map(
            (id) =>
              ({
                type: 'duplicateElement',
                id,
                offset: { x: 20, y: 20 },
              }) as const,
          ),
        );
        if (!result) return;
        const added = result.diff.added;
        const addedSet = new Set(added);
        // Duplicating a group also duplicates its subtree; select only the
        // copies that sit outside the copied set.
        const roots = added.filter((id) => {
          const parentId = result.project.elements[id]?.parentId ?? null;
          return !parentId || !addedSet.has(parentId);
        });
        if (roots.length > 0) {
          useTraceStore.getState().selectElements(roots);
        }
        return;
      }
      // While a path is being edited, the path editor owns Delete/arrow
      // keys (anchor delete/nudge); only Escape/Enter exit here.
      if (useTraceStore.getState().selection.editingPathElementId) {
        if (event.key === 'Escape' || event.key === 'Enter') {
          event.preventDefault();
          endPathEdit();
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
        const project = state.project;
        const ids = project
          ? topmostSelectedIds(
              project,
              state.selection.selectedElementIds,
            )
          : [];
        if (ids.length > 0) {
          event.preventDefault();
          dispatch(
            ids.map((id) => ({ type: 'deleteElement', id }) as const),
          );
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
  }, [
    dispatch,
    endPathEdit,
    nudge,
    onSave,
    redo,
    selectAllElements,
    setPlayhead,
    togglePlay,
    undo,
  ]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-card/35 text-sm text-muted-foreground">
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
    <div className="flex h-full min-h-0 flex-col bg-card/35 text-foreground">
      <header className="flex items-center gap-2 border-b border-border bg-card/50 px-2 py-1.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
          onClick={() => navigate('/trace')}
          aria-label="Back to Trace projects"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">
            {project.name}
          </p>
          <p className="font-mono text-[9px] text-muted-foreground">
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
            className="size-7 text-muted-foreground hover:bg-accent/30 hover:text-foreground disabled:opacity-30"
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
            className="size-7 text-muted-foreground hover:bg-accent/30 hover:text-foreground disabled:opacity-30"
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
                : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground')
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
                ? 'text-sky-300 hover:bg-accent/30'
                : 'text-muted-foreground hover:bg-accent/30')
            }
            onClick={() => setLooping(!playback.isLooping)}
          >
            Loop
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            onClick={() => setProjectFilesOpen(true)}
            title="Import an SVG from the project's files"
          >
            <FolderSearchIcon className="size-3.5" />
            Files
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            onClick={handleImportSvg}
            title="Import an SVG file"
          >
            <UploadIcon className="size-3.5" />
            Import
          </Button>
          <input
            type="file"
            ref={importFileInputRef}
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={handleImportFileChange}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-border bg-accent/30 text-[10px] text-foreground hover:bg-accent/50"
            onClick={() => setExportOpen(true)}
          >
            <DownloadIcon className="size-3.5" />
            Export
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-cyan-500/30 bg-cyan-500/10 text-[10px] text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200"
            onClick={() => setCopilotOpen(true)}
            title="Open Trace Copilot"
          >
            <SparklesIcon className="size-3.5" />
            Copilot
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
            className="ml-1 hidden border-border text-[9px] text-muted-foreground md:inline-flex"
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
          onTransformElement={(elementId, transform, origin) => {
            useTraceStore
              .getState()
              .updateTransform(elementId, transform, origin);
          }}
          editingPathElementId={selection.editingPathElementId}
          onEnterPathEdit={(elementId) => startPathEdit(elementId)}
          onExitPathEdit={() => endPathEdit()}
          onCommitPath={(elementId, model) => {
            const state = useTraceStore.getState();
            const element = state.project?.elements[elementId];
            if (!element) return;
            if (
              element.type === 'polyline' ||
              element.type === 'polygon'
            ) {
              updateAttributes(elementId, {
                points: serializePointsString(model),
              });
            } else {
              updateAttributes(elementId, {
                d: serializePathData(model),
              });
            }
          }}
          isPlaying={playback.isPlaying}
        />
        <TraceInspector projectId={projectId} />
      </div>

      {playback.isTimelineCollapsed ? (
        <div className="flex items-center justify-between border-t border-border bg-card/50 px-3 py-1">
          <span className="font-mono text-[10px] text-muted-foreground">
            Timeline collapsed · {Math.round(playback.currentTimeMs)}ms
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10px] text-foreground hover:bg-accent/30"
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

      <ProjectFileBrowserDialog
        open={projectFilesOpen}
        onOpenChange={setProjectFilesOpen}
        mode="select"
        accept={['image']}
        acceptExtensions={['svg']}
        title="Import SVG from project files"
        confirmLabel="Import"
        onSelect={(files) => void handleProjectFileImport(files)}
      />

      <TraceCopilotSheet
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        traceProjectId={projectId}
        initialPrompt={copilotInitialPrompt}
        onInitialPromptHandled={() => setCopilotInitialPrompt(null)}
      />
    </div>
  );
}
