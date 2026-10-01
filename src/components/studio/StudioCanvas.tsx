/**
 * components/studio/StudioCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time 60fps HTML5 Canvas preview renderer for Studio.
 *
 * Implements:
 *   - Kinetic camera zoom & pan interpolation with smooth cubic easing
 *   - Sleek wallpaper backdrop with mesh gradients / dark glass
 *   - Rounded window frame clipping with customizable drop shadows and header dots
 *   - Aspect ratio framing (16:9, 9:16, 1:1, 4:3)
 *   - Synchronized karaoke subtitles overlay
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { FilmIcon } from 'lucide-react';
import type {
  StudioStyling,
  StudioZoom,
  StudioCaption,
} from '@/main/ipc/channels';

interface StudioCanvasProps {
  videoUrl: string | null;
  styling: StudioStyling;
  zooms: StudioZoom[];
  captions: StudioCaption[];
  currentTimeMs: number;
  durationMs?: number;
  isPlaying: boolean;
  onTimeUpdate?: (ms: number) => void;
  onDurationChange?: (ms: number) => void;
  onEnded?: () => void;
}

// EaseInOutCubic interpolation
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Parse CSS linear-gradient string and construct a CanvasGradient
function parseLinearGradient(
  ctx: CanvasRenderingContext2D,
  bgString: string,
  cw: number,
  ch: number,
): CanvasGradient {
  const match = bgString.match(/linear-gradient\s*\((.+)\)/i);
  if (!match) {
    const fallback = ctx.createLinearGradient(0, 0, cw, ch);
    fallback.addColorStop(0, '#111827');
    fallback.addColorStop(1, '#030712');
    return fallback;
  }

  const rawArgs = match[1];
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  for (let i = 0; i < rawArgs.length; i++) {
    const char = rawArgs[i];
    if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;
    if (char === ',' && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  let angleDeg = 135;
  let stopParts = parts;

  if (parts.length > 0 && /deg$/i.test(parts[0])) {
    angleDeg = parseFloat(parts[0]) || 135;
    stopParts = parts.slice(1);
  } else if (parts.length > 0 && /^to\s+/i.test(parts[0])) {
    const toDir = parts[0].toLowerCase();
    if (toDir.includes('bottom') && toDir.includes('right')) angleDeg = 135;
    else if (toDir.includes('bottom') && toDir.includes('left')) angleDeg = 225;
    else if (toDir.includes('top') && toDir.includes('right')) angleDeg = 45;
    else if (toDir.includes('top') && toDir.includes('left')) angleDeg = 315;
    else if (toDir.includes('bottom')) angleDeg = 180;
    else if (toDir.includes('right')) angleDeg = 90;
    else if (toDir.includes('top')) angleDeg = 0;
    else if (toDir.includes('left')) angleDeg = 270;
    stopParts = parts.slice(1);
  }

  // Calculate coordinates from angle
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const cx = cw / 2;
  const cy = ch / 2;
  const length = Math.abs(cw * Math.cos(rad)) + Math.abs(ch * Math.sin(rad));
  const halfLen = length / 2;
  const x0 = cx - Math.cos(rad) * halfLen;
  const y0 = cy - Math.sin(rad) * halfLen;
  const x1 = cx + Math.cos(rad) * halfLen;
  const y1 = cy + Math.sin(rad) * halfLen;

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);

  const parsedStops: { color: string; offset: number | null }[] = [];
  stopParts.forEach((part) => {
    const pctMatch = part.match(/(.*?)\s+(\d+(?:\.\d+)?)%/);
    if (pctMatch) {
      parsedStops.push({
        color: pctMatch[1].trim(),
        offset: Math.min(1, Math.max(0, parseFloat(pctMatch[2]) / 100)),
      });
    } else {
      parsedStops.push({
        color: part.trim(),
        offset: null,
      });
    }
  });

  const n = parsedStops.length;
  if (n === 0) {
    grad.addColorStop(0, '#111827');
    grad.addColorStop(1, '#030712');
    return grad;
  }

  parsedStops.forEach((stop, idx) => {
    const offset =
      stop.offset !== null ? stop.offset : n === 1 ? 0 : idx / (n - 1);
    try {
      grad.addColorStop(offset, stop.color);
    } catch {
      // Fallback in case of an invalid color format
    }
  });

  return grad;
}

export function StudioCanvas({
  videoUrl,
  styling,
  zooms,
  captions,
  currentTimeMs,
  durationMs,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onEnded,
}: StudioCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dynamic canvas bitmap dimensions based on aspect ratio
  const canvasDims = useMemo(() => {
    switch (styling.aspectRatio) {
      case '9:16':
        return { w: 1080, h: 1920 };
      case '1:1':
        return { w: 1080, h: 1080 };
      case '4:3':
        return { w: 1440, h: 1080 };
      case '16:9':
      default:
        return { w: 1920, h: 1080 };
    }
  }, [styling.aspectRatio]);

  // Smooth camera state
  const cameraStateRef = useRef({
    scale: 1,
    panX: 0.5,
    panY: 0.5,
  });

  const [videoLoaded, setVideoLoaded] = useState(false);
  const lastEmittedTimeRef = useRef(0);
  const currentTimeRef = useRef(currentTimeMs);
  useEffect(() => {
    currentTimeRef.current = currentTimeMs;
  }, [currentTimeMs]);

  const bgGradCacheRef = useRef<{
    bg: string;
    cw: number;
    ch: number;
    val: CanvasGradient | string;
  } | null>(null);
  const glowGradCacheRef = useRef<{
    cw: number;
    ch: number;
    val: CanvasGradient;
  } | null>(null);

  // Delta-clock playback loop when playing without a video source (blank showcase)
  useEffect(() => {
    if (!isPlaying || videoUrl) return;

    let animId: number;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTick;
      lastTick = now;
      const targetDuration = durationMs || 30000;
      const nextTime = currentTimeRef.current + delta;

      if (nextTime >= targetDuration) {
        currentTimeRef.current = targetDuration;
        onTimeUpdate?.(targetDuration);
        onEnded?.();
      } else {
        currentTimeRef.current = nextTime;
        onTimeUpdate?.(nextTime);
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, videoUrl, durationMs, onTimeUpdate, onEnded]);

  // Synchronize play / pause with video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, videoLoaded]);

  // Synchronize seek from parent (bypassed during smooth playback to prevent decoder stutter)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;

    const diff = Math.abs(video.currentTime * 1000 - currentTimeMs);
    if (!isPlaying && diff > 50) {
      video.currentTime = currentTimeMs / 1000;
    } else if (isPlaying && diff > 400) {
      video.currentTime = currentTimeMs / 1000;
    }
  }, [currentTimeMs, videoLoaded, isPlaying]);

  // Main 60fps render loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || video.readyState < 2) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const cw = canvas.width;
      const ch = canvas.height;
      const timeMs = video.currentTime * 1000;

      // 60fps playhead synchronization
      if (isPlaying && Math.abs(timeMs - lastEmittedTimeRef.current) >= 16) {
        lastEmittedTimeRef.current = timeMs;
        onTimeUpdate?.(timeMs);
      }

      // ── 1. Calculate Active Zoom Target ─────────────────────────────────────
      let targetScale = 1.0;
      let targetPanX = 0.5;
      let targetPanY = 0.5;

      const activeZoom = zooms.find(
        (z) => timeMs >= z.startMs - 400 && timeMs <= z.endMs + 400,
      );

      if (activeZoom) {
        const transitionDuration = 450;
        let progress = 1.0;

        if (timeMs < activeZoom.startMs) {
          // Transition in
          progress = easeInOutCubic(
            Math.max(
              0,
              (timeMs - (activeZoom.startMs - transitionDuration)) /
                transitionDuration,
            ),
          );
        } else if (timeMs > activeZoom.endMs) {
          // Transition out
          progress = easeInOutCubic(
            Math.max(0, 1.0 - (timeMs - activeZoom.endMs) / transitionDuration),
          );
        }

        const scaleBoost =
          (activeZoom.scale - 1.0) * (styling.zoomIntensity / 1.5);
        targetScale = 1.0 + scaleBoost * progress;
        targetPanX = 0.5 + (activeZoom.targetX - 0.5) * progress;
        targetPanY = 0.5 + (activeZoom.targetY - 0.5) * progress;
      }

      // Smooth camera interpolation
      const smoothFactor = styling.cameraEasing === 'snappy' ? 0.22 : 0.12;
      const cam = cameraStateRef.current;
      cam.scale += (targetScale - cam.scale) * smoothFactor;
      cam.panX += (targetPanX - cam.panX) * smoothFactor;
      cam.panY += (targetPanY - cam.panY) * smoothFactor;
      // ── 2. Draw Background (Cached Gradients) ───────────────────────────────
      ctx.clearRect(0, 0, cw, ch);

      let bgStyle = bgGradCacheRef.current;
      if (
        !bgStyle ||
        bgStyle.bg !== styling.background ||
        bgStyle.cw !== cw ||
        bgStyle.ch !== ch
      ) {
        const val =
          styling.background && styling.background.includes('gradient')
            ? parseLinearGradient(ctx, styling.background, cw, ch)
            : styling.background || '#090a0f';
        bgStyle = { bg: styling.background, cw, ch, val };
        bgGradCacheRef.current = bgStyle;
      }
      ctx.fillStyle = bgStyle.val;
      ctx.fillRect(0, 0, cw, ch);

      let glowStyle = glowGradCacheRef.current;
      if (!glowStyle || glowStyle.cw !== cw || glowStyle.ch !== ch) {
        const glow = ctx.createRadialGradient(
          cw * 0.5,
          ch * 0.5,
          100,
          cw * 0.5,
          ch * 0.5,
          cw * 0.65,
        );
        glow.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
        glow.addColorStop(1, 'rgba(99, 102, 241, 0)');
        glowStyle = { cw, ch, val: glow };
        glowGradCacheRef.current = glowStyle;
      }
      ctx.fillStyle = glowStyle.val;
      ctx.fillRect(0, 0, cw, ch);

      // ── 3. Window Container Bounds & Shadows ────────────────────────────────
      const pad = (styling.padding / 100) * Math.min(cw, ch) * 0.85;
      const maxWinW = Math.max(10, cw - pad * 2);
      const maxWinH = Math.max(10, ch - pad * 2);

      const headerH = 26;
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;
      const videoAspect = vw / vh;

      // Fit content inside maxWinW x (maxWinH - headerH) preserving the video content aspect ratio
      let contentW = maxWinW;
      let contentH = contentW / videoAspect;
      if (contentH + headerH > maxWinH) {
        contentH = Math.max(10, maxWinH - headerH);
        contentW = contentH * videoAspect;
      }
      const winW = contentW;
      const winH = contentH + headerH;
      const winX = (cw - winW) / 2;
      const winY = (ch - winH) / 2;
      const radius = styling.borderRadius;

      if (pad > 8) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 14;

        ctx.beginPath();
        ctx.roundRect(winX, winY, winW, winH, radius);
        ctx.fillStyle = '#0f1117';
        ctx.fill();
        ctx.restore();
      }

      // Clip inside window
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(winX, winY, winW, winH, radius);
      ctx.clip();

      // ── 4. Draw Zoomed & Panned Video Frame ──────────────────────────────────
      // Calculate video source crop based on camera zoom & pan
      const cropW = vw / cam.scale;
      const cropH = vh / cam.scale;
      const cropX = Math.max(
        0,
        Math.min(vw - cropW, cam.panX * vw - cropW / 2),
      );
      const cropY = Math.max(
        0,
        Math.min(vh - cropH, cam.panY * vh - cropH / 2),
      );

      // Render content cleanly beneath the window header bar
      const contentY = winY + headerH;
      ctx.drawImage(
        video,
        cropX,
        cropY,
        cropW,
        cropH,
        winX,
        contentY,
        winW,
        contentH,
      );

      // Window border overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── 5. Window Header Bar & Traffic Dots ─────────────────────────────────
      ctx.fillStyle = 'rgba(15, 17, 23, 0.75)';
      ctx.fillRect(winX, winY, winW, headerH);

      // Subtle header separator
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(winX, winY + headerH);
      ctx.lineTo(winX + winW, winY + headerH);
      ctx.stroke();

      // macOS Traffic light dots
      const dotY = winY + headerH / 2;
      const dotR = 4.5;
      const dots = ['#ef4444', '#f59e0b', '#10b981'];
      dots.forEach((color, i) => {
        ctx.beginPath();
        ctx.arc(winX + 16 + i * 14, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });

      // ── 6. Synchronized Subtitles / Captions ─────────────────────────────────
      if (styling.showCaptions && captions.length > 0) {
        const activeCap = captions.find(
          (c) => timeMs >= c.startMs && timeMs <= c.endMs,
        );

        if (activeCap) {
          const capText = activeCap.text;
          const fontSize = Math.max(18, Math.round(Math.min(cw, ch) * 0.032));
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
          const textMetrics = ctx.measureText(capText);
          const horizPad = Math.round(fontSize * 1.1);
          const vertPad = Math.round(fontSize * 0.45);
          const badgeW = textMetrics.width + horizPad * 2;
          const badgeH = fontSize + vertPad * 2;
          const badgeX = winX + (winW - badgeW) / 2;
          const bottomOffset = Math.round(Math.min(cw, ch) * 0.04);
          const badgeY = winY + winH - badgeH - bottomOffset;

          // Capsule pill background
          ctx.save();
          ctx.fillStyle = 'rgba(10, 10, 15, 0.88)';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Render text with crisp styling
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(capText, badgeX + badgeW / 2, badgeY + badgeH / 2);
          ctx.restore();
        }
      }

      ctx.restore(); // end window clip

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [styling, zooms, captions, isPlaying, onTimeUpdate]);

  // Aspect ratio styling for outer canvas container
  const aspectClass =
    styling.aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[640px]'
      : styling.aspectRatio === '1:1'
        ? 'aspect-square max-h-[580px]'
        : styling.aspectRatio === '4:3'
          ? 'aspect-[4/3] max-h-[580px]'
          : 'aspect-video max-h-[580px]';

  return (
    <div
      ref={containerRef}
      className={`relative w-full mx-auto flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-border/40 shadow-2xl ${aspectClass}`}
    >
      {/* Hidden native video source */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          className="hidden"
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (v) {
              setVideoLoaded(true);
              onDurationChange?.(v.duration * 1000);
            }
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (v && onTimeUpdate) {
              onTimeUpdate(v.currentTime * 1000);
            }
          }}
          onEnded={onEnded}
        >
          <track kind="captions" />
        </video>
      )}

      {/* Render Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasDims.w}
        height={canvasDims.h}
        className="w-full h-full object-contain pointer-events-none select-none"
      />

      {/* Sleek Canvas View when no video is loaded (Blank Canvas mode) */}
      {!videoUrl && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
          style={{
            background: styling.background.includes('gradient')
              ? styling.background
              : styling.background || '#090a0f',
          }}
        >
          <div className="w-full max-w-md p-8 rounded-2xl border-2 border-dashed border-border/40 bg-black/40 backdrop-blur-md flex flex-col items-center gap-3 shadow-2xl">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <FilmIcon className="w-6 h-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-foreground">
                Blank Showcase Canvas
              </h3>
              <p className="text-xs text-muted-foreground/80 max-w-xs">
                Drag media or click{' '}
                <span className="text-primary font-bold">+</span> in the Content
                Panel on the left to add video, text, effects, or audio.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
