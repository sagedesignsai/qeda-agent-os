/**
 * components/sidebar/ChatMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Level-2 rail content for the Chat section: the conversation list with search,
 * inline rename, delete and a "New chat" action, plus a back row to the main
 * menu.
 *
 * Selection is route-driven (`/chat/:sessionId`), so this menu is the single
 * source of chat navigation — the Chat page carries no session panel.
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
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from 'lucide-react';
import { toast } from 'sonner';

interface Session {
  id: string;
  title: string;
}

export function ChatMenu({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { sessionId: activeId } = useParams<{ sessionId?: string }>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const reload = async () => {
    try {
      const data = await window.electron.ipc.invoke<Session[]>('sessions:list');
      setSessions(data ?? []);
    } catch {
      // Best-effort.
    }
  };

  // Refetch when the active session changes so chats created elsewhere (the
  // Chat page auto-creating one) show up.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data =
          await window.electron.ipc.invoke<Session[]>('sessions:list');
        if (!cancelled) setSessions(data ?? []);
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, search]);

  // Starting a chat only navigates: the session is created by the first
  // message, so bailing out here leaves no empty conversation behind.
  const handleNew = () => {
    setSearch('');
    navigate('/chat');
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electron.ipc.invoke('sessions:delete', { id });
      if (id === activeId) navigate('/chat');
      await reload();
      toast.success('Conversation deleted.');
    } catch {
      toast.error('Failed to delete session.');
    }
  };

  const startEdit = (session: Session) => {
    setEditingId(session.id);
    setEditValue(session.title);
  };

  const commitEdit = async (id: string) => {
    const title = editValue.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await window.electron.ipc.invoke('sessions:rename', { id, title });
      await reload();
    } catch {
      toast.error('Failed to rename session.');
    }
  };

  return (
    <SidebarContent>
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
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <div className="relative px-1 pt-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Conversations</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {search ? 'No matching chats.' : 'No conversations yet.'}
              </p>
            )}

            {filtered.map((session) => (
              <SidebarMenuItem key={session.id}>
                {editingId === session.id ? (
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
                    aria-label="Rename conversation"
                  />
                ) : (
                  <>
                    <SidebarMenuButton
                      size="sm"
                      isActive={session.id === activeId}
                      tooltip={session.title || 'Untitled'}
                      onClick={() => navigate(`/chat/${session.id}`)}
                    >
                      <MessageSquareIcon />
                      <span>{session.title || 'Untitled'}</span>
                    </SidebarMenuButton>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction
                          showOnHover
                          aria-label="Conversation actions"
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
