/**
 * components/sidebar/TerminalMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Level-2 rail content for the Terminal section — mirrors ChatMenu exactly:
 *
 *   • Back row → main menu
 *   • New Session action
 *   • Search/filter input
 *   • Session list — route-driven active state, inline rename, delete
 *   • Status dot on each row (idle/running/done/error)
 *
 * Selection is route-driven (`/terminal/:sessionId`), so this menu is the
 * single source of terminal navigation — the Terminal page carries no sidebar.
 *
 * Reload triggers: on mount, and whenever the active sessionId changes (so
 * sessions auto-created by the Terminal page appear without a manual refresh).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  XCircleIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { TerminalSession } from '@/main/ipc/channels';
import { useIpcEvent } from '@/hooks/use-ipc';

// ─── Status indicator ─────────────────────────────────────────────────────────

function SessionStatusDot({ status }: { status: TerminalSession['status'] }) {
  if (status === 'running') {
    return <Loader2Icon className="size-3 shrink-0 animate-spin text-sky-400" />;
  }
  if (status === 'done') {
    return <CheckCircle2Icon className="size-3 shrink-0 text-emerald-400" />;
  }
  if (status === 'error') {
    return <XCircleIcon className="size-3 shrink-0 text-rose-400" />;
  }
  // idle
  return <CircleDashedIcon className="size-3 shrink-0 text-muted-foreground/60" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TerminalMenu({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { sessionId: activeId } = useParams<{ sessionId?: string }>();

  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // ── Data loading ────────────────────────────────────────────────────────
  const reload = async () => {
    try {
      const data = await window.electron.ipc.invoke<TerminalSession[]>(
        'terminal:sessions-list',
      );
      setSessions(data ?? []);
    } catch {
      // Best-effort
    }
  };

  // Reload whenever the active session changes so sessions auto-created by
  // the Terminal page appear here without a manual refresh.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await window.electron.ipc.invoke<TerminalSession[]>(
          'terminal:sessions-list',
        );
        if (!cancelled) setSessions(data ?? []);
      } catch {
        // Best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  // ── Live event subscriptions ─────────────────────────────────────────────

  // When a running session finishes, update its status in-place without a
  // full reload (avoids a flash).
  useIpcEvent('terminal:agent-done', (...args: unknown[]) => {
    const { sessionId } = args[0] as { sessionId: string };
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'done' as const } : s)),
    );
  });

  useIpcEvent('terminal:agent-error', (...args: unknown[]) => {
    const { sessionId } = args[0] as { sessionId: string };
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'error' as const } : s)),
    );
  });

  // Spinner starts as soon as a goal begins running.
  useIpcEvent('terminal:session-status', (...args: unknown[]) => {
    const { sessionId, status } = args[0] as { sessionId: string; status: TerminalSession['status'] };
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status } : s)),
    );
  });

  // When main renames a session after goal completion, reflect it immediately.
  useIpcEvent('terminal:session-renamed', (...args: unknown[]) => {
    const { sessionId, title } = args[0] as { sessionId: string; title: string };
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title } : s)),
    );
  });

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.goal.toLowerCase().includes(q),
    );
  }, [sessions, search]);

  // ── Actions ─────────────────────────────────────────────────────────────

  // Navigate to /terminal — the page auto-creates a session on first goal
  const handleNew = () => {
    setSearch('');
    navigate('/terminal');
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electron.ipc.invoke('terminal:session-delete', { id });
      if (id === activeId) navigate('/terminal');
      await reload();
      toast.success('Session deleted.');
    } catch {
      toast.error('Failed to delete session.');
    }
  };

  const startEdit = (session: TerminalSession) => {
    setEditingId(session.id);
    setEditValue(session.title);
  };

  const commitEdit = async (id: string) => {
    const title = editValue.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await window.electron.ipc.invoke('terminal:session-rename', { id, title });
      await reload();
    } catch {
      toast.error('Failed to rename session.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <SidebarContent>
      {/* Actions row */}
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="sm" onClick={onBack}>
                <ArrowLeftIcon />
                <span>Main menu</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton size="sm" onClick={handleNew}>
                <PlusIcon />
                <span>New session</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Search */}
          <div className="relative px-1 pt-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Session list */}
      <SidebarGroup>
        <SidebarGroupLabel>Sessions</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {search ? 'No matching sessions.' : 'No sessions yet.'}
              </p>
            )}

            {filtered.map((session) => (
              <SidebarMenuItem key={session.id}>
                {editingId === session.id ? (
                  /* Inline rename input */
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => void commitEdit(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitEdit(session.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="h-7 text-xs"
                    aria-label="Rename session"
                  />
                ) : (
                  <>
                    <SidebarMenuButton
                      size="sm"
                      isActive={session.id === activeId}
                      tooltip={session.title || session.goal || 'Untitled'}
                      onClick={() => navigate(`/terminal/${session.id}`)}
                    >
                      {/* Status dot replaces the static icon */}
                      <SessionStatusDot status={session.status} />
                      <span className={cn(
                        'truncate',
                        session.status === 'done' && 'text-muted-foreground',
                      )}>
                        {session.title || session.goal || 'Untitled'}
                      </span>
                    </SidebarMenuButton>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction
                          showOnHover
                          aria-label="Session actions"
                        >
                          <MoreHorizontalIcon />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="right">
                        <DropdownMenuItem onSelect={() => startEdit(session)}>
                          <PencilIcon className="mr-2 h-3.5 w-3.5" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => void handleDelete(session.id)}
                        >
                          <TrashIcon className="mr-2 h-3.5 w-3.5" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}
