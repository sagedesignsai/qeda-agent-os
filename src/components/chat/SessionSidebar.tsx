/**
 * components/chat/SessionSidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modern chat sessions sidebar with search, inline editing, and quick actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  PlusIcon,
  SearchIcon,
  MessageSquareIcon,
  PencilIcon,
  TrashIcon,
  MoreHorizontalIcon,
  XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Session {
  id: string;
  title: string;
  created_at?: number;
  updated_at?: number;
}

interface SessionSidebarProps {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewSession: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNewSession,
  onDelete,
  onRename,
}: SessionSidebarProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, search]);

  const startEdit = (session: Session) => {
    setEditingId(session.id);
    setEditValue(session.title);
  };

  const commitEdit = (id: string) => {
    if (editValue.trim()) {
      onRename(id, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col bg-sidebar/50">
      {/* ── Top Actions: New Chat & Search ──────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3 border-b bg-card/40">
        <Button
          onClick={onNewSession}
          className="w-full justify-start gap-2 shadow-sm font-medium text-xs h-8"
          size="sm"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>New Chat</span>
          <span className="ml-auto font-mono text-[10px] opacity-60">⌘N</span>
        </Button>

        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="h-8 pl-8 pr-7 text-xs bg-muted/30 focus-visible:ring-1"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Sessions List ───────────────────────────────────────────────────── */}
      <ScrollArea className="flex-1 p-2">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <MessageSquareIcon className="h-8 w-8 mb-2 stroke-1 opacity-40" />
            <p className="text-xs font-medium">
              {search ? 'No matching chats found' : 'No conversations yet'}
            </p>
            <p className="text-[11px] mt-0.5 opacity-70">
              {search ? 'Try another search term' : 'Click "New Chat" to begin'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {search ? 'Matching Results' : 'Recent Chats'}
            </div>

            {filteredSessions.map((session) => {
              const isActive = activeId === session.id;
              const isEditing = editingId === session.id;

              return (
                <div
                  key={session.id}
                  onClick={() => !isEditing && onSelect(session.id)}
                  className={cn(
                    'group relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-all',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium shadow-xs'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <MessageSquareIcon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-colors',
                      isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />

                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(session.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-6 flex-1 px-1.5 text-xs bg-background"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate leading-snug">
                      {session.title || 'Untitled Session'}
                    </span>
                  )}

                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
                          isActive && 'opacity-70',
                        )}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Session options"
                      >
                        <MoreHorizontalIcon className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => startEdit(session)}>
                        <PencilIcon className="mr-2 h-3.5 w-3.5" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDelete(session.id)}
                      >
                        <TrashIcon className="mr-2 h-3.5 w-3.5" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
