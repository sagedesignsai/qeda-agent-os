/**
 * components/sidebar/ProjectsMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Level-2 rail content for the Projects section.
 *
 *   • Back row → main menu
 *   • "All projects" → the grid
 *   • A compact list of projects (with a status dot) → the detail view
 *
 * Data comes from `useProjects`, so creating, archiving, or deleting a project
 * anywhere in the app refreshes this list through the `projects:changed`
 * broadcast.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useNavigate, useParams } from 'react-router';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { ArrowLeftIcon, FolderKanbanIcon, PlusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/use-projects';
import { projectIcon } from '@/components/projects/ProjectCard';

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  done: 'bg-sky-500',
  archived: 'bg-zinc-500',
};

export function ProjectsMenu({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { projectId: activeId } = useParams<{ projectId?: string }>();
  const { rollups } = useProjects();

  const visible = rollups.filter((r) => r.project.status !== 'archived');

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
              <SidebarMenuButton size="sm" onClick={() => navigate('/projects')}>
                <PlusIcon />
                <span>New project</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                isActive={activeId === undefined}
                onClick={() => navigate('/projects')}
              >
                <FolderKanbanIcon />
                <span>All projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No projects yet.
              </p>
            )}

            {visible.map(({ project }) => {
              const Icon = projectIcon(project.icon);
              return (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={project.id === activeId}
                    tooltip={project.name}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <span className="relative flex size-4 shrink-0 items-center justify-center">
                      <Icon className="size-3.5 text-muted-foreground" />
                      <span
                        className={cn(
                          'absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-2 ring-sidebar',
                          STATUS_DOT[project.status] ?? 'bg-zinc-500',
                        )}
                      />
                    </span>
                    <span className="truncate">{project.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
}
