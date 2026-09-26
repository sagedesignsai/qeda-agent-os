/**
 * components/AppSidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The application rail, built on the shadcn `Sidebar` primitives.
 *
 * It is a two-level menu so there is never a second sidebar on screen:
 *
 *   Brand (always visible)
 *   Level 1 — Main menu: search (⌘K), new chat, section links, recent chats.
 *   Level 2 — Section submenu, auto-selected from the route:
 *             /chat*      → conversation list  (ChatMenu)
 *             /workspace* → notebook/page tree (WorkspaceMenu)
 *   Footer (always visible): model, theme, settings.
 *
 * Each submenu has a "Main menu" row that returns to Level 1 for the current
 * location. While the rail is collapsed to icons it always shows Level 1 (the
 * submenus need the width); expanding reveals the active section.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/chat/ThemeToggle';
import { ChatMenu } from '@/components/sidebar/ChatMenu';
import { WorkspaceMenu } from '@/components/sidebar/WorkspaceMenu';
import {
  BookOpenIcon,
  MessageSquareIcon,
  NotebookIcon,
  SettingsIcon,
  SearchIcon,
  PlusIcon,
  SparklesIcon,
  TerminalIcon,
  CheckSquareIcon,
} from 'lucide-react';
import { TerminalMenu } from '@/components/sidebar/TerminalMenu';

interface RecentSession {
  id: string;
  title: string;
}

interface AppSidebarProps {
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
}

const NAV_ITEMS = [
  { to: '/chat', label: 'Chat & Research', icon: MessageSquareIcon },
  { to: '/workspace', label: 'Workspace', icon: NotebookIcon },
  { to: '/terminal', label: 'Terminal', icon: TerminalIcon },
  { to: '/tasks', label: 'Tasks', icon: CheckSquareIcon },
];

/** Which section submenu a pathname belongs to, if any. */
function sectionOf(pathname: string): 'chat' | 'workspace' | 'terminal' | null {
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chat';
  if (pathname === '/workspace' || pathname.startsWith('/workspace/')) {
    return 'workspace';
  }
  if (pathname === '/terminal' || pathname.startsWith('/terminal/')) return 'terminal';
  return null;
}

export function AppSidebar({
  onOpenCommandPalette,
  onOpenSettings,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  // The pathname at which the user last asked for the main menu. Comparing it
  // to the current pathname means navigating away naturally re-opens the
  // section submenu, without needing an effect.
  const [showMainAt, setShowMainAt] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentSession[]>([]);
  const [provider, setProvider] = useState<string>('');
  const [model, setModel] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sessions =
          await window.electron.ipc.invoke<RecentSession[]>('sessions:list');
        if (!cancelled) setRecents((sessions ?? []).slice(0, 5));
      } catch {
        // Recents are best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await window.electron.ipc.invoke<{
          activeProvider?: string;
          activeModel?: string;
        }>('settings:get');
        if (cancelled) return;
        setProvider(s?.activeProvider ?? '');
        setModel(s?.activeModel ?? '');
      } catch {
        if (!cancelled) {
          setProvider('');
          setModel('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const section = sectionOf(location.pathname);
  const view =
    collapsed || !section || showMainAt === location.pathname ? 'main' : section;

  // Starting a chat only navigates: the session is created by the first
  // message, so bailing out here leaves no empty conversation behind.
  const handleNewChat = () => {
    setShowMainAt(null);
    navigate('/chat');
  };

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/chat" onClick={() => setShowMainAt(null)}>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-primary to-primary/70 text-primary-foreground shadow-sm">
                  <BookOpenIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold tracking-tight">
                    Vellum
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/70">
                    Agent OS
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {view === 'main' && (
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    tooltip="Search"
                    onClick={onOpenCommandPalette}
                  >
                    <SearchIcon />
                    <span>Search…</span>
                    <kbd className="ml-auto rounded border border-sidebar-border bg-sidebar-accent/50 px-1 font-mono text-[10px] text-sidebar-foreground/70">
                      ⌘K
                    </kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    tooltip="New chat"
                    onClick={handleNewChat}
                  >
                    <PlusIcon />
                    <span>New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
                  const isActive =
                    location.pathname === to ||
                    location.pathname.startsWith(`${to}/`);
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        asChild
                        size="sm"
                        isActive={isActive}
                        tooltip={label}
                      >
                        <Link to={to} onClick={() => setShowMainAt(null)}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {recents.length > 0 && (
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel>Recent</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {recents.map((session) => (
                    <SidebarMenuItem key={session.id}>
                      <SidebarMenuButton
                        size="sm"
                        onClick={() => {
                          setShowMainAt(null);
                          navigate(`/chat/${session.id}`);
                        }}
                      >
                        <MessageSquareIcon />
                        <span>{session.title || 'Untitled'}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
      )}

      {view === 'chat' && (
        <ChatMenu onBack={() => setShowMainAt(location.pathname)} />
      )}

      {view === 'workspace' && (
        <WorkspaceMenu onBack={() => setShowMainAt(location.pathname)} />
      )}

      {view === 'terminal' && (
        <TerminalMenu onBack={() => setShowMainAt(location.pathname)} />
      )}

      <SidebarFooter>
        <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-sidebar-accent/50 px-2 py-1 text-[11px] text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          <SparklesIcon className="size-3 shrink-0 text-amber-500" />
          <span className="shrink-0 capitalize">{provider || 'AI'}:</span>
          <span className="truncate font-mono">{model || 'No model set'}</span>
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              tooltip="Settings"
              onClick={onOpenSettings}
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
