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
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  Circle,
  Undo2Icon,
  Redo2Icon,
  SaveIcon,
  CheckIcon,
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
import {
  timelineStore,
  useSelectedClip,
  useTimelineTools,
  useTimelineTracks,
} from '@/hooks/use-timeline-store';
import { StudioInspector } from '@/components/studio/StudioInspector';
import { StudioSourcePicker } from '@/components/studio/StudioSourcePicker';
import { StudioRecordingBar } from '@/components/studio/StudioRecordingBar';
import { StudioSocialKitModal } from '@/components/studio/StudioSocialKitModal';
import { StudioContentPanel } from '@/components/studio/content/StudioContentPanel';
import type { ContentTab } from '@/components/studio/content/StudioContentPanel';
import { StudioCopilotPanel } from '@/components/studio/copilot/StudioCopilotPanel';
import { StudioCommandBar } from '@/components/studio/StudioCommandBar';
import { BlendModeDialog } from '@/components/studio/features/BlendModeDialog';
import { TextAnimatorDialog } from '@/components/studio/features/TextAnimatorDialog';
import { ShapeEditorDialog } from '@/components/studio/features/ShapeEditorDialog';
import type { ShapeEditorValue } from '@/components/studio/features/ShapeEditorDialog';
import { EffectPickerDialog } from '@/components/studio/features/EffectPickerDialog';
import { TransformRangeDialog } from '@/components/studio/features/TransformRangeDialog';
import { ClipEffectsStudioDialog } from '@/components/studio/inspector/ClipEffectsStudioDialog';
import { StudioCanvasBackgroundAddonDialog } from '@/components/studio/addons/StudioCanvasBackgroundAddonDialog';
import { staticValueForProperty } from '@/lib/studio/timeline/keyframes-ui';
import { isStudioZoomClip, STUDIO_ZOOM_PRESETS } from '@/lib/studio/effects/zoom-presets';
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
  type TimelineClip,
  type TimelineTrack,
} from '@/lib/studio-types';
import { renderComposedStudioVideo } from '@/lib/studio/render/export-renderer';
import {
  BUILTIN_STUDIO_ADDONS,
  type StudioAddonId,
} from '@/components/studio/addons/StudioAddonRegistry';
import { studioMediaAssetUrl } from '@/lib/studio/media';
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
  const selectedClipData = useSelectedClip();
  const selectedClip = selectedClipData?.clip ?? null;
  const selectedTrack = selectedClipData?.track ?? null;
  const selectedShapePayload = selectedClip?.payload as
    | (NonNullable<TimelineClip['payload']> & {
        shapeKind?: string;
        pathData?: string;
        fill?: string;
        stroke?: { color: string; width: number };
        trim?: { start: number; end: number; offset: number };
        pathLengthPx?: number;
      })
    | undefined;
  const isSelectedShape =
    selectedClip?.itemType === 'shape' ||
    typeof selectedShapePayload?.shapeKind === 'string';
  const shapeEditorValue: ShapeEditorValue = {
    shapeKind: (selectedShapePayload?.shapeKind ?? 'rect') as ShapeEditorValue['shapeKind'],
    pathData: selectedShapePayload?.pathData ?? '',
    fill: selectedShapePayload?.fill,
    stroke: selectedShapePayload?.stroke,
    trim: selectedShapePayload?.trim,
    pathLengthPx: selectedShapePayload?.pathLengthPx,
  };
  const { canUndo, canRedo, undo, redo } = useTimelineTools();
  const availableAddons = useMemo(
    () => BUILTIN_STUDIO_ADDONS.filter((addon) =>
      addon.scope === 'canvas' ||
      (selectedClipData
        ? addon.canRun(selectedClipData.track, selectedClipData.clip)
        : false),
    ),
    [selectedClipData],
  );

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
  const [contentTab, setContentTab] = useState<ContentTab>('media');
  // Feature dialogs opened from the command bar / inline entry points.
  const [blendDialogOpen, setBlendDialogOpen] = useState(false);
  const [textAnimatorDialogOpen, setTextAnimatorDialogOpen] = useState(false);
  const [shapeEditorOpen, setShapeEditorOpen] = useState(false);
  const [transformRangeOpen, setTransformRangeOpen] = useState(false);
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [effectsStudioOpen, setEffectsStudioOpen] = useState(false);
  const [pendingEffectType, setPendingEffectType] =
    useState<StudioEffectType | null>(null);
  const [backgroundStudioOpen, setBackgroundStudioOpen] = useState(false);
  const [activeAddonId, setActiveAddonId] = useState<StudioAddonId | null>(null);
  const [addonTargetClipId, setAddonTargetClipId] = useState<string | null>(null);

  const openStudioAddon = useCallback(
    (addonId: StudioAddonId, clipId?: string) => {
      const addon = BUILTIN_STUDIO_ADDONS.find((item) => item.id === addonId);
      if (!addon) return;
      if (addon.scope === 'canvas') {
        setAddonTargetClipId(null);
        setActiveAddonId(addonId);
        return;
      }

      const target = clipId
        ? timelineStore.findClip(clipId)
        : selectedClipData;
      if (!target || !addon.canRun(target.track, target.clip)) {
        toast.error('Select a supported video clip to use this add-on.');
        return;
      }
      setAddonTargetClipId(target.clip.id);
      setActiveAddonId(addonId);
    },
    [selectedClipData],
  );

  const activeAddon = BUILTIN_STUDIO_ADDONS.find(
    (addon) => addon.id === activeAddonId,
  );
  const addonTarget = addonTargetClipId
    ? timelineStore.findClip(addonTargetClipId)
    : null;

  const applyStudioAddonPatch = useCallback(
    (clipId: string, patch: Partial<TimelineClip>) => {
      const target = timelineStore.findClip(clipId);
      const addon = BUILTIN_STUDIO_ADDONS.find(
        (item) => item.id === activeAddonId,
      );
      if (
        addon?.scope !== 'clip' ||
        !target ||
        !addon.canRun(target.track, target.clip)
      ) {
        toast.error('This add-on can no longer be applied to the selected clip.');
        return false;
      }
      if (target.track.locked) {
        toast.error('Unlock this video track before applying the add-on.');
        return false;
      }
      timelineStore.updateClip(clipId, patch, target.track.id);
      toast.success(`${addon.name} applied.`);
      return true;
    },
    [activeAddonId],
  );

  const applyStudioCanvasBackground = useCallback(
    (background: string) => {
      if (!activeTake) return;
      void updateStyling({ background });
      toast.success('Canvas background updated.');
    },
    [activeTake, updateStyling],
  );

  const updateSelectedClipPayload = useCallback(
    (payload: NonNullable<TimelineClip['payload']>) => {
      if (!selectedClip) return;
      timelineStore.updateClip(
        selectedClip.id,
        { payload },
        selectedTrack?.id,
      );
    },
    [selectedClip, selectedTrack?.id],
  );

  const openShapesLibrary = () => {
    if (contentPanelCollapsed) toggleLeftPanel();
    setContentTab('shapes');
  };

  const openEffectsStudioForType = useCallback((effectType: StudioEffectType) => {
    setPendingEffectType(effectType);
    setEffectsStudioOpen(true);
  }, []);

  const handleAddPositionKeyframe = useCallback(() => {
    if (!selectedClip) return;
    const localTimeMs = Math.max(
      0,
      timelineStore.getState().currentTimeMs - selectedClip.startMs,
    );
    const property =
      selectedTrack?.type === 'effects' && isStudioZoomClip(selectedClip)
        ? 'zoomScale'
        : 'x';
    timelineStore.addClipKeyframe(
      selectedClip.id,
      property,
      localTimeMs,
      staticValueForProperty(selectedClip, property),
    );
    toast.success(
      property === 'zoomScale'
        ? 'Zoom keyframe added at the playhead.'
        : 'Position keyframe added at the playhead.',
    );
  }, [selectedClip, selectedTrack?.type]);

  const handleAddZoomAtPlayhead = useCallback(() => {
    const preset = STUDIO_ZOOM_PRESETS[0];
    const startMs = timelineStore.getState().currentTimeMs;
    const durationMs = Math.min(
      preset.durationMs,
      Math.max(600, effectiveDurationMs - startMs),
    );
    timelineStore.addClip('effects', {
      name: preset.label,
      durationMs,
      startMs,
      color: preset.accent,
      itemType: 'effect',
      payload: {
        effectType: 'zoom',
        scale: preset.scale,
        targetX: preset.targetX,
        targetY: preset.targetY,
      },
    });
    toast.success(
      'Zoom added on the Effects track. Open its Effects Studio to keyframe it.',
    );
  }, [effectiveDurationMs]);

  const handleClearKeyframes = useCallback(() => {
    if (!selectedClip) return;
    const keyframes = selectedClip.payload?.keyframes ?? [];
    for (const keyframe of [...keyframes]) {
      timelineStore.removeClipKeyframe(selectedClip.id, keyframe.id);
    }
    toast.success('Clip keyframes cleared.');
  }, [selectedClip]);

  const handleCopyKeyframes = useCallback(() => {
    const keyframes = selectedClip?.payload?.keyframes ?? [];
    if (keyframes.length === 0) return;
    void navigator.clipboard
      ?.writeText(JSON.stringify(keyframes, null, 2))
      .then(() => toast.success('Keyframes copied to clipboard.'))
      .catch(() => toast.error('Could not copy keyframes.'));
  }, [selectedClip]);

  // Content library & inspector panel states & refs
  const [contentPanelCollapsed, setContentPanelCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const timelinePanelRef = useRef<PanelImperativeHandle | null>(null);
  const expandedTimelineSizeRef = useRef(35);

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

  const toggleTimelinePanel = () => {
    const panel = timelinePanelRef.current;
    if (!panel) return;
    if (timelineCollapsed) {
      panel.resize(`${expandedTimelineSizeRef.current}%`);
      setTimelineCollapsed(false);
    } else {
      expandedTimelineSizeRef.current = panel.getSize().asPercentage;
      panel.resize('36px');
      setTimelineCollapsed(true);
    }
  };


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

      // Feature-dialog shortcuts. They are ignored while any modal owns the
      // screen so typing in a dialog can never trigger a background action.
      const modalOpen =
        commandBarOpen ||
        blendDialogOpen ||
        textAnimatorDialogOpen ||
        shapeEditorOpen ||
        transformRangeOpen ||
        effectPickerOpen ||
        effectsStudioOpen ||
        backgroundStudioOpen ||
        videoCropDialogOpen ||
        sourcePickerOpen ||
        socialKitModalOpen ||
        copilotOpen;
      if (modalOpen) return;

      if (selectedClip && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const visualSelected =
          selectedTrack?.type === 'video' ||
          selectedTrack?.type === 'overlays' ||
          isSelectedShape;
        const textSelected =
          selectedTrack?.type === 'captions' ||
          selectedClip.itemType === 'text';
        const zoomSelected =
          selectedTrack?.type === 'effects' && isStudioZoomClip(selectedClip);

        if (e.shiftKey) {
          const key = e.key.toLowerCase();
          if (key === 'b' && visualSelected) {
            e.preventDefault();
            setBlendDialogOpen(true);
          } else if (key === 'f' && visualSelected) {
            e.preventDefault();
            setEffectPickerOpen(true);
          } else if (key === 't' && textSelected) {
            e.preventDefault();
            setTextAnimatorDialogOpen(true);
          } else if (key === 's' && isSelectedShape) {
            e.preventDefault();
            setShapeEditorOpen(true);
          }
        } else if (
          e.key.toLowerCase() === 'k' &&
          (visualSelected || textSelected || zoomSelected)
        ) {
          e.preventDefault();
          handleAddPositionKeyframe();
        }
      }

      // Space: Play/Pause (only if not in an input field)
      if (e.code === 'Space' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
        timelineStore.setPlaying(!isPlaying);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTake,
    backgroundStudioOpen,
    blendDialogOpen,
    commandBarOpen,
    copilotOpen,
    effectPickerOpen,
    effectsStudioOpen,
    handleAddPositionKeyframe,
    isPlaying,
    isSelectedShape,
    selectedClip,
    selectedTrack?.type,
    shapeEditorOpen,
    socialKitModalOpen,
    sourcePickerOpen,
    textAnimatorDialogOpen,
    transformRangeOpen,
    videoCropDialogOpen,
  ]);

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

      const preserveTrackIds = new Set(
        (activeTake.tracks ?? []).map((track) => track.id),
      );
      const extracted = extractClipsFromTracks(tracks, { preserveTrackIds });

      // Persist both the compatibility fields (zooms, captions, cuts, etc.)
      // and any multi-track layers or per-clip edits (transform, deviceFrame,
      // effects, keyframes, animations) in a single atomic save.
      void updateTimelineData({
        zooms: extractZoomsFromTracks(tracks, cuts),
        captions: extractCaptionsFromTracks(tracks, cuts),
        cuts: extractCutsFromTracks(tracks, activeTake.durationMs),
        effects: extractEffectsFromTracks(tracks, cuts),
        overlays: extractOverlaysFromTracks(tracks, cuts),
        ...(extracted ? { tracks: extracted.tracks } : {}),
      }).catch((error: unknown) => {
        console.error('[Studio] Failed to save timeline data.', error);
        toast.error('Could not save the latest timeline changes.');
      });
    },
    [activeTake, cuts, updateTimelineData],
  );


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

  const handleRenameTake = useCallback(
    async (id: string, newTitle: string) => {
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
    },
    [activeTake, loadTake],
  );

  const [projectTitleDraft, setProjectTitleDraft] = useState(
    activeTake?.title ?? '',
  );
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [justSavedProject, setJustSavedProject] = useState(false);

  useEffect(() => {
    setProjectTitleDraft(activeTake?.title ?? '');
  }, [activeTake?.id, activeTake?.title]);

  const handleCommitProjectTitle = useCallback(async () => {
    if (!activeTake) return;
    const trimmed = projectTitleDraft.trim();
    if (!trimmed) {
      setProjectTitleDraft(activeTake.title);
      return;
    }
    if (trimmed === activeTake.title) return;
    await handleRenameTake(activeTake.id, trimmed);
  }, [activeTake, handleRenameTake, projectTitleDraft]);

  const handleSaveProject = useCallback(async () => {
    if (!activeTake || isSavingProject) return;
    setIsSavingProject(true);
    try {
      const trimmedTitle = projectTitleDraft.trim();
      const nextTitle = trimmedTitle || activeTake.title;
      if (!trimmedTitle) {
        setProjectTitleDraft(activeTake.title);
      }

      const currentTracks = timelineStore.getState().tracks;
      const preserveTrackIds = new Set(
        (activeTake.tracks ?? []).map((track) => track.id),
      );
      const extractedClips = extractClipsFromTracks(currentTracks, {
        preserveTrackIds,
      });

      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        title: nextTitle,
        styling: activeTake.styling,
        zooms: extractZoomsFromTracks(currentTracks, cuts),
        captions: extractCaptionsFromTracks(currentTracks, cuts),
        cuts: extractCutsFromTracks(currentTracks, activeTake.durationMs),
        effects: extractEffectsFromTracks(currentTracks, cuts),
        overlays: extractOverlaysFromTracks(currentTracks, cuts),
        ...(extractedClips ? { tracks: extractedClips.tracks } : {}),
      });

      if (nextTitle !== activeTake.title) {
        await loadTake(activeTake.id);
      }

      setJustSavedProject(true);
      window.setTimeout(() => setJustSavedProject(false), 1800);
      toast.success('Project saved');
    } catch (error) {
      console.error('[Studio] Failed to save project.', error);
      toast.error('Failed to save project');
    } finally {
      setIsSavingProject(false);
    }
  }, [activeTake, cuts, isSavingProject, loadTake, projectTitleDraft]);

  // Cmd+S / Ctrl+S: Save project
  useEffect(() => {
    if (!activeTake) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSaveProject();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTake, handleSaveProject]);

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
    const transitionAnchorMs = startMs ?? timelineStore.getState().currentTimeMs;
    const preferredTransitionClipId = timelineStore.getState().selectedClipId ?? undefined;
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
    const newClip = clipPayload.trackType === 'transitions'
      ? timelineStore.addTransitionClip({
          transitionType: clipPayload.payload?.transitionType ?? 'fade',
          durationMs: clipPayload.durationMs,
          startMs: transitionAnchorMs,
          name: clipPayload.name,
          color: clipPayload.color,
          preferredClipId: preferredTransitionClipId,
          targetTrackId,
        })
      : timelineStore.addClip(clipPayload.trackType, {
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

    if (!newClip) {
      toast.error('Place a transition at a cut between adjacent clips on one video track.');
      return;
    }

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
      {mediaPrepProgress &&
        mediaPrepProgress.takeId === activeTake?.id &&
        mediaPrepProgress.stage !== 'ready' && (
          <div className="fixed top-4 right-4 z-50 max-w-sm bg-card/95 border border-border/80 shadow-2xl rounded-xl p-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <SparklesIcon className="size-4 animate-spin" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">
                Preparing media
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {mediaPrepProgress.stage === 'probing' &&
                  'Analyzing video file…'}
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
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* ── Top Header Bar (Dense h-10) ─────────────────────────────────────── */}
          <PageHeader
            className="select-none"
            crumbs={[]}
            title={
              <input
                type="text"
                value={projectTitleDraft}
                onChange={(e) => setProjectTitleDraft(e.target.value)}
                onBlur={() => void handleCommitProjectTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setProjectTitleDraft(activeTake.title);
                    e.currentTarget.blur();
                  }
                }}
                aria-label="Project name"
                title="Edit project name"
                placeholder="Untitled project"
                className="h-7 w-40 sm:w-56 truncate rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold tracking-tight text-foreground transition-colors hover:border-border/60 hover:bg-secondary/30 focus:border-primary/60 focus:bg-secondary/40 focus:outline-none"
              />
            }
            nav={
              <div className="flex items-center gap-1">
                <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border/60" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Z)"
                  aria-label="Undo"
                >
                  <Undo2Icon className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Shift+Z)"
                  aria-label="Redo"
                >
                  <Redo2Icon className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 shrink-0 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground',
                    justSavedProject && 'text-emerald-400 hover:text-emerald-400',
                  )}
                  onClick={() => void handleSaveProject()}
                  disabled={isSavingProject}
                  title="Save project (⌘S)"
                  aria-label="Save project"
                >
                  {justSavedProject ? (
                    <CheckIcon className="w-3.5 h-3.5" />
                  ) : (
                    <SaveIcon className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {isSavingProject ? 'Saving…' : justSavedProject ? 'Saved' : 'Save'}
                  </span>
                </Button>
              </div>
            }
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

                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-7 shrink-0 text-muted-foreground hover:text-foreground',
                      timelineCollapsed && 'bg-primary/10 text-primary',
                    )}
                    onClick={toggleTimelinePanel}
                    title={
                      timelineCollapsed ? 'Expand Timeline' : 'Collapse Timeline'
                    }
                    aria-label={
                      timelineCollapsed ? 'Expand Timeline' : 'Collapse Timeline'
                    }
                  >
                    {timelineCollapsed ? (
                      <ChevronUpIcon className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    )}
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
                    size="icon"
                    className="size-7 shrink-0 bg-indigo-600 text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 hover:shadow-md active:scale-95 disabled:opacity-50"
                    onClick={handleOpenSocialKit}
                    disabled={isGeneratingSocialKit}
                    title="Generate social release kit"
                    aria-label="Generate social release kit"
                  >
                    <Share2Icon className="size-3.5 studio-icon-shimmer" />
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
                    activeTab={contentTab}
                    onActiveTabChange={setContentTab}
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
                  <main className="flex-1 flex flex-col overflow-hidden h-full w-full">
                    {/* 60fps Real-Time Video Preview Canvas — full container, no padding */}
                    <div className="flex-1 w-full h-full flex items-center justify-center min-h-0 overflow-hidden">
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
                    onUpdateStyling={updateStyling}
                    onToggleCollapse={toggleRightPanel}
                    onAddZoomAtPlayhead={handleAddZoomAtPlayhead}
                    mediaAssets={activeTake.mediaAssets ?? []}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom Full-Width Multi-Track Timeline Panel */}
            <ResizablePanel
              id="studio-bottom-timeline"
              panelRef={timelinePanelRef}
              defaultSize="35%"
              minSize="36px"
              maxSize="55%"
              collapsible
              collapsedSize="36px"
              onResize={(size) => {
                const isCollapsed = size.inPixels <= 36;
                if (!isCollapsed) {
                  expandedTimelineSizeRef.current = size.asPercentage;
                }
                setTimelineCollapsed(isCollapsed);
              }}
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
                addons={BUILTIN_STUDIO_ADDONS}
                onRunAddon={(addonId, clipId) =>
                  openStudioAddon(addonId, clipId)
                }
                collapsed={timelineCollapsed}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
          </div>
          <StudioCopilotPanel
            open={copilotOpen}
            onOpenChange={setCopilotOpen}
            activeTake={activeTake}
            projectId={projectId ?? undefined}
            currentTimeMs={timelineStore.getState().currentTimeMs}
            initialPrompt={copilotInitialPrompt}
            onInitialPromptHandled={() => setCopilotInitialPrompt(null)}
          />
        </div>
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

      {activeAddon?.scope === 'clip' &&
        addonTarget &&
        activeTake && (
          <activeAddon.Dialog
            open={Boolean(activeAddonId)}
            clip={addonTarget.clip}
            track={addonTarget.track}
            videoUrl={
              addonTarget.clip.payload?.mediaAssetId
                ? studioMediaAssetUrl(addonTarget.clip.payload.mediaAssetId)
                : videoUrl
            }
            onOpenChange={(open) => {
              if (!open) {
                setActiveAddonId(null);
                setAddonTargetClipId(null);
              }
            }}
            onApply={(patch) =>
              applyStudioAddonPatch(addonTarget.clip.id, patch)
            }
          />
        )}
      {activeAddon?.scope === 'canvas' && activeTake && (
        <activeAddon.Dialog
          open={Boolean(activeAddonId)}
          styling={activeTake.styling}
          onOpenChange={(open) => {
            if (!open) {
              setActiveAddonId(null);
              setAddonTargetClipId(null);
            }
          }}
          onApply={applyStudioCanvasBackground}
        />
      )}

      {/* ── Feature Dialogs (command bar + inline entry points) ─────────────── */}
      {selectedClip && (
        <BlendModeDialog
          open={blendDialogOpen}
          onOpenChange={setBlendDialogOpen}
          clipName={selectedClip.name}
          value={selectedClip.payload?.blendMode}
          onApply={(blendMode) =>
            updateSelectedClipPayload({ blendMode })
          }
        />
      )}

      {selectedClip && (
        <TextAnimatorDialog
          open={textAnimatorDialogOpen}
          onOpenChange={setTextAnimatorDialogOpen}
          clipName={selectedClip.name}
          text={selectedClip.payload?.text ?? selectedClip.name}
          value={selectedClip.payload?.textAnimator}
          onApply={(textAnimator) =>
            updateSelectedClipPayload({ textAnimator })
          }
        />
      )}

      {selectedClip && isSelectedShape && (
        <ShapeEditorDialog
          open={shapeEditorOpen}
          onOpenChange={setShapeEditorOpen}
          clipName={selectedClip.name}
          value={shapeEditorValue}
          onApply={(next) =>
            updateSelectedClipPayload(
              next as unknown as NonNullable<TimelineClip['payload']>,
            )
          }
        />
      )}

      {selectedClip && (
        <TransformRangeDialog
          open={transformRangeOpen}
          onOpenChange={setTransformRangeOpen}
          clipName={selectedClip.name}
        />
      )}

      {selectedClip && (
        <EffectPickerDialog
          open={effectPickerOpen}
          onOpenChange={setEffectPickerOpen}
          clipName={selectedClip.name}
          onSelect={(effectType) => {
            setEffectPickerOpen(false);
            openEffectsStudioForType(effectType);
          }}
        />
      )}

      {selectedClip && (
        <ClipEffectsStudioDialog
          open={effectsStudioOpen}
          onOpenChange={(next) => {
            setEffectsStudioOpen(next);
            if (!next) setPendingEffectType(null);
          }}
          clip={selectedClip}
          initialEffectType={pendingEffectType}
          mediaAssets={activeTake?.mediaAssets ?? []}
          onUpdateClip={(clipId, patch) =>
            timelineStore.updateClip(clipId, patch, selectedTrack?.id)
          }
        />
      )}

      {activeTake && (
        <StudioCanvasBackgroundAddonDialog
          open={backgroundStudioOpen}
          onOpenChange={setBackgroundStudioOpen}
          styling={activeTake.styling}
          onApply={applyStudioCanvasBackground}
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
          timelineOpen={!timelineCollapsed}
          onToggleContentLibrary={toggleLeftPanel}
          onToggleInspector={toggleRightPanel}
          onToggleTimeline={toggleTimelinePanel}
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
          selectedClip={selectedClip}
          selectedTrack={selectedTrack}
          onOpenBlendMode={
            selectedClip &&
            (selectedTrack?.type === 'video' ||
              selectedTrack?.type === 'overlays' ||
              isSelectedShape)
              ? () => setBlendDialogOpen(true)
              : undefined
          }
          onOpenTransformRange={
            selectedClip &&
            (selectedTrack?.type === 'video' ||
              selectedTrack?.type === 'overlays' ||
              selectedTrack?.type === 'captions')
              ? () => setTransformRangeOpen(true)
              : undefined
          }
          onOpenEffectsStudio={
            selectedClip &&
            (selectedTrack?.type === 'video' ||
              selectedTrack?.type === 'overlays' ||
              (selectedTrack?.type === 'effects' &&
                isStudioZoomClip(selectedClip)))
              ? () => {
                  setPendingEffectType(null);
                  setEffectsStudioOpen(true);
                }
              : undefined
          }
          onAddZoomAtPlayhead={handleAddZoomAtPlayhead}
          onOpenEffectPicker={
            selectedClip &&
            (selectedTrack?.type === 'video' ||
              selectedTrack?.type === 'overlays')
              ? () => setEffectPickerOpen(true)
              : undefined
          }
          onAddEffect={
            selectedClip &&
            (selectedTrack?.type === 'video' ||
              selectedTrack?.type === 'overlays')
              ? openEffectsStudioForType
              : undefined
          }
          onOpenTextAnimator={
            selectedClip &&
            (selectedTrack?.type === 'captions' ||
              selectedClip.itemType === 'text')
              ? () => setTextAnimatorDialogOpen(true)
              : undefined
          }
          onOpenShapeEditor={
            selectedClip && isSelectedShape
              ? () => setShapeEditorOpen(true)
              : undefined
          }
          onShowShapesTab={openShapesLibrary}
          onOpenBackgroundStudio={() => setBackgroundStudioOpen(true)}
          onAddKeyframe={
            selectedClip &&
            (selectedTrack?.type === 'video' ||
              selectedTrack?.type === 'overlays' ||
              selectedTrack?.type === 'captions' ||
              (selectedTrack?.type === 'effects' &&
                isStudioZoomClip(selectedClip)))
              ? handleAddPositionKeyframe
              : undefined
          }
          onClearKeyframes={
            selectedClip?.payload?.keyframes?.length
              ? handleClearKeyframes
              : undefined
          }
          onCopyKeyframes={
            selectedClip?.payload?.keyframes?.length
              ? handleCopyKeyframes
              : undefined
          }
          addons={availableAddons}
          onRunAddon={(addonId) => openStudioAddon(addonId)}
          activeTool="select"
          selectedClipId={selectedClipData?.clip.id ?? null}
        />
      )}
    </div>
  );
}
