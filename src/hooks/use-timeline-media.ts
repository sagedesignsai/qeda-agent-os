/**
 * hooks/use-timeline-media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Media processing hook for Studio Timeline:
 *   - Web Audio API waveform peak sampling (compact Float32Array)
 *   - Video keyframe thumbnail filmstrip generator (Map<number, ImageBitmap>)
 *
 * The waveform is sampled through an `AnalyserNode` fed by the media element,
 * never by `decodeAudioData`: recordings are `MediaRecorder` webm, which
 * `decodeAudioData` cannot demux.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { isFiniteDurationSeconds, safeDurationMs } from '@/lib/studio-types';
import { closeBitmap } from '@/lib/image-bitmap-lifetime';

// Waveform resolution: one peak per 12.5ms of media, i.e. ~80 peaks/second.
const PEAKS_PER_SECOND = 80;
// Upper bound on the peak buffer so a long recording cannot allocate a
// multi-megabyte Float32Array.
const MAX_PEAKS = 8000;
// The analyser only reports what the decoder has already produced, so the
// probe is walked faster than real time. Chromium caps playbackRate at 16.
const SAMPLING_PLAYBACK_RATE = 4;
// Time-domain FFT window. At 48kHz the maximum 32768 samples is ~680ms of
// audio, which is what lets an accelerated pass still cover every bucket
// instead of skipping the media it races through between animation frames.
const ANALYSER_FFT_SIZE = 32768;

export function useTimelineMedia(videoUrl: string | null, durationMs: number) {
  const [audioPeaks, setAudioPeaks] = useState<Float32Array | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, ImageBitmap>>(
    new Map(),
  );
  const [isExtractingWaveform, setIsExtractingWaveform] = useState(false);
  const [isExtractingThumbnails, setIsExtractingThumbnails] = useState(false);

  const bitmapsRef = useRef<Map<number, ImageBitmap>>(new Map());

  /**
   * Release bitmaps and stop publishing them in the same breath.
   *
   * The order matters. `thumbnails` state is what the canvas paints from, and it
   * holds the *same* bitmap objects as the map being disposed. Closing without
   * first clearing the published map leaves the viewport holding detached
   * bitmaps: the objects stay perfectly valid JavaScript, so nothing looks wrong,
   * but `drawImage` then throws `InvalidStateError: image source is detached`
   * from inside the paint routine — which aborts the remainder of that frame.
   *
   * `new Map()` rather than `map.clear()`: the consumer treats a new Map
   * identity as "thumbnails changed" and repaints. Mutating the published map in
   * place would leave the painter holding the previous reference and drawing
   * nothing.
   */
  const disposeBitmaps = (bitmaps: Map<number, ImageBitmap>) => {
    if (bitmaps.size === 0) return;
    // The same bitmap is stored under both a slot and a millisecond key, so
    // close each object exactly once.
    const closing = new Set(bitmaps.values());
    closing.forEach(closeBitmap);
    bitmaps.clear();

    // Now drop any published map that referenced one of them. Comparing against
    // `closing` rather than clearing unconditionally keeps an unrelated, still
    // valid map from causing a pointless repaint.
    setThumbnails((current) =>
      [...current.values()].some((bitmap) => closing.has(bitmap))
        ? new Map()
        : current,
    );
  };

  // ── 1. Web Audio API Waveform Sampler ─────────────────────────────────────

  useEffect(() => {
    setIsExtractingWaveform(false);
    if (!videoUrl) {
      setAudioPeaks(null);
      return;
    }

    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let probe: HTMLVideoElement | null = null;
    let rafId: number | null = null;
    let watchdogId: ReturnType<typeof setTimeout> | null = null;
    let extractionStartId: ReturnType<typeof setTimeout> | null = null;

    // The probe element must be attached to the document (and rendered rather
    // than `display:none`) or Chromium stops producing samples for it.
    const detachProbe = () => {
      if (!probe) return;
      probe.pause();
      probe.removeAttribute('src');
      probe.load();
      probe.remove();
      probe = null;
    };

    const cancelSampling = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (watchdogId !== null) {
        clearTimeout(watchdogId);
        watchdogId = null;
      }
    };

    extractionStartId = setTimeout(() => {
      if (cancelled) return;
      setIsExtractingWaveform(true);
      void (async () => {
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          if (!AudioCtx) {
            throw new Error('Web Audio API unavailable in this renderer');
          }
          audioCtx = new AudioCtx();

          probe = document.createElement('video');
          probe.src = videoUrl;
          probe.muted = true;
          probe.playsInline = true;
          probe.preload = 'auto';
          probe.crossOrigin = 'anonymous';
          probe.style.position = 'fixed';
          probe.style.width = '1px';
          probe.style.height = '1px';
          probe.style.opacity = '0';
          probe.style.pointerEvents = 'none';
          document.body.appendChild(probe);

          await new Promise<void>((resolve, reject) => {
            if (cancelled) return resolve();
            const onLoaded = () => {
              cleanup();
              resolve();
            };
            const onFailed = () => {
              cleanup();
              reject(new Error('Media failed to load for waveform analysis'));
            };
            const cleanup = () => {
              probe?.removeEventListener('loadedmetadata', onLoaded);
              probe?.removeEventListener('error', onFailed);
            };
            probe?.addEventListener('loadedmetadata', onLoaded);
            probe?.addEventListener('error', onFailed);
          });
          if (cancelled) return;

          // Resolved after `loadedmetadata` so a properly-muxed file can use its
          // own length. Headerless `MediaRecorder` webm reports `Infinity`, and
          // the take's recorded duration is what bins the samples instead.
          const totalDurationSec =
            safeDurationMs(probe.duration, durationMs) / 1000;
          if (!isFiniteDurationSeconds(totalDurationSec)) {
            throw new Error('Media duration is unknown');
          }

          // Route the element through the graph instead of decoding bytes:
          // `decodeAudioData` cannot demux a webm/Matroska container and always
          // throws `EncodingError` for screen recordings.
          const source = audioCtx.createMediaElementSource(probe);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = ANALYSER_FFT_SIZE;
          // Deliberately not connected to `audioCtx.destination` — the graph
          // exists only to feed the analyser, so nothing is ever audible.
          source.connect(analyser);

          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
          if (audioCtx.state !== 'running') {
            throw new Error(
              'AudioContext could not be resumed (autoplay policy); no waveform',
            );
          }

          // Target: ~80 peaks per second of duration, capped so a long recording
          // does not allocate an unbounded buffer.
          const totalPeaks = Math.max(
            1,
            Math.min(Math.ceil(totalDurationSec * PEAKS_PER_SECOND), MAX_PEAKS),
          );
          const samples = new Uint8Array(analyser.fftSize);
          // How much media one analyser window covers, in seconds.
          const windowSec = analyser.fftSize / audioCtx.sampleRate;
          const peaks = new Float32Array(totalPeaks);
          const seen = new Uint8Array(totalPeaks);

          // The analyser only sees what the decoder has produced, so the clip is
          // walked at an accelerated rate instead of in real time.
          probe.playbackRate = SAMPLING_PLAYBACK_RATE;
          await probe.play();

          const bucketSec = totalDurationSec / totalPeaks;

          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              cancelSampling();
              resolve();
            };

            const step = () => {
              if (cancelled || settled) return finish();

              const elapsedSec = probe?.currentTime ?? 0;
              if (probe?.ended || elapsedSec >= totalDurationSec - bucketSec) {
                return finish();
              }

              analyser.getByteTimeDomainData(samples);
              let sum = 0;
              for (let i = 0; i < samples.length; i++) {
                sum += Math.abs(samples[i] - 128);
              }
              // Normalized to 0..1 against full scale, then boosted for legibility.
              const amp = Math.min(1, (sum / samples.length / 128) * 2.5);

              // The window is far wider than the media advanced since the last
              // frame, so spread it across every bucket it covers. Without this
              // the accelerated pass leaves most of the clip unsampled.
              const firstBucket = Math.floor(elapsedSec / bucketSec);
              const lastBucket = Math.floor(
                (elapsedSec + windowSec) / bucketSec,
              );
              for (let b = firstBucket; b <= lastBucket; b++) {
                if (b < 0 || b >= totalPeaks) continue;
                // Overlapping windows are common, so keep the loudest.
                if (!seen[b] || amp > peaks[b]) {
                  peaks[b] = amp;
                  seen[b] = 1;
                }
              }

              rafId = requestAnimationFrame(step);
            };

            probe?.addEventListener('ended', finish, { once: true });
            rafId = requestAnimationFrame(step);
            // A stalled decode must not leave the promise pending forever.
            watchdogId = setTimeout(
              finish,
              (totalDurationSec / SAMPLING_PLAYBACK_RATE) * 1000 + 5000,
            );
          });
          if (cancelled) return;

          // Fast sampling skips buckets. Carry the last known peak forward so the
          // drawn waveform stays continuous instead of dropping to zero.
          let lastSeen = 0;
          let hasSignal = false;
          for (let i = 0; i < totalPeaks; i++) {
            if (seen[i]) {
              lastSeen = peaks[i];
              hasSignal = true;
            } else {
              peaks[i] = lastSeen;
            }
          }

          if (!cancelled) {
            // A video with no decodable audio track produces pure silence; report
            // "no waveform" rather than a flat line that looks like real audio.
            setAudioPeaks(hasSignal ? peaks : null);
          }
        } catch (err) {
          console.warn('Could not extract audio waveform from media:', err);
          if (!cancelled) {
            // Do not fabricate a plausible-looking waveform for failed/silent media.
            setAudioPeaks(null);
          }
        } finally {
          cancelSampling();
          detachProbe();
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
    }, 750);

    return () => {
      cancelled = true;
      if (extractionStartId !== null) clearTimeout(extractionStartId);
      cancelSampling();
      detachProbe();
    };
  }, [videoUrl, durationMs]);

  // ── 2. Adaptive Video Keyframe Filmstrip Generator ────────────────────────

  useEffect(() => {
    if (!videoUrl || durationMs <= 0) {
      disposeBitmaps(bitmapsRef.current);
      setThumbnails(new Map());
      return;
    }

    disposeBitmaps(bitmapsRef.current);
    setThumbnails(new Map());
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
          if (cancelled) {
            // Never published, so nothing can be holding it — but route the close
            // through the registry anyway so no caller can reintroduce this bug.
            closeBitmap(bitmap);
            return;
          }
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
      disposeBitmaps(resultMap);
      if (bitmapsRef.current === resultMap) {
        // Hand the ref a fresh map rather than the emptied one, so a later
        // dispose can never close the same objects a second time.
        bitmapsRef.current = new Map();
      }
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
