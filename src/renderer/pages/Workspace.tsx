/**
 * renderer/pages/Workspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The knowledge workspace. Notebook/page navigation lives in the rail
 * (WorkspaceMenu); this page renders the selected page's block editor and the
 * right-hand info panel, both keyed off `/workspace/:notebookId/:pageId`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader, type PageCrumb } from '@/components/PageHeader';
import type { Notebook, Page } from '@/main/ipc/channels';
import {
  useNotebooks,
  usePageDetail,
  usePages,
  usePageSearch,
} from '@/hooks/use-workspace';
import { useProjectScope } from '@/hooks/use-project-scope';
import { BlockEditor } from '@/components/workspace/BlockEditor';
import { PageInfoPanel } from '@/components/workspace/PageInfoPanel';
import {
  Loader2Icon,
  MessageSquareIcon,
  NotebookIcon,
  PanelRightIcon,
  PlusIcon,
  ArrowUpRightIcon,
  FlaskConicalIcon,
  FolderKanbanIcon,
  SearchIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProjects } from '@/hooks/use-projects';

export default function Workspace() {
  const navigate = useNavigate();
  const { notebookId, pageId } = useParams<{
    notebookId?: string;
    pageId?: string;
  }>();

  const { notebooks, reload: reloadNotebooks } = useNotebooks();
  const { projects: projectRollups } = useProjects();
  const {
    detail,
    reload: reloadDetail,
    loading: pageLoading,
  } = usePageDetail(pageId ?? null);
  const { projectId } = useProjectScope();
  const [infoOpen, setInfoOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Filter notebooks to active project if one is scoped, otherwise show all
  const filteredNotebooks = projectId
    ? notebooks.filter((n) => n.project_id === projectId)
    : notebooks;

  // Prefer the loaded page's own notebook (a cross-notebook link may have
  // navigated with a stale :notebookId).
  const contextNotebookId = detail?.page.notebook_id ?? notebookId ?? null;
  const activeNotebook =
    notebooks.find((n) => n.id === contextNotebookId) ?? null;

  const crumbs: PageCrumb[] = [
    { label: 'Notebooks', to: '/workspace' },
    ...(activeNotebook
      ? [{ label: activeNotebook.title, to: `/workspace/${activeNotebook.id}` }]
      : []),
    ...(detail ? [{ label: detail.page.title || 'Untitled' }] : []),
  ];

  const handleCreateNotebook = useCallback(
    async (title: string, ownerProjectId?: string | null) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        toast.error('Notebook name is required.');
        return;
      }
      const duplicate = notebooks.find(
        (n) => n.title.trim().toLowerCase() === cleanTitle.toLowerCase(),
      );
      if (duplicate) {
        toast.error(`A notebook named “${cleanTitle}” already exists.`);
        return;
      }
      try {
        const notebook = await window.electron.ipc.invoke<Notebook>(
          'notebooks:create',
          { title: cleanTitle, projectId: ownerProjectId },
        );
        await reloadNotebooks();
        navigate(`/workspace/${notebook.id}`);
        toast.success('Notebook created.');
      } catch {
        toast.error('Could not create notebook.');
      }
    },
    [notebooks, reloadNotebooks],
  );

  const handleCreatePage = async (targetNotebookId: string) => {
    try {
      const page = await window.electron.ipc.invoke<Page>('pages:create', {
        notebookId: targetNotebookId,
        title: 'Untitled',
        parentPageId: null,
      });
      navigate(`/workspace/${targetNotebookId}/${page.id}`);
    } catch (err) {
      toast.error(
        `Failed to create page: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    try {
      const ok = await window.electron.ipc.invoke<boolean>(
        'pages:restore-version',
        { versionId },
      );
      if (!ok) {
        toast.error('Could not restore version. It may have been deleted.');
        return;
      }
      await reloadDetail(pageId ?? '');
      toast.success('Version restored.');
    } catch (err) {
      toast.error(
        `Error restoring version: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleChatWithContext = (
    id: string,
    notebookContextId?: string,
    chatProjectId?: string | null,
  ) => {
    navigate('/chat', {
      state: {
        chatContext: {
          pageId: id,
          notebookId: notebookContextId,
          ...(chatProjectId ? { projectId: chatProjectId } : {}),
        },
      },
    });
  };

  const handleResearchNotebook = (id: string) => {
    const notebook = notebooks.find((item) => item.id === id);
    if (!notebook) {
      toast.error('Notebook not found.');
      return;
    }
    navigate('/chat', {
      state: {
        chatContext: {
          notebookId: id,
          ...(notebook?.project_id ? { projectId: notebook.project_id } : {}),
        },
      },
    });
  };

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <ResizablePanel id="workspace-editor" minSize="380px">
          <div className="flex h-full flex-col overflow-hidden">
            <PageHeader
              crumbs={crumbs}
              actions={
                <>
                  {!detail && (
                    <>
                      <div className="relative h-9 w-64">
                        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search pages…"
                          className="h-9 pl-9 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                        className="h-7 gap-1.5 text-xs shrink-0"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">New notebook</span>
                      </Button>
                    </>
                  )}
                  {detail && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground"
                      onClick={() =>
                        handleChatWithContext(
                          detail.page.id,
                          detail.page.notebook_id,
                          detail.page.project_id,
                        )
                      }
                    >
                      <MessageSquareIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Chat about page</span>
                    </Button>
                  )}
                  {notebookId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => void handleCreatePage(notebookId)}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">New page</span>
                    </Button>
                  )}
                  {detail && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={infoOpen ? 'secondary' : 'ghost'}
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          onClick={() => setInfoOpen((v) => !v)}
                          aria-label="Toggle info panel"
                        >
                          <PanelRightIcon className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {infoOpen ? 'Hide info panel' : 'Show info panel'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              }
            />

            <div className="min-h-0 flex-1 overflow-hidden">
              {pageLoading && !detail ? (
                <EditorSkeleton />
              ) : detail ? (
                <BlockEditor
                  pageId={detail.page.id}
                  title={detail.page.title}
                  initialBlocks={detail.blocks}
                  onSaved={pageId ? () => void reloadDetail(pageId) : undefined}
                />
              ) : (
                <NotebooksHome
                  notebooks={filteredNotebooks}
                  projects={projectRollups.filter((p) => p.id !== 'inbox')}
                  selectedNotebookId={notebookId ?? null}
                  query={query}
                  createOpen={createOpen}
                  setCreateOpen={setCreateOpen}
                  onCreateNotebook={handleCreateNotebook}
                  onCreatePage={handleCreatePage}
                  onOpenPage={(id, nbId) =>
                    navigate(`/workspace/${nbId}/${id}`)
                  }
                  onOpenNotebook={(nbId) => navigate(`/workspace/${nbId}`)}
                  onResearchNotebook={handleResearchNotebook}
                  onNotebookUpdated={() => void reloadNotebooks()}
                />
              )}
            </div>
          </div>
        </ResizablePanel>

        {detail && infoOpen && (
          <>
            <ResizableHandle withHandle />

            <ResizablePanel
              id="workspace-info"
              defaultSize="300px"
              minSize="220px"
              maxSize="420px"
              className="border-l"
            >
              <PageInfoPanel
                detail={detail}
                onNavigate={(id) => {
                  if (contextNotebookId) {
                    navigate(`/workspace/${contextNotebookId}/${id}`);
                  }
                }}
                onChatWithContext={(id) =>
                  handleChatWithContext(
                    id,
                    detail?.page.notebook_id,
                    detail?.page.project_id,
                  )
                }
                onVersionRestore={handleRestoreVersion}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

function NotebooksHome({
  notebooks,
  projects,
  selectedNotebookId,
  query,
  createOpen,
  setCreateOpen,
  onCreateNotebook,
  onCreatePage,
  onOpenPage,
  onOpenNotebook,
  onResearchNotebook,
  onNotebookUpdated,
}: {
  notebooks: Notebook[];
  projects: { id: string; name: string }[];
  selectedNotebookId: string | null;
  query: string;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  onCreateNotebook: (title: string, projectId?: string | null) => Promise<void>;
  onCreatePage: (notebookId: string) => Promise<void>;
  onOpenPage: (id: string, notebookId: string) => void;
  onOpenNotebook: (notebookId: string) => void;
  onResearchNotebook: (notebookId: string) => void;
  onNotebookUpdated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('none');
  const { hits, searching, search } = usePageSearch();
  const activeNotebook = notebooks.find((n) => n.id === selectedNotebookId);
  const { pages: activePages } = usePages(selectedNotebookId);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(query), 180);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const saveNotebook = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error('Notebook name is required.');
      return;
    }
    await onCreateNotebook(cleanTitle, projectId === 'none' ? null : projectId);
    setCreateOpen(false);
    setTitle('');
  };

  const changeNotebookProject = async (notebookId: string, value: string) => {
    try {
      await window.electron.ipc.invoke('notebooks:update', {
        id: notebookId,
        project_id: value === 'none' ? null : value,
      });
      onNotebookUpdated();
      toast.success('Notebook project updated.');
    } catch {
      toast.error('Could not update notebook project.');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Notebooks
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {activeNotebook?.title ?? 'Your notebooks, organized'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Keep notes, Chat research, and project context together. Continue
              exploring or turn what you learn into work.
            </p>
          </div>
          <div className="flex gap-2">
            {activeNotebook && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onResearchNotebook(activeNotebook.id)}
                >
                  <FlaskConicalIcon className="mr-1.5 size-4" />
                  Research with Chat
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onCreatePage(activeNotebook.id)}
                >
                  <PlusIcon className="mr-1.5 size-4" />
                  New page
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-1.5 size-4" />
              New notebook
            </Button>
          </div>
        </header>

        {query.trim() ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Search results</h2>
            {searching ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Searching…
              </div>
            ) : hits.length ? (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {hits.map((hit) => (
                  <button
                    key={hit.page_id}
                    type="button"
                    onClick={() => onOpenPage(hit.page_id, hit.notebook_id)}
                    className="block w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="flex items-center justify-between gap-3 font-medium">
                      {hit.title}
                      <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {hit.notebook_title}
                      {hit.project_id
                        ? ` · ${projects.find((p) => p.id === hit.project_id)?.name ?? 'Project'}`
                        : ''}
                    </span>
                    <span className="mt-2 block text-sm text-muted-foreground">
                      {hit.snippet}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No matching pages yet. Try another phrase or start a research
                notebook in Chat.
              </p>
            )}
          </section>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Notebooks</h2>
                <span className="text-xs text-muted-foreground">
                  {notebooks.length}
                </span>
              </div>
              {notebooks.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {notebooks.map((notebook) => (
                    <div
                      key={notebook.id}
                      className="rounded-lg border bg-card p-4"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenNotebook(notebook.id)}
                        className="flex w-full items-center gap-3 text-left"
                        aria-label={`Open ${notebook.title}`}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <NotebookIcon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {notebook.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {notebook.description || 'Notebook'}
                          </span>
                        </span>
                        <ArrowUpRightIcon className="size-4 text-muted-foreground" />
                      </button>
                      <div className="mt-4 flex items-center gap-2 border-t pt-3">
                        <FolderKanbanIcon className="size-3.5 text-muted-foreground" />
                        <Select
                          value={notebook.project_id ?? 'none'}
                          onValueChange={(value) =>
                            void changeNotebookProject(notebook.id, value)
                          }
                        >
                          <SelectTrigger className="h-7 flex-1 border-0 px-1 text-xs shadow-none">
                            <SelectValue placeholder="Link to project" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Not linked to a project
                            </SelectItem>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {notebook.project_id && (
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">
                            Project-linked
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  No notebooks yet. Create one here, or ask Chat to research a
                  topic and build one for you.
                </div>
              )}
            </section>

            {activeNotebook && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">
                  Pages in {activeNotebook.title}
                </h2>
                {activePages.length ? (
                  activePages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => onOpenPage(page.id, activeNotebook.id)}
                      className="block w-full rounded-md border bg-card p-3 text-left text-sm hover:bg-accent/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {page.title || 'Untitled'}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelativeDate(page.updated_at)}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No pages yet. Create a page or ask Chat to research this
                    notebook’s topic.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
            <DialogDescription>
              Keep related notes and research together. Link it to a project to
              carry that context into other workflows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="knowledge-notebook-title">Name</Label>
              <Input
                id="knowledge-notebook-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Market research"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveNotebook();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveNotebook()}
              disabled={!title.trim()}
            >
              Create notebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Format a Unix-epoch timestamp as a short, locale-stable relative label. */
function formatRelativeDate(epochSeconds: number): string {
  const seconds = Date.now() / 1000 - epochSeconds;
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(weeks / 4);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/** Skeleton shown while navigating to a new page so the user sees progress. */
function EditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b px-8 py-3">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-8 py-6">
        <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
      </div>
    </div>
  );
}
