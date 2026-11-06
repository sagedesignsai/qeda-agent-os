/**
 * components/music/GlobalAudioDock.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * App-wide floating focus session bar.
 *
 * Music transport used to share this dock as a bottom-centre pill. That fought
 * the main surface for attention, so playback now lives in `SidebarMusicPlayer`
 * (collapsed / popover / expanded). This module keeps only the focus session
 * chrome, which still needs a global floating home while a timer is running.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useLocation, useNavigate } from 'react-router';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useFocusStore } from '@/stores/focus-store';
import { FloatingFocusBar } from '@/components/focus/FloatingFocusBar';

export function GlobalAudioDock() {
  const location = useLocation();
  const navigate = useNavigate();
  const focus = useFocusSession();

  const onTasks = location.pathname.startsWith('/tasks');
  const showFocus =
    Boolean(focus.focusedTask) &&
    focus.displayMode !== 'closed' &&
    (focus.displayMode === 'floating' || !onTasks);

  if (!showFocus) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-3xl">
        <FloatingFocusBar
          inline
          onExpand={() => {
            navigate('/tasks');
            useFocusStore.getState().setDisplayMode('modal');
          }}
        />
      </div>
    </div>
  );
}
