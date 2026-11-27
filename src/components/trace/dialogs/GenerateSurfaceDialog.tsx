/**
 * components/trace/dialogs/GenerateSurfaceDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Surface Generator add-on workspace. Describe a backdrop, review the generated
 * layers over time, then insert the validated fragment at the back of the stack.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  SparklesIcon,
  WallpaperIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { MessageList } from '@/components/chat/MessageList';
import { SidebarContent, SidebarFooter } from '@/components/ui/sidebar';
import { TraceRenderer } from '@/components/trace/renderer/TraceRenderer';
import { useTraceStore } from '@/stores/trace-store';
import { useSurfaceGenerationAgent } from '@/hooks/use-surface-generation-agent';
import {
  surfaceProposalProject,
  type SurfaceGenerationProposal,
  type SurfaceGenerationRequest,
} from '@/lib/trace/addons/surfaces/generation';
import { cn } from '@/lib/utils';

export type GenerateSurfaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplySurface: (proposal: SurfaceGenerationProposal) => boolean | void;
};

const QUICK_PROMPTS = [
  'A slow aurora backdrop in deep navy and cyan, calm and premium.',
  'Layered topographic ridges at golden hour with a soft sun glow.',
  'A technical blueprint grid with a blue scanning accent line.',
  'A soft halftone texture with a diagonal accent, editorial and quiet.',
];

export function GenerateSurfaceDialog({
  open,
  onOpenChange,
  onApplySurface,
}: GenerateSurfaceDialogProps) {
  const project = useTraceStore((state) => state.project);
  const [intensity, setIntensity] = useState([52]);
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const previewTimeRef = useRef(0);
  const [applyError, setApplyError] = useState<string | null>(null);

  const request = useMemo<SurfaceGenerationRequest | null>(() => {
    if (!project) return null;
    return {
      width: project.width,
      height: project.height,
      durationMs: project.durationMs,
      fps: project.fps,
      prompt: '',
      intensity: intensity[0],
      loop,
      projectName: project.name,
      ...(project.style ? { style: project.style } : {}),
    };
  }, [project, intensity, loop]);

  const {
    messages,
    status,
    error,
    sendMessage,
    clearMessages,
    abortStream,
    proposal,
    clearProposal,
  } = useSurfaceGenerationAgent(request);

  const isStreaming = status === 'streaming';
  const previewProject = useMemo(
    () => (proposal ? surfaceProposalProject(proposal) : null),
    [proposal],
  );
  const previewDurationMs = Math.max(1, proposal?.durationMs ?? project?.durationMs ?? 1);

  const seekPreview = useCallback((timeMs: number) => {
    previewTimeRef.current = timeMs;
    setPreviewTimeMs(timeMs);
  }, []);

  const resetPreview = useCallback(() => {
    setPlaying(false);
    seekPreview(0);
    setApplyError(null);
  }, [seekPreview]);

  useEffect(() => {
    if (!open) return;
    clearProposal();
    clearMessages();
    resetPreview();
  }, [open, clearProposal, clearMessages, resetPreview]);

  useEffect(() => {
    if (!proposal) return;
    seekPreview(0);
    setPlaying(true);
    setApplyError(null);
  }, [proposal, seekPreview]);

  useEffect(() => {
    if (!playing || !previewProject) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = now - previous;
      previous = now;
      const next = previewTimeRef.current + elapsed;
      seekPreview(next % previewDurationMs);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, previewProject, previewDurationMs, seekPreview]);

  const runPrompt = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || !request || isStreaming) return;
      clearProposal();
      resetPreview();
      sendMessage(value);
    },
    [request, isStreaming, clearProposal, resetPreview, sendMessage],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isStreaming) abortStream();
    onOpenChange(nextOpen);
  };

  const applySurface = () => {
    if (!proposal) return;
    const applied = onApplySurface(proposal);
    if (applied === false) {
      setApplyError(
        'The project changed before this surface could be inserted. Generate again from the latest document.',
      );
      return;
    }
    onOpenChange(false);
  };

  const playheadProgress = Math.max(
    0,
    Math.min(1, previewTimeMs / previewDurationMs),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(820px,calc(100dvh-2rem))] w-[min(1360px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden border-border bg-card p-0 text-foreground">
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-3 pr-14">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span className="flex size-7 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-sky-300">
                  <WallpaperIcon className="size-3.5" />
                </span>
                Generate surface
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {project ? `${project.width}×${project.height} · ${(project.durationMs / 1000).toFixed(1)}s` : 'No project'}
                </span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                Describe a background surface, review the generated layers and tracks, then insert them behind the composition.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isStreaming ? (
                <Badge variant="outline" className="border-sky-400/30 text-sky-300">
                  Working
                </Badge>
              ) : null}
              {proposal ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 bg-sky-500 px-3 text-xs font-medium text-slate-950 hover:bg-sky-400"
                  onClick={applySurface}
                  disabled={isStreaming}
                >
                  <SparklesIcon className="size-3.5" /> Insert at back
                </Button>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <section
            className="flex min-h-[390px] min-w-0 flex-1 flex-col border-b border-border/70 p-4 md:border-r md:border-b-0 md:p-5"
            aria-label="Generated surface preview"
          >
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-[#0c111a]">
              <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(45deg,#ffffff08_25%,transparent_25%),linear-gradient(-45deg,#ffffff08_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ffffff08_75%),linear-gradient(-45deg,transparent_75%,#ffffff08_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0px] [background-size:16px_16px]" />
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-white/10 bg-black/35 px-2.5 py-1.5 text-[10px] text-slate-300 backdrop-blur-sm">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    proposal
                      ? 'bg-sky-400 shadow-[0_0_10px_#38bdf8]'
                      : 'bg-slate-500',
                  )}
                />
                {proposal ? 'Surface preview' : 'Awaiting a brief'}
              </div>
              {previewProject ? (
                <div className="relative h-full w-full p-6 drop-shadow-[0_0_44px_rgba(56,189,248,0.14)]">
                  <TraceRenderer
                    project={previewProject}
                    timeMs={previewTimeMs}
                    interactive={false}
                    svgId="trace-surface-preview-svg"
                    elementIdPrefix="trace-surface-preview"
                    className="size-full"
                  />
                  <div className="absolute bottom-3 right-3 rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
                    {(previewTimeMs / 1000).toFixed(2)}s /{' '}
                    {(previewDurationMs / 1000).toFixed(2)}s
                  </div>
                </div>
              ) : (
                <div className="relative z-10 flex max-w-xs flex-col items-center gap-3 px-6 text-center">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground">
                    <WallpaperIcon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Describe a surface
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      The specialist designs vector layers, stages editable
                      tracks, validates the import and reviews rendered frames
                      before anything is inserted.
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="size-8 border border-white/10 bg-white/10 text-white hover:bg-white/15"
                  onClick={() => setPlaying((value) => !value)}
                  aria-label={playing ? 'Pause preview' : 'Play preview'}
                  disabled={!proposal}
                >
                  {playing ? (
                    <PauseIcon className="size-3.5" />
                  ) : (
                    <PlayIcon className="size-3.5" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="size-8 border border-white/10 bg-white/10 text-white hover:bg-white/15"
                  onClick={() => {
                    setPlaying(false);
                    seekPreview(0);
                  }}
                  aria-label="Reset preview"
                  disabled={!proposal}
                >
                  <RotateCwIcon className="size-3.5" />
                </Button>
                <span className="text-[10px] text-slate-400">
                  {playing ? 'Playing loop' : proposal ? 'Preview paused' : 'No preview yet'}
                </span>
              </div>
            </div>

            <div className="mt-3 shrink-0 rounded-xl border border-border/70 bg-background/30 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    Surface timeline
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {proposal
                      ? `${proposal.tracks.length} editable tracks · ${Object.keys(proposal.fragment.elements).length} layers · ${(previewDurationMs / 1000).toFixed(1)}s`
                      : 'Tracks appear here after a valid proposal.'}
                  </p>
                </div>
                {proposal?.visualReview ? (
                  <Badge variant="outline" className="shrink-0 border-border/80 text-[9px]">
                    {proposal.visualReview.performed ? 'Frames reviewed' : 'Preview ready'}
                  </Badge>
                ) : null}
              </div>
              {proposal ? (
                <>
                  <div className="mb-1 grid grid-cols-[110px_minmax(0,1fr)] gap-2 font-mono text-[9px] text-muted-foreground">
                    <span>TRACK</span>
                    <div className="flex justify-between">
                      <span>0.0s</span>
                      <span>{(previewDurationMs / 2000).toFixed(1)}s</span>
                      <span>{(previewDurationMs / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-2">
                    <div className="space-y-2">
                      {proposal.tracks.map((track, index) => (
                        <div
                          key={`${track.elementId}-${track.property}-${index}`}
                          className="flex h-7 items-center truncate text-[10px] text-muted-foreground"
                          title={`${track.elementId} · ${track.property}`}
                        >
                          {track.elementId} · {track.property}
                        </div>
                      ))}
                    </div>
                    <div className="relative min-w-0">
                      <div
                        className="pointer-events-none absolute inset-y-0 z-10 w-px bg-sky-200/90 shadow-[0_0_8px_#38bdf8]"
                        style={{ left: `${playheadProgress * 100}%` }}
                      />
                      <div className="space-y-2">
                        {proposal.tracks.map((track, index) => (
                          <div
                            key={`${track.elementId}-${track.property}-${index}`}
                            className="relative h-7 rounded-md border border-border/50 bg-background/50"
                          >
                            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                            {track.keyframes.map((keyframe, frameIndex) => (
                              <button
                                key={`${keyframe.timeMs}-${frameIndex}`}
                                type="button"
                                className="absolute top-1/2 z-20 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-100 bg-sky-400 shadow-[0_0_8px_#38bdf8] hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                                style={{
                                  left: `${Math.max(0, Math.min(100, (keyframe.timeMs / previewDurationMs) * 100))}%`,
                                }}
                                onClick={() => {
                                  setPlaying(false);
                                  seekPreview(keyframe.timeMs);
                                }}
                                aria-label={`${track.property} keyframe at ${(keyframe.timeMs / 1000).toFixed(2)} seconds`}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                      {(previewTimeMs / 1000).toFixed(2)}s
                    </span>
                    <Slider
                      value={[Math.min(previewTimeMs, previewDurationMs)]}
                      onValueChange={(value) => {
                        setPlaying(false);
                        seekPreview(value[0]);
                      }}
                      min={0}
                      max={previewDurationMs}
                      step={Math.max(1, Math.round(1000 / (project?.fps ?? 30)))}
                      aria-label="Scrub surface preview"
                    />
                    <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground">
                      {(previewDurationMs / 1000).toFixed(2)}s
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground">
                  No tracks yet
                </div>
              )}
            </div>
          </section>

          <aside
            className="flex min-h-[420px] w-full shrink-0 flex-col border-t border-border/60 md:w-[400px] md:min-w-[400px] md:border-l md:border-t-0"
            aria-label="Surface generation copilot"
          >
            <div className="shrink-0 border-b border-border/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <SparklesIcon className="size-3.5 text-sky-300" />
                    Surface Specialist
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Vector layers + tracks, validated before insertion.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[10px] text-muted-foreground"
                  onClick={() => {
                    clearMessages();
                    clearProposal();
                    resetPreview();
                  }}
                  disabled={messages.length === 0 && !proposal}
                >
                  Clear
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex justify-between text-[10px]">
                    <Label className="text-muted-foreground">Motion intensity</Label>
                    <span className="font-mono">{intensity[0]}%</span>
                  </div>
                  <Slider
                    value={intensity}
                    onValueChange={(value) => {
                      setIntensity(value);
                      clearProposal();
                      resetPreview();
                    }}
                    min={0}
                    max={100}
                    step={1}
                    aria-label="Surface motion intensity"
                    disabled={isStreaming}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'mt-4 h-6 shrink-0 px-2 text-[9px]',
                    loop && 'border-sky-400/50 bg-sky-400/[0.08] text-sky-200',
                  )}
                  onClick={() => {
                    setLoop((value) => !value);
                    clearProposal();
                    resetPreview();
                  }}
                  disabled={isStreaming}
                >
                  {loop ? 'Seamless loop' : 'One-shot'}
                </Button>
              </div>
            </div>

            <SidebarContent className="min-h-0 flex-1 p-0">
              <Conversation className="h-full">
                <ConversationContent className="p-0 pb-6">
                  <MessageList
                    messages={messages}
                    status={status}
                    error={error}
                    onApproval={() => {}}
                    onRetry={runPrompt}
                    emptyState={
                      <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center">
                        <div className="rounded-full border border-sky-400/20 bg-sky-400/10 p-3 text-sky-300">
                          <WallpaperIcon className="size-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Build a backdrop
                          </p>
                          <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                            Describe the surface you want. The specialist emits
                            SVG plus editable tracks, imports it with the real
                            parser and checks the result before you insert it.
                          </p>
                        </div>
                        <div className="flex w-full max-w-sm flex-col gap-2">
                          {QUICK_PROMPTS.map((quickPrompt) => (
                            <button
                              key={quickPrompt}
                              type="button"
                              onClick={() => runPrompt(quickPrompt)}
                              disabled={!request || isStreaming}
                              className="rounded-lg border border-border/60 bg-secondary/30 p-2.5 text-left text-[10px] text-muted-foreground transition-colors hover:border-sky-400/40 hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
                            >
                              {quickPrompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    }
                  />
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </SidebarContent>

            {proposal ? (
              <div className="shrink-0 border-t border-sky-400/20 bg-sky-400/[0.05] px-3 py-2.5">
                <p className="text-[10px] font-medium text-foreground">
                  {proposal.summary}
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  {proposal.tracks.length} timeline tracks ·{' '}
                  {Object.keys(proposal.fragment.elements).length} layers ·{' '}
                  {proposal.report.expandedUses
                    ? `${proposal.report.expandedUses} use refs expanded · `
                    : ''}
                  validated
                </p>
                {applyError ? (
                  <p role="alert" className="mt-1 text-[9px] leading-relaxed text-red-300">
                    {applyError}
                  </p>
                ) : null}
                {proposal.visualReview?.performed ? (
                  <p className="mt-1 line-clamp-3 text-[9px] leading-relaxed text-muted-foreground">
                    {proposal.visualReview.notes}
                  </p>
                ) : null}
                {proposal.visualReview && !proposal.visualReview.performed ? (
                  <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-300">
                    Visual review unavailable: {proposal.visualReview.notes}
                  </p>
                ) : null}
                {proposal.warnings.slice(0, 5).map((warning, index) => (
                  <p
                    key={index}
                    className="mt-1 text-[9px] leading-relaxed text-amber-300"
                  >
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <SidebarFooter className="border-t border-border/40 bg-card/60 p-3">
              <PromptInput onSubmit={({ text }) => runPrompt(text)}>
                <PromptInputBody>
                  <PromptInputTextarea
                    placeholder={
                      request
                        ? 'Describe the background or surface you want…'
                        : 'Open a Trace project first…'
                    }
                    className="min-h-12 text-xs"
                    disabled={!request || isStreaming}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <span className="text-[9px] text-muted-foreground">
                      SVG → layers · tracks stay editable
                    </span>
                  </PromptInputTools>
                  <PromptInputSubmit
                    status={status}
                    onStop={abortStream}
                    disabled={!request}
                  />
                </PromptInputFooter>
              </PromptInput>
            </SidebarFooter>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}