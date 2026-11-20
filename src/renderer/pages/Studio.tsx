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

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  VideoIcon,
  FolderKanbanIcon,
  Trash2Icon,
  Share2Icon,
  DownloadIcon,
  PanelLeft as PanelLeftIcon,
  PanelRight as PanelRightIcon,
  SparklesIcon,
  Circle,
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
import { useIpcEvent } from '@/hooks/use-ipc';
import { useProjectScope } from '@/hooks/use-project-scope';
import { StudioProjectsView } from '@/components/studio/projects/StudioProjectsView';
import { StudioCanvas } from '@/components/studio/StudioCanvas';
import { StudioCanvasTimeline } from '@/components/studio/timeline/StudioCanvasTimeline';
import { StudioVideoCropDialog } from '@/components/studio/plugins/StudioVideoCropDialog';
import { timelineStore, useTimelineTracks } from '@/hooks/use-timeline-store';
import { StudioInspector } from '@/components/studio/StudioInspector';
import { StudioSourcePicker } from '@/components/studio/StudioSourcePicker';
import { StudioRecordingBar } from '@/components/studio/StudioRecordingBar';
import { StudioSocialKitModal } from '@/components/studio/StudioSocialKitModal';
import { StudioContentPanel } from '@/components/studio/content/StudioContentPanel';
import { StudioCopilotSheet } from '@/components/studio/copilot/StudioCopilotSheet';
import { StudioCommandBar } from '@/components/studio/StudioCommandBar';
import { inferTimelineItemType } from '@/lib/studio/timeline/item-type';
import { StudioCompositionCreateDialog } from '@/components/studio/StudioCompositionCreateDialog';
import { ShowcaseProjectDialog, type ShowcaseProjectSourceType } from '@/components/studio/ShowcaseProjectDialog';
import type { ContentItemPayload } from '@/components/studio/content/items/ContentCardItem';
import {
  compositionDurationMs,
  extractClipsFromTracks,
  extractZoomsFromTracks,
  extractCaptionsFromTracks,
  extractCutsFromTracks,
  extractEffectsFromTracks,
  extractOverlaysFromTracks,
  convertTakeToTimeline,
  normalizeCuts,
  safeDurationMs,
  sourceFromComp,
  type StudioTake,
  type StudioEffect,
  type StudioEffectType,
  type StudioOverlay,
  type StudioVideoCrop,
  type StudioComposition,
  type StudioCompositionSceneId,
  type StudioCompositionSummary,
  type StudioCompositionTemplateSummary,
  type StudioTakeSummary,
  type TimelineTrack,
} from '@/lib/studio-types';
import { renderComposedStudioVideo } from '@/lib/studio/render/export-renderer';
import { toast } from 'sonner';

