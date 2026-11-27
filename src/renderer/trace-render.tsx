/**
 * renderer/trace-render.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry for the hidden Trace export window. Loads one immutable project
 * snapshot, mounts the export driver, and never imports the app shell or editor
 * providers.
 */

import { createRoot } from 'react-dom/client';

import { TraceExportApp } from '@/components/trace/export/TraceExportApp';
import type { TraceRenderJobPayload } from '@/lib/trace/export/protocol';

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
    const job = await window.electron.ipc.invoke<TraceRenderJobPayload>(
      'trace:export-job',
      { jobId },
    );
    root.render(<TraceExportApp job={job} />);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await window.electron.ipc
      .invoke('trace:export-failed', { jobId, message })
      .catch(() => undefined);
    container.textContent = message;
  }
}

void boot();