import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeftIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  ImagePlusIcon,
  Layers3Icon,
  Music2Icon,
  PlusIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  Redo2Icon,
  VideoIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StudioCompositionPreview } from '@/components/studio/StudioCompositionPreview';
import { StudioCompositionInspector } from '@/components/studio/StudioCompositionInspector';
import { StudioCompositionEffectsPanel } from '@/components/studio/StudioCompositionEffectsPanel';
import { StudioCompositionTakeStylePanel } from '@/components/studio/StudioCompositionTakeStylePanel';
import { StudioCompositionTakeTracksPanel } from '@/components/studio/StudioCompositionTakeTracksPanel';
import { StudioCopilotSheet } from '@/components/studio/copilot/StudioCopilotSheet';
import { StudioSocialKitModal } from '@/components/studio/StudioSocialKitModal';
import { StudioCanvasTimeline } from '@/components/studio/timeline/StudioCanvasTimeline';
import { renderStudioCompositionVideo } from '@/lib/studio/render/composition-export';
import { studioTakeMediaUrl } from '@/lib/studio/media';
import { sourceTimeForTakeLayer } from '@/lib/studio/render/take-frame';
import { timelineStore } from '@/hooks/use-timeline-store';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import { updateStudioCompositionFromTracks } from '@/lib/studio/timeline/composition';
import { compositionDurationMs, normalizeCuts } from '@/lib/studio/timeline/ripple';
import {
  applyStudioCompositionOperation,
  createDefaultStudioTakePresentation,
  parseStudioCompositionDocument,
  setCompositionAspectRatio,
  studioTakePresentationFromTake,
} from '@/lib/studio/composition';
import type {
  StudioAspectRatio,
  StudioComposition,
  StudioCompositionDocument,
  StudioCompositionLayerPatch,
  StudioCompositionOperation,
  StudioEffect,
  StudioEffectType,
  StudioLayerLayout,
  StudioTake,
  StudioTakePresentation,
  StudioTakeSummary,
  TimelineTrack,
} from '@/lib/studio/types';
import { toast } from 'sonner';

const ASPECT_RATIOS: Array<{ value: StudioAspectRatio; label: string }> = [
  { value: '16:9', label: 'YouTube · 16:9' },
  { value: '9:16', label: 'Mobile · 9:16' },
  { value: '1:1', label: 'Square · 1:1' },
  { value: '4:3', label: 'Classic · 4:3' },
];

