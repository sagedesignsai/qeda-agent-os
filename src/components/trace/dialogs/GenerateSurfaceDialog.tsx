/**
 * components/trace/dialogs/GenerateSurfaceDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Surface Generator add-on workspace. Describe a backdrop, review the generated
 * layers over time, then insert the validated fragment at the back of the stack.
 *
 * The preview is realtime: the moment the specialist's proposeSurface tool
 * compiles a valid proposal, the staged fragment streams in and plays. Playback
 * drives the SVG DOM directly through the runtime renderer (mount once, mutate
 * per frame) instead of re-rendering React at 60fps, which is what kept large
 * surfaces laggy. Completed proposals are persisted, as is the chat itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HistoryIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  SparklesIcon,
  WallpaperIcon,
  XIcon,
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
import { useIpcEvent } from '@/hooks/use-ipc';
import { applyElementAnimationAtTime } from '@/lib/trace/runtime/dom-renderer';
import {
  surfaceProposalProject,
  type SurfaceGenerationProposal,
  type SurfaceGenerationRequest,
} from '@/lib/trace/addons/surfaces/generation';
import type { TraceSurfaceSummary } from '@/main/ipc/channels';
import type { TraceProject } from '@/lib/trace/types';
import { cn } from '@/lib/utils';
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup';
import type { SvgAnimationProperty } from '@/lib/trace/animation-plan';
import { RecipeFieldControl } from '@/components/trace/dialogs/RecipeSetupDialog';
import { SURFACE_BLOCKS } from '@/lib/trace/addons';
import { blockDefaults, blockPreviewSvg, getBlock, instantiateBlock } from '@/lib/trace/blocks';

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

/** Preview DOM-sync cap. 40fps reads as smooth while staying cheap. */
const PREVIEW_FRAME_MS = 25;
/** UI state (timecode, slider, keyframe playhead) refresh interval. */
const PREVIEW_UI_INTERVAL_MS = 120;

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
  const [applyError, setApplyError] = useState<string | null>(null);
  const [history, setHistory] = useState<TraceSurfaceSummary[]>([]);
  const [historySelection, setHistorySelection] = useState<{
    id: string;
    proposal: SurfaceGenerationProposal;
  } | null>(null);
  const [view, setView] = useState<'templates' | 'generate'>('templates');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    SURFACE_BLOCKS[0]?.id ?? null,
  );
  const [templateValues, setTemplateValues] = useState<Record<string, unknown>>(
    {},
  );
  const previewTimeRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const nodeMapRef = useRef(new Map<string, SVGGElement>());
  const previewProjectRef = useRef<TraceProject | null>(null);

  const request = useMemo<SurfaceGenerationRequest | null>(() => {
    if (!project) return null;
    return {
      width: project.width,
      height: project.height,
      durationMs: project.durationMs,
      fps: project.fps,
      prompt: '',
      projectId: project.id,
      intensity: intensity[0],
      loop,
      projectName: project.name,
      ...(project.style ? { style: project.style } : {}),
    };
  }, [project, intensity, loop]);

  useEffect(() => {
    const block = selectedTemplateId ? getBlock(selectedTemplateId) : null;
    if (block) setTemplateValues(blockDefaults(block));
  }, [selectedTemplateId]);

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
  // A saved surface selected from history stands in until a fresh proposal
  // arrives (the staged event replaces it mid-turn).
  const templateProposal = useMemo(() => {
    if (view !== 'templates' || !project || !selectedTemplateId) return null;
    const block = getBlock(selectedTemplateId);
    if (!block) return null;
    try {
      const { fragment } = instantiateBlock(selectedTemplateId, templateValues, {
        canvas: { width: project.width, height: project.height },
        ...(project.style ? { style: project.style } : {}),
      });
      const tracks = Object.values(fragment.elements).flatMap((element: any) =>
        (element.tracks ?? []).map((track: any) => ({
          elementId: element.id,
          property: track.property as SvgAnimationProperty,
          keyframes: track.keyframes.map((keyframe: any) => ({
            timeMs: keyframe.timeMs,
            value: keyframe.value,
            easing: keyframe.easing,
          })),
        })),
      );
      const proposal: SurfaceGenerationProposal = {
        summary: block.title,
        width: project.width,
        height: project.height,
        durationMs: project.durationMs,
        loop: true,
        fragment,
        tracks,
        report: {
          width: project.width,
          height: project.height,
          elementCount: Object.keys(fragment.elements).length,
          droppedTags: {},
          droppedAttributes: {},
          expandedUses: 0,
          warnings: [],
        },
        warnings: [],
        previewSvg: '',
        previewTimeMs: block.previewTimeMs ?? 1400,
        visualReview: {
          performed: false,
          notes: 'Predefined surface template.',
        },
      };
      proposal.previewSvg = staticSvgMarkup(
        surfaceProposalProject(proposal),
        block.previewTimeMs ?? 1400,
      );
      return proposal;
    } catch {
      return null;
    }
  }, [view, project, selectedTemplateId, templateValues]);

  const activeProposal =
    view === 'templates'
      ? templateProposal
      : proposal ?? historySelection?.proposal ?? null;
  const previewProject = useMemo(
    () => (activeProposal ? surfaceProposalProject(activeProposal) : null),
    [activeProposal],
  );
  const previewDurationMs = Math.max(
    1,
    activeProposal?.durationMs ?? project?.durationMs ?? 1,
  );

  useEffect(() => {
    previewProjectRef.current = previewProject;
  }, [previewProject]);

  // ── Durable chat session ────────────────────────────────────────────────
  const chatSessionId = `trace-surface-generation:${project?.id ?? 'scratch'}`;
  useEffect(() => {
    if (!project) return;
    // Idempotent: the persisted session's row must exist before the first
    // turn saves messages (the message table has a foreign key).
    window.electron.ipc
      .invoke('sessions:ensure', {
        id: chatSessionId,
        title: 'Surface Generator',
        projectId: project.id,
      })
      .catch(() => {
        // Persistence is best-effort.
      });
  }, [chatSessionId, project]);

  // ── Persisted surface history ────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    try {
      const result = await window.electron.ipc.invoke<{
        surfaces: TraceSurfaceSummary[];
      }>('trace-surface-generation:list', { limit: 24 });
      setHistory(result?.surfaces ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshHistory();
  }, [open, refreshHistory]);

  useIpcEvent(
    'trace-surface-generation:saved',
    (raw: unknown) => {
      const payload = raw as { surface?: TraceSurfaceSummary };
      if (!payload.surface) return;
      const surface = payload.surface;
      setHistory((current) => [
        surface,
        ...current.filter((entry) => entry.id !== surface.id),
      ].slice(0, 24));
    },
    [],
  );

  const selectHistorySurface = useCallback(
    async (id: string) => {
      try {
        const result = await window.electron.ipc.invoke<{
          proposal: SurfaceGenerationProposal | null;
        }>('trace-surface-generation:load', { id });
        if (result?.proposal) {
          clearProposal();
          setHistorySelection({ id, proposal: result.proposal });
        }
      } catch {
        // Ignore load failures; the card stays clickable.
      }
    },
    [clearProposal],
  );

  const deleteHistorySurface = useCallback(
    async (id: string) => {
      setHistory((current) => current.filter((entry) => entry.id !== id));
      setHistorySelection((current) =>
        current?.id === id ? null : current,
      );
      try {
        await window.electron.ipc.invoke('trace-surface-generation:delete', {
          id,
        });
      } catch {
        // Best-effort.
      }
    },
    [],
  );

  // ── Fast preview: mount once, mutate the SVG DOM per frame ───────────────
  const syncPreviewDom = useCallback((timeMs: number) => {
    const doc = previewProjectRef.current;
    if (!doc) return;
    const nodeMap = nodeMapRef.current;
    if (nodeMap.size === 0) return;
    for (const element of Object.values(doc.elements)) {
      const node = nodeMap.get(element.id);
      if (node) applyElementAnimationAtTime(node, element, timeMs);
    }
  }, []);

  const seekPreview = useCallback(
    (timeMs: number) => {
      previewTimeRef.current = timeMs;
      setPreviewTimeMs(timeMs);
      syncPreviewDom(timeMs);
    },
    [syncPreviewDom],
  );

  // Rebuild the node map whenever a new proposal mounts, then paint the
  // current moment so the first frame is not the t=0 React render.
  useEffect(() => {
    const container = stageContainerRef.current;
    nodeMapRef.current = new Map();
    if (!container || !previewProject) return;
    const nodes = container.querySelectorAll<SVGGElement>('[data-trace-id]');
    for (const node of nodes) {
      const id = node.getAttribute('data-trace-id');
      if (id) nodeMapRef.current.set(id, node);
    }
    syncPreviewDom(previewTimeRef.current);
  }, [previewProject, syncPreviewDom]);

  const resetPreview = useCallback(() => {
    setPlaying(false);
    previewTimeRef.current = 0;
    setPreviewTimeMs(0);
    setApplyError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    // The conversation persists across opens; only playback state resets.
    clearProposal();
    setHistorySelection(null);
    resetPreview();
    setView('templates');
  }, [open, clearProposal, resetPreview]);

  // Show the most recent persisted surface while the session is idle, so the
  // workspace is never an empty canvas after a reopen.
  useEffect(() => {
    if (!open || proposal || historySelection || history.length === 0) return;
    void selectHistorySurface(history[0].id);
  }, [open, proposal, historySelection, history, selectHistorySurface]);

  useEffect(() => {
    if (!activeProposal) return;
    previewTimeRef.current = 0;
    setPreviewTimeMs(0);
    setApplyError(null);
    setPlaying(true);
    syncPreviewDom(0);
  }, [activeProposal, syncPreviewDom]);

  useEffect(() => {
    if (!playing || !previewProject) return;
    let frame = 0;
    let previous = performance.now();
    let syncAccumulator = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(120, now - previous);
      previous = now;
      const next = (previewTimeRef.current + elapsed) % previewDurationMs;
      previewTimeRef.current = next;

      syncAccumulator += elapsed;
      if (syncAccumulator >= PREVIEW_FRAME_MS) {
        syncAccumulator = 0;
        syncPreviewDom(next);
      }
      if (now - lastUiUpdateRef.current >= PREVIEW_UI_INTERVAL_MS) {
        lastUiUpdateRef.current = now;
        setPreviewTimeMs(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, previewProject, previewDurationMs, syncPreviewDom]);

  const runPrompt = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || !request || isStreaming) return;
      clearProposal();
      setHistorySelection(null);
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
    if (!activeProposal) return;
    const applied = onApplySurface(activeProposal);
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

  // Mounted once per proposal; playback mutates the DOM, never React.
  const stage = useMemo(() => {
    if (!previewProject) return null;
    return (
      <TraceRenderer
        project={previewProject}
        timeMs={0}
        interactive={false}
        svgId="trace-surface-preview-svg"
        elementIdPrefix="trace-surface-preview"
        className="size-full"
      />
    );
  }, [previewProject]);

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
              <div className="flex items-center rounded-md border border-border/70 bg-background/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setView('templates')}
                  className={cn(
                    'rounded px-2 py-1 text-[10px] font-medium transition-colors',
                    view === 'templates'
                      ? 'bg-sky-500/15 text-sky-200'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Templates
                </button>
                <button
                  type="button"
                  onClick={() => setView('generate')}
                  className={cn(
                    'rounded px-2 py-1 text-[10px] font-medium transition-colors',
                    view === 'generate'
                      ? 'bg-sky-500/15 text-sky-200'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Generate
                </button>
              </div>
              {isStreaming ? (
                <Badge variant="outline" className="border-sky-400/30 text-sky-300">
                  Working
                </Badge>
              ) : null}
              {activeProposal ? (
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
                    activeProposal
                      ? proposal
                        ? 'bg-sky-400 shadow-[0_0_10px_#38bdf8]'
                        : 'bg-sky-300/70'
                      : 'bg-slate-500',
                  )}
                />
                {activeProposal
                  ? proposal
                    ? isStreaming
                      ? 'Live proposal'
                      : 'Surface preview'
                    : 'Saved surface'
                  : 'Awaiting a brief'}
              </div>
              <div
                ref={stageContainerRef}
                className="relative h-full w-full p-6 drop-shadow-[0_0_44px_rgba(56,189,248,0.14)]"
              >
                {stage}
                <div className="absolute bottom-3 right-3 rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
                  {(previewTimeMs / 1000).toFixed(2)}s /{' '}
                  {(previewDurationMs / 1000).toFixed(2)}s
                </div>
              </div>
              {!previewProject ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
                    <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground">
                      <WallpaperIcon className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {view === 'templates'
                          ? 'Select a template'
                          : 'Describe a surface'}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {view === 'templates'
                          ? 'Pick a predefined surface on the right to preview and insert it.'
                          : 'The specialist designs vector layers, stages editable tracks, validates the import and reviews rendered frames before anything is inserted.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="size-8 border border-white/10 bg-white/10 text-white hover:bg-white/15"
                  onClick={() => setPlaying((value) => !value)}
                  aria-label={playing ? 'Pause preview' : 'Play preview'}
                  disabled={!previewProject}
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
                  disabled={!previewProject}
                >
                  <RotateCwIcon className="size-3.5" />
                </Button>
                <span className="text-[10px] text-slate-400">
                  {playing
                    ? 'Playing loop'
                    : activeProposal
                      ? 'Preview paused'
                      : 'No preview yet'}
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
                    {activeProposal
                      ? `${activeProposal.tracks.length} editable tracks · ${Object.keys(activeProposal.fragment.elements).length} layers · ${(previewDurationMs / 1000).toFixed(1)}s`
                      : 'Tracks appear here after a valid proposal.'}
                  </p>
                </div>
                {activeProposal?.visualReview ? (
                  <Badge variant="outline" className="shrink-0 border-border/80 text-[9px]">
                    {activeProposal.visualReview.performed ? 'Frames reviewed' : 'Preview ready'}
                  </Badge>
                ) : null}
              </div>
              {activeProposal ? (
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
                      {activeProposal.tracks.map((track, index) => (
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
                        {activeProposal.tracks.map((track, index) => (
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
            {view === 'templates' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    Surface templates
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {SURFACE_BLOCKS.length} predefined
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SURFACE_BLOCKS.map((block) => {
                    const preview = blockPreviewSvg(
                      block,
                      blockDefaults(block),
                      block.previewTimeMs ?? 1400,
                      project?.style,
                    );
                    return (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(block.id)}
                        className={cn(
                          'overflow-hidden rounded-md border bg-[#070b14] text-left transition-colors',
                          selectedTemplateId === block.id
                            ? 'border-sky-400/60 ring-1 ring-sky-400/40'
                            : 'border-border/70 hover:border-sky-400/40',
                        )}
                      >
                        <div
                          className="aspect-video w-full [&>svg]:h-full [&>svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: preview }}
                        />
                        <div className="px-2 py-1.5">
                          <p className="truncate text-[10px] font-medium text-foreground">
                            {block.title}
                          </p>
                          <p className="line-clamp-2 text-[9px] leading-snug text-muted-foreground/70">
                            {block.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedTemplateId ? (
                  <div className="rounded-lg border border-border/60 bg-background/30 p-3">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                      Options
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {getBlock(selectedTemplateId)?.fields.map((field) => (
                        <RecipeFieldControl
                          key={field.key}
                          field={field}
                          value={templateValues[field.key]}
                          onChange={(value) =>
                            setTemplateValues((current) => ({
                              ...current,
                              [field.key]: value,
                            }))
                          }
                        />
                      ))}
                      {(getBlock(selectedTemplateId)?.fields.length ?? 0) === 0 ? (
                        <p className="text-[10px] text-muted-foreground">
                          No adjustable options.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
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
                    setHistorySelection(null);
                    resetPreview();
                  }}
                  disabled={messages.length === 0 && !activeProposal}
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
                      setHistorySelection(null);
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
                    setHistorySelection(null);
                    resetPreview();
                  }}
                  disabled={isStreaming}
                >
                  {loop ? 'Seamless loop' : 'One-shot'}
                </Button>
              </div>
            </div>

            {history.length > 0 ? (
              <div className="shrink-0 border-b border-border/60 px-4 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  <HistoryIcon className="size-3" />
                  Generated surfaces
                </p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {history.map((surface) => (
                    <div
                      key={surface.id}
                      className="group relative shrink-0 overflow-hidden rounded-md border border-border/70 bg-[#070b14]"
                      title={surface.summary}
                    >
                      <button
                        type="button"
                        className="block h-14 w-24"
                        onClick={() => void selectHistorySurface(surface.id)}
                        aria-label={`Preview ${surface.summary}`}
                      >
                        <img
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(surface.thumbnailSvg)}`}
                          alt=""
                          className="size-full object-cover"
                          draggable={false}
                        />
                      </button>
                      <button
                        type="button"
                        className="absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded-sm bg-black/70 text-slate-300 hover:text-red-300 group-hover:flex"
                        onClick={() => void deleteHistorySurface(surface.id)}
                        aria-label={`Delete ${surface.summary}`}
                      >
                        <XIcon className="size-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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

            {activeProposal ? (
              <div className="shrink-0 border-t border-sky-400/20 bg-sky-400/[0.05] px-3 py-2.5">
                <p className="text-[10px] font-medium text-foreground">
                  {activeProposal.summary}
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  {activeProposal.tracks.length} timeline tracks ·{' '}
                  {Object.keys(activeProposal.fragment.elements).length} layers ·{' '}
                  {activeProposal.loop ? 'seamless loop' : 'one-shot'}
                </p>
                {applyError ? (
                  <p role="alert" className="mt-1 text-[9px] leading-relaxed text-red-300">
                    {applyError}
                  </p>
                ) : null}
                {activeProposal.visualReview?.performed ? (
                  <p className="mt-1 line-clamp-3 text-[9px] leading-relaxed text-muted-foreground">
                    {activeProposal.visualReview.notes}
                  </p>
                ) : null}
                {activeProposal.visualReview && !activeProposal.visualReview.performed ? (
                  <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-amber-300">
                    Visual review unavailable: {activeProposal.visualReview.notes}
                  </p>
                ) : null}
                {activeProposal.warnings.slice(0, 4).map((warning, index) => (
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
              </>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}