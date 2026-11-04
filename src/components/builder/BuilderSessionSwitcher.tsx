/**
 * components/builder/BuilderSessionSwitcher.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A compact dropdown that appears in the Builder page header when multiple
 * sessions are active. Lets the user see which session is focused and switch
 * between them.
 *
 * Hidden when there is 0 or 1 active session — nothing to switch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon, CheckIcon, CircleIcon, Loader2Icon } from 'lucide-react';
import type { BuilderActiveSessionSummary } from '@/main/ipc/channels';
import { cn } from '@/lib/utils';

export function BuilderSessionSwitcher() {
  const [sessions, setSessions] = useState<BuilderActiveSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const list = await window.electron.ipc.invoke<BuilderActiveSessionSummary[]>(
        'builder:sessions:active-list',
      );
      setSessions(list);
    } catch {
      // Non-fatal.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Listen for session changes so the list stays fresh.
  useEffect(() => {
    const unsubscribe = window.electron.ipc.on(
      'builder:sessions:changed',
      () => {
        void refresh();
      },
    );
    return unsubscribe;
  }, []);

  // Hide when there's nothing to switch.
  if (loading || sessions.length <= 1) return null;

  const focused = sessions.find((s) => s.isFocused);
  if (!focused) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          )}
          title="Switch session"
        >
          <span className="max-w-[120px] truncate">{focused.title || 'Untitled'}</span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {sessions.map((session) => (
          <DropdownMenuItem
            key={session.id}
            onClick={async () => {
              try {
                await window.electron.ipc.invoke('builder:sessions:focus', {
                  id: session.id,
                });
                // Trigger a session-state refresh in the hook by broadcasting
                // a change event.
                if (
                  !window.electron.ipc.invoke ||
                  typeof window.electron.ipc.invoke !== 'function'
                )
                  return;
                // The hook subscribes to builder:session-state changes via
                // re-invoking on session ID change. We signal this by
                // refreshing the active list, which causes a re-render with
                // the new focused session. The use-builder-session hook will
                // re-fetch builder:session-state on the next effect cycle.
                void window.electron.ipc.invoke('builder:sessions:active-list');
              } catch {
                // Best effort.
              }
            }}
          >
            <div className="flex flex-1 items-center gap-2">
              <CircleIcon
                className={cn(
                  'size-2 shrink-0',
                  session.running ? 'text-green-500' : 'text-muted-foreground/40',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {session.title || 'Untitled'}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {session.repoDirectory}
                  {session.branch ? ` · ${session.branch}` : ''}
                </p>
              </div>
              {session.isFocused && (
                <CheckIcon className="size-3.5 shrink-0 text-foreground" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
