/**
 * hooks/use-motion-project.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the selected Motion bundle and autosaves document revisions through the
 * main-process persistence API. The renderer never handles project paths.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { MotionBackupSummary, MotionDocument, MotionOpenResult, MotionProjectSummary } from '@/main/ipc/channels';
import { motionStore } from '@/hooks/use-motion-store';
import type { MotionSelection } from '@/lib/motion/types';
import type { TimelineView } from '@/lib/timeline/types';

type ProjectStatus = 'loading' | 'recovery' | 'ready' | 'error';
type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed';

export function useMotionProject() {
  const [status, setStatus] = useState<ProjectStatus>('loading');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [project, setProject] = useState<MotionProjectSummary | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [recovery, setRecovery] = useState<MotionOpenResult['recovery']>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [backups, setBackups] = useState<MotionBackupSummary[]>([]);
  const [repairCopyId, setRepairCopyId] = useState<string | null>(null);
  const [inspectionCopyPath, setInspectionCopyPath] = useState<string | null>(null);
  const savedDocument = useRef<MotionDocument | null>(null);
  const recoveryProjectId = useRef<string | null>(null);
  const forceBackupOnNextSave = useRef(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        let { projects } = await window.electron.ipc.invoke<{ projects: MotionProjectSummary[] }>('motion:list-projects', { includeMissing: true });
        let selected = projects.find((item) => !item.missing);
        if (!selected) {
          if (projects.length > 0) throw new Error('Motion projects are missing. Locate a project folder before creating another project.');
          const created = await window.electron.ipc.invoke<{ projectId: string; path: string }>('motion:create-project', { name: 'Launch hero' });
          projects = (await window.electron.ipc.invoke<{ projects: MotionProjectSummary[] }>('motion:list-projects', { includeMissing: true })).projects;
          selected = projects.find((item) => item.id === created.projectId);
          if (!selected) throw new Error('The new Motion project was created but could not be loaded from the project index.');
        }
        if (!mounted) return;
        setProject(selected);
        const opened = await window.electron.ipc.invoke<MotionOpenResult>('motion:open-project', { projectId: selected.id });
        if (!mounted) return;
        setReadOnly(opened.readOnly);
        setWarnings(opened.warnings);
        if (opened.recovery) {
          recoveryProjectId.current = selected.id;
          setRecovery(opened.recovery);
          setStatus('recovery');
          return;
        }
        motionStore.loadDocument(opened.document);
        await restoreEditorState(selected.id, opened.document);
        if (!mounted) return;
        savedDocument.current = opened.document;
        forceBackupOnNextSave.current = opened.dirty;
        setStatus('ready');
      } catch (cause) {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setStatus('error');
        }
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const respondToRecovery = useCallback(async (action: 'recover' | 'discard') => {
    const id = recoveryProjectId.current;
    if (!id) return;
    try {
      await window.electron.ipc.invoke<{ document: MotionDocument; path: string }>('motion:recover-project', { projectId: id, action });
      const result = await window.electron.ipc.invoke<MotionOpenResult>('motion:open-project', { projectId: id });
      motionStore.loadDocument(result.document);
      await restoreEditorState(id, result.document);
      savedDocument.current = result.document;
      forceBackupOnNextSave.current = result.dirty;
      setReadOnly(result.readOnly);
      setRecovery(null);
      setStatus('ready');
      setError(null);
      setSaveStatus('saved');
      setWarnings(result.warnings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, []);

  const refreshBackups = useCallback(async () => {
    if (!project) return;
    try {
      const result = await window.electron.ipc.invoke<{ backups: MotionBackupSummary[] }>('motion:list-backups', { projectId: project.id });
      setBackups(result.backups);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [project]);

  useEffect(() => {
    if (status === 'error' && project) void refreshBackups();
  }, [project, refreshBackups, status]);

  const restoreBackup = useCallback(async (revision: number) => {
    if (!project) return;
    try {
      await window.electron.ipc.invoke<{ document: MotionDocument; path: string }>('motion:restore-backup', { projectId: project.id, revision });
      const result = await window.electron.ipc.invoke<MotionOpenResult>('motion:open-project', { projectId: project.id });
      motionStore.loadDocument(result.document);
      await restoreEditorState(project.id, result.document);
      savedDocument.current = result.document;
      forceBackupOnNextSave.current = false;
      setReadOnly(result.readOnly);
      setWarnings(result.warnings);
      setStatus('ready');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [project]);

  const openProjectFolder = useCallback(async () => {
    if (!project) return;
    try {
      await window.electron.ipc.invoke<void>('motion:reveal-project', { projectId: project.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [project]);

  const duplicateForRepair = useCallback(async () => {
    if (!project) return;
    try {
      const result = await window.electron.ipc.invoke<{ projectId: string }>('motion:duplicate-for-repair', { projectId: project.id });
      setRepairCopyId(result.projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [project]);

  const preserveRecoveryCopy = useCallback(async () => {
    if (!project) return;
    try {
      const result = await window.electron.ipc.invoke<{ path: string }>('motion:preserve-recovery-copy', { projectId: project.id });
      setInspectionCopyPath(result.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [project]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!project || status !== 'ready' || readOnly) return false;
    const document = motionStore.getDocument();
    const forceBackup = forceBackupOnNextSave.current;
    if (document === savedDocument.current && !forceBackup) return true;
    setSaveStatus('saving');
    try {
      await window.electron.ipc.invoke<{ revision: number; savedAt: string; bytes: number }>('motion:save-project', {
        projectId: project.id,
        document,
        expectedRevision: savedDocument.current?.revision ?? document.revision,
        forceBackup,
      });
      savedDocument.current = document;
      forceBackupOnNextSave.current = false;
      setSaveStatus('saved');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaveStatus('failed');
      return false;
    }
  }, [project, readOnly, status]);

  const saveCopyLocally = useCallback(async () => {
    const document = motionStore.getDocument();
    try {
      const created = await window.electron.ipc.invoke<{ projectId: string; path: string }>('motion:save-copy', {
        document,
        name: `${document.meta.name} copy`,
      });
      const { projects } = await window.electron.ipc.invoke<{ projects: MotionProjectSummary[] }>('motion:list-projects', { includeMissing: true });
      const copy = projects.find((item) => item.id === created.projectId);
      if (!copy) throw new Error('The local copy was created but is missing from the project index.');
      const opened = await window.electron.ipc.invoke<MotionOpenResult>('motion:open-project', { projectId: created.projectId });
      motionStore.loadDocument(opened.document);
      savedDocument.current = opened.document;
      forceBackupOnNextSave.current = opened.dirty;
      setProject(copy);
      setReadOnly(opened.readOnly);
      setWarnings(opened.warnings);
      setStatus('ready');
      setSaveStatus('saved');
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !project || readOnly) return;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
    let saving = false;
    const clearTimers = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (maxWaitTimer) clearTimeout(maxWaitTimer);
      debounceTimer = undefined;
      maxWaitTimer = undefined;
    };
    const runSave = async () => {
      if (saving) return;
      const attemptedDocument = motionStore.getDocument();
      clearTimers();
      saving = true;
      await saveNow();
      saving = false;
      // A newer edit arrived during the save. Schedule that revision, but never
      // spin on the same failed snapshot; another edit or explicit save retries.
      if (motionStore.getDocument() !== attemptedDocument) schedule();
    };
    const schedule = () => {
      if (motionStore.getDocument() === savedDocument.current && !forceBackupOnNextSave.current) return;
      setSaveStatus('unsaved');
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!maxWaitTimer) maxWaitTimer = setTimeout(() => void runSave(), 2_000);
      debounceTimer = setTimeout(() => void runSave(), 500);
    };
    const unsubscribe = motionStore.subscribe(schedule);
    if (forceBackupOnNextSave.current) schedule();
    return () => {
      clearTimers();
      unsubscribe();
    };
  }, [project, readOnly, saveNow, status]);

  useEffect(() => {
    if (status !== 'ready' || !project || readOnly) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const persist = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const snapshot = motionStore.getSnapshot();
        void window.electron.ipc.invoke<void>('motion:write-editor-state', {
          projectId: project.id,
          state: { version: 1, view: snapshot.view, selection: snapshot.selection },
        }).catch(() => undefined);
      }, 500);
    };
    const unsubscribe = motionStore.subscribe(persist);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [project, readOnly, status]);

  useEffect(() => {
    const unsubscribe = window.electron.ipc.on('motion:changed', () => {
      if (!project) return;
      void window.electron.ipc.invoke<{ projects: MotionProjectSummary[] }>('motion:list-projects', { includeMissing: true })
        .then(({ projects }) => setProject(projects.find((item) => item.id === project.id) ?? project))
        .catch(() => undefined);
    });
    return unsubscribe;
  }, [project]);

  return {
    status, saveStatus, project, recovery, error, readOnly, warnings, backups,
    repairCopyId, inspectionCopyPath, respondToRecovery, saveNow, restoreBackup,
    openProjectFolder, duplicateForRepair, preserveRecoveryCopy, saveCopyLocally,
  };
}

async function restoreEditorState(projectId: string, document: MotionDocument): Promise<void> {
  try {
    const { state } = await window.electron.ipc.invoke<{ state: unknown | null }>('motion:read-editor-state', { projectId });
    if (!state || typeof state !== 'object') return;
    const record = state as Record<string, unknown>;
    const view = record.view as Partial<TimelineView> | null;
    if (
      view &&
      Number.isFinite(view.pxPerSecond) && (view.pxPerSecond ?? 0) > 0 &&
      Number.isFinite(view.scrollSeconds) && (view.scrollSeconds ?? -1) >= 0
    ) {
      motionStore.setView({ pxPerSecond: view.pxPerSecond!, scrollSeconds: view.scrollSeconds! });
    }
    const selection = record.selection;
    if (isValidSelection(selection, document)) motionStore.setSelection(selection);
  } catch {
    // Editor state is disposable; a failed or malformed restore must not block
    // opening the canonical project document.
  }
}

function isValidSelection(value: unknown, document: MotionDocument): value is MotionSelection {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const selection = value as Record<string, unknown>;
  if (typeof selection.trackId !== 'string') return false;
  const track = document.timeline.tracks.find((item) => item.id === selection.trackId);
  if (!track) return false;
  if (selection.kind === 'track') return true;
  if (selection.kind !== 'placement' && selection.kind !== 'keyframe') return false;
  if (typeof selection.placementId !== 'string') return false;
  const placement = track.placements.find((item) => item.id === selection.placementId);
  if (!placement || selection.kind === 'placement') return Boolean(placement);
  if (typeof selection.clipId !== 'string' || typeof selection.channelId !== 'string' || typeof selection.keyframeId !== 'string') return false;
  if (placement.clipId !== selection.clipId) return false;
  const clip = document.timeline.clips.find((item) => item.id === selection.clipId);
  const channel = clip?.channels.find((item) => item.id === selection.channelId);
  return Boolean(channel?.keyframes.some((item) => item.id === selection.keyframeId));
}
