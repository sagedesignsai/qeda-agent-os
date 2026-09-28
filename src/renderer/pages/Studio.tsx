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
  SparklesIcon,
  FolderKanbanIcon,
  Trash2Icon,
  PlusIcon,
  Share2Icon,
  DownloadIcon,
  ChevronDownIcon,
  LayersIcon,
} from 'lucide-react';
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
import { StudioCanvas } from '@/components/studio/StudioCanvas';
import { StudioTimeline } from '@/components/studio/StudioTimeline';
import { StudioInspector } from '@/components/studio/StudioInspector';
import { StudioSourcePicker } from '@/components/studio/StudioSourcePicker';
import { StudioRecordingBar } from '@/components/studio/StudioRecordingBar';
import { StudioSocialKitModal } from '@/components/studio/StudioSocialKitModal';
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
    runMagicDraft,
    generateSocialKit,
    exportVideo,
    deleteTake,
  } = useStudio(takeId, projectId);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);

  // Modals
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [socialKitModalOpen, setSocialKitModalOpen] = useState(false);

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
    const newZoom = {
      id: Math.random().toString(36).slice(2, 9),
      startMs: Math.max(0, currentTimeMs - 200),
      endMs: Math.min(durationMs, currentTimeMs + 2000),
      targetX: 0.5,
      targetY: 0.5,
      scale: 1.6,
    };
    updateZooms([...activeTake.zooms, newZoom]);
    toast.success('Added zoom keyframe at playhead');
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

      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="h-14 border-b border-border/40 px-4 flex items-center justify-between bg-card/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
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

      {/* ── Main Workspace Body ────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {activeTake ? (
          <>
            {/* Center Canvas & Timeline Area */}
            <main className="flex-1 flex flex-col p-6 overflow-hidden items-center justify-between gap-4">
              {/* Editable Title Bar */}
              <div className="w-full flex items-center justify-between px-2">
                {isEditingTitle ? (
                  <Input
                    ref={titleInputRef}
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleTitleSubmit}
                    onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
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
                  <span>{(activeTake.durationMs / 1000).toFixed(1)}s</span>
                </div>
              </div>

              {/* 60fps Real-Time Video Preview Canvas */}
              <div className="flex-1 w-full flex items-center justify-center min-h-0">
                <StudioCanvas
                  videoUrl={videoDataUrl}
                  styling={activeTake.styling}
                  zooms={activeTake.zooms}
                  captions={activeTake.captions}
                  currentTimeMs={currentTimeMs}
                  isPlaying={isPlaying}
                  onTimeUpdate={(ms) => setCurrentTimeMs(ms)}
                  onDurationChange={(ms) => setDurationMs(ms)}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>

              {/* Scrubber & Timeline Bar */}
              <div className="w-full max-w-4xl">
                <StudioTimeline
                  currentTimeMs={currentTimeMs}
                  durationMs={durationMs}
                  isPlaying={isPlaying}
                  zooms={activeTake.zooms}
                  cuts={activeTake.cuts}
                  captions={activeTake.captions}
                  onSeek={(ms) => setCurrentTimeMs(ms)}
                  onTogglePlay={() => setIsPlaying((prev) => !prev)}
                />
              </div>
            </main>

            {/* Right Settings & Dials Inspector */}
            <StudioInspector
              styling={activeTake.styling}
              isProcessingDraft={isProcessingDraft}
              isGeneratingSocialKit={isGeneratingSocialKit}
              onUpdateStyling={updateStyling}
              onRunMagicDraft={runMagicDraft}
              onGenerateSocialKit={handleOpenSocialKit}
              onExportVideo={exportVideo}
              onAddZoomAtPlayhead={handleAddZoomAtPlayhead}
            />
          </>
        ) : (
          /* Empty State: Zero Takes */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-2xl mb-6">
              <VideoIcon className="w-10 h-10" />
            </div>

            <h1 className="text-2xl font-bold tracking-tight mb-2">
              Turn Any Screen Demo Into a Studio Showcase
            </h1>
            <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
              No manual timeline cutting or analysis paralysis. Record any
              window, and the agent auto-cuts dead air, adds kinetic camera zoom
              on clicks, and drafts your release changelog and social post.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mb-8 text-left">
              <div className="rounded-xl border border-border/40 bg-card/40 p-4 backdrop-blur-sm shadow-sm">
                <div className="font-semibold text-xs text-indigo-400 mb-1 flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5" /> 1. Record Any App
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick your IDE, terminal, or browser. Global mouse tracking
                  tracks every click.
                </p>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/40 p-4 backdrop-blur-sm shadow-sm">
                <div className="font-semibold text-xs text-purple-400 mb-1 flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5" /> 2. One-Click Magic
                  Draft
                </div>
                <p className="text-xs text-muted-foreground">
                  Agent trims silence pauses and generates smooth camera zoom
                  curves automatically.
                </p>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/40 p-4 backdrop-blur-sm shadow-sm">
                <div className="font-semibold text-xs text-sky-400 mb-1 flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5" /> 3. 1-Click Social Kit
                </div>
                <p className="text-xs text-muted-foreground">
                  Export 4K MP4/GIF and copy ready-to-share GitHub release notes
                  and tweet thread.
                </p>
              </div>
            </div>

            <Button
              size="lg"
              className="gap-2 bg-gradient-to-r from-indigo-500 to-primary hover:from-indigo-600 hover:to-primary/90 text-white shadow-xl font-medium px-6"
              onClick={() => setSourcePickerOpen(true)}
            >
              <VideoIcon className="w-5 h-5" />
              Record First Showcase Take
            </Button>
          </div>
        )}
      </div>

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
    </div>
  );
}
