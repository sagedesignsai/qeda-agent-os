/**
 * renderer/pages/Studio.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Showcase Studio route view (/studio and /studio/:takeId).
 *
 * An agent-powered video showcase editor that consolidates:
 *   - Screen & window recording with global cursor telemetry
 *   - Real-time 60fps Canvas preview with kinetic zoom curves & wallpaper styling
 *   - Autonomous Magic Draft (silence trimming & smart camera zoom)
 *   - Project-aware social release kits (X/Twitter, GitHub release notes, LinkedIn)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  VideoIcon,
  FolderKanbanIcon,
  Trash2Icon,
  PlusIcon,
  Share2Icon,
  DownloadIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  LayersIcon,
  PanelLeft as PanelLeftIcon,
  PanelRight as PanelRightIcon,
  SparklesIcon,
} from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { useDefaultLayout } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStudio } from '@/hooks/use-studio';
import { useProjectScope } from '@/hooks/use-project-scope';
import { StudioProjectsView } from '@/components/studio/projects/StudioProjectsView';
import { StudioCanvas } from '@/components/studio/StudioCanvas';
import { StudioCanvasTimeline } from '@/components/studio/timeline/StudioCanvasTimeline';
import { timelineStore } from '@/hooks/use-timeline-store';
import { StudioInspector } from '@/components/studio/StudioInspector';
import { StudioSourcePicker } from '@/components/studio/StudioSourcePicker';
import { StudioRecordingBar } from '@/components/studio/StudioRecordingBar';
import { StudioSocialKitModal } from '@/components/studio/StudioSocialKitModal';
import { StudioContentPanel } from '@/components/studio/content/StudioContentPanel';
import { StudioCopilotSheet } from '@/components/studio/copilot/StudioCopilotSheet';
import type { ContentItemPayload } from '@/components/studio/content/items/ContentCardItem';
import type { StudioTake } from '@/lib/studio-types';
import { toast } from 'sonner';

export default function Studio() {
  const { takeId } = useParams<{ takeId?: string }>();
  const navigate = useNavigate();
  const { projectId, projectName } = useProjectScope();

  const {
    takes,
    activeTake,
    isRecording,
    recordingSeconds,
    isProcessingDraft,
    isGeneratingSocialKit,
    loadTake,
    listSources,
    startRecording,
    stopRecording,
    updateStyling,
    updateZooms,
    generateSocialKit,
    exportVideo,
    deleteTake,
  } = useStudio(takeId, projectId);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);

  // Modals & Copilot
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [socialKitModalOpen, setSocialKitModalOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<
    string | null
  >(null);

  // Content library & inspector panel states & refs
  const [contentPanelCollapsed, setContentPanelCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);

  // Persistence hooks for Studio layout
  const verticalLayout = useDefaultLayout({ id: 'studio-layout-vertical-v1' });
  const horizontalLayout = useDefaultLayout({
    id: 'studio-layout-horizontal-v1',
  });

  const toggleLeftPanel = () => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      setContentPanelCollapsed(false);
    } else {
      panel.collapse();
      setContentPanelCollapsed(true);
    }
  };

  const toggleRightPanel = () => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      setInspectorCollapsed(false);
    } else {
      panel.collapse();
      setInspectorCollapsed(true);
    }
  };

  // Editable title
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  // Fetch video data URL when active take changes
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!activeTake?.id) {
        if (!cancelled) setVideoDataUrl(null);
        return;
      }

      try {
        const url = await window.electron.ipc.invoke<string | null>(
          'studio:read-video-data',
          { takeId: activeTake.id },
        );
        if (!cancelled) {
          setVideoDataUrl(url);
        }
      } catch {
        if (!cancelled) {
          setVideoDataUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTake?.id]);

  const handleTitleSubmit = async () => {
    setIsEditingTitle(false);
    if (!activeTake || !titleInput.trim() || titleInput === activeTake.title)
      return;

    try {
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        title: titleInput.trim(),
      });
      toast.success('Title updated');
    } catch {
      toast.error('Failed to update title');
    }
  };

  const handleStartCapture = async (source: {
    sourceId: string;
    sourceName: string;
    includeMic: boolean;
  }) => {
    const newTakeId = await startRecording({
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      includeMic: source.includeMic,
      takeProjectId: projectId,
    });
    if (newTakeId) {
      navigate(`/studio/${newTakeId}`);
    }
  };

  const handleAddZoomAtPlayhead = () => {
    if (!activeTake) return;
    const currentPlayhead = timelineStore.getState().currentTimeMs;
    const effectiveDuration = durationMs || activeTake.durationMs;
    const newZoom = {
      id: Math.random().toString(36).slice(2, 9),
      startMs: Math.max(0, currentPlayhead - 200),
      endMs: Math.min(effectiveDuration, currentPlayhead + 2000),
      targetX: 0.5,
      targetY: 0.5,
      scale: 1.6,
    };
    updateZooms([...activeTake.zooms, newZoom]);
    toast.success('Added zoom keyframe at playhead');
  };

  const handleRunMagicDraftViaCopilot = () => {
    setCopilotInitialPrompt(
      'Run a complete Magic Draft on this take: prune dead air pauses, calculate kinetic zooms from mouse dwell points, and polish canvas styling.',
    );
    setCopilotOpen(true);
  };

  const handleOpenSocialKitViaCopilot = () => {
    if (activeTake?.socialKit) {
      setSocialKitModalOpen(true);
    } else {
      setCopilotInitialPrompt(
        'Draft a high-converting AI Social Release Kit for this showcase take: viral X/Twitter thread, GitHub changelog markdown, and LinkedIn announcement.',
      );
      setCopilotOpen(true);
    }
  };

  const handleOpenSocialKit = async () => {
    if (!activeTake) return;
    if (activeTake.socialKit) {
      setSocialKitModalOpen(true);
    } else {
      const kit = await generateSocialKit();
      if (kit) setSocialKitModalOpen(true);
    }
  };

  const handleRenameTake = async (id: string, newTitle: string) => {
    try {
      await window.electron.ipc.invoke('studio:save-take', {
        id,
        title: newTitle,
      });
      toast.success('Project renamed');
      if (activeTake && activeTake.id === id) {
        await loadTake(id);
      }
    } catch {
      toast.error('Failed to rename project');
    }
  };

  const handleQuickExport = async (id: string) => {
    try {
      toast.info('Exporting 1080p MP4 showcase video...');
      const res = await window.electron.ipc.invoke<{
        ok: boolean;
        filePath?: string;
        error?: string;
      }>('studio:export-video', {
        takeId: id,
        format: 'mp4',
      });
      if (res.ok && res.filePath) {
        toast.success(`Exported showcase to ${res.filePath}`);
        await window.electron.ipc.invoke('studio:open-path', {
          path: res.filePath,
        });
      } else if (res.error) {
        toast.error(`Export failed: ${res.error}`);
      }
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    }
  };

  const handleDeleteTake = async (id: string) => {
    await deleteTake(id);
    if (takeId === id) {
      navigate('/studio');
    }
  };

  const handleCreateBlankProject = async () => {
    try {
      const blankTake = await window.electron.ipc.invoke<StudioTake>(
        'studio:create-blank-take',
        { projectId },
      );
      toast.success('Created new blank showcase project');
      navigate(`/studio/${blankTake.id}`);
    } catch {
      toast.error('Failed to create blank project');
    }
  };

  const handleInsertClip = async (clipPayload: ContentItemPayload) => {
    const newClip = timelineStore.addClip(clipPayload.trackType, clipPayload);

    // If it's a zoom effect, sync to activeTake.zooms
    if (
      clipPayload.trackType === 'effects' &&
      clipPayload.payload?.scale &&
      activeTake
    ) {
      const zoom = {
        id: newClip.id,
        startMs: newClip.startMs,
        endMs: newClip.startMs + newClip.durationMs,
        targetX: clipPayload.payload.targetX ?? 0.5,
        targetY: clipPayload.payload.targetY ?? 0.5,
        scale: clipPayload.payload.scale ?? 1.5,
      };
      updateZooms([...activeTake.zooms, zoom]);
    }

    // If it's a text caption, sync to activeTake.captions
    if (
      clipPayload.trackType === 'captions' &&
      clipPayload.payload?.text &&
      activeTake
    ) {
      const caption = {
        id: newClip.id,
        startMs: newClip.startMs,
        endMs: newClip.startMs + newClip.durationMs,
        text: clipPayload.payload.text,
      };
      const updatedCaptions = [...activeTake.captions, caption];
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        captions: updatedCaptions,
      });
      await loadTake(activeTake.id);
    }

    // If it's a video file and current take is blank, load it into canvas
    if (
      clipPayload.trackType === 'video' &&
      clipPayload.payload?.filePath &&
      activeTake
    ) {
      if (!activeTake.videoPath) {
        await window.electron.ipc.invoke('studio:save-take', {
          id: activeTake.id,
          videoPath: clipPayload.payload.filePath,
          durationMs: clipPayload.durationMs,
        });
        await loadTake(activeTake.id);
      }
    }

    toast.success(
      `Added ${clipPayload.name} to ${clipPayload.trackType} track`,
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden select-none">
      {/* ── Active Recording Floating Pill ─────────────────────────────────── */}
      {isRecording && (
        <StudioRecordingBar
          seconds={recordingSeconds}
          onStop={async () => {
            const take = await stopRecording();
            if (take) navigate(`/studio/${take.id}`);
          }}
        />
      )}

      {!takeId ? (
        /* ── Studio Projects Library (Grid / List view) ─────────────────────── */
        <StudioProjectsView
          takes={takes}
          onOpenTake={(id) => {
            loadTake(id);
            navigate(`/studio/${id}`);
          }}
          onNewRecording={() => setSourcePickerOpen(true)}
          onNewBlankProject={handleCreateBlankProject}
          onRenameTake={handleRenameTake}
          onQuickExport={handleQuickExport}
          onDeleteTake={handleDeleteTake}
        />
      ) : activeTake ? (
        /* ── Full Showcase Studio Editor ───────────────────────────────────── */
        <>
          {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
          <header className="h-14 border-b border-border/40 px-4 flex items-center justify-between bg-card/40 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3">
              {/* Back to All Projects */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground -ml-1"
                onClick={() => navigate('/studio')}
              >
                <ChevronLeftIcon className="w-4 h-4" />
                <span>All Projects</span>
              </Button>

              <div className="h-4 w-[1px] bg-border/60" />

              {/* Logo / Title */}
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                  <VideoIcon className="w-4 h-4" />
                </div>
                <span className="font-semibold text-sm tracking-tight hidden sm:inline">
                  Showcase Studio
                </span>
              </div>

              <div className="h-4 w-[1px] bg-border/60" />

              {/* Takes Selector Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2 max-w-[220px] text-xs font-normal"
                  >
                    <LayersIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {activeTake ? activeTake.title : 'Select a Take'}
                    </span>
                    <ChevronDownIcon className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-64 max-h-72 overflow-y-auto"
                >
                  {takes.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      No recorded takes yet.
                    </div>
                  ) : (
                    takes.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => {
                          loadTake(t.id);
                          navigate(`/studio/${t.id}`);
                        }}
                        className="flex flex-col items-start gap-0.5 text-xs py-2"
                      >
                        <span className="font-medium truncate w-full">
                          {t.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {(t.durationMs / 1000).toFixed(1)}s • {t.sourceType}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSourcePickerOpen(true)}
                    className="text-xs text-primary gap-2"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    New Showcase Recording
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Project Badge if Scoped */}
              {projectName && (
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border/50">
                  <FolderKanbanIcon className="w-3 h-3 text-primary" />
                  <span className="truncate max-w-[120px]">{projectName}</span>
                </div>
              )}
            </div>

            {/* Action Controls */}
            <div className="flex items-center gap-2">
              {activeTake && (
                <>
                  {/* Left content panel toggle */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 text-muted-foreground hover:text-foreground ${!contentPanelCollapsed ? 'text-primary bg-primary/10' : ''}`}
                    onClick={toggleLeftPanel}
                    title={
                      contentPanelCollapsed
                        ? 'Show Content Library'
                        : 'Hide Content Library'
                    }
                  >
                    <PanelLeftIcon className="w-4 h-4" />
                  </Button>

                  {/* Right inspector toggle */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 text-muted-foreground hover:text-foreground ${!inspectorCollapsed ? 'text-primary bg-primary/10' : ''}`}
                    onClick={toggleRightPanel}
                    title={
                      inspectorCollapsed
                        ? 'Show Studio Inspector'
                        : 'Hide Studio Inspector'
                    }
                  >
                    <PanelRightIcon className="w-4 h-4" />
                  </Button>

                  <div className="h-4 w-[1px] bg-border/60 mx-1" />

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs border-rose-500/30 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer shadow-2xs font-medium"
                    onClick={() => setSourcePickerOpen(true)}
                    title="Record a new screen or window take"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className="hidden sm:inline">Record Take</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs border-indigo-500/40 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 cursor-pointer shadow-2xs font-medium"
                    onClick={() => {
                      setCopilotInitialPrompt(null);
                      setCopilotOpen(true);
                    }}
                    title="Open Studio AI Copilot Director"
                  >
                    <SparklesIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">AI Director</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleOpenSocialKit}
                    disabled={isGeneratingSocialKit}
                  >
                    <Share2Icon className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Release Kit</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => exportVideo('mp4')}
                  >
                    <DownloadIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => activeTake && deleteTake(activeTake.id)}
                    title="Delete Take"
                  >
                    <Trash2Icon className="w-4 h-4" />
                  </Button>

                  <div className="h-4 w-[1px] bg-border/60 mx-1" />
                </>
              )}

              <Button
                variant="default"
                size="sm"
                className="h-8 gap-1.5 bg-gradient-to-r from-indigo-500 to-primary hover:from-indigo-600 hover:to-primary/90 text-white shadow-md text-xs font-medium"
                onClick={() => setSourcePickerOpen(true)}
              >
                <VideoIcon className="w-3.5 h-3.5" />
                Record Showcase
              </Button>
            </div>
          </header>

          {/* ── Resizable Layout: Top Workspace (Left Library | Center Canvas | Right Inspector) + Bottom Full-Width Timeline ── */}
          <ResizablePanelGroup
            orientation="vertical"
            className="flex-1 w-full overflow-hidden"
            {...verticalLayout}
          >
            {/* Top Workspace Panel */}
            <ResizablePanel
              id="studio-top-workspace"
              defaultSize="65%"
              minSize="45%"
              maxSize="80%"
              className="flex flex-col min-h-0 overflow-hidden"
            >
              <ResizablePanelGroup
                orientation="horizontal"
                className="h-full w-full overflow-hidden"
                {...horizontalLayout}
              >
                {/* Left Content Library Panel */}
                <ResizablePanel
                  id="studio-content-panel"
                  panelRef={leftPanelRef}
                  defaultSize="22%"
                  minSize="15%"
                  maxSize="35%"
                  collapsible
                  collapsedSize="48px"
                  onResize={(size) => {
                    setContentPanelCollapsed(size.inPixels <= 52);
                  }}
                  className="flex flex-col min-w-0 overflow-hidden"
                >
                  <StudioContentPanel
                    takes={takes}
                    onAddClip={handleInsertClip}
                    onNewRecording={() => setSourcePickerOpen(true)}
                    isCollapsed={contentPanelCollapsed}
                    onToggleCollapse={toggleLeftPanel}
                  />
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Center Canvas Area */}
                <ResizablePanel
                  id="studio-center-canvas"
                  defaultSize="56%"
                  minSize="35%"
                  maxSize="80%"
                  className="flex flex-col overflow-hidden min-w-0"
                >
                  <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden items-center justify-between gap-3 h-full w-full">
                    {/* Editable Title Bar */}
                    <div className="w-full flex items-center justify-between px-2 shrink-0">
                      {isEditingTitle ? (
                        <Input
                          ref={titleInputRef}
                          value={titleInput}
                          onChange={(e) => setTitleInput(e.target.value)}
                          onBlur={handleTitleSubmit}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleTitleSubmit()
                          }
                          className="h-8 text-sm font-semibold max-w-sm"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setTitleInput(activeTake.title);
                            setIsEditingTitle(true);
                          }}
                          className="text-sm font-semibold hover:text-primary cursor-pointer transition-colors flex items-center gap-1.5 bg-transparent border-0 p-0 text-left"
                          title="Click to rename take"
                        >
                          <span>{activeTake.title}</span>
                          <span className="text-[10px] text-muted-foreground font-normal">
                            (edit)
                          </span>
                        </button>
                      )}

                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="capitalize">
                          {activeTake.sourceType} Capture
                        </span>
                        <span>•</span>
                        <span>
                          {(activeTake.durationMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    {/* 60fps Real-Time Video Preview Canvas */}
                    <div className="flex-1 w-full flex items-center justify-center min-h-0 overflow-hidden">
                      <StudioCanvas
                        videoUrl={videoDataUrl}
                        styling={activeTake.styling}
                        zooms={activeTake.zooms}
                        captions={activeTake.captions}
                        currentTimeMs={currentTimeMs}
                        isPlaying={isPlaying}
                        onTimeUpdate={(ms) => {
                          timelineStore.seek(ms, false);
                        }}
                        onDurationChange={(ms) => setDurationMs(ms)}
                        onEnded={() => setIsPlaying(false)}
                      />
                    </div>
                  </main>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Settings & Dials Inspector */}
                <ResizablePanel
                  id="studio-inspector-panel"
                  panelRef={rightPanelRef}
                  defaultSize="22%"
                  minSize="15%"
                  maxSize="35%"
                  collapsible
                  collapsedSize="0px"
                  onResize={(size) => {
                    setInspectorCollapsed(size.inPixels <= 20);
                  }}
                  className="flex flex-col min-w-0 overflow-hidden"
                >
                  <StudioInspector
                    styling={activeTake.styling}
                    isProcessingDraft={isProcessingDraft}
                    isGeneratingSocialKit={isGeneratingSocialKit}
                    onUpdateStyling={updateStyling}
                    onRunMagicDraft={handleRunMagicDraftViaCopilot}
                    onGenerateSocialKit={handleOpenSocialKitViaCopilot}
                    onExportVideo={exportVideo}
                    onAddZoomAtPlayhead={handleAddZoomAtPlayhead}
                    onToggleCollapse={toggleRightPanel}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom Full-Width Multi-Track Timeline Panel */}
            <ResizablePanel
              id="studio-bottom-timeline"
              defaultSize="35%"
              minSize="20%"
              maxSize="55%"
              className="p-2.5 bg-background/50 flex flex-col min-h-0 overflow-hidden"
            >
              <StudioCanvasTimeline
                activeTake={activeTake}
                videoUrl={videoDataUrl}
                currentTimeMs={currentTimeMs}
                durationMs={durationMs || activeTake.durationMs}
                isPlaying={isPlaying}
                onSeek={(ms) => {
                  setCurrentTimeMs(ms);
                  timelineStore.seek(ms, false);
                }}
                onTogglePlay={() => setIsPlaying((prev) => !prev)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </>
      ) : (
        /* Take Not Found Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-4 shadow-sm">
            <VideoIcon className="w-8 h-8" />
          </div>
          <h2 className="text-base font-semibold mb-1">
            Showcase Take Not Found
          </h2>
          <p className="text-muted-foreground text-xs mb-6 max-w-xs">
            The requested recording does not exist or may have been deleted.
          </p>
          <Button size="sm" onClick={() => navigate('/studio')}>
            Return to Studio Projects
          </Button>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <StudioSourcePicker
        open={sourcePickerOpen}
        onOpenChange={setSourcePickerOpen}
        onListSources={listSources}
        onSelectSource={handleStartCapture}
      />

      <StudioSocialKitModal
        open={socialKitModalOpen}
        onOpenChange={setSocialKitModalOpen}
        socialKit={activeTake?.socialKit ?? null}
      />

      {activeTake && (
        <StudioCopilotSheet
          open={copilotOpen}
          onOpenChange={setCopilotOpen}
          activeTake={activeTake}
          currentTimeMs={currentTimeMs}
          initialPrompt={copilotInitialPrompt}
          onInitialPromptHandled={() => setCopilotInitialPrompt(null)}
          onChanged={() => loadTake(activeTake.id)}
        />
      )}
    </div>
  );
}
