/**
 * components/trace/dialogs/CompositionQaDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The readiness report: measurable QA plus a contact sheet of the moments a
 * reviewer should see. Same report the copilot's auditComposition tool uses, so
 * the panel and the agent cannot disagree about what is wrong.
 */

import { useMemo } from 'react';
import { ShieldCheckIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { qaTraceProject } from '@/lib/trace/qa';
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup';
import { formatTraceTimecode } from '@/lib/trace/runtime/resolve-element';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

export type CompositionQaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SEVERITY_STYLES = {
  error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
} as const;

export function CompositionQaDialog({
  open,
  onOpenChange,
}: CompositionQaDialogProps) {
  const project = useTraceStore((state) => state.project);

  const report = useMemo(
    () => (project ? qaTraceProject(project) : null),
    [project],
  );

  const frames = useMemo(() => {
    if (!project || !report) return [];
    return report.frames.map((frame) => ({
      ...frame,
      svg: staticSvgMarkup(project, frame.timeMs, {
        size: false,
        subtitles: true,
      }),
    }));
  }, [project, report]);

  if (!project || !report) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-border bg-card text-foreground sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ShieldCheckIcon
              className={cn(
                'size-4',
                report.errorCount > 0
                  ? 'text-rose-400'
                  : report.warningCount > 0
                    ? 'text-amber-300'
                    : 'text-emerald-400',
              )}
            />
            Composition QA
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Measurable readiness checks and the frames a reviewer should see.
            Warnings do not block a render; errors do.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {[
            {
              label: 'Errors',
              value: report.errorCount,
              tone:
                report.errorCount > 0
                  ? 'text-rose-300'
                  : 'text-muted-foreground',
            },
            {
              label: 'Warnings',
              value: report.warningCount,
              tone:
                report.warningCount > 0
                  ? 'text-amber-300'
                  : 'text-muted-foreground',
            },
            {
              label: 'Open notes',
              value: report.metrics.unresolvedNotes,
              tone:
                report.metrics.unresolvedNotes > 0
                  ? 'text-sky-300'
                  : 'text-muted-foreground',
            },
            { label: 'Frames', value: frames.length, tone: 'text-foreground' },
          ].map((tile) => (
            <div
              key={tile.label}
              className="rounded-md border border-border/60 bg-background/40 px-3 py-2"
            >
              <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
                {tile.label}
              </p>
              <p className={cn('font-mono text-lg', tile.tone)}>{tile.value}</p>
            </div>
          ))}
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3">
          {/* Issues */}
          <ScrollArea className="h-72 rounded-md border border-border/60 bg-background/30">
            {report.issues.length === 0 ? (
              <p className="px-3 py-10 text-center text-[11px] text-emerald-300">
                No issues. This cut is ready for a render.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {report.issues.map((issue, index) => (
                  <li
                    key={`${issue.code}-${index}`}
                    className="flex flex-col gap-1 px-2 py-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'rounded border px-1 py-px font-mono text-[9px] uppercase',
                          SEVERITY_STYLES[issue.severity],
                        )}
                      >
                        {issue.severity}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/70">
                        {issue.code}
                      </span>
                      {issue.timeMs !== undefined ? (
                        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                          {formatTraceTimecode(issue.timeMs)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] leading-snug text-foreground">
                      {issue.message}
                    </p>
                    {issue.fix ? (
                      <p className="text-[10px] leading-snug text-muted-foreground/70">
                        {issue.fix}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>

          {/* Contact sheet */}
          <ScrollArea className="h-72 rounded-md border border-border/60 bg-background/30 p-2">
            <div className="grid grid-cols-2 gap-2">
              {frames.map((frame) => (
                <div
                  key={`${frame.timeMs}-${frame.label}`}
                  className="overflow-hidden rounded border border-border/60 bg-[#070b14]"
                >
                  <div
                    className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: frame.svg }}
                  />
                  <p className="truncate px-1.5 py-1 font-mono text-[9px] text-muted-foreground">
                    {formatTraceTimecode(frame.timeMs)} · {frame.label}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>{report.metrics.sceneCount} scene(s)</span>
          <span>{report.metrics.elementCount} layers</span>
          <span>{report.metrics.trackCount} tracks</span>
          <span>{report.metrics.keyframeCount} keyframes</span>
          <span>
            {report.metrics.totalNarrationLines === 0
              ? 'no narration'
              : `${report.metrics.measuredNarrationLines}/${report.metrics.totalNarrationLines} narration lines measured`}
          </span>
          {report.metrics.linearMotionTracks > 0 ? (
            <span className="text-amber-300/80">
              {report.metrics.linearMotionTracks} linear motion track(s)
            </span>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}