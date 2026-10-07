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

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  VideoIcon,
  FolderKanbanIcon,
  Trash2Icon,
  PlusIcon,
  Share2Icon,
  DownloadIcon,
  ChevronDownIcon,
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
import { OverflowMenu } from '@/components/OverflowMenu';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
import {
  extractZoomsFromTracks,
  extractCaptionsFromTracks,
  extractCutsFromTracks,
  type StudioTake,
  type TimelineTrack,
} from '@/lib/studio-types';
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
    updateCaptions,
    updateCuts,
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
  }, [activeTake?.id, activeTake?.videoPath]);

  // Synchronize timeline track structural edits (zooms, captions, cuts) back to active take
  const handleTimelineTracksChange = useCallback(
    (tracks: TimelineTrack[]) => {
      if (!activeTake) return;
      const updatedZooms = extractZoomsFromTracks(tracks);
      const updatedCaptions = extractCaptionsFromTracks(tracks);
      const updatedCuts = extractCutsFromTracks(
        tracks,
        durationMs || activeTake.durationMs,
      );

      // Real-time synchronization: update activeTake and persist
      updateZooms(updatedZooms);
      updateCaptions(updatedCaptions);
      updateCuts(updatedCuts);
    },
    [activeTake, durationMs, updateZooms, updateCaptions, updateCuts],
  );

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
      updateCaptions([...activeTake.captions, caption]);
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
        setDurationMs(clipPayload.durationMs);
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
          {/* ── Top Header Bar (Dense h-10) ─────────────────────────────────────── */}
          <PageHeader
            className="select-none"
            crumbs={[
              { label: 'Showcase Studio', to: '/studio' },
              { label: activeTake ? activeTake.title : 'No take selected' },
            ]}
            title={
              <span className="inline-flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/20 text-primary">
                  <VideoIcon className="size-3" />
                </span>
                <span className="truncate">
                  {activeTake ? activeTake.title : 'Showcase Studio'}
                </span>
              </span>
            }
            nav={
              /* Takes Selector Dropdown — this is the editor's view
                   switcher, so it belongs in `nav` rather than the action
                   cluster. */
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2.5 text-xs font-normal"
                    aria-label="Switch take"
                  >
                    <LayersIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                    {/* Deliberately not the take title — the heading beside it
                        already says that. This is the switcher for *other*
                        takes, so it names the set instead. */}
                    <span className="hidden sm:inline">
                      {takes.length === 1 ? '1 take' : `${takes.length} takes`}
                    </span>
                    <ChevronDownIcon className="w-3 h-3 opacity-50 shrink-0" />
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
            }
            meta={
              projectName && (
                <div className="hidden items-center gap-1 rounded-full border border-border/50 bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground lg:flex">
                  <FolderKanbanIcon className="size-3 shrink-0 text-primary" />
                  <span className="max-w-[120px] truncate">{projectName}</span>
                </div>
              )
            }
            actions={
              activeTake && (
                <>
                  {/* Panel toggles are view state, not commands — icon-only
                      keeps them cheap in the row. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-7 shrink-0 text-muted-foreground hover:text-foreground',
                      !contentPanelCollapsed && 'bg-primary/10 text-primary',
                    )}
                    onClick={toggleLeftPanel}
                    title={
                      contentPanelCollapsed
                        ? 'Show Content Library'
                        : 'Hide Content Library'
                    }
                  >
                    <PanelLeftIcon className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-7 shrink-0 text-muted-foreground hover:text-foreground',
                      !inspectorCollapsed && 'bg-primary/10 text-primary',
                    )}
                    onClick={toggleRightPanel}
                    title={
                      inspectorCollapsed
                        ? 'Show Studio Inspector'
                        : 'Hide Studio Inspector'
                    }
                  >
                    <PanelRightIcon className="w-3.5 h-3.5" />
                  </Button>

                  <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border/60" />

                  {/* Recording is the primary command; labels drop below sm
                      so the row survives a narrow window. */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => setSourcePickerOpen(true)}
                    title="Record a new screen or window take"
                  >
                    <span className="size-2 shrink-0 animate-pulse rounded-full bg-rose-500" />
                    <span className="hidden sm:inline">Record Take</span>
                  </Button>

                  {/* Three secondary commands plus delete collapse into one
                      overflow menu rather than six inline buttons. */}
                  <OverflowMenu
                    label="More studio actions"
                    items={[
                      {
                        label: 'AI Director',
                        icon: (
                          <SparklesIcon className="size-3.5 text-indigo-400" />
                        ),
                        onSelect: () => {
                          setCopilotInitialPrompt(null);
                          setCopilotOpen(true);
                        },
                      },
                      {
                        label: 'Release Kit',
                        icon: (
                          <Share2Icon className="size-3.5 text-indigo-400" />
                        ),
                        disabled: isGeneratingSocialKit,
                        onSelect: handleOpenSocialKit,
                      },
                      {
                        label: 'Export MP4',
                        icon: <DownloadIcon className="size-3.5" />,
                        onSelect: () => void exportVideo('mp4'),
                      },
                      {
                        label: 'Delete take',
                        icon: <Trash2Icon className="size-3.5" />,
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () => void deleteTake(activeTake.id),
                      },
                    ]}
                  />
                </>
              )
            }
          />

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
                  <main className="flex-1 flex flex-col p-2 md:p-3 overflow-hidden items-center justify-between gap-2 h-full w-full">
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
                        durationMs={durationMs || activeTake.durationMs}
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
              className="p-0 bg-background flex flex-col min-h-0 overflow-hidden"
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
                onTracksChange={handleTimelineTracksChange}
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
