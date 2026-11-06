/**
 * components/trace/dialogs/ExportDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * SVG / GSAP export surface.
 *
 * The animated SVG is a self-contained artifact (no JS). GSAP output is for
 * interactive experiences, where the host controls the timeline.
 */

import { stageOf } from '@/lib/trace/document';
import { useMemo, useState } from 'react';
import { CheckIcon, CopyIcon, DownloadIcon } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  compileProjectToAnimatedSvg,
  copyOrDownloadCode,
  downloadAnimatedSvg,
  generateGsapCode,
} from '@/lib/trace/export';
import { useTraceStore } from '@/stores/trace-store';

export type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Format = 'svg' | 'react' | 'vanilla';

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const project = useTraceStore((state) => state.project);
  const [format, setFormat] = useState<Format>('svg');
  const [loop, setLoop] = useState(true);
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => {
    if (!project) return '';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card text-foreground sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Export composition
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            The animated SVG is self-contained. GSAP code mounts the same
            artwork and exposes the timeline for interactive control.
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
            </TabsList>
          </Tabs>

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
        </div>

        <ScrollArea className="h-72 rounded-md border border-border bg-accent/15">
          <pre className="whitespace-pre-wrap break-all p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {code}
          </pre>
        </ScrollArea>

        <p className="text-[10px] leading-relaxed text-muted-foreground/50">
          Animated SVG approximates typewriter reveals with a clip animation and
          does not animate parametric internals (counters, gauges). Use the GSAP
          export when you need frame-exact text or runtime control.
        </p>
      </DialogContent>
    </Dialog>
  );
}
