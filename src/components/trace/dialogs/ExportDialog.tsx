/**
 * components/trace/dialogs/ExportDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * SVG / GSAP / video export surface.
 *
 * The animated SVG is a self-contained artifact (no JS). GSAP output is for
 * interactive experiences, where the host controls the timeline. The video tab
 * renders frame-exact MP4/WebM in a hidden window — the same serializer feeds
 * the encoder, and narration audio is muxed in when voice lines exist.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckIcon, CopyIcon, DownloadIcon, FilmIcon, Loader2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  compileProjectToAnimatedSvg,
  copyOrDownloadCode,
  downloadAnimatedSvg,
  generateGsapCode,
} from '@/lib/trace/export';
import {
  DEFAULT_TRACE_EXPORT_PRESET_ID,
  listTraceExportPresets,
  resolveTraceExportSettings,
} from '@/lib/trace/export/presets';
import { traceRenderFrameCount } from '@/lib/trace/export/render-plan';
import type { TraceRenderProgress } from '@/lib/trace/export/protocol';
import { useIpcEvent } from '@/hooks/use-ipc';
import { useTraceStore } from '@/stores/trace-store';

export type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Format = 'svg' | 'react' | 'vanilla' | 'video';

type VideoExportState = {
  jobId: string;
  phase: TraceRenderProgress['phase'];
  frame: number;
  frameCount: number;
  fraction: number;
  outputPath: string;
};

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const project = useTraceStore((state) => state.project);
  const currentLooping = useTraceStore((state) => state.playback.isLooping);
  const [format, setFormat] = useState<Format>('svg');
  const [loop, setLoop] = useState(true);
  const [copied, setCopied] = useState(false);

  const [presetId, setPresetId] = useState(DEFAULT_TRACE_EXPORT_PRESET_ID);
  const [video, setVideo] = useState<VideoExportState | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setLoop(currentLooping);
  }, [open, currentLooping]);

  useIpcEvent('trace:export-progress', (payload: unknown) => {
    const progress = payload as Partial<TraceRenderProgress> | undefined;
    if (!progress?.jobId || !video) return;
    if (progress.jobId !== video.jobId) return;
    setVideo((current) =>
      current
        ? {
            ...current,
            phase: progress.phase ?? current.phase,
            frame: progress.frame ?? current.frame,
            frameCount: progress.frameCount ?? current.frameCount,
            fraction: progress.fraction ?? current.fraction,
          }
        : current,
    );
    if (progress.phase === 'done') {
      toast.success('Video export complete.');
    }
    if (progress.phase === 'failed' && progress.error) {
      setVideoError(progress.error);
    }
  }, [video]);

  const code = useMemo(() => {
    if (!project || format === 'video') return '';
    if (format === 'svg')
      return compileProjectToAnimatedSvg(project, {
        loop,
        includeDimensions: true,
      });
    return generateGsapCode(project, {
      format: format === 'react' ? 'react' : 'vanilla',
      loop,
      componentName: project.name,
    });
  }, [project, format, loop]);

  const slug = (project?.name ?? 'trace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  const copy = async () => {
    const result = await copyOrDownloadCode(
      code,
      `${slug}.${format === 'svg' ? 'svg' : 'tsx'}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    toast.success(
      result === 'copied'
        ? 'Copied to clipboard'
        : 'Clipboard unavailable — downloaded instead',
    );
  };

  const download = () => {
    if (!project) return;
    if (format === 'svg') {
      downloadAnimatedSvg(project, { loop });
      return;
    }
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.${format === 'react' ? 'tsx' : 'ts'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const videoSettings = useMemo(
    () =>
      project
        ? resolveTraceExportSettings(presetId, {
            width: project.width,
            height: project.height,
            fps: project.fps,
          })
        : null,
    [project, presetId],
  );

  const videoFrameCount = useMemo(() => {
    if (!project || !videoSettings) return 0;
    try {
      return traceRenderFrameCount(project.durationMs, videoSettings.fps);
    } catch {
      return 0;
    }
  }, [project, videoSettings]);

  const hasNarrationAudio = Boolean(
    project?.narration?.lines.some(
      (line) => Boolean(line.ttsAssetId) && (line.durationMs ?? 0) > 0,
    ),
  );

  const startVideoExport = async () => {
    if (!project || !videoSettings) return;
    setVideoError(null);
    try {
      const picked = await window.electron.ipc.invoke<{ path: string } | null>(
        'trace:pick-export-path',
        { projectName: project.name, presetId },
      );
      if (!picked?.path) return;

      const started = await window.electron.ipc.invoke<{
        jobId: string;
        outputPath: string;
        frameCount: number;
      }>('trace:export-start', {
        projectId: project.id,
        project,
        presetId,
        outputPath: picked.path,
      });
      setVideo({
        jobId: started.jobId,
        phase: 'prepare',
        frame: 0,
        frameCount: started.frameCount,
        fraction: 0,
        outputPath: started.outputPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setVideoError(message);
      toast.error(message);
    }
  };

  const cancelVideoExport = () => {
    if (!video) return;
    void window.electron.ipc
      .invoke('trace:export-cancel', { jobId: video.jobId })
      .catch(() => undefined);
    setVideo(null);
  };

  const revealVideoExport = () => {
    if (!video) return;
    void window.electron.ipc
      .invoke('trace:reveal-export', { path: video.outputPath })
      .catch(() => undefined);
  };

  const videoRunning =
    video !== null && ['prepare', 'render', 'finalize'].includes(video.phase);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card text-foreground sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Export composition
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            The animated SVG is self-contained. GSAP code mounts the same
            artwork and exposes the timeline for interactive control. Video
            renders frame-exact output with the narration muxed in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={format}
            onValueChange={(value) => setFormat(value as Format)}
          >
            <TabsList className="h-7 bg-accent/30">
              <TabsTrigger value="svg" className="h-5 px-2 text-[10px]">
                Animated SVG
              </TabsTrigger>
              <TabsTrigger value="react" className="h-5 px-2 text-[10px]">
                React + GSAP
              </TabsTrigger>
              <TabsTrigger value="vanilla" className="h-5 px-2 text-[10px]">
                Vanilla GSAP
              </TabsTrigger>
              <TabsTrigger value="video" className="h-5 px-2 text-[10px]">
                Video
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {format !== 'video' && (
            <>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(event) => setLoop(event.target.checked)}
                  className="size-3 accent-sky-400"
                />
                Loop
              </label>

              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-border bg-accent/30 text-[10px] text-foreground hover:bg-accent/50"
                  onClick={() => void copy()}
                  disabled={!code}
                >
                  {copied ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 bg-sky-500 text-[10px] text-slate-950 hover:bg-sky-400"
                  onClick={download}
                  disabled={!code}
                >
                  <DownloadIcon className="size-3.5" />
                  Download
                </Button>
              </div>
            </>
          )}
        </div>

        {format === 'video' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Preset
                </span>
                <Select
                  value={presetId}
                  onValueChange={(value) => setPresetId(value)}
                  disabled={videoRunning}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {listTraceExportPresets().map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {videoSettings && project && (
                <div className="flex flex-1 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-background/60 px-2 py-1 font-mono">
                    {videoSettings.width}×{videoSettings.height} ·{' '}
                    {videoSettings.fps}fps
                  </span>
                  <span className="rounded bg-background/60 px-2 py-1 font-mono">
                    {videoFrameCount} frames ·{' '}
                    {(project.durationMs / 1000).toFixed(1)}s
                  </span>
                  <span
                    className={
                      'rounded px-2 py-1 ' +
                      (hasNarrationAudio
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {hasNarrationAudio
                      ? 'narration muxed in'
                      : 'no voice audio'}
                  </span>
                </div>
              )}
            </div>

            {videoError && (
              <p className="flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <span>{videoError}</span>
                <button
                  type="button"
                  className="shrink-0 text-destructive/70 hover:text-destructive"
                  onClick={() => setVideoError(null)}
                  aria-label="Dismiss export error"
                >
                  <XIcon className="size-3" />
                </button>
              </p>
            )}

            {video && (
              <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {videoRunning ? (
                      <Loader2Icon className="size-3 animate-spin text-sky-400" />
                    ) : (
                      <FilmIcon className="size-3 text-sky-400" />
                    )}
                    {video.phase === 'done'
                      ? 'Complete'
                      : video.phase === 'failed'
                        ? 'Failed'
                        : video.phase === 'cancelled'
                          ? 'Cancelled'
                          : `Rendering — frame ${video.frame} / ${video.frameCount}`}
                  </span>
                  <span className="font-mono">
                    {Math.round(video.fraction * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-accent/40">
                  <div
                    className="h-full bg-sky-400 transition-[width]"
                    style={{ width: `${Math.round(video.fraction * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  {video.phase === 'done' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={revealVideoExport}
                    >
                      <DownloadIcon className="size-3.5" />
                      Show in folder
                    </Button>
                  )}
                  {videoRunning && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={cancelVideoExport}
                    >
                      <XIcon className="size-3.5" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Button
              type="button"
              size="sm"
              className="h-8 w-fit gap-1.5 bg-sky-500 text-xs text-slate-950 hover:bg-sky-400"
              onClick={() => void startVideoExport()}
              disabled={!project || videoRunning}
            >
              <FilmIcon className="size-3.5" />
              {videoRunning ? 'Exporting…' : 'Export video'}
            </Button>

            <p className="text-[10px] leading-relaxed text-muted-foreground/50">
              Frames are serialized from the same SVG pipeline the editor uses,
              so the file matches the stage exactly. Subtitles are burned in
              from the narration; the animated-SVG export cannot carry them.
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-72 rounded-md border border-border bg-accent/15">
              <pre className="whitespace-pre-wrap break-all p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {code}
              </pre>
            </ScrollArea>

            <p className="text-[10px] leading-relaxed text-muted-foreground/50">
              Animated SVG approximates typewriter reveals with a clip animation
              and does not animate parametric internals (counters, gauges). Use
              the GSAP export when you need frame-exact text or runtime
              control.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}