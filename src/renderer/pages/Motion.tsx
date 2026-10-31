/**
 * renderer/pages/Motion.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Route /motion — the product-showcase motion studio.
 *
 * The page owns app-level navigation and keyboard shortcuts. The editor shell
 * composes the scene panel, preview, timeline and inspector.
 *
 * Keyboard shortcuts live here rather than in the timeline kit: the kit is
 * reusable and must not claim global keys on whatever surface mounts it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from 'react';
import { useParams } from 'react-router';

import { MotionEditor } from '@/components/motion/MotionEditor';
import { Button } from '@/components/ui/button';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { useMotionProject } from '@/hooks/use-motion-project';

export default function Motion() {
  const { projectId } = useParams();
  const { doc, canUndo, canRedo } = useMotionSnapshot();
  const motionProject = useMotionProject(projectId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && event.code === 'KeyS') {
        event.preventDefault();
        void motionProject.saveNow();
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        motionStore.togglePlay();
        return;
      }
      if (modifier && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) motionStore.redo();
        else motionStore.undo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [motionProject.saveNow]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {motionProject.status === 'loading' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">Opening Motion project…</div>
      ) : motionProject.status === 'error' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="max-h-full max-w-xl overflow-y-auto rounded-lg border border-destructive/40 bg-card p-5 text-sm">
            <h2 className="font-medium">Couldn’t open the Motion project</h2>
            <p className="mt-2 text-muted-foreground">{motionProject.error}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void motionProject.openProjectFolder()}>Open project folder</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void motionProject.preserveRecoveryCopy()}>Save recovery file for inspection</Button>
              <Button type="button" size="sm" onClick={() => void motionProject.duplicateForRepair()}>Duplicate for repair</Button>
            </div>
            {motionProject.backups.length > 0 && (
              <section className="mt-5">
                <h3 className="text-xs font-semibold">Restore from backup</h3>
                <ul className="mt-2 space-y-2">
                  {motionProject.backups.map((backup) => (
                    <li key={backup.revision} className="flex items-center justify-between gap-4 rounded-md border border-border/60 p-2">
                      <span className="text-xs text-muted-foreground">Revision {backup.revision} · {new Date(backup.modifiedAt).toLocaleString()}</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => void motionProject.restoreBackup(backup.revision)}>Restore</Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {motionProject.repairCopyId && <p role="status" className="mt-3 text-xs text-muted-foreground">Repair copy created: {motionProject.repairCopyId}. It is available in the project list.</p>}
            {motionProject.inspectionCopyPath && <p role="status" className="mt-3 break-all text-xs text-muted-foreground">Recovery file preserved at {motionProject.inspectionCopyPath}</p>}
          </div>
        </div>
      ) : motionProject.status === 'recovery' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <section role="alertdialog" aria-labelledby="motion-recovery-title" className="max-w-md rounded-lg border border-border/60 bg-card p-5 shadow-lg">
            <h2 id="motion-recovery-title" className="text-sm font-semibold">Motion closed unexpectedly</h2>
            {motionProject.recovery?.canonicalError ? (
              <p className="mt-2 text-xs text-destructive">The main project file could not be read: {motionProject.recovery.canonicalError}</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Recover the autosaved changes from {motionProject.recovery?.savedAt}?</p>
            )}
            {motionProject.readOnly && <p className="mt-2 text-xs text-muted-foreground">This folder is read-only, so recovery cannot be written here.</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={motionProject.readOnly} onClick={() => void motionProject.respondToRecovery('discard')}>Discard</Button>
              <Button type="button" size="sm" disabled={motionProject.readOnly} onClick={() => void motionProject.respondToRecovery('recover')}>Recover</Button>
            </div>
          </section>
        </div>
      ) : (
        <>
          {motionProject.warnings.some((warning) => warning.includes('autosave recovery file is invalid')) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 px-3 py-2 text-xs text-muted-foreground">
              <span>An invalid autosave was preserved. Save a copy for inspection before removing it.</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void motionProject.preserveRecoveryCopy()}>Save inspection copy</Button>
            </div>
          )}
          {motionProject.inspectionCopyPath && <div role="status" className="border-b border-border/60 px-3 py-1 text-xs text-muted-foreground">Inspection copy: {motionProject.inspectionCopyPath}</div>}
          {motionProject.readOnly && <div role="status" className="border-b border-border/60 px-3 py-1 text-xs text-muted-foreground">This Motion project is read-only. Changes will not be saved.</div>}
          {motionProject.saveStatus === 'failed' && motionProject.error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/30 px-3 py-2 text-xs text-destructive">
              <span>Save failed: {motionProject.error}. Your editor remains open.</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void motionProject.saveCopyLocally()}>Save a copy locally</Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <MotionEditor canUndo={canUndo} canRedo={canRedo} motionProject={motionProject} />
          </div>
        </>
      )}
    </div>
  );
}
