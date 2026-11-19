import { studioCompositionAssetMediaUrl, studioTakeMediaUrl } from '../media';
import type {
  StudioComposition,
  StudioCompositionLayer,
} from '../types';
import { studioCanvasDims } from './geometry';
import {
  drawStudioCompositionFrame,
  type StudioCompositionMedia,
} from './composition';
import { WebMMuxer } from './webm-muxer';

export interface StudioCompositionExportOptions {
  onProgress?: (progress: number, status: string) => void;
  signal?: AbortSignal;
  fps?: number;
}

interface LoadedLayer {
  layer: StudioCompositionLayer;
  video?: HTMLVideoElement;
  image?: HTMLImageElement;
}

function releaseLayers(layers: LoadedLayer[]): void {
  for (const { video } of layers) {
    if (!video) continue;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

function seekTo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSeconds) < 0.001) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Could not seek source video to ${timeSeconds.toFixed(3)}s.`));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = timeSeconds;
  });
}

async function loadLayer(
  layer: StudioCompositionLayer,
  signal?: AbortSignal,
): Promise<LoadedLayer> {
  if (signal?.aborted) throw new Error('Export cancelled.');
  const src =
    layer.kind === 'video'
      ? studioTakeMediaUrl(layer.sourceId)
      : studioCompositionAssetMediaUrl(layer.sourceId);

  if (layer.kind === 'image') {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    try {
      await image.decode();
      return { layer, image };
    } catch (error) {
      image.removeAttribute('src');
      throw error;
    }
  }

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Could not load recording "${layer.name}".`));
      };
      const onAbort = () => {
        cleanup();
        reject(new Error('Export cancelled.'));
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error(`Recording "${layer.name}" has no usable duration.`);
    }
    return { layer, video };
  } catch (error) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    throw error;
  }
}

async function detectCodec(
  width: number,
  height: number,
): Promise<{ encoderCodec: string; muxerCodec: 'vp8' | 'vp9' }> {
  const candidates = [
    { encoderCodec: 'vp09.00.10.08', muxerCodec: 'vp9' as const },
    { encoderCodec: 'vp8', muxerCodec: 'vp8' as const },
  ];
  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.encoderCodec,
        width,
        height,
        bitrate: 16_000_000,
        framerate: 30,
      });
      if (support.supported) return candidate;
    } catch {
      // Try the next browser-supported codec.
    }
  }
  throw new Error('This browser does not support VP8 or VP9 video export.');
}

