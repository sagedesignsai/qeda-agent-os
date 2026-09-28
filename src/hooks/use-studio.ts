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
import type {
  StudioTake,
  StudioTakeSummary,
  StudioStyling,
  StudioSocialKit,
  StudioZoom,
  StudioCut,
  StudioCaption,
} from '@/main/ipc/channels';
import { DEFAULT_STUDIO_STYLING } from '@/main/ipc/channels';

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
  const [activeTake, setActiveTake] = useState<StudioTake | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isProcessingDraft, setIsProcessingDraft] = useState<boolean>(false);
  const [isGeneratingSocialKit, setIsGeneratingSocialKit] =
    useState<boolean>(false);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
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
        { projectId },
      );
      setTakes(list || []);
      return list;
    } catch (err) {
      console.error('Failed to list studio takes:', err);
      return [];
    }
  }, [projectId]);

  // ── Load Active Take ──────────────────────────────────────────────────────

  const loadTake = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const take = await window.electron.ipc.invoke<StudioTake | null>(
        'studio:get-take',
        { id },
      );
      setActiveTake(take);
      return take;
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

  // Listen for studio:changed events
  useIpcEvent('studio:changed', () => {
    refreshTakes();
    if (activeTake?.id) {
      loadTake(activeTake.id);
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

  // ── Update Zooms ──────────────────────────────────────────────────────────

  const updateZooms = useCallback(
    async (zooms: StudioZoom[]) => {
      if (!activeTake) return;
      setActiveTake((prev) => (prev ? { ...prev, zooms } : null));
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        zooms,
      });
    },
    [activeTake],
  );

  // ── Update Cuts ───────────────────────────────────────────────────────────

  const updateCuts = useCallback(
    async (cuts: StudioCut[]) => {
      if (!activeTake) return;
      setActiveTake((prev) => (prev ? { ...prev, cuts } : null));
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        cuts,
      });
    },
    [activeTake],
  );

  // ── Update Captions ───────────────────────────────────────────────────────

  const updateCaptions = useCallback(
    async (captions: StudioCaption[]) => {
      if (!activeTake) return;
      setActiveTake((prev) => (prev ? { ...prev, captions } : null));
      await window.electron.ipc.invoke('studio:save-take', {
        id: activeTake.id,
        captions,
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
      setActiveTake(processed);
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
    async (format: 'mp4' | 'gif' | 'webm' = 'mp4') => {
      if (!activeTake) return;
      try {
        toast.info(`Preparing ${format.toUpperCase()} export...`);
        const res = await window.electron.ipc.invoke<{
          ok: boolean;
          filePath?: string;
          error?: string;
        }>('studio:export-video', {
          takeId: activeTake.id,
          format,
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
    isProcessingDraft,
    isGeneratingSocialKit,
    loadTake,
    refreshTakes,
    listSources,
    startRecording,
    stopRecording,
    updateStyling,
    updateZooms,
    updateCuts,
    updateCaptions,
    runMagicDraft,
    generateSocialKit,
    exportVideo,
    deleteTake,
  };
}
