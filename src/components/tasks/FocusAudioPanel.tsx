/**
 * components/tasks/FocusAudioPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Focus-mode audio: pick a scene, then adjust the layers it loaded.
 *
 * This used to own a page-local engine (`use-focus-audio`) that disposed its
 * AudioContext on unmount. It now reads the app-wide soundscape store, so the
 * ambience survives minimising focus mode or navigating to another page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Separator } from '@/components/ui/separator';
import { ScenePicker } from '@/components/music/ScenePicker';
import { SoundscapeMixer } from '@/components/music/SoundscapeMixer';
import { cn } from '@/lib/utils';

export interface FocusAudioPanelProps {
  className?: string;
}

export function FocusAudioPanel({ className }: FocusAudioPanelProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4 rounded-xl border border-border/60 bg-card/60 p-4',
        className,
      )}
    >
      <ScenePicker compact />
      <Separator />
      <SoundscapeMixer compact />
    </div>
  );
}
