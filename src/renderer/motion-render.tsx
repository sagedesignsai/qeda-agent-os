/**
 * renderer/motion-render.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry for the hidden export window. Loads one immutable snapshot, mounts the
 * export driver, and never imports the app shell or editor providers.
 */

import { createRoot } from 'react-dom/client';

import { MotionExportApp } from '@/components/motion/export/MotionExportApp';
import { motionStore } from '@/hooks/use-motion-store';
import type { MotionRenderJobPayload } from '@/lib/motion/export/protocol';

async function boot(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) throw new Error('The export window has no root element.');
  const root = createRoot(container);
  const jobId = new URLSearchParams(window.location.search).get('job');
  if (!jobId) {
    container.textContent = 'No export job was supplied.';
    return;
  }

  try {
    const job = await window.electron.ipc.invoke<MotionRenderJobPayload>('motion:export-job', { jobId });
    // Node renderers read the project id and asset list from the shared store.
    motionStore.loadDocument(job.document);
    root.render(<MotionExportApp job={job} />);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await window.electron.ipc
      .invoke('motion:export-failed', { jobId, message })
      .catch(() => undefined);
    container.textContent = message;
  }
}

void boot();
