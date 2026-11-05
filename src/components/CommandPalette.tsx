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
  PlusIcon,
  MoonIcon,
  SunIcon,
  SettingsIcon,
  FileTextIcon,
  FolderKanbanIcon,
  CheckSquareIcon,
  VideoIcon,
  TerminalIcon,
  Music2Icon,
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SparklesIcon,
  TimerIcon,
} from 'lucide-react';
import { useMusicStore } from '@/stores/music-store';
import { useFocusStore } from '@/stores/focus-store';
import { useSoundscapeStore } from '@/stores/soundscape-store';
import { BUILTIN_SCENES } from '@/lib/music/scenes';
interface SessionLite {
  id: string;
  title: string;
}

interface DocLite {
  id: string;
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
  const { resolvedTheme, setTheme } = useTheme();
  // Select only what the labels need; the store updates position on every
  // `timeupdate`, and a palette that re-renders four times a second is waste.
  const hasTrack = useMusicStore((s) => s.currentTrack() !== null);
  const playing = useMusicStore((s) => s.playing);
  const focusRunning = useFocusStore((s) => s.timer.running);
  const hasFocusTask = useFocusStore((s) => s.focusedTask !== null);
  const sceneId = useSoundscapeStore((s) => s.sceneId);
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [docs, setDocs] = useState<DocLite[]>([]);

  // Load recent sessions and documents whenever the palette opens.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const [sessionData, docData] = await Promise.all([
          window.electron.ipc.invoke<SessionLite[]>('sessions:list'),
          window.electron.ipc.invoke<DocLite[]>('documents:list'),
        ]);
        if (!cancelled) {
          setSessions((sessionData ?? []).slice(0, 6));
          setDocs(docData ?? []);
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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

  const matchingDocs =
    query.trim().length >= 2
      ? docs.filter((d) =>
          d.title.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : [];

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
            <CommandItem onSelect={() => run(() => navigate('/projects'))}>
              <FolderKanbanIcon />
              <span>Projects</span>
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/tasks'))}>
              <CheckSquareIcon />
              <span>Tasks &amp; Focus</span>
              <CommandShortcut>⌘2</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/documents'))}>
              <FileTextIcon />
              <span>Documents Studio</span>
              <CommandShortcut>⌘3</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/studio'))}>
              <VideoIcon />
              <span>Showcase Studio</span>
              <CommandShortcut>⌘4</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/terminal'))}>
              <TerminalIcon />
              <span>Terminal</span>
              <CommandShortcut>⌘5</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/chat'))}>
              <MessageSquareIcon />
              <span>Chat &amp; Research</span>
              <CommandShortcut>⌘6</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/music'))}>
              <Music2Icon />
              <span>Music</span>
              <CommandShortcut>⌘7</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => navigate('/projects'))}>
              <PlusIcon />
              <span>New project…</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/documents'))}>
              <FileTextIcon />
              <span>New document</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/chat'))}>
              <PlusIcon />
              <span>New chat</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))
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

          <CommandSeparator />

          <CommandGroup heading="Audio">
            <CommandItem
              onSelect={() =>
                run(() => {
                  const store = useMusicStore.getState();
                  if (!store.currentTrack()) {
                    navigate('/music');
                    return;
                  }
                  void store.toggle();
                })
              }
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
              <span>
                {playing ? 'Pause playback' : hasTrack ? 'Resume playback' : 'Open music'}
              </span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void useMusicStore.getState().next())}
            >
              <SkipForwardIcon />
              <span>Next track</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => void useMusicStore.getState().previous())}
            >
              <SkipBackIcon />
              <span>Previous track</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => {
                  const store = useSoundscapeStore.getState();
                  const index = BUILTIN_SCENES.findIndex(
                    (scene) => scene.id === store.sceneId,
                  );
                  const next =
                    BUILTIN_SCENES[(index + 1) % BUILTIN_SCENES.length];
                  store.setScene(next.id, next.config.soundscape);
                  if (!store.started) {
                    void store.start(next.config.soundscape);
                  }
                })
              }
            >
              <SparklesIcon />
              <span className="capitalize">Next scene · {sceneId.replace(/-/g, ' ')}</span>
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => navigate('/music?copilot=1'))}
            >
              <SparklesIcon />
              <span>Ask Music Copilot</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                run(() => {
                  const store = useFocusStore.getState();
                  if (store.focusedTask) store.start();
                  else navigate('/tasks');
                })
              }
            >
              <TimerIcon />
              <span>
                {focusRunning
                  ? 'Pause focus timer'
                  : hasFocusTask
                    ? 'Start focus timer'
                    : 'Start focus…'}
              </span>
            </CommandItem>
            {focusRunning && (
              <CommandItem
                onSelect={() => run(() => useFocusStore.getState().pause())}
              >
                <PauseIcon />
                <span>Pause focus timer</span>
              </CommandItem>
            )}
          </CommandGroup>

          {sessions.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent chats">
                {sessions.map((session) => (
                  <CommandItem
                    key={session.id}
                    value={`chat ${session.title} ${session.id}`}
                    onSelect={() => run(() => navigate(`/chat/${session.id}`))}
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

          {matchingDocs.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Documents">
                {matchingDocs.map((doc) => (
                  <CommandItem
                    key={doc.id}
                    value={`doc ${doc.title} ${doc.id}`}
                    onSelect={() => run(() => navigate(`/documents/${doc.id}`))}
                  >
                    <FileTextIcon className="text-primary" />
                    <span className="truncate">{doc.title || 'Untitled'}</span>
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
