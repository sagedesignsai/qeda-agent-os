/**
 * renderer/pages/Trace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Route /trace/:projectId — the Nova Trace vector motion editor.
 *
 * The page owns project loading and persistence. Autosave is debounced and
 * revision-checked; the editor shell owns the engine and shortcuts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { TraceEditor } from '@/components/trace/TraceEditor';
import type { TraceProject } from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';

type OpenResult = {
  project: TraceProject;
  path: string;
  revision: number;
};

type Status = 'loading' | 'ready' | 'error';

/** Quiet period after the last edit before autosave fires. */
const AUTOSAVE_DELAY_MS = 1600;

export default function Trace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const open = async () => {
      try {
        const result = await window.electron.ipc.invoke<OpenResult>(
          'trace:open-project',
          { projectId },
        );
        if (cancelled) return;
        useTraceStore.getState().loadProject(result.project, {
          path: result.path,
          revision: result.revision,
        });
        setError(null);
        setStatus('ready');
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    };

    void open();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const saveNow = useCallback(async () => {
    const state = useTraceStore.getState();
    if (!state.project || !projectId || savingRef.current) return;

    savingRef.current = true;
    state.markSaving();
    try {
      const result = await window.electron.ipc.invoke<{
        revision: number;
        savedAt: string;
      }>('trace:save-project', {
        projectId,
        project: state.project,
        expectedRevision: state.revision,
      });
      useTraceStore.getState().markSaved(result.revision);
    } catch (cause) {
      useTraceStore
        .getState()
        .markSaveFailed(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
    }
  }, [projectId]);

  // Debounced autosave. Watches the document, not the playhead.
  useEffect(() => {
    if (status !== 'ready') return;
    let timer: number | null = null;

    const unsubscribe = useTraceStore.subscribe((state, previous) => {
      if (
        !state.dirty ||
        state.project === previous.project ||
        state.saveState === 'saving'
      ) {
        return;
      }
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void saveNow();
      }, AUTOSAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [status, saveNow]);

  // Flush a pending edit on route exit so work is never silently lost.
  useEffect(
    () => () => {
      const state = useTraceStore.getState();
      if (state.dirty && state.project && projectId) {
        void window.electron.ipc.invoke('trace:save-project', {
          projectId,
          project: state.project,
          expectedRevision: state.revision,
        });
      }
      state.closeProject();
    },
    [projectId],
  );

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-[#070b14] text-sm text-slate-500">
        Opening Trace project…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-[#070b14] p-6">
        <div className="max-w-lg rounded-lg border border-rose-500/30 bg-[#0a1120] p-5 text-sm text-slate-300">
          <h2 className="font-medium text-slate-100">
            Couldn’t open the Trace project
          </h2>
          <p className="mt-2 text-slate-500">{error}</p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigate('/trace')}
            >
              Back to projects
            </Button>
            {projectId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void window.electron.ipc.invoke('trace:reveal-project', {
                    projectId,
                  })
                }
              >
                Show in folder
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return <TraceEditor onSave={() => void saveNow()} />;
}
