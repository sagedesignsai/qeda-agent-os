/**
 * components/motion/export/MotionExportDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Export settings and live job state. Preflight here is the same pure function
 * main runs against the snapshot, so the editor cannot offer a doomed export.
 */

import { useMemo, useState } from 'react';
import { FolderOpenIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MotionExportState } from '@/hooks/use-motion-export';
import {
  MOTION_EXPORT_PRESETS,
  estimateMotionExportBytes,
  getMotionExportPreset,
  resolveMotionExportSettings,
} from '@/lib/motion/export/presets';
import { preflightMotionExport } from '@/lib/motion/export/preflight';
import type { MotionRenderProgress } from '@/lib/motion/export/protocol';
import type { MotionDocument } from '@/lib/motion/types';

const PHASE_LABEL: Record<MotionRenderProgress['phase'], string> = {
  snapshot: 'Snapshotting project',
  preflight: 'Checking export',
  prepare: 'Preparing assets',
  render: 'Rendering frames',
  finalize: 'Finishing file',
  done: 'Export complete',
  failed: 'Export failed',
  cancelled: 'Export cancelled',
};

export function MotionExportDialog({
  doc,
  state,
  onClose,
}: {
  doc: MotionDocument;
  state: MotionExportState;
  onClose: () => void;
}) {
  const [presetId, setPresetId] = useState('launch-1080p');
  const [useWorkArea, setUseWorkArea] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const scene = doc.scenes.find((candidate) => candidate.id === doc.activeSceneId);
  const fullEnd = scene?.timeline.duration ?? doc.timeline.duration;
  const workArea = doc.timeline.workArea;
  const workAreaAvailable = Boolean(workArea?.enabled && workArea.end > workArea.start);
  const range = useWorkArea && workAreaAvailable && workArea
    ? { start: workArea.start, end: Math.min(workArea.end, fullEnd) }
    : { start: 0, end: fullEnd };

  const preset = getMotionExportPreset(presetId);
  const issues = useMemo(
    () => preflightMotionExport(doc, { range, container: preset.container }),
    [doc, range.start, range.end, preset.container],
  );
  const settings = useMemo(
    () => (() => {
      try {
        return resolveMotionExportSettings(presetId, doc.meta.output);
      } catch {
        return null;
      }
    })(),
    [presetId, doc.meta.output],
  );
  const blocking = issues.filter((issue) => issue.severity === 'blocking');
  const duration = Math.max(0, range.end - range.start);
  const estimatedMb = (estimateMotionExportBytes({ bitrate: preset.bitrate }, duration) / (1024 * 1024)).toFixed(1);
  const progress = state.progress;

  const start = async () => {
    const result = await state.start({ document: doc, presetId, range });
    if (result) setOutputPath(result.outputPath);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Export composition</DialogTitle>
          <DialogDescription>
            Render the active scene from a snapshot; editing this project will not change a running export.
          </DialogDescription>
        </DialogHeader>

        {progress ? (
          <div className="space-y-4" aria-live="polite">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{PHASE_LABEL[progress.phase]}</span>
                <span className="tabular-nums text-muted-foreground">
                  {progress.frame} / {progress.frameCount} frames
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                />
              </div>
            </div>

            {progress.phase === 'done' && outputPath && (
              <p className="break-all text-xs text-muted-foreground">{outputPath}</p>
            )}
            {(progress.phase === 'failed' || progress.phase === 'cancelled') && (
              <p className="text-xs text-destructive">{progress.error ?? PHASE_LABEL[progress.phase]}</p>
            )}
            {state.error && progress.phase !== 'failed' && (
              <p className="text-xs text-destructive">{state.error}</p>
            )}

            <DialogFooter>
              {state.busy ? (
                <Button type="button" variant="outline" onClick={() => void state.cancel()}>
                  Cancel export
                </Button>
              ) : (
                <>
                  {progress.phase === 'done' && outputPath && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void window.electron.ipc.invoke('motion:reveal-export', { path: outputPath })}
                    >
                      <FolderOpenIcon data-icon="inline-start" />
                      Show in folder
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      state.dismiss();
                      if (progress.phase === 'done') onClose();
                      else setOutputPath(null);
                    }}
                  >
                    Done
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <label className="block space-y-1.5 text-xs font-medium">
                Preset
                <Select value={presetId} onValueChange={setPresetId}>
                  <SelectTrigger aria-label="Export preset" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MOTION_EXPORT_PRESETS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>

              <div className="space-y-1.5 text-xs font-medium">
                Range
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={!useWorkArea}
                    onClick={() => setUseWorkArea(false)}
                    className={`rounded-md border p-2 text-left ${!useWorkArea ? 'border-primary bg-primary/5' : 'border-border/60'}`}
                  >
                    <span className="block text-[11px] font-medium">Full scene</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">0.00s – {fullEnd.toFixed(2)}s</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={useWorkArea}
                    disabled={!workAreaAvailable}
                    onClick={() => setUseWorkArea(true)}
                    className={`rounded-md border p-2 text-left disabled:opacity-50 ${useWorkArea ? 'border-primary bg-primary/5' : 'border-border/60'}`}
                  >
                    <span className="block text-[11px] font-medium">Work area</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {workAreaAvailable ? `${workArea!.start.toFixed(2)}s – ${Math.min(workArea!.end, fullEnd).toFixed(2)}s` : 'Enabled in the timeline'}
                    </span>
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {settings
                  ? `${settings.width} × ${settings.height} · ${settings.fps} fps · ${duration.toFixed(2)}s · ~${estimatedMb} MB`
                  : 'This preset needs a valid output size and frame rate.'}
              </p>

              {issues.length > 0 && (
                <ul className="max-h-40 space-y-1.5 overflow-y-auto text-[11px]">
                  {issues.map((issue, index) => (
                    <li
                      key={`${issue.code}-${index}`}
                      className={issue.severity === 'blocking' ? 'text-destructive' : 'text-amber-600'}
                    >
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}

              {state.error && <p className="text-xs text-destructive">{state.error}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Close</Button>
              <Button
                type="button"
                disabled={blocking.length > 0 || !settings}
                onClick={() => void start()}
              >
                Export
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
