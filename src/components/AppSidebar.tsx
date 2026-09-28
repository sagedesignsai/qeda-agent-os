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
import { useCallback, useEffect, useState } from 'react';
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
import { ProjectsMenu } from '@/components/sidebar/ProjectsMenu';
import { DocumentsMenu } from '@/components/sidebar/DocumentsMenu';
import { QedaLogomark } from '@/components/QedaLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquareIcon,
  NotebookIcon,
  SettingsIcon,
  SearchIcon,
  PlusIcon,
  SparklesIcon,
  TerminalIcon,
  CheckSquareIcon,
  FolderKanbanIcon,
  ChevronsUpDownIcon,
  CheckIcon,
  FileTextIcon,
  VideoIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/use-projects';
import { useProjectScope } from '@/hooks/use-project-scope';
import { useIpcEvent } from '@/hooks/use-ipc';
import { projectIcon } from '@/components/projects/ProjectCard';
import type { Project } from '@/main/ipc/channels';
import { TerminalMenu } from '@/components/sidebar/TerminalMenu';

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  done: 'bg-sky-500',
  archived: 'bg-zinc-500',
};

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
  { to: '/projects', label: 'Projects', icon: FolderKanbanIcon },
  { to: '/studio', label: 'Showcase Studio', icon: VideoIcon },
  { to: '/documents', label: 'Documents', icon: FileTextIcon },
  { to: '/workspace', label: 'Workspace', icon: NotebookIcon },
  { to: '/terminal', label: 'Terminal', icon: TerminalIcon },
  { to: '/tasks', label: 'Tasks', icon: CheckSquareIcon },
];

