/**
 * components/AppLoadingOverlay.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen overlay that displays the animated Qeda logo while the app loads
 * initial data (projects list, settings) via IPC. Fades out smoothly when
 * loading completes, then unmounts.
 *
 * Used by App.tsx to cover the blank state between splash screen close and the
 * first meaningful render (after ProjectsHome resolves its redirect).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { QedaLogoAnimated } from '@/components/QedaLogo';

interface AppLoadingOverlayProps {
  /** When false, the overlay fades out and unmounts. */
  loading: boolean;
}

export function AppLoadingOverlay({ loading }: AppLoadingOverlayProps) {
  const [fading, setFading] = useState(false);
  const [mounted, setMounted] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  // Fallback timeout: if loading exceeds 8 seconds, force-hide the overlay
  // so the user is never stuck on a blank screen.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setFading(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  // When loading finishes, start fade-out transition
  useEffect(() => {
    if (loading) return;
    setFading(true);
    const timer = setTimeout(() => setMounted(false), 550);
    return () => clearTimeout(timer);
  }, [loading]);

  if (!mounted) return null;

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex items-center justify-center
        transition-opacity duration-500 ease-in-out
        ${isDark ? 'bg-[#0e0f14]' : 'bg-zinc-50'}
        ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}
      `}
    >
      <QedaLogoAnimated
        size={120}
        drawLoop
        drawDurationMs={2400}
        className={isDark ? 'text-zinc-200' : 'text-zinc-900'}
      />
    </div>
  );
}