export default function Studio() {
  const { takeId } = useParams<{ takeId?: string }>();
  const navigate = useNavigate();
  const { projectId, projectName, withScope } = useProjectScope();
  const [compositions, setCompositions] = useState<StudioCompositionSummary[]>([]);
  const [compositionTemplates, setCompositionTemplates] = useState<
    StudioCompositionTemplateSummary[]
  >([]);
  const [compositionCreateOpen, setCompositionCreateOpen] = useState(false);

  // Showcase Project Dialog state
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<'new' | 'edit'>('new');
  const [editingTake, setEditingTake] = useState<StudioTakeSummary | null>(null);

  const refreshCompositions = useCallback(async () => {
    try {
      const list = await window.electron.ipc.invoke<StudioCompositionSummary[]>(
        'studio:composition-list',
        { projectId },
      );
      setCompositions(list);
      const templates =
        await window.electron.ipc.invoke<StudioCompositionTemplateSummary[]>(
          'studio:composition-template-list',
        );
      setCompositionTemplates(templates);
    } catch (error) {
      console.error('[Studio] Failed to list compositions.', error);
    }
  }, [projectId]);

  useEffect(() => {
    void refreshCompositions();
  }, [refreshCompositions]);

  useIpcEvent(
    'studio:composition-changed',
    () => void refreshCompositions(),
    [refreshCompositions],
  );

  const {
    takes,
    hasMoreTakes,
    loadingMoreTakes,
    activeTake,
    isRecording,
    recordingSeconds,
    agentRecording,
    agentRecordingSeconds,
    stopAgentRecording,
    isProcessingDraft,
    isGeneratingSocialKit,
    exportProgress,
    mediaPrepProgress,
    loadTake,
    loadMoreTakes,
    listSources,
    startRecording,
    stopRecording,
    updateStyling,
    updateZooms,
    updateCaptions,
    updateEffects,
    updateOverlays,
    updateTimelineData,
    updateTracks,
    updateMediaAssets,
    generateSocialKit,
    exportVideo,
    deleteTake,
  } = useStudio(takeId, projectId);

  // Timeline tracks for per-clip animation evaluation on the preview canvas
  const timelineTracks = useTimelineTracks();

  // A named take means one was just recorded (agent or manual). Keep the route
  // in sync so a refresh reopens that take, and let `useStudio` reload it.
  useIpcEvent(
    'studio:changed',
    (payload) => {
      const changed = payload as { takeId?: string } | undefined;
      if (changed?.takeId && changed.takeId !== takeId) {
        navigate(withScope(`/studio/${changed.takeId}`));
      }
    },
    [takeId, navigate, withScope],
  );

  const [quickExportProgress, setQuickExportProgress] = useState<{
    isExporting: boolean;
    progress: number;
    statusText: string;
  } | null>(null);

  const currentExportProgress = exportProgress || quickExportProgress;

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // The take's recorded duration is authoritative. `durationMs` state is only
  // trusted once the media element reports a finite length — a `MediaRecorder`
  // webm reports `Infinity`, and a plain `durationMs || fallback` would let that
  // poison the timeline because `Infinity` is truthy.
  const sourceDurationMs = safeDurationMs(
    durationMs,
    activeTake?.durationMs ?? 0,
  );

  // Cuts excise ranges from the source, so everything the editor shows — the
  // ruler, the playhead, the total — is composition time, which is shorter.
  const cuts = useMemo(
    () => normalizeCuts(activeTake?.cuts ?? [], sourceDurationMs),
    [activeTake?.cuts, sourceDurationMs],
  );
  const effectiveDurationMs = compositionDurationMs(sourceDurationMs, cuts);

  // Modals & Copilot
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [socialKitModalOpen, setSocialKitModalOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<
    string | null
  >(null);
  const [videoCropDialogOpen, setVideoCropDialogOpen] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);

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

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // But still allow Cmd+K to open command bar
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          setCommandBarOpen(true);
        }
        return;
      }

      // Cmd+K / Ctrl+K: Open command bar
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandBarOpen(true);
      }

      // Only handle other shortcuts if we're in an active take
      if (!activeTake) return;

      // Space: Play/Pause (only if not in an input field)
      if (e.code === 'Space' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
        timelineStore.setPlaying(!isPlaying);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTake, isPlaying]);

  // Resolve a lightweight streaming URL when the active take changes.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!activeTake?.id) {
        if (!cancelled) setVideoUrl(null);
        return;
      }

      try {
        const url = await window.electron.ipc.invoke<string | null>(
          'studio:read-video-data',
          { takeId: activeTake.id },
        );
        if (!cancelled) {
          setVideoUrl(url);
        }
      } catch {
        if (!cancelled) {
          setVideoUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTake?.id, activeTake?.videoPath]);

  // Synchronize timeline track structural edits back to active take
  const handleTimelineTracksChange = useCallback(
    (tracks: TimelineTrack[]) => {
      if (!activeTake) return;

      // Multi-track model: extract clips directly from tracks
      const isMultiTrack = activeTake.tracks !== undefined || timelineStore.getState().isMultiTrack;
      if (isMultiTrack) {
        // Legacy tracks remain the editable base; persist their data alongside
        // the media-backed layer tracks instead of replacing it.
        void updateTimelineData({
          zooms: extractZoomsFromTracks(tracks, cuts),
          captions: extractCaptionsFromTracks(tracks, cuts),
          cuts: extractCutsFromTracks(tracks, activeTake.durationMs),
          effects: extractEffectsFromTracks(tracks, cuts),
          overlays: extractOverlaysFromTracks(tracks, cuts),
        });
        const extracted = extractClipsFromTracks(tracks);
        if (extracted) {
          void updateTracks(extracted.tracks);
        }
        return;
      }

      // Legacy single-recording model: derive zooms, captions, cuts, etc.
      // The timeline speaks composition time; the model is authored in source
      // time, so every derived span is mapped back through the current cuts.
      const updatedZooms = extractZoomsFromTracks(tracks, cuts);
      const updatedCaptions = extractCaptionsFromTracks(tracks, cuts);
      const updatedCuts = extractCutsFromTracks(tracks, activeTake.durationMs);
      const updatedEffects = extractEffectsFromTracks(tracks, cuts);
      const updatedOverlays = extractOverlaysFromTracks(tracks, cuts);

      // Timeline commits arrive on pointer release, so persist the full
      // structural delta as one narrow database update.
      void updateTimelineData({
        zooms: updatedZooms,
        captions: updatedCaptions,
        cuts: updatedCuts,
        effects: updatedEffects,
        overlays: updatedOverlays,
      });
    },
    [activeTake, cuts, updateTimelineData, updateTracks],
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
      navigate(withScope(`/studio/${newTakeId}`));
    }
  };

  const handleAddZoomAtPlayhead = () => {
    if (!activeTake) return;
    const currentPlayhead = timelineStore.getState().currentTimeMs;
    const newZoom = {
      id: Math.random().toString(36).slice(2, 9),
      startMs: Math.max(0, currentPlayhead - 200),
      endMs: Math.min(effectiveDurationMs, currentPlayhead + 2000),
      targetX: 0.5,
      targetY: 0.5,
      scale: 1.6,
    };
    updateZooms([...activeTake.zooms, newZoom]);
    toast.success('Added zoom keyframe at playhead');
  };

  // The timeline store owns the playhead; canvas playback does not update page
  // state at frame rate.
  const handlePreviewTimeUpdate = useCallback((ms: number) => {
    timelineStore.seek(ms, false);
  }, []);

  const handleTogglePlayback = useCallback(() => {
    const nextPlaying = !isPlaying;
    const video = previewVideoRef.current;
    const isMultiTrack = timelineStore.getState().isMultiTrack;
    if (nextPlaying) {
      // Start from the button's user gesture; the canvas also keeps playback
      // synchronized when state changes or the video element mounts later.
      // The playhead lives in composition time, the element in source time.
      if (!isMultiTrack) {
        const playheadMs = timelineStore.getState().currentTimeMs;
        const sourceMs = sourceFromComp(playheadMs, cuts);
        if (video && Math.abs(video.currentTime * 1000 - sourceMs) > 50) {
          video.currentTime = sourceMs / 1000;
        }
        void video?.play().catch((error: unknown) => {
          console.warn('[Studio] Timeline playback request failed.', error);
          setIsPlaying(false);
          timelineStore.setPlaying(false);
        });
      }
    } else {
      video?.pause();
    }
    setIsPlaying(nextPlaying);
    timelineStore.setPlaying(nextPlaying);
  }, [isPlaying, cuts]);

  const handlePreviewVideoElement = useCallback(
    (video: HTMLVideoElement | null) => {
      previewVideoRef.current = video;
    },
    [],
  );

  const handleRestartPlayback = useCallback(() => {
    timelineStore.seek(0, false);
    const video = previewVideoRef.current;
    if (video && video.readyState >= 1) video.currentTime = 0;
  }, []);

  const handlePlaybackEnded = useCallback(() => {
    timelineStore.setPlaying(false);
    setIsPlaying(false);
  }, []);

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

  const handleApplyVideoCrop = useCallback(
    async (crop: StudioVideoCrop | null) => {
      if (!activeTake) return;
      try {
        await window.electron.ipc.invoke('studio:save-take', {
          id: activeTake.id,
          videoCrop: crop,
        });
        await loadTake(activeTake.id);
        toast.success(crop ? 'Video crop applied' : 'Video crop cleared');
      } catch {
        toast.error('Failed to apply video crop');
      }
    },
    [activeTake, loadTake],
  );

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

  // ── Showcase Project Dialog Handlers ──────────────────────────────────────

  const handleCreateProject = async (
    title: string,
    sourceType: ShowcaseProjectSourceType,
  ) => {
    try {
      const take = await window.electron.ipc.invoke<StudioTake>(
        'studio:create-blank-take',
        { projectId, title },
      );
      toast.success('Project created');

      if (sourceType === 'screen-record') {
        // Open the source picker to start recording
        setSourcePickerOpen(true);
      } else if (sourceType === 'import-video') {
        // Open file import dialog for video selection
        const result = await window.electron.ipc.invoke<{
          canceled: boolean;
          files: Array<{
            name: string;
            path: string;
            sizeBytes: number;
            type: 'video' | 'audio' | 'image';
          }>;
        }>('studio:import-media', { types: ['video'] });

        if (!result.canceled && result.files.length > 0) {
          const videoFile = result.files.find((f) => f.type === 'video') ?? result.files[0];
          // Set the video path on the take
          await window.electron.ipc.invoke('studio:save-take', {
            id: take.id,
            videoPath: videoFile.path,
          });
          // Navigate to the editor with the imported video
          navigate(withScope(`/studio/${take.id}`));
        }
      } else if (sourceType === 'blank') {
        // Navigate directly to the editor with a blank project
        navigate(withScope(`/studio/${take.id}`));
      }
    } catch (err) {
      toast.error('Failed to create project');
      console.error(err);
    }
  };

  const handleEditProject = async (
    id: string,
    title: string,
    description: string | null,
  ) => {
    try {
      await window.electron.ipc.invoke('studio:save-take', {
        id,
        title,
        description,
      });
      toast.success('Project updated');
      if (activeTake && activeTake.id === id) {
        await loadTake(id);
      }
    } catch {
      toast.error('Failed to update project');
    }
  };

  const handleOpenNewProjectDialog = () => {
    setProjectDialogMode('new');
    setEditingTake(null);
    setProjectDialogOpen(true);
  };

  const handleOpenEditProjectDialog = (take: StudioTakeSummary) => {
    setProjectDialogMode('edit');
    setEditingTake(take);
    setProjectDialogOpen(true);
  };

  const handleQuickExport = async (id: string) => {
    if (activeTake && activeTake.id === id) {
      await exportVideo('mp4');
      return;
    }

    try {
      const targetTake = await window.electron.ipc.invoke<StudioTake | null>(
        'studio:get-take',
        { id },
      );
      if (!targetTake) {
        toast.error('Could not find showcase project to export');
        return;
      }

      // 1. Prompt user for save destination
      const savePrompt = await window.electron.ipc.invoke<{
        canceled: boolean;
        filePath?: string;
      }>('studio:prompt-save-dialog', {
        takeId: id,
        format: 'mp4',
        defaultTitle: targetTake.title,
      });

      if (savePrompt.canceled || !savePrompt.filePath) return;

      // 2. Render complete composition
      setQuickExportProgress({
        isExporting: true,
        progress: 0.05,
        statusText: 'Rendering composition with camera zooms & subtitles...',
      });

      await renderComposedStudioVideo(targetTake, {
        onProgress: (ratio, text) => {
          setQuickExportProgress({
            isExporting: true,
            progress: Math.min(0.92, Math.max(0.05, ratio * 0.9)),
            statusText: text,
          });
        },
      });

      // 3. Transcode rendered WebM into final MP4 container
      setQuickExportProgress({
        isExporting: true,
        progress: 0.95,
        statusText: 'Encoding final MP4 video with FFmpeg...',
      });

      const res = await window.electron.ipc.invoke<{
        ok: boolean;
        filePath?: string;
        error?: string;
      }>('studio:export-video', {
        takeId: id,
        format: 'mp4',
        targetPath: savePrompt.filePath,
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
    } finally {
      setQuickExportProgress(null);
    }
  };

  const handleDeleteTake = async (id: string) => {
    await deleteTake(id);
    if (takeId === id) {
      navigate('/studio');
    }
  };

  const handleCreateComposition = async (
    sceneId: StudioCompositionSceneId,
    title: string,
    sourceTakeIds: string[],
    templateId?: string,
  ) => {
    try {
      const composition = templateId
        ? await window.electron.ipc.invoke<StudioComposition>(
            'studio:composition-create-from-template',
            { projectId, title, templateId, sourceTakeIds },
          )
        : await window.electron.ipc.invoke<StudioComposition>(
            'studio:composition-create',
            { projectId, title, sceneId, sourceTakeIds },
          );
      toast.success('Composition created.');
      navigate(withScope(`/studio/compositions/${composition.id}`));
    } catch (error) {
      console.error('[Studio] Failed to create composition.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not create composition.',
      );
      throw error;
    }
  };

  const handleDeleteCompositionTemplate = async (
    templateId: string,
  ): Promise<boolean> => {
    try {
      const deleted = await window.electron.ipc.invoke<boolean>(
        'studio:composition-template-delete',
        { id: templateId },
      );
      if (!deleted) {
        toast.error('This template was already removed.');
        return false;
      }
      await refreshCompositions();
      toast.success('Template deleted.');
      return true;
    } catch (error) {
      console.error('[Studio] Failed to delete composition template.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not delete template.',
      );
      return false;
    }
  };

  const handleInsertClip = async (clipPayload: ContentItemPayload, startMs?: number, targetTrackId?: string) => {
    if (clipPayload.mediaAsset && activeTake) {
      const currentAssets = activeTake.mediaAssets ?? [];
      const exists = currentAssets.some((asset) => asset.id === clipPayload.mediaAsset?.id);
      if (!exists) await updateMediaAssets([...currentAssets, clipPayload.mediaAsset]);
      if (activeTake.tracks === undefined) {
        await updateTracks([]);
        timelineStore.setTracksAndDuration(
          convertTakeToTimeline({ ...activeTake, tracks: [], mediaAssets: [...currentAssets, clipPayload.mediaAsset] }),
          effectiveDurationMs,
          true,
          true,
        );
      }
    }
    if (clipPayload.trackType === 'transitions' && activeTake?.tracks === undefined && activeTake) {
      await updateTracks([]);
      timelineStore.setTracksAndDuration(
        convertTakeToTimeline({ ...activeTake, tracks: [] }),
        effectiveDurationMs,
        true,
        true,
      );
    }
    const newClip = timelineStore.addClip(clipPayload.trackType, {
      ...clipPayload,
      itemType:
        clipPayload.itemType ??
        inferTimelineItemType(
          clipPayload.trackType,
          clipPayload.payload,
          clipPayload.mediaAsset?.kind,
        ),
      startMs: startMs ?? 0,
      targetTrackId,
    });

    // If it's a zoom effect, sync to activeTake.zooms
    if (
      clipPayload.trackType === 'effects' &&
      clipPayload.payload?.scale &&
      (!clipPayload.payload.effectType ||
        clipPayload.payload.effectType === 'zoom') &&
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

    // If it's a canvas effect, sync to activeTake.effects
    if (
      clipPayload.trackType === 'effects' &&
      clipPayload.payload?.effectType &&
      clipPayload.payload.effectType !== 'zoom' &&
      activeTake
    ) {
      const effect: StudioEffect = {
        id: newClip.id,
        type: clipPayload.payload.effectType as StudioEffectType,
        startMs: newClip.startMs,
        endMs: newClip.startMs + newClip.durationMs,
        intensity: clipPayload.payload.intensity ?? 0.6,
      };
      updateEffects([...(activeTake.effects ?? []), effect]);
    }

    // If it's a media overlay, sync to activeTake.overlays
    if (
      clipPayload.trackType === 'overlays' &&
      clipPayload.payload?.srcPath &&
      activeTake
    ) {
      const overlay: StudioOverlay = {
        id: newClip.id,
        kind: clipPayload.payload.kind === 'image' ? 'image' : 'video',
        srcPath: clipPayload.payload.srcPath,
        startMs: newClip.startMs,
        endMs: newClip.startMs + newClip.durationMs,
        x: 0.5,
        y: 0.5,
        widthPct: 0.42,
        opacity: 1,
        rotation: 0,
        cornerRadius: 12,
      };
      updateOverlays([...(activeTake.overlays ?? []), overlay]);
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
      !clipPayload.mediaAsset &&
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
      {(isRecording || agentRecording) && (
        <StudioRecordingBar
          seconds={agentRecording ? agentRecordingSeconds : recordingSeconds}
          mode={agentRecording ? 'agent' : 'manual'}
          sourceName={agentRecording?.sourceName}
          captureKind={agentRecording?.capture?.kind}
          highlightCount={agentRecording?.highlightCount}
          onStop={async () => {
            if (agentRecording) {
              const res = await stopAgentRecording();
              if (res.stopped && res.takeId) navigate(withScope(`/studio/${res.takeId}`));
              return;
            }
            const take = await stopRecording();
            if (take) navigate(withScope(`/studio/${take.id}`));
          }}
        />
      )}

      {/* ── Export Progress Overlay ────────────────────────────────────────── */}
      {currentExportProgress?.isExporting && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card/95 border border-border/80 shadow-2xl rounded-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 animate-pulse">
                <DownloadIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm text-foreground truncate">
                  Exporting Showcase Video
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {currentExportProgress.statusText}
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-primary">
                {Math.round(currentExportProgress.progress * 100)}%
              </span>
            </div>

            <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-150 ease-out rounded-full"
                style={{
                  width: `${Math.round(currentExportProgress.progress * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Media Prep Progress Toast ──────────────────────────────────────── */}
      {mediaPrepProgress && mediaPrepProgress.stage !== 'ready' && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-card/95 border border-border/80 shadow-2xl rounded-xl p-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <SparklesIcon className="size-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">
              Preparing media
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {mediaPrepProgress.stage === 'probing' && 'Analyzing video file…'}
              {mediaPrepProgress.stage === 'optimizing' &&
                'Optimizing for fast seeking…'}
              {mediaPrepProgress.stage === 'filmstrip' &&
                'Generating thumbnails…'}
              {mediaPrepProgress.stage === 'waveform' &&
                'Extracting audio waveform…'}
              {mediaPrepProgress.stage === 'error' &&
                (mediaPrepProgress.message || 'Preparation failed')}
            </p>
          </div>
        </div>
      )}

      {!takeId ? (
        /* ── Studio Projects Library (Grid / List view) ─────────────────────── */
        <StudioProjectsView
          takes={takes}
          compositions={compositions}
          onNewComposition={() => setCompositionCreateOpen(true)}
          onOpenComposition={(id) => navigate(withScope(`/studio/compositions/${id}`))}
          hasMoreTakes={hasMoreTakes}
          loadingMoreTakes={loadingMoreTakes}
          onLoadMore={loadMoreTakes}
          onOpenTake={(id) => {
            loadTake(id);
            navigate(withScope(`/studio/${id}`));
          }}
          onNewRecording={handleOpenNewProjectDialog}
          onEditProject={handleOpenEditProjectDialog}
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
              <span className="truncate font-semibold">
                {activeTake ? activeTake.title : 'Showcase Studio'}
              </span>
            }
            nav={null}
            center={
              /* Command Bar - Searchable Input */
              activeTake && (
                <div
                  onClick={() => setCommandBarOpen(true)}
                  className="relative w-96 max-w-md cursor-text"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setCommandBarOpen(true);
                    }
                  }}
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 h-8 rounded-md bg-secondary/30 border border-secondary/50 hover:border-secondary/70 hover:bg-secondary/40 transition-all duration-200 group"
                  >
                    <span className="text-[10px] opacity-50 font-mono">⌘K</span>
                    <input
                      type="text"
                      placeholder="Commands…"
                      readOnly
                      className="flex-1 bg-transparent text-xs text-muted-foreground placeholder-muted-foreground/50 outline-none cursor-pointer"
                      onClick={() => setCommandBarOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          setCommandBarOpen(true);
                        }
                      }}
                    />
                  </div>
                </div>
              )
            }
            meta={null}
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

                  {/* Primary AI Actions */}
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-3 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                    onClick={() => {
                      setCopilotInitialPrompt(null);
                      setCopilotOpen(true);
                    }}
                    title="Open AI Director copilot"
                  >
                    <SparklesIcon className="w-3.5 h-3.5 transition-transform duration-300 group-hover:animate-spin" />
                    <span>AI Director</span>
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                    onClick={handleOpenSocialKit}
                    disabled={isGeneratingSocialKit}
                    title="Generate social media release kit"
                  >
                    <Share2Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Release Kit</span>
                    <span className="sm:hidden">Kit</span>
                  </Button>

                  <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border/60" />

                  {/* Remaining secondary commands in overflow menu */}
                  <OverflowMenu
                    label="More studio actions"
                    items={[
                      {
                        label: 'Record Take',
                        icon: <Circle className="size-3.5 text-rose-500 fill-rose-500" />,
                        onSelect: () => setSourcePickerOpen(true),
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
                  defaultSize="20%"
                  minSize="14%"
                  maxSize="32%"
                  collapsible
                  collapsedSize="44px"
                  onResize={(size) => {
                    setContentPanelCollapsed(size.inPixels <= 48);
                  }}
                  className="flex flex-col min-w-0 overflow-hidden"
                >
                  <StudioContentPanel
                    takes={takes}
                    onAddClip={handleInsertClip}
                    onNewRecording={handleOpenNewProjectDialog}
                    projectId={projectId}
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
                  <main className="flex-1 flex flex-col p-2 md:p-3 overflow-hidden items-center justify-between gap-1.5 h-full w-full">
                    {/* Canvas Header: Title + Source Info (Dense Layout) */}
                    <div className="w-full flex items-center justify-between px-2 shrink-0 py-1.5 rounded-md bg-background/40 border border-border/30 hover:border-border/50 transition-all duration-200">
                      {isEditingTitle ? (
                        <Input
                          ref={titleInputRef}
                          value={titleInput}
                          onChange={(e) => setTitleInput(e.target.value)}
                          onBlur={handleTitleSubmit}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleTitleSubmit()
                          }
                          className="h-7 text-sm font-semibold max-w-xs px-2 py-1 bg-primary/5 border-primary/30 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                          placeholder="Take title..."
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setTitleInput(activeTake.title);
                            setIsEditingTitle(true);
                          }}
                          className="flex-1 text-left flex items-center gap-2 px-2 py-1 rounded transition-all duration-150 hover:bg-primary/5 group"
                          title="Click to edit take title"
                        >
                          <span className="text-sm font-semibold text-foreground truncate">
                            {activeTake.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                            edit
                          </span>
                        </button>
                      )}

                      <div className="flex items-center gap-2 ml-auto pl-2 text-xs text-muted-foreground shrink-0 font-mono transition-colors duration-200">
                        <span className="hidden sm:inline capitalize opacity-75">
                          {activeTake.sourceType}
                        </span>
                        <span className="text-border/50">•</span>
                        <span className="font-medium">
                          {(activeTake.durationMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    {/* 60fps Real-Time Video Preview Canvas */}
                    <div className="flex-1 w-full flex items-center justify-center min-h-0 overflow-hidden">
                      <StudioCanvas
                        videoUrl={videoUrl}
                        styling={activeTake.styling}
                        zooms={activeTake.zooms}
                        captions={activeTake.captions}
                        effects={activeTake.effects ?? []}
                        overlays={activeTake.overlays ?? []}
                        videoCrop={activeTake.videoCrop}
                        cuts={cuts}
                        durationMs={effectiveDurationMs}
                        isPlaying={isPlaying}
                        onTimeUpdate={handlePreviewTimeUpdate}
                        onDurationChange={(ms) =>
                          setDurationMs(
                            safeDurationMs(ms, activeTake.durationMs),
                          )
                        }
                        onEnded={handlePlaybackEnded}
                        onVideoElement={handlePreviewVideoElement}
                        tracks={timelineTracks}
                        mediaAssets={activeTake.mediaAssets ?? []}
                      />
                    </div>
                  </main>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Settings & Dials Inspector */}
                <ResizablePanel
                  id="studio-inspector-panel"
                  panelRef={rightPanelRef}
                  defaultSize="20%"
                  minSize="14%"
                  maxSize="32%"
                  collapsible
                  collapsedSize="0px"
                  onResize={(size) => {
                    setInspectorCollapsed(size.inPixels <= 16);
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
                videoUrl={videoUrl}
                durationMs={effectiveDurationMs}
                isPlaying={isPlaying}
                onSeek={handlePreviewTimeUpdate}
                onTogglePlay={handleTogglePlayback}
                onRestartPlayback={handleRestartPlayback}
                onTracksChange={handleTimelineTracksChange}
                onInsertClip={(clip, startMs, targetTrackId) => { void handleInsertClip(clip, startMs, targetTrackId); }}
                onOpenVideoCrop={() => setVideoCropDialogOpen(true)}
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

      <ShowcaseProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        mode={projectDialogMode}
        editingTake={editingTake}
        onCreate={handleCreateProject}
        onEdit={handleEditProject}
      />

      <StudioCompositionCreateDialog
        open={compositionCreateOpen}
        takes={takes}
        templates={compositionTemplates}
        onOpenChange={setCompositionCreateOpen}
        onCreate={handleCreateComposition}
        onDeleteTemplate={handleDeleteCompositionTemplate}
      />

      <StudioSocialKitModal
        open={socialKitModalOpen}
        onOpenChange={setSocialKitModalOpen}
        socialKit={activeTake?.socialKit ?? null}
      />

      <StudioVideoCropDialog
        open={videoCropDialogOpen}
        onOpenChange={setVideoCropDialogOpen}
        videoUrl={videoUrl}
        videoCrop={activeTake?.videoCrop ?? null}
        onApply={handleApplyVideoCrop}
      />

      {activeTake && (
        <StudioCopilotSheet
          open={copilotOpen}
          onOpenChange={setCopilotOpen}
          activeTake={activeTake}
          projectId={projectId ?? undefined}
          currentTimeMs={timelineStore.getState().currentTimeMs}
          initialPrompt={copilotInitialPrompt}
          onInitialPromptHandled={() => setCopilotInitialPrompt(null)}
        />
      )}

      {/* ── Studio Command Bar ─────────────────────────────────────────────── */}
      {activeTake && (
        <StudioCommandBar
          open={commandBarOpen}
          onOpenChange={setCommandBarOpen}
          isPlaying={isPlaying}
          contentLibraryOpen={!contentPanelCollapsed}
          inspectorOpen={!inspectorCollapsed}
          onToggleContentLibrary={toggleLeftPanel}
          onToggleInspector={toggleRightPanel}
          onTogglePlayback={handleTogglePlayback}
          onRestartPlayback={handleRestartPlayback}
          onZoomToFit={() => {
            /* Placeholder for zoom to fit */
          }}
          onRecord={() => setSourcePickerOpen(true)}
          onExport={() => void exportVideo('mp4')}
          onSocialKit={handleOpenSocialKit}
          onMagicDraft={handleRunMagicDraftViaCopilot}
          onAIDirector={() => {
            setCopilotInitialPrompt(null);
            setCopilotOpen(true);
          }}
          onSelectTool={() => {
            /* Set select tool on timeline */
          }}
          onBladeTool={() => {
            /* Set blade tool on timeline */
          }}
          onSplitAtPlayhead={() => {
            /* Split at playhead */
          }}
          onDeleteClip={() => {
            /* Delete selected clip */
          }}
          activeTool="select"
          selectedClipId={null}
        />
      )}
    </div>
  );
}
