/**
 * pages/Projects.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The spine of the productivity system. A project is the unit of *intent*:
 * an outcome with a deadline, the tasks that achieve it, the repo the work
 * happens in, the docs that describe it, and the conversations about it.
 *
 *   /projects                → the grid: every project with its rollup
 *   /projects/:projectId     → one project, with shortcuts into its work
 *
 * Everything is driven by `useProjects`, which keeps the grid and the sidebar
 * menu in sync through the `projects:changed` broadcast.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createElement, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import {
  FileTextIcon,
  FolderPlusIcon,
  InboxIcon,
  Loader2Icon,
  PlusIcon,
  TargetIcon,
  TerminalIcon,
  Trash2Icon,
  VideoIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { OverflowMenu } from '@/components/OverflowMenu';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ProjectCard,
  projectIcon,
  PROJECT_STATUS_META,
} from '@/components/projects/ProjectCard';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import {
  useProjects,
  type CreateProjectInput,
  type UpdateProjectPatch,
} from '@/hooks/use-projects';
import { formatFocusDuration } from '@/components/tasks/FocusStatsStrip';
import type { ProjectRollup } from '@/main/ipc/channels';

export default function Projects() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { rollups, loading, createProject, updateProject, deleteProject } =
    useProjects();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRollup | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectRollup | null>(
    null,
  );

  const selected = useMemo(
    () => rollups.find((r) => r.project.id === projectId) ?? null,
    [rollups, projectId],
  );

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (rollup: ProjectRollup) => {
    setEditing(rollup);
    setDialogOpen(true);
  };

  const handleSubmit = async (
    input: CreateProjectInput | UpdateProjectPatch,
  ) => {
    try {
      if (editing) {
        await updateProject(editing.project.id, input as UpdateProjectPatch);
        toast.success('Project updated');
      } else {
        const created = await createProject(input as CreateProjectInput);
        toast.success('Project created');
        if (created) navigate(`/projects/${created.id}`);
      }
    } catch {
      toast.error(
        editing ? 'Could not update project' : 'Could not create project',
      );
    }
  };

  const handleArchive = async (id: string, archived: boolean) => {
    try {
      await updateProject(id, { status: archived ? 'archived' : 'active' });
      toast.success(archived ? 'Project archived' : 'Project restored');
    } catch {
      toast.error('Could not archive project');
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteProject(target.project.id);
      toast.success('Project deleted', {
        description: 'Its tasks moved back to the Inbox.',
      });
      if (projectId === target.project.id) navigate('/projects');
    } catch {
      toast.error('Could not delete project');
    }
  };

  // ── Detail view ───────────────────────────────────────────────────────────
  if (projectId) {
    if (!selected) {
      return (
        <div className="flex h-full flex-col">
          <PageHeader
            crumbs={[{ label: 'Projects', to: '/projects' }, { label: '…' }]}
          />
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {loading ? (
              <Loader2Icon className="size-5 animate-spin" />
            ) : (
              'Project not found.'
            )}
          </div>
        </div>
      );
    }

    const { project } = selected;
    const status = PROJECT_STATUS_META[project.status];
    const pct =
      selected.taskTotal > 0
        ? Math.round((selected.taskDone / selected.taskTotal) * 100)
        : 0;

    return (
      <div className="flex h-full flex-col">
        <PageHeader
          crumbs={[
            { label: 'Projects', to: '/projects' },
            { label: project.name },
          ]}
          title={
            <span className="inline-flex items-center gap-2">
              {createElement(projectIcon(project.icon), {
                className: 'size-4 shrink-0 text-muted-foreground',
              })}
              <span className="truncate">{project.name}</span>
            </span>
          }
          subtitle={project.description || undefined}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                onClick={() => openEdit(selected)}
              >
                Edit
              </Button>
              {/* Delete is destructive and infrequent, so it drops into the
                  overflow rather than sitting next to Edit on every screen. */}
              <OverflowMenu
                label="More project actions"
                items={
                  project.id !== 'inbox'
                    ? [
                        {
                          label: 'Delete',
                          icon: <Trash2Icon className="size-3.5" />,
                          destructive: true,
                          onSelect: () => setPendingDelete(selected),
                        },
                      ]
                    : []
                }
              />
            </>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] font-normal ${status.className}`}
              >
                {status.label}
              </Badge>
              {project.deadline !== null && (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px] font-normal"
                >
                  <TargetIcon className="size-3" />
                  {formatDistanceToNow(new Date(project.deadline * 1000), {
                    addSuffix: true,
                  })}
                </Badge>
              )}
              {project.repo_path && (
                <Badge
                  variant="outline"
                  className="gap-1 font-mono text-[10px] font-normal"
                >
                  {project.repo_path}
                </Badge>
              )}
            </div>

            {/* Rollup */}
            <div className="rounded-xl border bg-card/40 p-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {selected.taskTotal === 0
                    ? 'No tasks yet'
                    : `${selected.taskDone} of ${selected.taskTotal} tasks done`}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {pct}%
                </span>
              </div>
              <Progress value={pct} className="h-2" />

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Active" value={String(selected.taskActive)} />
                <Stat label="Backlog" value={String(selected.taskBacklog)} />
                <Stat
                  label="Overdue"
                  value={String(selected.overdue)}
                  tone={selected.overdue > 0 ? 'danger' : undefined}
                />
                <Stat
                  label="Focus today"
                  value={formatFocusDuration(selected.focusSecToday)}
                />
              </div>
            </div>

            {/* Shortcuts into the work */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Shortcut
                to={`/tasks?project=${project.id}`}
                icon={TargetIcon}
                label="Tasks"
              />
              <Shortcut
                to={`/documents?projectId=${project.id}`}
                icon={FileTextIcon}
                label="Documents"
              />
              <Shortcut
                to={`/studio?projectId=${project.id}`}
                icon={VideoIcon}
                label="Studio"
              />
              <Shortcut
                to={`/terminal?project=${project.id}`}
                icon={TerminalIcon}
                label="Terminal"
              />
            </div>
          </div>
        </div>

        <ProjectDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          project={selected.project}
          onSubmit={handleSubmit}
        />
        <DeleteDialog
          target={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void handleDelete()}
        />
      </div>
    );
  }

  // ── Grid view ─────────────────────────────────────────────────────────────
  const active = rollups.filter((r) => r.project.status !== 'archived');
  const archived = rollups.filter((r) => r.project.status === 'archived');
  // The Inbox is seeded for everyone, so "no projects" means *only* the Inbox.
  // Archived projects still count as real, so they keep their section rather
  // than being swallowed by the empty state. The Inbox itself still renders
  // below the empty state — hiding it would strand quick-capture tasks.
  const hasAnyRealProject = rollups.some((r) => r.project.id !== 'inbox');
  const inbox = active.find((r) => r.project.id === 'inbox') ?? null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        crumbs={[{ label: 'Projects' }]}
        subtitle={
          active.length > 0
            ? `${active.length} active${archived.length > 0 ? ` · ${archived.length} archived` : ''}`
            : undefined
        }
        actions={
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={openCreate}
          >
            <PlusIcon className="size-3" />
            New project
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !hasAnyRealProject ? (
          <NoProjectsState
            inbox={inbox}
            onNew={openCreate}
            onOpen={(id) => navigate(`/projects/${id}`)}
            onEdit={openEdit}
            onDelete={(id) =>
              setPendingDelete(rollups.find((r) => r.project.id === id) ?? null)
            }
          />
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((rollup, index) => (
                <motion.div
                  key={rollup.project.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                >
                  <ProjectCard
                    rollup={rollup}
                    onOpen={(id) => navigate(`/projects/${id}`)}
                    onEdit={openEdit}
                    onArchive={(id, isArchived) =>
                      void handleArchive(id, isArchived)
                    }
                    onDelete={(id) =>
                      setPendingDelete(
                        rollups.find((r) => r.project.id === id) ?? null,
                      )
                    }
                  />
                </motion.div>
              ))}
            </div>

            {archived.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Archived
                </h2>
                <div className="grid grid-cols-1 gap-3 opacity-70 sm:grid-cols-2 xl:grid-cols-3">
                  {archived.map((rollup) => (
                    <ProjectCard
                      key={rollup.project.id}
                      rollup={rollup}
                      onOpen={(id) => navigate(`/projects/${id}`)}
                      onEdit={openEdit}
                      onArchive={(id, a) => void handleArchive(id, a)}
                      onDelete={(id) =>
                        setPendingDelete(
                          rollups.find((r) => r.project.id === id) ?? null,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing?.project ?? null}
        onSubmit={handleSubmit}
      />
      <DeleteDialog
        target={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}) {
  return (
    <div className="rounded-lg border bg-background/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          tone === 'danger' ? 'text-rose-400' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Shortcut({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border bg-card/40 px-3 py-2.5 text-xs transition-colors hover:border-primary/40 hover:bg-card/70"
    >
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </Link>
  );
}

/**
 * The fallback for a user who skipped the welcome flow: only the Inbox exists.
 * The Inbox still renders below, so quick capture is never out of reach.
 */
function NoProjectsState({
  inbox,
  onNew,
  onOpen,
  onEdit,
  onDelete,
}: {
  inbox: ProjectRollup | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onEdit: (rollup: ProjectRollup) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-8 py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/40">
          <FolderPlusIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">No projects yet</p>
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            A project holds an outcome, its tasks, the repo you build it in, and
            the docs that describe it. Start one and everything gains a home.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={onNew}>
          <PlusIcon className="size-3" />
          Create your first project
        </Button>
      </div>

      {inbox && (
        <div className="w-full space-y-2 text-left">
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <InboxIcon className="size-3.5" />
            Or keep capturing into the Inbox
          </div>
          <div className="mx-auto w-full max-w-sm">
            <ProjectCard
              rollup={inbox}
              onOpen={onOpen}
              onEdit={onEdit}
              onArchive={() => {}}
              onDelete={onDelete}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: ProjectRollup | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={target !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{target?.project.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {target && target.taskTotal > 0
              ? `${target.taskTotal} task${
                  target.taskTotal === 1 ? '' : 's'
                } will move to the Inbox — nothing is lost.`
              : 'This project will be removed. Nothing is lost.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
