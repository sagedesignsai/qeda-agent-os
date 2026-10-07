/**
 * hooks/use-timeline-media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Media processing hook for Studio Timeline:
 *   - Web Audio API waveform peak sampling (compact Float32Array)
 *   - Video keyframe thumbnail filmstrip generator (Map<number, ImageBitmap>)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';

export function useTimelineMedia(videoUrl: string | null, durationMs: number) {
  const [audioPeaks, setAudioPeaks] = useState<Float32Array | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, ImageBitmap>>(
    new Map(),
  );
  const [isExtractingWaveform, setIsExtractingWaveform] = useState(false);
  const [isExtractingThumbnails, setIsExtractingThumbnails] = useState(false);

  const bitmapsRef = useRef<Map<number, ImageBitmap>>(new Map());

  // ── 1. Web Audio API Waveform Sampler ─────────────────────────────────────

  useEffect(() => {
    if (!videoUrl) {
      setAudioPeaks(null);
      return;
    }

    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    setIsExtractingWaveform(true);

    void (async () => {
      try {
        const response = await fetch(videoUrl);
        const arrayBuffer = await response.arrayBuffer();

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtx = new AudioCtx();

        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0); // Left channel

        // Target: ~80 peaks per second of duration
        const durationSec = audioBuffer.duration;
        const totalPeaks = Math.max(
          1,
          Math.min(rawData.length || 1, Math.floor(durationSec * 80)),
        );

        const peaks = new Float32Array(totalPeaks);

        for (let i = 0; i < totalPeaks; i++) {
          const start = Math.floor((i * rawData.length) / totalPeaks);
          const end = Math.max(
            start + 1,
            Math.floor(((i + 1) * rawData.length) / totalPeaks),
          );
          let sum = 0;
          for (let j = start; j < end; j++) {
            sum += Math.abs(rawData[j] || 0);
          }
          peaks[i] = Math.min(1.0, (sum / (end - start)) * 2.5); // Boost visual amplitude
        }

        if (!cancelled) {
          setAudioPeaks(peaks);
        }
      } catch (err) {
        console.warn('Could not extract audio waveform from media:', err);
        if (!cancelled) {
          // Do not fabricate a plausible-looking waveform for failed/silent media.
          setAudioPeaks(null);
        }
      } finally {
        if (audioCtx && audioCtx.state !== 'closed') {
          try {
            await audioCtx.close();
          } catch {
            // Context may already have closed during navigation.
          }
        }
        if (!cancelled) {
          setIsExtractingWaveform(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoUrl, durationMs]);

  // ── 2. Adaptive Video Keyframe Filmstrip Generator ────────────────────────

  useEffect(() => {
    if (!videoUrl || durationMs <= 0) {
      bitmapsRef.current.forEach((b) => b.close());
      bitmapsRef.current.clear();
      setThumbnails(new Map());
      return;
    }

    let cancelled = false;
    setIsExtractingThumbnails(true);

    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 68;
    const ctx = canvas.getContext('2d');

    const intervalSec = 1.5; // Snapshot every 1.5s
    const totalDurationSec = Math.max(1, durationMs / 1000);
    const targetTimes: number[] = [];

    for (let t = 0.5; t < totalDurationSec; t += intervalSec) {
      targetTimes.push(t);
    }

    const resultMap = new Map<number, ImageBitmap>();

    const captureNext = async (index: number) => {
      if (cancelled || index >= targetTimes.length) {
        if (!cancelled) {
          bitmapsRef.current = resultMap;
          setThumbnails(new Map(resultMap));
          setIsExtractingThumbnails(false);
        }
        return;
      }

      const timeSec = targetTimes[index];
      video.currentTime = timeSec;

      const onSeeked = async () => {
        video.removeEventListener('seeked', onSeeked);
        if (cancelled || !ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const bitmap = await createImageBitmap(canvas);
          const slot = Math.floor(timeSec / intervalSec);
          resultMap.set(slot, bitmap);
          resultMap.set(Math.floor(timeSec * 1000), bitmap);
        } catch {
          // ignore bitmap error
        }
        captureNext(index + 1);
      };

      video.addEventListener('seeked', onSeeked, { once: true });
    };

    video.addEventListener(
      'loadedmetadata',
      () => {
        captureNext(0);
      },
      { once: true },
    );

    return () => {
      cancelled = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [videoUrl, durationMs]);

  return {
    audioPeaks,
    thumbnails,
    isExtractingWaveform,
    isExtractingThumbnails,
  };
}
