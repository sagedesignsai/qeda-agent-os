/**
 * components/trace/dialogs/AnimateSvgDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Wide two-column workspace for the Animate SVG add-on. AI plans are previewed
 * on a temporary project copy and committed as editable timeline tracks on apply.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLinesIcon,
  FlameIcon,
  MoveUpRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  SparklesIcon,
  WavesIcon,
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
import type { TraceProject } from '@/lib/trace/types';
import type { SvgAnimationPlayback, TraceAnimationPlan } from '@/lib/trace/animation-plan';
import { useTraceStore } from '@/stores/trace-store';
import { useSvgAnimationAgent } from '@/hooks/use-svg-animation-agent';
import { cn } from '@/lib/utils';

export type AnimateSvgDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetElementId?: string | null;
  targetElementName?: string | null;
  onApplyAnimation: (plan: TraceAnimationPlan) => boolean | void;
};

const MOTIONS = [
  { id: 'custom', label: 'Auto', detail: 'Follow your direction', icon: SparklesIcon },
  { id: 'flicker', label: 'Flicker', detail: 'A lively, irregular flame', icon: FlameIcon },
  { id: 'sway', label: 'Sway', detail: 'A soft side-to-side drift', icon: WavesIcon },
  { id: 'pulse', label: 'Pulse', detail: 'A warm breathing glow', icon: AudioLinesIcon },
  { id: 'reveal', label: 'Reveal', detail: 'Fade the artwork into view', icon: MoveUpRightIcon },
] as const;

function focusedElementProject(
  project: TraceProject,
  targetElementId: string,
): TraceProject | null {
  const target = project.elements[targetElementId];
  if (!target) return null;

  const ancestorChain: string[] = [];
  const seen = new Set<string>();
  let cursor: typeof target | undefined = target;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    ancestorChain.push(cursor.id);
    cursor = cursor.parentId ? project.elements[cursor.parentId] : undefined;
  }

  const included = new Set(ancestorChain);
  const addDescendants = (id: string) => {
    const stack = [...(project.elements[id]?.childrenIds ?? [])];
    while (stack.length) {
      const childId = stack.pop()!;
      if (included.has(childId) || !project.elements[childId]) continue;
      included.add(childId);
      stack.push(...(project.elements[childId].childrenIds ?? []));
    }
  };
  addDescendants(targetElementId);

  const elements: TraceProject['elements'] = {};
  for (const id of included) {
    const element = project.elements[id];
    if (!element) continue;
    const ancestorIndex = ancestorChain.indexOf(id);
    const childrenIds =
      ancestorIndex > 0
        ? [ancestorChain[ancestorIndex - 1]]
        : (element.childrenIds ?? []).filter((childId) => included.has(childId));
    elements[id] = { ...element, childrenIds };
  }

  return {
    ...project,
    elements,
    rootElementIds: [ancestorChain[ancestorChain.length - 1] ?? targetElementId],
  };
}

export function AnimateSvgDialog({
  open,
  onOpenChange,
  targetElementId,
  targetElementName,
  onApplyAnimation,
}: AnimateSvgDialogProps) {
  const project = useTraceStore((state) => state.project);
  const previewProject = useMemo(
    () =>
      project && targetElementId
        ? focusedElementProject(project, targetElementId)
        : null,
    [project, targetElementId],
  );
  const [motion, setMotion] = useState<(typeof MOTIONS)[number]['id']>('custom');
  const [playback, setPlayback] = useState<SvgAnimationPlayback>('auto');
  const [intensity, setIntensity] = useState([58]);
  const [duration, setDuration] = useState([3]);
  const [playing, setPlaying] = useState(false);
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const previewTimeRef = useRef(0);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const {
    messages,
    status,
    error,
    sendMessage,
    clearMessages,
    abortStream,
    proposal: plan,
    clearProposal,
  } = useSvgAnimationAgent({
    project: previewProject,
    targetElementId,
    motion,
    playback,
    durationMs: Math.round(Math.min(duration[0], (project?.durationMs ?? 8000) / 1000) * 1000),
    intensity: intensity[0],
  });
  const isStreaming = status === 'streaming';
  const clearProposalAndPause = useCallback(() => {
    clearProposal();
    setConfirmReplace(false);
    setApplyError(null);
    setPlaying(false);
    previewTimeRef.current = 0;
    setPreviewTimeMs(0);
  }, [clearProposal]);
  useEffect(() => {
    if (!open) return;
    clearProposal();
    clearMessages();
    setConfirmReplace(false);
    setApplyError(null);
    setPlaying(false);
    previewTimeRef.current = 0;
    setPreviewTimeMs(0);
  }, [open, targetElementId, clearProposal, clearMessages]);
  const durationLimit = Math.max(0.1, (project?.durationMs ?? 8000) / 1000);
  const selectedDuration = Math.min(duration[0], durationLimit);
  const previewDurationMs = Math.max(1, plan?.durationMs ?? Math.round(selectedDuration * 1000));
  const previewDurationSeconds = previewDurationMs / 1000;
  const canAnimate = Boolean(targetElementId && previewProject);
  const conflicts = useMemo(() => plan?.tracks.flatMap((track) => {
    const element = project?.elements[track.elementId];
    const existing = element?.tracks.find((entry) => entry.property === track.property);
    return existing ? [{ elementId: track.elementId, name: element.name, property: track.property, label: existing.label }] : [];
  }) ?? [], [plan, project]);

  const seekPreview = useCallback((timeMs: number) => {
    previewTimeRef.current = timeMs;
    setPreviewTimeMs(timeMs);
  }, []);
  const runPrompt = useCallback((text: string) => {
    const value = text.trim();
    if (!value || !targetElementId || !previewProject || isStreaming) return;
    clearProposalAndPause();
    sendMessage(value);
  }, [targetElementId, previewProject, isStreaming, clearProposalAndPause, sendMessage]);

  useEffect(() => {
    if (!playing || !plan) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = now - previous;
      previous = now;
      const durationMs = previewDurationMs;
      const nextTime = previewTimeRef.current + elapsed;
      if (plan.playback === 'once' && nextTime >= durationMs) {
        seekPreview(durationMs);
        setPlaying(false);
        return;
      }
      seekPreview(nextTime % durationMs);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, plan, previewDurationMs, seekPreview]);

  useEffect(() => {
    if (!plan) return;
    setDuration([Math.min(plan.durationMs / 1000, durationLimit)]);
    seekPreview(0);
    setPlaying(true);
    setConfirmReplace(false);
    setApplyError(null);
  }, [plan, durationLimit, seekPreview]);

  const animatedPreviewProject = useMemo(() => {
    if (!previewProject || !plan) return previewProject;
    const copy = structuredClone(previewProject);
    for (const planned of plan.tracks) {
      const element = copy.elements[planned.elementId];
      if (!element) continue;
      const existing = element.tracks.find((track) => track.property === planned.property);
      const keyframes = planned.keyframes.map((keyframe, index) => ({
        id: `addon-preview-${planned.elementId}-${planned.property}-${index}`,
        timeMs: keyframe.timeMs,
        value: keyframe.value,
        easing: keyframe.easing,
      }));
      if (existing) existing.keyframes = keyframes;
      else element.tracks.push({ id: `addon-preview-${planned.elementId}-${planned.property}`, property: planned.property, label: planned.property, keyframes });
    }
    return copy;
  }, [previewProject, plan]);

  const handleClearConversation = () => {
    clearMessages();
    clearProposalAndPause();
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isStreaming) abortStream();
    onOpenChange(nextOpen);
  };
  const applyPlan = () => {
    if (!plan) return;
    if (conflicts.length > 0 && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    const applied = onApplyAnimation(plan);
    if (applied === false) {
      setApplyError('The project changed before this plan could be applied. Review the selected SVG and generate a fresh proposal.');
      return;
    }
    onOpenChange(false);
  };
  const playheadProgress = Math.max(0, Math.min(1, previewTimeMs / previewDurationMs));
  const quickPrompts = [
    'Make this a smooth, seamless loop.',
    'Animate the inner shapes more than the outer silhouette.',
    'Keep the movement subtle and premium.',
  ];

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex h-[min(800px,calc(100dvh-2rem))] w-[min(1320px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden border-border bg-card p-0 text-foreground">
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-3 pr-14">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span className="flex size-7 items-center justify-center rounded-lg border border-orange-400/20 bg-orange-400/10 text-orange-300">
                  <SparklesIcon className="size-3.5" />
                </span>
                Animate SVG
                <span className="truncate text-xs font-normal text-muted-foreground">{targetElementName || 'No layer selected'}</span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                Describe motion to the SVG specialist, inspect real keyframes, and preview the animation before applying it.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status === 'streaming' ? <Badge variant="outline" className="border-orange-400/30 text-orange-300">Working</Badge> : null}
              {plan ? (
                <Button type="button" size="sm" className="h-8 gap-1.5 bg-orange-400 px-3 text-xs font-medium text-slate-950 hover:bg-orange-300" onClick={applyPlan} disabled={isStreaming}>
                  <SparklesIcon className="size-3.5" /> {conflicts.length ? (confirmReplace ? `Confirm replacing ${conflicts.length} tracks` : `Review ${conflicts.length} track conflicts`) : 'Apply animation'}
                </Button>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <section className="flex min-h-[390px] min-w-0 flex-1 flex-col border-b border-border/70 p-4 md:border-r md:border-b-0 md:p-5" aria-label="SVG preview and animation timeline">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-[#0c111a]">
              <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(45deg,#ffffff08_25%,transparent_25%),linear-gradient(-45deg,#ffffff08_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ffffff08_75%),linear-gradient(-45deg,transparent_75%,#ffffff08_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0px] [background-size:16px_16px]" />
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-white/10 bg-black/35 px-2.5 py-1.5 text-[10px] text-slate-300 backdrop-blur-sm">
                <span className={cn('size-1.5 rounded-full', plan ? 'bg-orange-400 shadow-[0_0_10px_#fb923c]' : 'bg-slate-500')} />
                {plan ? 'Animation preview' : 'Original artwork'}
              </div>
              {animatedPreviewProject ? (
                <div className="relative h-full w-full p-8 drop-shadow-[0_0_44px_rgba(249,115,22,0.18)]">
                  <TraceRenderer project={animatedPreviewProject} timeMs={previewTimeMs} interactive={false} svgId="trace-addon-preview-svg" elementIdPrefix="trace-addon-elem" className="size-full" />
                  <div className="absolute bottom-3 right-3 rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">{(previewTimeMs / 1000).toFixed(2)}s / {previewDurationSeconds.toFixed(2)}s</div>
                </div>
              ) : (
                <div className="relative z-10 flex max-w-xs flex-col items-center gap-3 px-6 text-center">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground"><SparklesIcon className="size-5" /></span>
                  <div>
                    <p className="text-sm font-medium text-foreground">Select an SVG layer</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose artwork in the Explorer, then open Animate SVG from its context menu or the Command Bar.</p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
                <Button type="button" size="icon-sm" variant="secondary" className="size-8 border border-white/10 bg-white/10 text-white hover:bg-white/15" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause preview' : 'Play preview'} disabled={!plan}>
                  {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
                </Button>
                <Button type="button" size="icon-sm" variant="secondary" className="size-8 border border-white/10 bg-white/10 text-white hover:bg-white/15" onClick={() => { setPlaying(false); seekPreview(0); }} aria-label="Reset preview" disabled={!plan}>
                  <RotateCwIcon className="size-3.5" />
                </Button>
                <span className="text-[10px] text-slate-400">{playing ? (plan?.playback === 'loop' ? 'Playing loop' : 'Playing once') : plan ? 'Preview paused' : 'Awaiting motion'}</span>
              </div>
            </div>

            <div className="mt-3 shrink-0 rounded-xl border border-border/70 bg-background/30 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">Animation timeline</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{plan ? `${plan.tracks.length} editable tracks · ${previewDurationSeconds.toFixed(1)} seconds · ${plan.playback}` : 'Tracks and keyframes appear here after the specialist proposes motion.'}</p>
                </div>
                {plan?.visualReview ? <Badge variant="outline" className="shrink-0 border-border/80 text-[9px]">{plan.visualReview.performed ? 'Frame reviewed' : 'Preview ready'}</Badge> : null}
              </div>
              {plan ? (
                <>
                  <div className="mb-1 grid grid-cols-[100px_minmax(0,1fr)] gap-2 text-[9px] font-mono text-muted-foreground">
                    <span>TRACK</span>
                    <div className="flex justify-between"><span>0.0s</span><span>{(previewDurationSeconds / 2).toFixed(1)}s</span><span>{previewDurationSeconds.toFixed(1)}s</span></div>
                  </div>
                  <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-2">
                    <div className="space-y-2">
                      {plan.tracks.map((track, index) => { const label = `${project?.elements[track.elementId]?.name || track.property} · ${track.property}`; return <div key={`${track.elementId}-${track.property}-${index}`} className="flex h-7 items-center truncate text-[10px] text-muted-foreground" title={label}>{label}</div>; })}
                    </div>
                    <div className="relative min-w-0">
                      <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-orange-200/90 shadow-[0_0_8px_#fb923c]" style={{ left: `${playheadProgress * 100}%` }} />
                      <div className="space-y-2">
                        {plan.tracks.map((track, index) => (
                          <div key={`${track.elementId}-${track.property}-${index}`} className="relative h-7 rounded-md border border-border/50 bg-background/50">
                            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                            {track.keyframes.map((keyframe, frameIndex) => (
                              <button key={`${keyframe.timeMs}-${frameIndex}`} type="button" className="absolute top-1/2 z-20 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-100 bg-orange-400 shadow-[0_0_8px_#fb923c] hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300" style={{ left: `${Math.max(0, Math.min(100, keyframe.timeMs / previewDurationMs * 100))}%` }} onClick={() => { setPlaying(false); seekPreview(keyframe.timeMs); }} aria-label={`${track.property} keyframe at ${(keyframe.timeMs / 1000).toFixed(2)} seconds`} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{(previewTimeMs / 1000).toFixed(2)}s</span>
                    <Slider value={[Math.min(previewTimeMs, previewDurationMs)]} onValueChange={(value) => { setPlaying(false); seekPreview(value[0]); }} min={0} max={previewDurationMs} step={Math.max(1, Math.round(1000 / (project?.fps ?? 30)))} aria-label="Scrub animation preview" />
                    <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground">{previewDurationSeconds.toFixed(2)}s</span>
                  </div>
                </>
              ) : (
                <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground">No keyframes yet</div>
              )}
            </div>
          </section>

          <aside className="flex min-h-[420px] w-full shrink-0 flex-col border-t border-border/60 md:w-[390px] md:min-w-[390px] md:border-l md:border-t-0" aria-label="SVG animation copilot">
            <div className="shrink-0 border-b border-border/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><SparklesIcon className="size-3.5 text-orange-300" />SVG Animation Specialist</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Describe the animation you want; presets are optional hints.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-muted-foreground" onClick={handleClearConversation} disabled={messages.length === 0 && !plan}>Clear</Button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
                {MOTIONS.map((entry) => {
                  const Icon = entry.icon;
                  const active = motion === entry.id;
                  return <Button key={entry.id} type="button" variant="outline" size="sm" className={cn('h-7 shrink-0 gap-1.5 px-2 text-[10px]', active && 'border-orange-400/50 bg-orange-400/[0.08] text-orange-200')} onClick={() => { setMotion(entry.id); clearProposalAndPause(); }} disabled={isStreaming}><Icon className="size-3" />{entry.label}</Button>;
                })}
              </div>
              <div className="mt-2 flex items-center gap-1.5" aria-label="Playback preference">
                <span className="mr-1 text-[9px] text-muted-foreground">Playback</span>
                {(['auto', 'once', 'loop'] as const).map((mode) => (
                  <Button key={mode} type="button" variant="outline" size="sm" className={cn('h-6 px-2 text-[9px] capitalize', playback === mode && 'border-orange-400/50 bg-orange-400/[0.08] text-orange-200')} onClick={() => { setPlayback(mode); clearProposalAndPause(); }} disabled={isStreaming}>{mode}</Button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-[10px]"><Label className="text-muted-foreground">Intensity</Label><span className="font-mono">{intensity[0]}%</span></div>
                  <Slider value={intensity} onValueChange={(value) => { setIntensity(value); clearProposalAndPause(); }} min={0} max={100} step={1} aria-label="Motion intensity" disabled={isStreaming} />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-[10px]"><Label className="text-muted-foreground">Preferred duration</Label><span className="font-mono">{selectedDuration.toFixed(1)}s</span></div>
                  <Slider value={[selectedDuration]} onValueChange={(value) => { setDuration(value); clearProposalAndPause(); }} min={Math.min(1, durationLimit)} max={durationLimit} step={durationLimit < 0.5 ? 0.1 : 0.5} aria-label="Animation duration" disabled={isStreaming} />
                </div>
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
                    emptyState={(
                      <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center">
                        <div className="rounded-full border border-orange-400/20 bg-orange-400/10 p-3 text-orange-300"><SparklesIcon className="size-5" /></div>
                        <div><p className="text-sm font-semibold text-foreground">Animate this artwork</p><p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground">Describe an entrance, stinger, loop, or other motion. The specialist inspects the artwork, builds keyframes, and checks the result before you apply it.</p></div>
                        <div className="flex w-full max-w-sm flex-col gap-2">
                          {quickPrompts.map((quickPrompt) => <button key={quickPrompt} type="button" onClick={() => runPrompt(quickPrompt)} disabled={!canAnimate || isStreaming} className="rounded-lg border border-border/60 bg-secondary/30 p-2.5 text-left text-[10px] text-muted-foreground transition-colors hover:border-orange-400/40 hover:bg-secondary/60 hover:text-foreground disabled:opacity-50">{quickPrompt}</button>)}
                        </div>
                      </div>
                    )}
                  />
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </SidebarContent>

            {plan ? (
              <div className="shrink-0 border-t border-orange-400/20 bg-orange-400/[0.05] px-3 py-2.5">
                <p className="text-[10px] font-medium text-foreground">{plan.summary}</p>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{plan.tracks.length} timeline tracks · {plan.playback === 'once' ? 'plays once' : 'loops'}{plan.visualReview?.performed ? ' · frames reviewed' : ''}</p>
                {applyError ? <p role="alert" className="mt-1 text-[9px] leading-relaxed text-red-300">{applyError}</p> : null}
                {plan.visualReview?.performed ? <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">{plan.visualReview.notes}</p> : null}
                {plan.visualReview && !plan.visualReview.performed ? <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-300">Visual review unavailable: {plan.visualReview.notes}</p> : null}
                {plan.warnings?.map((warning, index) => <p key={index} className="mt-1 text-[9px] leading-relaxed text-amber-300">{warning}</p>)}
                {conflicts.length > 0 ? (
                  <div className="mt-2 rounded-md border border-amber-400/25 bg-amber-400/[0.06] p-2">
                    <p className="text-[9px] font-medium text-amber-200">Applying this plan replaces {conflicts.length} existing track{conflicts.length === 1 ? '' : 's'}:</p>
                    <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{conflicts.map((conflict) => `${conflict.name} · ${conflict.label} (${conflict.property})`).join(', ')}</p>
                    {confirmReplace ? <div className="mt-2 flex items-center gap-2"><span className="text-[9px] text-amber-200">Confirm replacement to continue.</span><Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[9px]" onClick={() => setConfirmReplace(false)}>Cancel</Button></div> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <SidebarFooter className="border-t border-border/40 bg-card/60 p-3">
              <PromptInput onSubmit={({ text }) => runPrompt(text)}>
                <PromptInputBody>
                  <PromptInputTextarea placeholder={canAnimate ? 'Describe the animation you want…' : 'Select an SVG layer first…'} className="min-h-12 text-xs" disabled={!canAnimate || isStreaming} />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools><span className="text-[9px] text-muted-foreground">{targetElementId ? `${targetElementName || 'Selected layer'} · tracks stay editable` : 'Pick an SVG in Explorer'}</span></PromptInputTools>
                  <PromptInputSubmit status={status} onStop={abortStream} disabled={!canAnimate} />
                </PromptInputFooter>
              </PromptInput>
            </SidebarFooter>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