export default function StudioCompositionPage() {
  const { compositionId } = useParams<{ compositionId: string }>();
  const navigate = useNavigate();
  const [composition, setComposition] = useState<StudioComposition | null>(
    null,
  );
  const undoDocumentsRef = useRef<StudioCompositionDocument[]>([]);
  const redoDocumentsRef = useRef<StudioCompositionDocument[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [copilotTake, setCopilotTake] = useState<StudioTake | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [releaseKitOpen, setReleaseKitOpen] = useState(false);
  const [generatingReleaseKit, setGeneratingReleaseKit] = useState(false);
  const [takes, setTakes] = useState<StudioTakeSummary[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState('');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  useEffect(() => {
    undoDocumentsRef.current = [];
    redoDocumentsRef.current = [];
  }, [compositionId]);

  const fetchComposition = useCallback(async () => {
    if (!compositionId) return null;
    const loaded = await window.electron.ipc.invoke<StudioComposition | null>(
      'studio:composition-get',
      { id: compositionId },
    );
    if (!loaded) return null;
    const sourceTakes = await window.electron.ipc.invoke<StudioTakeSummary[]>(
      'studio:list-takes',
      { projectId: loaded.projectId },
    );
    const sourceTakeId = loaded.document.layers.find(
      (layer) => layer.kind === 'video',
    )?.sourceId;
    const sourceTake = sourceTakeId
      ? await window.electron.ipc.invoke<StudioTake | null>(
          'studio:get-take',
          { id: sourceTakeId },
        )
      : null;
    return { composition: loaded, takes: sourceTakes, sourceTake };
  }, [compositionId]);

  useEffect(() => {
    let cancelled = false;
    void fetchComposition()
      .then((result) => {
        if (cancelled) return null;
        if (!result) {
          setComposition(null);
          return null;
        }
        setComposition(result.composition);
        setCopilotTake(result.sourceTake);
        setSelectedLayerId(result.composition.document.layers[0]?.id ?? null);
        setTitleInput(result.composition.title);
        setTakes(result.takes);
        setSelectedTakeId(
          result.takes.find(
            (take) =>
              !result.composition.document.layers.some(
                (layer) => layer.kind === 'video' && layer.sourceId === take.id,
              ),
          )?.id ?? '',
        );
        return result;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(
          '[Studio composition] Failed to load composition.',
          error,
        );
        toast.error('Could not load this composition.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchComposition]);

  useEffect(() => {
    return window.electron.ipc.on('studio:composition-changed', () => {
      void fetchComposition()
        .then((result) => {
          if (!result) return;
          setComposition(result.composition);
          setCopilotTake(result.sourceTake);
          setTakes(result.takes);
          setTitleInput(result.composition.title);
        })
        .catch((error: unknown) => {
          console.error('[Studio composition] Refresh after agent edit failed.', error);
        });
    });
  }, [fetchComposition]);

  const availableTakes = takes.filter(
    (take) =>
      !composition?.document.layers.some(
        (layer) => layer.kind === 'video' && layer.sourceId === take.id,
      ),
  );

  const persist = useCallback(async (
    document: StudioCompositionDocument,
    title = composition?.title ?? '',
  ) => {
    if (!composition) return;
    const documentChanged = composition.document !== document;
    setSaving(true);
    try {
      const saved = await window.electron.ipc.invoke<StudioComposition>(
        'studio:composition-save',
        {
          id: composition.id,
          title,
          document: parseStudioCompositionDocument(document),
          expectedRevision: composition.revision ?? 1,
        },
      );
      setComposition(saved);
      setTitleInput(saved.title);
      if (documentChanged) {
        undoDocumentsRef.current.push(composition.document);
        redoDocumentsRef.current = [];
        setHistoryVersion((version) => version + 1);
      }
      return saved;
    } catch (error) {
      console.error('[Studio composition] Failed to save composition.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not save composition.',
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, [composition]);

  const undoComposition = async () => {
    if (!composition || saving || exporting) return;
    const previousDocument = undoDocumentsRef.current.pop();
    if (!previousDocument) return;
    setSaving(true);
    try {
      const saved = await window.electron.ipc.invoke<StudioComposition>(
        'studio:composition-save',
        {
          id: composition.id,
          title: composition.title,
          document: previousDocument,
          expectedRevision: composition.revision ?? 1,
        },
      );
      redoDocumentsRef.current.push(composition.document);
      setComposition(saved);
      setTitleInput(saved.title);
      setHistoryVersion((version) => version + 1);
    } catch (error) {
      undoDocumentsRef.current.push(previousDocument);
      toast.error(
        error instanceof Error ? error.message : 'Could not undo that edit.',
      );
    } finally {
      setSaving(false);
    }
  };

  const redoComposition = async () => {
    if (!composition || saving || exporting) return;
    const nextDocument = redoDocumentsRef.current.pop();
    if (!nextDocument) return;
    setSaving(true);
    try {
      const saved = await window.electron.ipc.invoke<StudioComposition>(
        'studio:composition-save',
        {
          id: composition.id,
          title: composition.title,
          document: nextDocument,
          expectedRevision: composition.revision ?? 1,
        },
      );
      undoDocumentsRef.current.push(composition.document);
      setComposition(saved);
      setTitleInput(saved.title);
      setHistoryVersion((version) => version + 1);
    } catch (error) {
      redoDocumentsRef.current.push(nextDocument);
      toast.error(
        error instanceof Error ? error.message : 'Could not redo that edit.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddTake = async () => {
    if (!composition || !selectedTakeId) return;
    if (composition.document.layers.length >= 12) {
      toast.error('A composition can contain up to 12 layers.');
      return;
    }
    const takeSummary = availableTakes.find((item) => item.id === selectedTakeId);
    if (!takeSummary) return;
    try {
      const take = await window.electron.ipc.invoke<StudioTake | null>(
        'studio:get-take',
        { id: takeSummary.id },
      );
      if (!take) throw new Error('The selected recording is no longer available.');
      const saved = await persist(
        applyStudioCompositionOperation(composition.document, {
          type: 'layer.addVideo',
          take: takeSummary,
          takePresentation: studioTakePresentationFromTake(take),
        }),
      );
      if (saved) {
        setCopilotTake((current) => current ?? take);
        setSelectedLayerId(
          saved.document.layers.find(
            (layer) => layer.kind === 'video' && layer.sourceId === take.id,
          )?.id ?? null,
        );
        toast.success('Recording added as a layer.');
      }
    } catch (error) {
      console.error('[Studio composition] Could not add recording layer.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not add that recording.',
      );
    }
  };

  const handleAddImage = async () => {
    if (!composition) return;
    if (composition.document.layers.length >= 12) {
      toast.error('A composition can contain up to 12 layers.');
      return;
    }
    try {
      const asset = await window.electron.ipc.invoke<{
        id: string;
        name: string;
      } | null>('studio:composition-import-image', { id: composition.id });
      if (!asset) return;
      const loaded = await fetchComposition();
      if (loaded) {
        setComposition(loaded.composition);
        setTitleInput(loaded.composition.title);
        setTakes(loaded.takes);
        const layers = loaded.composition.document.layers;
        setSelectedLayerId(layers[layers.length - 1]?.id ?? null);
      }
      toast.success(`${asset.name} added as a layer.`);
    } catch (error) {
      console.error('[Studio composition] Image import failed.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not add that image.',
      );
    }
  };

  const handleAddText = async () => {
    if (!composition) return;
    if (composition.document.layers.length >= 12) {
      toast.error('A composition can contain up to 12 layers.');
      return;
    }
    try {
      const document = applyStudioCompositionOperation(composition.document, {
        type: 'layer.addText',
        text: 'Your headline',
      });
      const saved = await persist(document);
      if (saved) {
        setSelectedLayerId(saved.document.layers.at(-1)?.id ?? null);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not add a text layer.',
      );
    }
  };

  const handleAspectRatioChange = async (value: string) => {
    if (!composition) return;
    const ratio = value as StudioAspectRatio;
    if (!ASPECT_RATIOS.some((option) => option.value === ratio)) return;
    await persist(setCompositionAspectRatio(composition.document, ratio));
  };

  const handleAudioSourceChange = async (layerId: string) => {
    if (!composition) return;
    await persist(
      parseStudioCompositionDocument({
        ...composition.document,
        audioSourceLayerId: layerId || null,
      }),
    );
  };

  const handleExport = async () => {
    if (!composition || exporting) return;
    setExporting(true);
    setExportStatus('Preparing media…');
    try {
      await renderStudioCompositionVideo(composition, {
        onProgress: (_progress, status) => setExportStatus(status),
      });
      setExportStatus('Encoding MP4…');
      const result = await window.electron.ipc.invoke<{
        ok: boolean;
        filePath?: string;
        error?: string;
        canceled?: boolean;
      }>('studio:composition-export', {
        id: composition.id,
        format: 'mp4',
      });
      if (result.canceled) return;
      if (!result.ok || !result.filePath) {
        throw new Error(result.error || 'Composition export failed.');
      }
      toast.success(`Exported composition to ${result.filePath}`);
    } catch (error) {
      console.error('[Studio composition] Export failed.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not export composition.',
      );
    } finally {
      setExporting(false);
      setExportStatus('');
    }
  };

  const handleRemoveLayer = async (layerId: string) => {
    if (!composition) return;
    const saved = await persist(
      applyStudioCompositionOperation(composition.document, {
        type: 'layer.remove',
        layerId,
      }),
    );
    if (saved) {
      if (selectedLayerId === layerId) {
        setSelectedLayerId(saved.document.layers[0]?.id ?? null);
      }
      toast.success('Layer removed.');
    }
  };

  const handleReorderLayer = async (
    layerId: string,
    direction: 'forward' | 'backward',
  ) => {
    if (!composition) return;
    try {
      await persist(
        applyStudioCompositionOperation(composition.document, {
          type: 'layer.reorder',
          layerId,
          direction,
        }),
      );
    } catch (error) {
      console.error('[Studio composition] Could not reorder layer.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not reorder layer.',
      );
    }
  };

  const handleAddEffect = (type: StudioEffectType, startMs: number) => {
    if (!composition) return;
    try {
      void persist(
      applyStudioCompositionOperation(composition.document, {
        type: 'effect.add',
        effectType: type,
        startMs,
      }),
    );
    } catch (error) {
      console.error('[Studio composition] Could not add canvas effect.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not add that effect.',
      );
    }
  };

  const handleUpdateEffect = (
    effectId: string,
    patch: Partial<Pick<StudioEffect, 'startMs' | 'endMs' | 'intensity'>>,
  ) => {
    if (!composition) return;
    try {
      void persist(
        applyStudioCompositionOperation(composition.document, {
        type: 'effect.patch',
        effectId,
        patch,
      }),
      );
    } catch (error) {
      console.error('[Studio composition] Could not update canvas effect.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not update that effect.',
      );
    }
  };

  const handleRemoveEffect = (effectId: string) => {
    if (!composition) return;
    try {
      void persist(
      applyStudioCompositionOperation(composition.document, {
        type: 'effect.remove',
        effectId,
      }),
    );
    } catch (error) {
      console.error('[Studio composition] Could not remove canvas effect.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not remove that effect.',
      );
    }
  };

  const handleLayerPatch = async (
    layerId: string,
    patch: StudioCompositionLayerPatch,
  ): Promise<boolean> => {
    if (!composition) return false;
    try {
      const operation: StudioCompositionOperation = {
        type: 'layer.patch',
        layerId,
        patch,
      };
      const saved = await persist(
        applyStudioCompositionOperation(composition.document, operation),
      );
      return Boolean(saved);
    } catch (error) {
      console.error('[Studio composition] Could not update layer.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not update that layer.',
      );
      return false;
    }
  };

  const handleLayoutChange = (
    layerId: string,
    layout: StudioLayerLayout,
  ) => handleLayerPatch(layerId, { layout });

  const handleTimingChange = (
    layerId: string,
    startMs: number,
    endMs: number,
  ) => handleLayerPatch(layerId, { startMs, endMs });

  const handleCompositionTracksChange = useCallback(async (tracks: TimelineTrack[]) => {
    if (!composition || saving || exporting) return;
    try {
      const document = updateStudioCompositionFromTracks(composition, tracks);
      const saved = await persist(document);
      if (saved) {
        setPlayheadMs((timeMs) => Math.min(timeMs, saved.document.durationMs));
      }
    } catch (error) {
      console.error('[Studio composition] Timeline edit failed.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not save timeline changes.',
      );
    }
  }, [composition, exporting, persist, saving]);

  const updateTakePresentation = async (
    layerId: string,
    patch: Partial<StudioTakePresentation>,
  ) => {
    const layer = composition?.document.layers.find(
      (candidate) => candidate.id === layerId,
    );
    if (!layer || layer.kind !== 'video') return false;
    const presentation =
      layer.takePresentation ?? createDefaultStudioTakePresentation();
    return handleLayerPatch(layerId, {
      takePresentation: { ...presentation, ...patch },
    });
  };

  const handleAddTakeCut = (layerId: string) => {
    const layer = composition?.document.layers.find(
      (candidate) => candidate.id === layerId,
    );
    if (!layer || layer.kind !== 'video') return;
    const presentation =
      layer.takePresentation ?? createDefaultStudioTakePresentation();
    const sourceTimeMs = sourceTimeForTakeLayer(layer, playheadMs);
    const cuts = normalizeCuts(
      [
        ...presentation.cuts,
        {
          id: crypto.randomUUID(),
          startMs: Math.max(0, sourceTimeMs - 250),
          endMs: Math.min(layer.sourceDurationMs, sourceTimeMs + 250),
          reason: 'manual' as const,
        },
      ],
      layer.sourceDurationMs,
    );
    if (compositionDurationMs(layer.sourceDurationMs, cuts) <= 0) return;
    void updateTakePresentation(layerId, { cuts });
  };

  const handleAddTakeCaption = (layerId: string) => {
    const layer = composition?.document.layers.find(
      (candidate) => candidate.id === layerId,
    );
    if (!layer || layer.kind !== 'video') return;
    const presentation =
      layer.takePresentation ?? createDefaultStudioTakePresentation();
    const startMs = sourceTimeForTakeLayer(layer, playheadMs);
    const endMs = Math.min(layer.sourceDurationMs, startMs + 2500);
    if (endMs <= startMs) return;
    void updateTakePresentation(layerId, {
      captions: [
        ...presentation.captions,
        {
          id: crypto.randomUUID(),
          startMs,
          endMs,
          text: 'New caption',
        },
      ],
    });
  };

  const handleAddTakeZoom = (layerId: string) => {
    const layer = composition?.document.layers.find(
      (candidate) => candidate.id === layerId,
    );
    if (!layer || layer.kind !== 'video') return;
    const presentation =
      layer.takePresentation ?? createDefaultStudioTakePresentation();
    const sourceTimeMs = sourceTimeForTakeLayer(layer, playheadMs);
    const startMs = Math.max(0, sourceTimeMs - 200);
    const endMs = Math.min(layer.sourceDurationMs, sourceTimeMs + 2000);
    if (endMs <= startMs) return;
    void updateTakePresentation(layerId, {
      zooms: [
        ...presentation.zooms,
        {
          id: crypto.randomUUID(),
          startMs,
          endMs,
          targetX: 0.5,
          targetY: 0.5,
          scale: 1.6,
        },
      ],
    });
  };

  const handleAddTakeEffect = (layerId: string, type: StudioEffectType, timeMs: number) => {
    const layer = composition?.document.layers.find(
      (candidate) => candidate.id === layerId,
    );
    if (!layer || layer.kind !== 'video') return;
    const presentation =
      layer.takePresentation ?? createDefaultStudioTakePresentation();
    const definition = STUDIO_EFFECTS.find((effect) => effect.type === type);
    if (!definition || presentation.effects.length >= 24) return;
    const startMs = Math.max(0, Math.min(layer.sourceDurationMs - 1, timeMs));
    void updateTakePresentation(layerId, {
      effects: [
        ...presentation.effects,
        {
          id: crypto.randomUUID(),
          type,
          startMs,
          endMs: Math.min(layer.sourceDurationMs, startMs + definition.defaultDurationMs),
          intensity: definition.defaultIntensity,
        },
      ],
    });
  };

  const handleUpdateTakeEffect = (
    layerId: string,
    effectId: string,
    patch: Partial<Pick<StudioEffect, 'startMs' | 'endMs' | 'intensity'>>,
  ) => {
    const layer = composition?.document.layers.find(
      (candidate) => candidate.id === layerId,
    );
  if (!layer || layer.kind !== 'video') return;
  const presentation =
    layer.takePresentation ?? createDefaultStudioTakePresentation();
  void updateTakePresentation(layerId, {
    effects: presentation.effects.map((effect) =>
      effect.id === effectId ? { ...effect, ...patch } : effect,
    ),
  });

  };

  const handleRemoveTakeEffect = (layerId: string, effectId: string) => {
    const layer = composition?.document.layers.find(
      (candidate) => candidate.id === layerId,
    );
  if (!layer || layer.kind !== 'video') return;
  const presentation =
    layer.takePresentation ?? createDefaultStudioTakePresentation();
  void updateTakePresentation(layerId, {
    effects: presentation.effects.filter((effect) => effect.id !== effectId),
  });

  };

  const handleOpenReleaseKit = async () => {
    if (!copilotTake) return;
    if (copilotTake.socialKit) {
      setReleaseKitOpen(true);
      return;
    }
    setGeneratingReleaseKit(true);
    try {
      const socialKit = await window.electron.ipc.invoke<NonNullable<StudioTake['socialKit']>>(
        'studio:generate-social-kit',
        { takeId: copilotTake.id },
      );
      setCopilotTake((take) => take ? { ...take, socialKit } : take);
      setReleaseKitOpen(true);
      toast.success('Release kit generated.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not generate a release kit.',
      );
    } finally {
      setGeneratingReleaseKit(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!composition || !titleInput.trim()) {
      setTitleInput(composition?.title ?? '');
      return;
    }
    if (titleInput.trim() === composition.title) return;
    const saved = await persist(composition.document, titleInput.trim());
    if (saved) toast.success('Composition renamed.');
  };

  const handleSaveTemplate = async () => {
    if (!composition || !templateName.trim() || savingTemplate) return;
    setSavingTemplate(true);
    try {
      await window.electron.ipc.invoke(
        'studio:composition-template-save',
        { compositionId: composition.id, title: templateName.trim() },
      );
      toast.success('Reusable template saved.');
      setSaveTemplateOpen(false);
    } catch (error) {
      console.error('[Studio composition] Could not save template.', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not save this template.',
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading composition…
      </div>
    );
  }

  if (!composition) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <h1 className="text-lg font-semibold">Composition not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or its source project is no longer
          available.
        </p>
        <Button variant="outline" onClick={() => navigate('/studio')}>
          Return to Studio
        </Button>
      </div>
    );
  }

  const sceneName =
    composition.document.sceneId === 'desktop-mobile-comparison'
      ? 'Desktop + mobile'
      : 'App spotlight';
  const selectedLayer =
    composition.document.layers.find((layer) => layer.id === selectedLayerId) ??
    null;
  const selectedTakePresentation =
    selectedLayer?.kind === 'video'
      ? selectedLayer.takePresentation ?? createDefaultStudioTakePresentation()
      : null;
  const primaryVideoLayer = composition.document.layers.find(
    (layer) => layer.kind === 'video',
  );
  const frontToBackLayers = [...composition.document.layers].sort(
    (a, b) => b.zIndex - a.zIndex,
  );
  const handleSelectLayer = (layerId: string | null) => {
    setSelectedLayerId(layerId);
    const clip = timelineStore
      .getState()
      .tracks.flatMap((track) => track.clips)
      .find(
        (item) =>
          item.payload?.compositionLayerId === layerId || item.id === layerId,
      );
    timelineStore.setSelectedClipId(clip?.id ?? null);
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to Studio"
          onClick={() => navigate('/studio')}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <Input
            aria-label="Composition title"
            value={titleInput}
            onChange={(event) => setTitleInput(event.target.value)}
            onBlur={() => void handleSaveTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setTitleInput(composition.title);
            }}
            disabled={saving || exporting}
            className="h-8 max-w-sm border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:border-border focus-visible:border-ring"
            maxLength={120}
          />
          <p className="px-2 text-[11px] text-muted-foreground">
            {sceneName} · {composition.document.layers.length} layers
          </p>
        </div>
        <label
          htmlFor="studio-composition-aspect"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <span>Format</span>
          <select
            id="studio-composition-aspect"
            aria-label="Output format"
            className="h-9 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={composition.document.aspectRatio}
            disabled={saving || exporting}
            onChange={(event) =>
              void handleAspectRatioChange(event.target.value)
            }
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio.value} value={ratio.value}>
                {ratio.label}
              </option>
            ))}
          </select>
        </label>
        <div data-history-version={historyVersion} className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Undo composition edit"
            title="Undo"
            disabled={saving || exporting || undoDocumentsRef.current.length === 0}
            onClick={() => void undoComposition()}
          >
            <Undo2Icon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Redo composition edit"
            title="Redo"
            disabled={saving || exporting || redoDocumentsRef.current.length === 0}
            onClick={() => void redoComposition()}
          >
            <Redo2Icon className="size-4" />
          </Button>
        </div>
        {copilotTake && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={saving || exporting}
              onClick={() => setCopilotOpen(true)}
            >
              Copilot
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={generatingReleaseKit || saving || exporting}
              onClick={() => void handleOpenReleaseKit()}
            >
              {generatingReleaseKit ? 'Generating…' : 'Release kit'}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={
            exporting || saving || !composition.document.layers.length
          }
          onClick={() => {
            setTemplateName(`${composition.title} template`);
            setSaveTemplateOpen(true);
          }}
        >
          <BookmarkPlusIcon className="size-4" />
          Save template
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={exporting || saving || !composition.document.layers.length}
          onClick={() => void handleExport()}
        >
          <DownloadIcon className="size-4" />
          {exporting ? 'Rendering…' : 'Export MP4'}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[#101318] p-4 md:p-8">
            <StudioCompositionPreview
              composition={composition}
              selectedLayerId={selectedLayerId}
              playheadMs={playheadMs}
              isPlaying={isPlaying}
              disabled={saving || exporting}
              onIsPlayingChange={setIsPlaying}
              onSelectLayer={handleSelectLayer}
              onPlayheadChange={setPlayheadMs}
              onLayoutChange={handleLayoutChange}
            />
          </main>

          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border/60 bg-card/30">
            <div className="shrink-0 border-b border-border/50 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Layers3Icon className="size-4 text-primary" />
                Layers
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Top layers render in front. Use the arrows to change stacking;
                each format keeps its own layout.
              </p>
            </div>

            <div className="max-h-48 shrink-0 space-y-1 overflow-y-auto p-2">
              {composition.document.layers.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Add a recording or image to start building this scene.
                </p>
              ) : (
                frontToBackLayers.map((layer, index) => (
                  <div
                    key={layer.id}
                    className={`flex items-center gap-1 rounded-md border p-1 ${
                      layer.id === selectedLayerId
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={layer.id === selectedLayerId}
                      onClick={() => handleSelectLayer(layer.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {layer.kind === 'video' ? (
                        <VideoIcon className="size-4 shrink-0 text-primary" />
                      ) : layer.kind === 'image' ? (
                        <ImagePlusIcon className="size-4 shrink-0 text-primary" />
                      ) : (
                        <TypeIcon className="size-4 shrink-0 text-primary" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {layer.name}
                        </span>
                        <span className="block text-[10px] capitalize text-muted-foreground">
                          {layer.kind} layer
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground"
                      aria-label={`Move ${layer.name} forward`}
                      title="Move forward"
                      disabled={saving || exporting || layer.locked === true || index === 0}
                      onClick={() =>
                        void handleReorderLayer(layer.id, 'forward')
                      }
                    >
                      <ChevronUpIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground"
                      aria-label={`Move ${layer.name} backward`}
                      title="Move backward"
                      disabled={
                        saving ||
                        exporting ||
                        layer.locked === true ||
                        index === frontToBackLayers.length - 1
                      }
                      onClick={() =>
                        void handleReorderLayer(layer.id, 'backward')
                      }
                    >
                      <ChevronDownIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${layer.name}`}
                      disabled={saving || exporting || layer.locked === true}
                      onClick={() => void handleRemoveLayer(layer.id)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <StudioCompositionInspector
              layer={selectedLayer}
              aspectRatio={composition.document.aspectRatio}
              durationMs={composition.document.durationMs}
              disabled={saving || exporting || selectedLayer?.locked === true}
              onCommit={(patch) =>
                selectedLayerId
                  ? handleLayerPatch(selectedLayerId, patch)
                  : Promise.resolve(false)
              }
            />
            {selectedLayer?.kind === 'video' && selectedTakePresentation && (
              <>
              <StudioCompositionTakeStylePanel
                styling={selectedTakePresentation.styling}
                onUpdateStyling={(updates) => {
                  if (selectedLayer.locked) return;
                  const document = updates.aspectRatio
                    ? setCompositionAspectRatio(
                        composition.document,
                        updates.aspectRatio,
                      )
                    : composition.document;
                  void persist(
                    applyStudioCompositionOperation(document, {
                      type: 'layer.patch',
                      layerId: selectedLayer.id,
                      patch: {
                        takePresentation: {
                          ...selectedTakePresentation,
                          styling: {
                            ...selectedTakePresentation.styling,
                            ...updates,
                          },
                        },
                      },
                    }),
                  );
                }}
              />
              <StudioCompositionTakeTracksPanel
                presentation={selectedTakePresentation}
                durationMs={selectedLayer.sourceDurationMs}
                playheadSourceMs={sourceTimeForTakeLayer(
                  selectedLayer,
                  playheadMs,
                )}
                disabled={saving || exporting || selectedLayer.locked === true}
                onUpdate={(patch) =>
                  void updateTakePresentation(selectedLayer.id, patch)
                }
                onAddCut={() => handleAddTakeCut(selectedLayer.id)}
                onAddCaption={() => handleAddTakeCaption(selectedLayer.id)}
                onAddZoom={() => handleAddTakeZoom(selectedLayer.id)}
              />
              <StudioCompositionEffectsPanel
                ariaLabel="Take layer effects"
                title="Take layer effects"
                description="Apply within this recording layer."
                effects={selectedTakePresentation.effects}
                durationMs={selectedLayer.sourceDurationMs}
                playheadMs={sourceTimeForTakeLayer(
                  selectedLayer,
                  playheadMs,
                )}
                disabled={saving || exporting || selectedLayer.locked === true}
                onAdd={(type, startMs) =>
                  handleAddTakeEffect(selectedLayer.id, type, startMs)
                }
                onUpdate={(effectId, patch) =>
                  handleUpdateTakeEffect(selectedLayer.id, effectId, patch)
                }
                onRemove={(effectId) =>
                  handleRemoveTakeEffect(selectedLayer.id, effectId)
                }
              />
              </>
            )}

            <StudioCompositionEffectsPanel
              effects={composition.document.effects ?? []}
              durationMs={composition.document.durationMs}
              playheadMs={playheadMs}
              disabled={saving || exporting}
              onAdd={handleAddEffect}
              onUpdate={handleUpdateEffect}
              onRemove={handleRemoveEffect}
            />

            <div className="space-y-2 border-t border-border/50 p-3">
              <label
                htmlFor="studio-composition-audio"
                className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
              >
                <Music2Icon className="size-3.5" />
                Audio from
              </label>
              <select
                id="studio-composition-audio"
                aria-label="Audio source"
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={composition.document.audioSourceLayerId ?? ''}
                disabled={saving || exporting}
                onChange={(event) => void handleAudioSourceChange(event.target.value)}
              >
                <option value="">No audio</option>
                {composition.document.layers
                  .filter((layer) => layer.kind === 'video')
                  .map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
              </select>
              <label
                htmlFor="studio-composition-add-take"
                className="block text-[11px] font-medium text-muted-foreground"
              >
                Add another recording
              </label>
              <div className="flex gap-2">
                <select
                  id="studio-composition-add-take"
                  aria-label="Recording to add"
                  className="h-9 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedTakeId}
                  onChange={(event) => setSelectedTakeId(event.target.value)}
                  disabled={!availableTakes.length || saving || exporting}
                >
                  <option value="">
                    {availableTakes.length ? 'Choose a take…' : 'No more takes'}
                  </option>
                  {availableTakes.map((take) => (
                    <option key={take.id} value={take.id}>
                      {take.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Add recording layer"
                  disabled={!selectedTakeId || saving || exporting}
                  onClick={() => void handleAddTake()}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={
                  saving || exporting || composition.document.layers.length >= 12
                }
                onClick={() => void handleAddImage()}
              >
                <ImagePlusIcon className="size-4" />
                Add an image layer
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={saving || exporting || composition.document.layers.length >= 12}
                onClick={() => void handleAddText()}
              >
                <TypeIcon className="size-4" />
                Add a text layer
              </Button>
              {saving && (
                <p role="status" className="text-[11px] text-muted-foreground">
                  Saving changes…
                </p>
              )}
              {exporting && (
                <p role="status" className="text-[11px] text-muted-foreground">
                  {exportStatus}
                </p>
              )}
            </div>
          </aside>
        </div>
        <div className="h-64 min-h-0 shrink-0">
          <StudioCanvasTimeline
            activeTake={null}
            activeComposition={composition}
            videoUrl={
              primaryVideoLayer?.kind === 'video'
                ? studioTakeMediaUrl(primaryVideoLayer.sourceId)
                : null
            }
            durationMs={composition.document.durationMs}
            isPlaying={isPlaying}
            onSeek={setPlayheadMs}
            onTogglePlay={() => setIsPlaying((playing) => !playing)}
            onRestartPlayback={() => setPlayheadMs(0)}
            onCompositionTracksChange={handleCompositionTracksChange}
            onCompositionLayerSelect={setSelectedLayerId}
            onOpenVideoCrop={() => {
              if (selectedLayer?.kind === 'video') {
                const presentation =
                  selectedLayer.takePresentation ??
                  createDefaultStudioTakePresentation();
                void handleLayerPatch(selectedLayer.id, {
                  takePresentation: {
                    ...presentation,
                    videoCrop: presentation.videoCrop ? undefined : {
                      x: 0.05,
                      y: 0.05,
                      width: 0.9,
                      height: 0.9,
                    },
                  },
                });
              }
            }}
          />
        </div>
      </div>
      <Dialog
        open={saveTemplateOpen}
        onOpenChange={(open) => !savingTemplate && setSaveTemplateOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save reusable template</DialogTitle>
            <DialogDescription>
              Keep this layout, timing, and motion. Recordings will be selected
              again when you use the template.
            </DialogDescription>
          </DialogHeader>
          <label
            htmlFor="studio-composition-template-name"
            className="space-y-1.5 text-xs font-medium"
          >
            Template name
            <Input
              id="studio-composition-template-name"
              value={templateName}
              maxLength={120}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Name this template"
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={savingTemplate}
              onClick={() => setSaveTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!templateName.trim() || savingTemplate}
              onClick={() => void handleSaveTemplate()}
            >
              {savingTemplate ? 'Saving…' : 'Save template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {copilotTake && (
        <>
          <StudioCopilotSheet
            open={copilotOpen}
            onOpenChange={setCopilotOpen}
            activeTake={copilotTake}
            compositionId={composition.id}
            projectId={composition.projectId ?? undefined}
            currentTimeMs={playheadMs}
          />
          <StudioSocialKitModal
            open={releaseKitOpen}
            onOpenChange={setReleaseKitOpen}
            socialKit={copilotTake.socialKit}
          />
        </>
      )}
    </div>
  );
}