export async function renderStudioCompositionVideo(
  composition: StudioComposition,
  options?: StudioCompositionExportOptions,
): Promise<{ durationMs: number }> {
  const document = composition.document;
  if (!document.layers.length) {
    throw new Error('Add at least one media layer before exporting.');
  }
  if (options?.signal?.aborted) throw new Error('Export cancelled.');

  const fps = Math.max(1, Math.round(options?.fps ?? 30));
  const dims = studioCanvasDims(document.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create the composition export canvas.');

  options?.onProgress?.(0.02, 'Loading composition media…');
  const loadResults = await Promise.allSettled(
    document.layers.map((layer) => loadLayer(layer, options?.signal)),
  );
  const failedLoad = loadResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  const loadedLayers = loadResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  if (failedLoad) {
    releaseLayers(loadedLayers);
    throw failedLoad.reason;
  }

  const ipcPromises: Promise<unknown>[] = [];
  let chunkWriteQueue: Promise<unknown> = Promise.resolve();
  let firstChunk = true;
  let renderStreamStarted = false;
  let encoder: VideoEncoder | null = null;
  let renderError: unknown = null;
  const closePartialStream = async () => {
    if (!renderStreamStarted) return;
    await Promise.allSettled(ipcPromises.splice(0));
    try {
      await window.electron.ipc.invoke(
        'studio:composition-save-rendered-chunk',
        {
          compositionId: composition.id,
          chunkBase64: '',
          isLast: true,
        },
      );
    } catch (cleanupError) {
      console.error(
        '[Studio composition] Could not close the partial render stream.',
        cleanupError,
      );
    }
  };

  try {
    const { encoderCodec, muxerCodec } = await detectCodec(
      dims.width,
      dims.height,
    );
    const muxer = new WebMMuxer({
      width: dims.width,
      height: dims.height,
      codec: muxerCodec,
      fps,
      onChunk: (chunk) => {
        const isFirst = firstChunk;
        firstChunk = false;
        renderStreamStarted = true;
        const bytes = chunk.data.buffer.slice(
          chunk.data.byteOffset,
          chunk.data.byteOffset + chunk.data.byteLength,
        ) as ArrayBuffer;
        const writePromise = chunkWriteQueue.then(() =>
          window.electron.ipc.invoke(
            'studio:composition-save-rendered-chunk',
            {
              compositionId: composition.id,
              chunk: bytes,
              isFirst,
              isLast: false,
            },
          ),
        );
        chunkWriteQueue = writePromise;
        ipcPromises.push(writePromise);
      },
    });

    const frames: Array<{
      data: Uint8Array;
      timestampMs: number;
      isKeyframe: boolean;
    }> = [];
    let encoderError: Error | null = null;
    encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        frames.push({
          data,
          timestampMs: chunk.timestamp / 1000,
          isKeyframe: chunk.type === 'key',
        });
      },
      error: (error) => {
        encoderError = error;
      },
    });
    encoder.configure({
      codec: encoderCodec,
      width: dims.width,
      height: dims.height,
      bitrate: 16_000_000,
      framerate: fps,
      latencyMode: 'quality',
    });

    const intervalMs = 1000 / fps;
    const totalFrames = Math.ceil((document.durationMs / 1000) * fps);
    for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
      if (options?.signal?.aborted) throw new Error('Export cancelled.');
      if (encoderError) throw encoderError;

      const timeMs = Math.min(frameIndex * intervalMs, document.durationMs);
      const media = new Map<string, StudioCompositionMedia>();
      for (const loaded of loadedLayers) {
        const { layer, video, image } = loaded;
        if (video) {
          if (timeMs >= layer.startMs && timeMs <= layer.endMs) {
            const durationMs = Math.min(
              layer.sourceDurationMs,
              video.duration * 1000,
            );
            const sourceMs = Math.min(
              durationMs - 1,
              Math.max(0, layer.sourceInMs + timeMs - layer.startMs),
            );
            await seekTo(video, sourceMs / 1000);
            if (video.readyState >= 2) {
              media.set(layer.id, {
                element: video,
                width: video.videoWidth,
                height: video.videoHeight,
              });
            }
          }
        } else if (image) {
          media.set(layer.id, {
            element: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        }
      }

      drawStudioCompositionFrame({
        ctx,
        document,
        width: dims.width,
        height: dims.height,
        timeMs,
        media,
      });

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(timeMs * 1000),
      });
      encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
      frame.close();

      if (frameIndex % 10 === 0 || frameIndex === totalFrames) {
        await encoder.flush();
        if (encoderError) throw encoderError;
        while (frames.length) {
          const encoded = frames.shift()!;
          muxer.addFrame(
            encoded.data,
            encoded.timestampMs,
            encoded.isKeyframe,
          );
        }
        await Promise.all(ipcPromises.splice(0));
      }

      if (
        frameIndex % Math.max(1, Math.floor(fps / 2)) === 0 ||
        frameIndex === totalFrames
      ) {
        options?.onProgress?.(
          0.08 + (frameIndex / Math.max(1, totalFrames)) * 0.88,
          `Rendering frame ${frameIndex + 1} of ${totalFrames + 1}…`,
        );
      }
    }
    muxer.finalize();
    await Promise.all(ipcPromises);
    await window.electron.ipc.invoke(
      'studio:composition-save-rendered-chunk',
      {
        compositionId: composition.id,
        chunkBase64: '',
        isLast: true,
      },
    );
    return { durationMs: document.durationMs };
  } catch (error) {
    renderError = error;
    await closePartialStream();
  } finally {
    if (encoder && encoder.state !== 'closed') encoder.close();
    releaseLayers(loadedLayers);
  }
  throw renderError;
}
