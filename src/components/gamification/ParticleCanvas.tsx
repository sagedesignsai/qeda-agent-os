/**
 * components/gamification/ParticleCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency, GPU-friendly canvas particle burst for instant dopamine hits.
 *
 * Spawns organic radial sparkles directly from the clicked checkbox or button.
 * Uses an idle-sleeping requestAnimationFrame loop (0% CPU when not animating).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

const COLORS = [
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#0ea5e9', // sky-500
  '#8b5cf6', // violet-500
  '#fbbf24', // amber-400
];

let globalTrigger: ((x: number, y: number) => void) | null = null;

/** Trigger a particle explosion at the given screen coordinates. */
export function triggerParticleBurst(x: number, y: number): void {
  globalTrigger?.(x, y);
}

export function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      if (particlesRef.current.length === 0) {
        animFrameRef.current = null;
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gentle gravity
        p.vx *= 0.96; // air drag
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    globalTrigger = (x: number, y: number) => {
      const count = 28;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 4.5;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.2,
          size: 2 + Math.random() * 2.5,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          alpha: 1,
          decay: 0.02 + Math.random() * 0.025,
        });
      }

      if (!animFrameRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };

    return () => {
      globalTrigger = null;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
