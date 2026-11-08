/**
 * components/presence/StreakBadge.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Flame icon + streak count in the header. Shows a milestone toast when the
 * user hits days 3, 7, 14, or 30.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { FlameIcon } from 'lucide-react';
import { usePresenceStreak } from '@/hooks/use-presence';
import { cn } from '@/lib/utils';

interface StreakBadgeProps {
  projectId: string | null;
  className?: string;
}

export function StreakBadge({ projectId, className }: StreakBadgeProps) {
  const { streakCount, milestoneMessage } = usePresenceStreak(projectId);
  const [showMilestone, setShowMilestone] = useState(false);

  useEffect(() => {
    if (milestoneMessage) {
      setShowMilestone(true);
      const timer = setTimeout(() => setShowMilestone(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [milestoneMessage]);

  if (!projectId || streakCount === 0) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-600 dark:bg-orange-950 dark:text-orange-400',
          className,
        )}
        title={`${streakCount} days in a row`}
      >
        <FlameIcon className="h-4 w-4" />
        <span>{streakCount}</span>
      </div>

      {showMilestone && milestoneMessage && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3 text-sm font-medium text-white shadow-lg">
            {milestoneMessage}
          </div>
        </div>
      )}
    </>
  );
}