/** Which section submenu a pathname belongs to, if any. */
function sectionOf(
  pathname: string,
): 'chat' | 'workspace' | 'terminal' | 'projects' | 'documents' | null {
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chat';
  if (pathname === '/projects' || pathname.startsWith('/projects/')) {
    return 'projects';
  }
  if (pathname === '/documents' || pathname.startsWith('/documents/')) {
    return 'documents';
  }
  if (pathname === '/workspace' || pathname.startsWith('/workspace/')) {
    return 'workspace';
  }
  if (pathname === '/terminal' || pathname.startsWith('/terminal/'))
    return 'terminal';
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

  const {
    projectId: queryProjectId,
    clear: clearScope,
    withScope,
    activeProjectId: resolvedProjectId,
    activeProjectName: resolvedProjectName,
  } = useProjectScope();
  const { projects } = useProjects();

  const routeProjectId = location.pathname.startsWith('/projects/')
    ? location.pathname.split('/')[2]
    : null;

  const activeProjectId = queryProjectId || routeProjectId || null;
  const activeProject = activeProjectId
    ? (projects.find((p) => p.id === activeProjectId) ?? null)
    : null;

  /**
   * True only when there is genuinely nothing: no scope AND no remembered
   * project. This is the state where the copilot cannot resolve a repository,
   * and the only one that earns attention colour in the rail. A remembered
   * default keeps the neutral treatment because it is the normal case.
   */
  const hasNoProjectAtAll = !activeProject && !resolvedProjectId;

  const handleSelectProject = (projectToSelect: Project | null) => {
    // Selecting a project also makes it the persisted default, so a fresh launch
    // returns to where the user was working. This is deliberately separate from
    // the `?project=` scope below: that is a temporary per-surface lens, this is
    // "what I was last doing". Clearing the scope does NOT clear the default —
    // pick "All Projects" for that.
    void window.electron.ipc.invoke('settings:set-active-project', {
      projectId: projectToSelect?.id ?? null,
    });

    if (!projectToSelect) {
      clearScope();
      if (location.pathname.startsWith('/projects/')) {
        navigate('/projects');
      } else {
        const params = new URLSearchParams(location.search);
        params.delete('project');
        const searchStr = params.toString() ? `?${params.toString()}` : '';
        navigate(`${location.pathname}${searchStr}`);
      }
    } else {
      if (location.pathname.startsWith('/projects')) {
        navigate(`/projects/${projectToSelect.id}`);
      } else {
        const params = new URLSearchParams(location.search);
        params.set('project', projectToSelect.id);
        navigate(`${location.pathname}?${params.toString()}`);
      }
    }
  };

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

  // The footer readout must track the active model. Fetching once on mount was
  // not enough: the Settings dialog mounts after this component and saves
  // without touching this state, so the label went stale until a remount.
  const loadModel = useCallback(async () => {
    try {
      const s = await window.electron.ipc.invoke<{
        activeProvider?: string;
        activeModel?: string;
      }>('settings:get');
      setProvider(s?.activeProvider ?? '');
      setModel(s?.activeModel ?? '');
    } catch {
      setProvider('');
      setModel('');
    }
  }, []);

  useEffect(() => {
    void loadModel();
  }, [loadModel]);

  useIpcEvent(
    'settings:changed',
    () => {
      void loadModel();
    },
    [loadModel],
  );

  const section = sectionOf(location.pathname);
  const view =
    collapsed || !section || showMainAt === location.pathname
      ? 'main'
      : section;

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
              <Link
                to="/chat"
                onClick={() => setShowMainAt(null)}
                className="group/brand"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border/70 text-foreground shadow-sm group-hover/brand:border-primary/50 group-hover/brand:bg-accent/40 transition-all">
                  <QedaLogomark
                    size={16}
                    ringClassName="text-foreground"
                    boltClassName="text-sky-400 group-hover/brand:text-amber-400"
                    animated
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold tracking-tight text-foreground">
                    Qeda
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
                        <Link
                          to={
                            activeProjectId && to !== '/projects'
                              ? withScope(to)
                              : to
                          }
                          onClick={() => setShowMainAt(null)}
                        >
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

      {view === 'projects' && (
        <ProjectsMenu onBack={() => setShowMainAt(location.pathname)} />
      )}

      {view === 'documents' && (
        <DocumentsMenu onBack={() => setShowMainAt(location.pathname)} />
      )}

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="sm"
                  title={
                    activeProject
                      ? `Project: ${activeProject.name}`
                      : hasNoProjectAtAll
                        ? 'No project selected. The copilot cannot read your code or files until you pick one.'
                        : resolvedProjectName
                          ? `Scoped to all projects. Agents use "${resolvedProjectName}" (your last project).`
                          : 'Project: All Projects'
                  }
                  className={cn(
                    'w-full justify-between gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors',
                    activeProject
                      ? 'border border-primary/25 bg-primary/10 text-foreground hover:bg-primary/15'
                      : 'border border-border/40 bg-sidebar-accent/30 text-sidebar-foreground/80 hover:bg-sidebar-accent/70',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {activeProject ? (
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          STATUS_DOT[activeProject.status] ?? 'bg-primary',
                        )}
                        style={
                          activeProject.color
                            ? { backgroundColor: activeProject.color }
                            : undefined
                        }
                      />
                    ) : (
                      <FolderKanbanIcon
                        className={cn(
                          'size-3.5 shrink-0',
                          hasNoProjectAtAll
                            ? 'text-amber-500'
                            : 'text-muted-foreground',
                        )}
                      />
                    )}
                    <span className="shrink-0 font-medium text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                      Project:
                    </span>
                    <span
                      className={cn(
                        'truncate text-[11px] group-data-[collapsible=icon]:hidden',
                        hasNoProjectAtAll
                          ? 'font-semibold text-amber-600 dark:text-amber-500'
                          : 'font-semibold',
                      )}
                    >
                      {activeProject
                        ? activeProject.name
                        : hasNoProjectAtAll
                          ? 'No project'
                          : 'All Projects'}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="size-3 shrink-0 text-muted-foreground/70 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="start"
                side={collapsed ? 'right' : 'top'}
                className="w-56"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Active Project
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => handleSelectProject(null)}
                  className="flex items-center justify-between text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FolderKanbanIcon className="size-3.5 text-muted-foreground" />
                    <span>All Projects (Global)</span>
                  </div>
                  {!activeProject && (
                    <CheckIcon className="size-3.5 text-primary" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {projects.filter((p) => p.status !== 'archived').length ===
                0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No projects created yet
                  </div>
                ) : (
                  projects
                    .filter((p) => p.status !== 'archived')
                    .map((p) => {
                      const Icon = projectIcon(p.icon);
                      const isSelected = activeProject?.id === p.id;
                      return (
                        <DropdownMenuItem
                          key={p.id}
                          onClick={() => handleSelectProject(p)}
                          className="flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'size-2 shrink-0 rounded-full',
                                STATUS_DOT[p.status] ?? 'bg-primary',
                              )}
                              style={
                                p.color
                                  ? { backgroundColor: p.color }
                                  : undefined
                              }
                            />
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">
                              {p.name}
                            </span>
                          </div>
                          {isSelected && (
                            <CheckIcon className="size-3.5 text-primary shrink-0 ml-1" />
                          )}
                        </DropdownMenuItem>
                      );
                    })
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setShowMainAt(null);
                    navigate('/projects');
                  }}
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  <PlusIcon className="size-3.5 mr-1" />
                  <span>Manage / New project…</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

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
