/**
 * hooks/use-studio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * State and transport hook for Studio: Showcase Video Generator & Recorder.
 *
 * Manages:
 *   - Screen/window capture negotiation via desktopCapturer and getUserMedia
 *   - Synchronized MediaRecorder streaming and chunk dispatching to main process
 *   - Global mouse telemetry tracker coordination
 *   - Showcase takes CRUD and active take playback
 *   - Magic Draft autonomous processing & Social Kit generation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { useIpcEvent } from './use-ipc';
import { renderComposedStudioVideo } from '@/lib/studio/render/export-renderer';
import type {
  StudioTake,
  StudioTakeSummary,
  StudioStyling,
  StudioSocialKit,
  StudioZoom,
  StudioCut,
  StudioCaption,
  StudioEffect,
  StudioOverlay,
  StudioRecordingSnapshot,
  StudioTrack,
  StudioMediaAsset,
  StudioScene,
} from '@/main/ipc/channels';
import {
  cloneStudioScene,
  createStudioSceneFromTemplate,
  getActiveStudioScene,
  getStudioScenes,
  projectStudioScene,
  reorderStudioScenes,
  updateStudioScene,
  type StudioSceneContentPatch,
  type StudioSceneTemplateId,
} from '@/lib/studio/scenes';
import { DEFAULT_STUDIO_STYLING } from '@/main/ipc/channels';

const STUDIO_TAKE_PAGE_SIZE = 50;

export interface CaptureSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  displayId?: string;
  appIcon?: string;
}

export function useStudio(
  activeTakeId?: string | null,
  projectId?: string | null,
) {
  const [takes, setTakes] = useState<StudioTakeSummary[]>([]);
  const [hasMoreTakes, setHasMoreTakes] = useState(false);
  const [loadingMoreTakes, setLoadingMoreTakes] = useState(false);
  const [activeTake, setActiveTake] = useState<StudioTake | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isProcessingDraft, setIsProcessingDraft] = useState<boolean>(false);
  const [isGeneratingSocialKit, setIsGeneratingSocialKit] =
    useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<{
    isExporting: boolean;
    progress: number;
    statusText: string;
  } | null>(null);

  // Media preparation progress (probe, optimize, filmstrip, waveform)
  const [mediaPrepProgress, setMediaPrepProgress] = useState<{
    takeId: string;
    stage:
      | 'probing'
      | 'optimizing'
      | 'filmstrip'
      | 'waveform'
      | 'ready'
      | 'error';
    message?: string;
  } | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  // Agent-driven capture lives in main; this is its renderer-side mirror.
  const [agentRecording, setAgentRecording] =
    useState<StudioRecordingSnapshot | null>(null);
  const [agentRecordingSeconds, setAgentRecordingSeconds] = useState<number>(0);
  const [activeRecordingTakeId, setActiveRecordingTakeId] = useState<
    string | null
  >(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordedStreamRef = useRef<MediaStream | null>(null);

  // ── Load Takes List ───────────────────────────────────────────────────────

  const refreshTakes = useCallback(async () => {
    try {
      const list = await window.electron.ipc.invoke<StudioTakeSummary[]>(
        'studio:list-takes',
        { projectId, limit: STUDIO_TAKE_PAGE_SIZE, offset: 0 },
      );
      setTakes(list || []);
      setHasMoreTakes((list?.length ?? 0) === STUDIO_TAKE_PAGE_SIZE);
      return list;
    } catch (err) {
      console.error('Failed to list studio takes:', err);
      return [];
    }
  }, [projectId]);

  const loadMoreTakes = useCallback(async () => {
    if (loadingMoreTakes || !hasMoreTakes) return;
    setLoadingMoreTakes(true);
    try {
      const page = await window.electron.ipc.invoke<StudioTakeSummary[]>(
        'studio:list-takes',
        {
          projectId,
          limit: STUDIO_TAKE_PAGE_SIZE,
          offset: takes.length,
        },
      );
      const nextPage = page || [];
      setTakes((current) => [...current, ...nextPage]);
      setHasMoreTakes(nextPage.length === STUDIO_TAKE_PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more studio takes:', err);
    } finally {
      setLoadingMoreTakes(false);
    }
  }, [hasMoreTakes, loadingMoreTakes, projectId, takes.length]);

  // ── Load Active Take ──────────────────────────────────────────────────────

  const loadTake = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const take = await window.electron.ipc.invoke<StudioTake | null>(
        'studio:get-take',
        { id },
      );
      const projected = take?.scenes?.length
        ? projectStudioScene(take, getActiveStudioScene(take))
        : take;
      setActiveTake(projected);
      return projected;
    } catch (err) {
      console.error(`Failed to load take ${id}:`, err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await refreshTakes();
      if (cancelled) return;

      const targetId = activeTakeId || list[0]?.id;
      if (targetId) {
        await loadTake(targetId);
      } else {
        setActiveTake(null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTakeId, refreshTakes, loadTake]);

  // Restore an in-flight agent capture after a renderer reload.
  useEffect(() => {
    let cancelled = false;
    window.electron.ipc
      .invoke<{ active: StudioRecordingSnapshot | null }>(
        'studio:get-active-recording',
      )
      .then((res) => {
        if (!cancelled) setAgentRecording(res?.active ?? null);
        return undefined;
      })
      .catch(() => {
        // The recorder event below still drives the pill if this is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live agent-capture state: started, each highlight, and stop.
  useIpcEvent('studio:recording-state', (payload) => {
    const state = payload as { active: StudioRecordingSnapshot | null } | null;
    setAgentRecording(state?.active ?? null);
  });

  // Derive elapsed time locally; the recorder only sends state transitions.
  useEffect(() => {
    if (!agentRecording) {
      setAgentRecordingSeconds(0);
      return;
    }
    const update = () =>
      setAgentRecordingSeconds(
        Math.max(0, Math.floor((Date.now() - agentRecording.startedAt) / 1000)),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [agentRecording]);

  // Listen for studio:changed events
  useIpcEvent(
    'studio:changed',
    (payload) => {
      refreshTakes();
      const changed = payload as { takeId?: string } | undefined;
      // A named take was just recorded; the Studio page navigates to it, which
      // reloads it through the route. Otherwise refresh the open take.
      if (!changed?.takeId && activeTake?.id) {
        loadTake(activeTake.id);
      }
    },
    [activeTake?.id],
  );

  // Listen for native media prep progress events
  useIpcEvent('studio:media-progress', (payload: unknown) => {
    const data = payload as { takeId: string; stage: string; error?: string };
    if (!data?.takeId || !data.stage) return;
    setMediaPrepProgress({
      takeId: data.takeId,
      stage: data.stage as
        'probing' | 'optimizing' | 'filmstrip' | 'waveform' | 'ready' | 'error',
      message: data.error,
    });
    // Auto-clear on ready/error after a short delay
    if (data.stage === 'ready' || data.stage === 'error') {
      setTimeout(() => {
        setMediaPrepProgress((prev) =>
          prev?.takeId === data.takeId ? null : prev,
        );
      }, 2000);
    }
  });

  // ── List Capture Sources ──────────────────────────────────────────────────

  const listSources = useCallback(
    async (
      types: ('screen' | 'window')[] = ['screen', 'window'],
    ): Promise<CaptureSource[]> => {
      try {
        return await window.electron.ipc.invoke<CaptureSource[]>(
          'studio:list-sources',
          { types },
        );
      } catch (err) {
        toast.error('Failed to enumerate screen sources');
        console.error(err);
        return [];
      }
    },
    [],
  );

  // ── Start Recording ───────────────────────────────────────────────────────

  const startRecording = useCallback(
    async ({
      sourceId,
      sourceName,
      includeMic = true,
      takeProjectId,
    }: {
      sourceId: string;
      sourceName: string;
      includeMic?: boolean;
      takeProjectId?: string | null;
    }) => {
      try {
        const takeId = nanoid();
        setActiveRecordingTakeId(takeId);

        // 1. Get desktop video stream using Chrome media source constraint
        const videoStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-expect-error chromeMediaSource is standard in Electron Chromium
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: 1280,
              maxWidth: 3840,
              minHeight: 720,
              maxHeight: 2160,
              maxFrameRate: 60,
            },
          },
        });

        // 2. Optionally get user microphone audio
        let combinedStream = videoStream;
        if (includeMic) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            const audioTrack = micStream.getAudioTracks()[0];
            if (audioTrack) {
              combinedStream = new MediaStream([
                ...videoStream.getVideoTracks(),
                audioTrack,
              ]);
            }
          } catch (micErr) {
            console.warn(
              'Microphone access denied or unavailable, recording video only:',
              micErr,
            );
          }
        }

        recordedStreamRef.current = combinedStream;

        // 3. Start main process mouse telemetry tracker
        await window.electron.ipc.invoke('studio:start-mouse-tracker', {
          takeId,
        });

        // 4. Initialize MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported(
          'video/webm;codecs=vp9,opus',
        )
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 8_000_000, // 8 Mbps high quality
        });

        let isFirstChunk = true;
        const startTime = Date.now();

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            const buffer = await e.data.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const chunkBase64 = btoa(binary);

            const durationMs = Date.now() - startTime;
            await window.electron.ipc.invoke('studio:save-recording-chunk', {
              takeId,
              chunkBase64,
              isFirst: isFirstChunk,
              isLast: false,
              mimeType,
              durationMs,
            });
            isFirstChunk = false;
          }
        };

        // Initialize empty take record
        await window.electron.ipc.invoke('studio:save-take', {
          id: takeId,
          projectId: takeProjectId !== undefined ? takeProjectId : projectId,
          title: `${sourceName} Showcase`,
          sourceType: sourceName.toLowerCase().includes('screen')
            ? 'screen'
            : 'window',
          sourceName,
          videoPath: '',
          durationMs: 0,
          styling: DEFAULT_STUDIO_STYLING,
        });

        recorder.start(1000); // 1-second chunks for resilient streaming
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingSeconds(0);

        recordingTimerRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);

        toast.success(`Recording started: ${sourceName}`);
        return takeId;
      } catch (err) {
        console.error('Failed to start recording:', err);
        toast.error('Failed to start recording: ' + (err as Error).message);
        setIsRecording(false);
        setActiveRecordingTakeId(null);
        return null;
      }
    },
    [projectId],
  );

  // ── Stop Recording ────────────────────────────────────────────────────────

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !activeRecordingTakeId) return null;

    const takeId = activeRecordingTakeId;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    return new Promise<StudioTake | null>((resolve) => {
      const recorder = mediaRecorderRef.current!;

      recorder.onstop = async () => {
        try {
          // 1. Stop all tracks
          recordedStreamRef.current?.getTracks().forEach((t) => t.stop());
          recordedStreamRef.current = null;

          // 2. Stop mouse tracker
          await window.electron.ipc.invoke('studio:stop-mouse-tracker', {
            takeId,
          });

          // 3. Mark last chunk
          await window.electron.ipc.invoke('studio:save-recording-chunk', {
            takeId,
            chunkBase64: '',
            isLast: true,
            durationMs: recordingSeconds * 1000,
          });

          // 4. Trigger Autonomous Magic Draft
          toast.info('Autonomous Agent is crafting Magic Draft...');
          setIsProcessingDraft(true);

          const processed = await window.electron.ipc.invoke<StudioTake>(
            'studio:process-draft',
            { takeId },
          );

          setActiveTake(processed);
          await refreshTakes();
          toast.success('Magic Draft ready!');
          resolve(processed);
        } catch (err) {
          console.error('Error stopping recording take:', err);
          toast.error('Failed to finalize recording take');
          resolve(null);
        } finally {
          setIsRecording(false);
          setActiveRecordingTakeId(null);
          setIsProcessingDraft(false);
          mediaRecorderRef.current = null;
        }
      };

      recorder.stop();
    });
  }, [activeRecordingTakeId, recordingSeconds, refreshTakes]);

  // ── Stop an Agent Capture ─────────────────────────────────────────────────
  // The user can always take the wheel back, instead of waiting for the agent
  // or the five-minute watchdog.

  const stopAgentRecording = useCallback(async () => {
    try {
      const res = await window.electron.ipc.invoke<{
        stopped: boolean;
        sessionId?: string;
        takeId?: string;
        error?: string;
      }>('studio:stop-agent-recording', {});
      if (!res.stopped) {
        toast.error(res.error ?? 'No agent recording is running.');
      }
      return res;
    } catch (err) {
      toast.error('Failed to stop agent recording: ' + (err as Error).message);
      return { stopped: false as const };
    }
  }, []);

  // ── Update Styling / Dials ────────────────────────────────────────────────

  const updateStyling = useCallback(
    async (stylingUpdates: Partial<StudioStyling>) => {
      if (!activeTake) return;
      const updatedStyling: StudioStyling = {
        ...activeTake.styling,
        ...stylingUpdates,
      };

      setActiveTake((prev) =>
        prev ? { ...prev, styling: updatedStyling } : null,
      );

      try {
        await window.electron.ipc.invoke('studio:save-take', {
          id: activeTake.id,
          styling: updatedStyling,
        });
      } catch (err) {
        console.error('Failed to save take styling:', err);
      }
    },
    [activeTake],
  );

  // ── Scene-aware content updates ───────────────────────────────────────────

  type StudioTakeContentPatch = Partial<
    Pick<
      StudioTake,
      'tracks' | 'cuts' | 'zooms' | 'captions' | 'effects' | 'overlays'
    >
  >;

  /**
   * Update the active scene's content together with the take's top-level
   * projection. Legacy single-scene projects keep writing the top-level fields
   * only; the first scene operation materializes the scene array.
   */
  const persistContentPatch = useCallback(
    async (patch: StudioTakeContentPatch) => {
      if (!activeTake) return;
      const scenes = activeTake.scenes?.length
        ? updateStudioScene(
            activeTake,
            activeTake.activeSceneId ?? activeTake.scenes[0].id,
            patch,
          ).scenes
        : undefined;
      setActiveTake((prev) => {
        if (!prev) return null;
        const next = { ...prev, ...patch };
        if (!prev.scenes?.length) return next;
        const updated = updateStudioScene(
          prev,
          prev.activeSceneId ?? prev.scenes[0].id,
          patch,
        );
        return { ...next, scenes: updated.scenes };
      });
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        ...patch,
        ...(scenes ? { scenes } : {}),
      });
    },
    [activeTake],
  );

  const updateZooms = useCallback(
    async (zooms: StudioZoom[]) => {
      await persistContentPatch({ zooms });
    },
    [persistContentPatch],
  );

  const updateCuts = useCallback(
    async (cuts: StudioCut[]) => {
      await persistContentPatch({ cuts });
    },
    [persistContentPatch],
  );

  const updateCaptions = useCallback(
    async (captions: StudioCaption[]) => {
      await persistContentPatch({ captions });
    },
    [persistContentPatch],
  );

  const updateEffects = useCallback(
    async (effects: StudioEffect[]) => {
      await persistContentPatch({ effects });
    },
    [persistContentPatch],
  );

  const updateOverlays = useCallback(
    async (overlays: StudioOverlay[]) => {
      await persistContentPatch({ overlays });
    },
    [persistContentPatch],
  );

  const updateTimelineData = useCallback(
    async (data: {
      zooms: StudioZoom[];
      captions: StudioCaption[];
      cuts: StudioCut[];
      effects: StudioEffect[];
      overlays: StudioOverlay[];
      tracks?: StudioTrack[];
    }) => {
      await persistContentPatch(data);
    },
    [persistContentPatch],
  );

  const updateTracks = useCallback(
    async (tracks: StudioTrack[]) => {
      await persistContentPatch({ tracks });
    },
    [persistContentPatch],
  );

  // ── Scenes ────────────────────────────────────────────────────────────────

  const saveScenes = useCallback(
    async (
      scenes: StudioScene[],
      activeSceneId: string,
      projected: StudioTake,
    ) => {
      if (!activeTake) return;
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        scenes,
        activeSceneId,
        cuts: projected.cuts ?? [],
        zooms: projected.zooms ?? [],
        captions: projected.captions ?? [],
        effects: projected.effects ?? [],
        overlays: projected.overlays ?? [],
        videoCrop: projected.videoCrop,
        tracks: projected.tracks,
      });
      setActiveTake(projected);
    },
    [activeTake],
  );

  /** Switch the editing scope to another scene. */
  const switchScene = useCallback(
    async (
      sceneId: string,
      currentPatch?: StudioTakeContentPatch,
    ): Promise<StudioTake | null> => {
      if (!activeTake) return null;
      const scenes = getStudioScenes(activeTake);
      const currentId = activeTake.activeSceneId ?? scenes[0].id;
      const patched = currentPatch
        ? updateStudioScene(
            { ...activeTake, scenes },
            currentId,
            currentPatch,
          )
        : { ...activeTake, scenes };
      const nextScenes = patched.scenes ?? scenes;
      const target = nextScenes.find((scene) => scene.id === sceneId);
      if (!target) return null;
      const projected = projectStudioScene(
        { ...patched, activeSceneId: sceneId },
        target,
      );
      await saveScenes(nextScenes, sceneId, projected);
      return projected;
    },
    [activeTake, saveScenes],
  );

  /** Add a scene from a template, or duplicate the current scene. */
  const addScene = useCallback(
    async (options: {
      name: string;
      templateId?: StudioSceneTemplateId;
      duplicateCurrent?: boolean;
      currentPatch?: StudioTakeContentPatch;
    }): Promise<StudioTake | null> => {
      if (!activeTake) return null;
      const scenes = getStudioScenes(activeTake);
      const currentId = activeTake.activeSceneId ?? scenes[0].id;
      const base = options.currentPatch
        ? updateStudioScene(
            { ...activeTake, scenes },
            currentId,
            options.currentPatch,
          )
        : { ...activeTake, scenes };
      const baseScenes = base.scenes ?? scenes;
      const current = baseScenes.find((scene) => scene.id === currentId) ?? baseScenes[0];
      const scene = options.duplicateCurrent
        ? cloneStudioScene(current, options.name)
        : createStudioSceneFromTemplate(
            options.templateId ?? 'blank',
            options.name,
          );
      const nextScenes = [...baseScenes, scene];
      const projected = projectStudioScene(
        { ...base, scenes: nextScenes, activeSceneId: scene.id },
        scene,
      );
      await saveScenes(nextScenes, scene.id, projected);
      return projected;
    },
    [activeTake, saveScenes],
  );

  const renameScene = useCallback(
    async (sceneId: string, name: string): Promise<boolean> => {
      if (!activeTake) return false;
      const trimmed = name.trim();
      if (!trimmed) return false;
      const scenes = getStudioScenes(activeTake);
      if (!scenes.some((scene) => scene.id === sceneId)) return false;
      const nextScenes = scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, name: trimmed } : scene,
      );
      setActiveTake((prev) => (prev ? { ...prev, scenes: nextScenes } : null));
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        scenes: nextScenes,
      });
      return true;
    },
    [activeTake],
  );

  const deleteScene = useCallback(
    async (
      sceneId: string,
    ): Promise<{
      take: StudioTake;
      deletedScene: StudioScene;
      index: number;
    } | null> => {
      if (!activeTake) return null;
      const scenes = getStudioScenes(activeTake);
      if (scenes.length <= 1) return null;
      const index = scenes.findIndex((scene) => scene.id === sceneId);
      if (index < 0) return null;
      const deletedScene = scenes[index];
      const nextScenes = scenes.filter((scene) => scene.id !== sceneId);
      const activeId = activeTake.activeSceneId ?? scenes[0].id;
      const nextActiveId =
        activeId === sceneId
          ? nextScenes[Math.min(index, nextScenes.length - 1)].id
          : activeId;
      const target =
        nextScenes.find((scene) => scene.id === nextActiveId) ?? nextScenes[0];
      const projected = projectStudioScene(
        { ...activeTake, scenes: nextScenes, activeSceneId: nextActiveId },
        target,
      );
      await saveScenes(nextScenes, nextActiveId, projected);
      return { take: projected, deletedScene, index };
    },
    [activeTake, saveScenes],
  );

  /** Restore a deleted scene (used by the undo toast). */
  const restoreScene = useCallback(
    async (scene: StudioScene, index: number): Promise<StudioTake | null> => {
      if (!activeTake) return null;
      const scenes = getStudioScenes(activeTake).slice();
      const insertAt = Math.max(0, Math.min(index, scenes.length));
      scenes.splice(insertAt, 0, scene);
      const projected = projectStudioScene(
        { ...activeTake, scenes, activeSceneId: scene.id },
        scene,
      );
      await saveScenes(scenes, scene.id, projected);
      return projected;
    },
    [activeTake, saveScenes],
  );

  const reorderScenes = useCallback(
    async (fromIndex: number, toIndex: number): Promise<boolean> => {
      if (!activeTake) return false;
      const next = reorderStudioScenes(activeTake, fromIndex, toIndex);
      if (next === activeTake) return false;
      setActiveTake(next);
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        scenes: next.scenes,
      });
      return true;
    },
    [activeTake],
  );

  const updateMediaAssets = useCallback(
    async (mediaAssets: StudioMediaAsset[]) => {
      if (!activeTake) return;
      setActiveTake((prev) => (prev ? { ...prev, mediaAssets } : null));
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        mediaAssets,
      });
    },
    [activeTake],
  );

  // ── Re-run Magic Draft ────────────────────────────────────────────────────

  const runMagicDraft = useCallback(async () => {
    if (!activeTake) return;
    try {
      setIsProcessingDraft(true);
      toast.info('Re-running Magic Draft auto-zoom and framing...');
      const processed = await window.electron.ipc.invoke<StudioTake>(
        'studio:process-draft',
        { takeId: activeTake.id, force: true },
      );
      setActiveTake(
        processed.scenes?.length
          ? projectStudioScene(processed, getActiveStudioScene(processed))
          : processed,
      );
      toast.success('Magic Draft updated!');
    } catch (err) {
      toast.error('Magic draft failed: ' + (err as Error).message);
    } finally {
      setIsProcessingDraft(false);
    }
  }, [activeTake]);

  // ── Generate AI Social Release Kit ────────────────────────────────────────

  const generateSocialKit = useCallback(async () => {
    if (!activeTake) return null;
    try {
      setIsGeneratingSocialKit(true);
      toast.info('Generating showcase release kit with AI...');
      const kit = await window.electron.ipc.invoke<StudioSocialKit>(
        'studio:generate-social-kit',
        { takeId: activeTake.id },
      );
      setActiveTake((prev) => (prev ? { ...prev, socialKit: kit } : null));
      toast.success('Showcase Social Kit generated!');
      return kit;
    } catch (err) {
      toast.error('Failed to generate social kit: ' + (err as Error).message);
      return null;
    } finally {
      setIsGeneratingSocialKit(false);
    }
  }, [activeTake]);

  // ── Export Video ──────────────────────────────────────────────────────────

  const exportVideo = useCallback(
    async (
      format: 'mp4' | 'gif' | 'webm' = 'mp4',
      scope: 'story' | 'scene' = 'story',
    ) => {
      if (!activeTake) return;
      try {
        // 1. Prompt user for save destination
        const savePrompt = await window.electron.ipc.invoke<{
          canceled: boolean;
          filePath?: string;
        }>('studio:prompt-save-dialog', {
          takeId: activeTake.id,
          format,
          defaultTitle: activeTake.title,
        });

        if (savePrompt.canceled || !savePrompt.filePath) return;

        // 2. Render complete composition (zooms, captions, framing, motion cards)
        setExportProgress({
          isExporting: true,
          progress: 0.05,
          statusText:
            scope === 'story'
              ? 'Rendering story scenes with camera zooms & subtitles...'
              : 'Rendering the current scene...',
        });

        await renderComposedStudioVideo(activeTake, {
          scope,
          sceneId: activeTake.activeSceneId,
          onProgress: (ratio, text) => {
            setExportProgress({
              isExporting: true,
              progress: Math.min(0.92, Math.max(0.05, ratio * 0.9)),
              statusText: text,
            });
          },
        });

        // 3. Transcode rendered WebM into final container (MP4/GIF/WebM)
        setExportProgress({
          isExporting: true,
          progress: 0.95,
          statusText: `Encoding final ${format.toUpperCase()} video with FFmpeg...`,
        });

        const res = await window.electron.ipc.invoke<{
          ok: boolean;
          filePath?: string;
          error?: string;
        }>('studio:export-video', {
          takeId: activeTake.id,
          format,
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
        toast.error(`Export error: ${(err as Error).message}`);
      } finally {
        setExportProgress(null);
      }
    },
    [activeTake],
  );

  // ── Delete Take ───────────────────────────────────────────────────────────

  const deleteTake = useCallback(
    async (id: string) => {
      try {
        const ok = await window.electron.ipc.invoke<boolean>(
          'studio:delete-take',
          {
            id,
          },
        );
        if (ok) {
          toast.success('Take deleted');
          const remaining = await refreshTakes();
          if (activeTake?.id === id) {
            const next = remaining[0]?.id;
            if (next) {
              await loadTake(next);
            } else {
              setActiveTake(null);
            }
          }
        }
      } catch (err) {
        toast.error('Failed to delete take: ' + (err as Error).message);
      }
    },
    [activeTake, refreshTakes, loadTake],
  );

  return {
    takes,
    activeTake,
    loading,
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
    refreshTakes,
    loadMoreTakes,
    hasMoreTakes,
    loadingMoreTakes,
    listSources,
    startRecording,
    stopRecording,
    updateStyling,
    updateZooms,
    updateCuts,
    updateCaptions,
    updateEffects,
    updateOverlays,
    updateTimelineData,
    updateTracks,
    updateMediaAssets,
    switchScene,
    addScene,
    renameScene,
    deleteScene,
    restoreScene,
    reorderScenes,
    runMagicDraft,
    generateSocialKit,
    exportVideo,
    deleteTake,
  };
}
