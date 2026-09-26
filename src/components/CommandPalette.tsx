/**
 * renderer/components/CommandPalette.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global command palette (⌘K / Ctrl+K):
 *   • Navigate between sections
 *   • Run quick actions (new chat, new page, theme, settings)
 *   • Jump to a recent conversation
 *   • Full-text search over pages
 *
 * Uses the existing IPC channels (`sessions:list`, `pages:search`, `pages:get`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTheme } from 'next-themes';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  MessageSquareIcon,
  NotebookIcon,
  PlusIcon,
  MoonIcon,
  SunIcon,
  SettingsIcon,
  FileTextIcon,
  SparklesIcon,
  NotebookPenIcon,
} from 'lucide-react';
import { useGenerateNotebook } from '@/components/GenerateNotebookDialog';

interface SessionLite {
  id: string;
  title: string;
}

interface PageHit {
  page_id: string;
  title: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenSettings,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const { open: openGenerateNotebook } = useGenerateNotebook();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [pages, setPages] = useState<PageHit[]>([]);

  // Load recent sessions whenever the palette opens.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const data =
          await window.electron.ipc.invoke<SessionLite[]>('sessions:list');
        if (!cancelled) setSessions((data ?? []).slice(0, 6));
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounced page search. Results are only rendered while the query is long
  // enough, so stale hits are never surfaced.
  useEffect(() => {
    if (!open || query.trim().length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const hits = await window.electron.ipc.invoke<PageHit[]>(
            'pages:search',
            { query },
          );
          if (!cancelled) setPages(hits ?? []);
        } catch {
          if (!cancelled) setPages([]);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const close = () => onOpenChange(false);

  // Clear the query whenever the dialog opens so it starts fresh.
  const handleOpenChange = (next: boolean) => {
    if (next) setQuery('');
    onOpenChange(next);
  };

  const run = (fn: () => void | Promise<void>) => {
    void fn();
    close();
  };

  const openPage = async (pageId: string) => {
    try {
      const detail = await window.electron.ipc.invoke<{
        page: { notebook_id: string };
      }>('pages:get', { id: pageId });
      navigate(`/workspace/${detail.page.notebook_id}/${pageId}`);
    } catch {
      navigate('/workspace');
    }
  };

  const showPages = query.trim().length >= 2;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <Command>
        <CommandInput
          placeholder="Search pages, chats, or type a command…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => run(() => navigate('/chat'))}>
              <MessageSquareIcon />
              <span>Chat &amp; Research</span>
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/workspace'))}>
              <NotebookIcon />
              <span>Workspace</span>
              <CommandShortcut>⌘2</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem
              value="generate notebook tutorial guide paper research"
              onSelect={() => run(() => openGenerateNotebook())}
            >
              <NotebookPenIcon />
              <span>Generate notebook…</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/chat'))}>
              <PlusIcon />
              <span>New chat</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/workspace'))}>
              <FileTextIcon />
              <span>New page</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() =>
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
                )
              }
            >
              {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
              <span>
                Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} theme
              </span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => onOpenSettings())}>
              <SettingsIcon />
              <span>Open settings</span>
              <CommandShortcut>⌘,</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          {sessions.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent chats">
                {sessions.map((session) => (
                  <CommandItem
                    key={session.id}
                    value={`chat ${session.title} ${session.id}`}
                    onSelect={() =>
                      run(() => navigate(`/chat/${session.id}`))
                    }
                  >
                    <MessageSquareIcon />
                    <span className="truncate">
                      {session.title || 'Untitled'}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {showPages && pages.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Pages">
                {pages.map((page) => (
                  <CommandItem
                    key={page.page_id}
                    value={`page ${page.title} ${page.page_id}`}
                    onSelect={() => run(() => openPage(page.page_id))}
                  >
                    <SparklesIcon className="text-primary" />
                    <span className="truncate">{page.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
