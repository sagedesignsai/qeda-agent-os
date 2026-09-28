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

import { useEffect, useRef, useState } from 'react';
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
  isPlaying: boolean;
  onTimeUpdate?: (ms: number) => void;
  onDurationChange?: (ms: number) => void;
  onEnded?: () => void;
}

// EaseInOutCubic interpolation
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function StudioCanvas({
  videoUrl,
  styling,
  zooms,
  captions,
  currentTimeMs,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onEnded,
}: StudioCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Smooth camera state
  const cameraStateRef = useRef({
    scale: 1,
    panX: 0.5,
    panY: 0.5,
  });

  const [videoLoaded, setVideoLoaded] = useState(false);

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

  // Synchronize seek from parent
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;

    const diff = Math.abs(video.currentTime * 1000 - currentTimeMs);
    if (diff > 250) {
      video.currentTime = currentTimeMs / 1000;
    }
  }, [currentTimeMs, videoLoaded]);

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

      // ── 2. Draw Background ──────────────────────────────────────────────────
      ctx.clearRect(0, 0, cw, ch);

      // Create gradient or solid background
      if (styling.background.includes('gradient')) {
        const bgGrad = ctx.createLinearGradient(0, 0, cw, ch);
        bgGrad.addColorStop(0, '#111827');
        bgGrad.addColorStop(0.5, '#1e1b4b');
        bgGrad.addColorStop(1, '#030712');
        ctx.fillStyle = bgGrad;
      } else {
        ctx.fillStyle = styling.background || '#090a0f';
      }
      ctx.fillRect(0, 0, cw, ch);

      // Subtle ambient radial glow behind the window
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
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cw, ch);

      // ── 3. Window Container Bounds & Shadows ────────────────────────────────
      const pad = (styling.padding / 100) * Math.min(cw, ch) * 0.85;
      const winW = cw - pad * 2;
      const winH = ch - pad * 2;
      const winX = pad;
      const winY = pad;
      const radius = styling.borderRadius;

      ctx.save();

      // Draw drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 48;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 24;

      // Rounded path for window
      ctx.beginPath();
      ctx.roundRect(winX, winY, winW, winH, radius);
      ctx.fillStyle = '#0f1117';
      ctx.fill();

      // Reset shadow for inner contents
      ctx.restore();

      // Clip inside window
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(winX, winY, winW, winH, radius);
      ctx.clip();

      // ── 4. Draw Zoomed & Panned Video Frame ──────────────────────────────────
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;

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

      ctx.drawImage(video, cropX, cropY, cropW, cropH, winX, winY, winW, winH);

      // Window border overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── 5. Window Header Bar & Traffic Dots ─────────────────────────────────
      const headerH = 26;
      ctx.fillStyle = 'rgba(15, 17, 23, 0.65)';
      ctx.fillRect(winX, winY, winW, headerH);

      // Subtle header separator
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
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
          ctx.font = '600 16px Inter, system-ui, sans-serif';
          const textMetrics = ctx.measureText(capText);
          const badgeW = textMetrics.width + 36;
          const badgeH = 34;
          const badgeX = winX + (winW - badgeW) / 2;
          const badgeY = winY + winH - 46;

          // Capsule pill background
          ctx.save();
          ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 17);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Render text with word highlights if available
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
  }, [styling, zooms, captions]);

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
        width={1920}
        height={1080}
        className="w-full h-full object-contain pointer-events-none select-none"
      />

      {/* Placeholder when no video loaded */}
      {!videoUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60 p-6 text-center">
          <p className="text-sm">
            No take selected. Record or select a take to preview.
          </p>
        </div>
      )}
    </div>
  );
}
