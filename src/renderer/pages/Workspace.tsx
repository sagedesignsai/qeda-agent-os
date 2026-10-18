/**
 * renderer/pages/Workspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The knowledge workspace. Notebook/page navigation lives in the rail
 * (WorkspaceMenu); this page renders the selected page's block editor and the
 * right-hand info panel, both keyed off `/workspace/:notebookId/:pageId`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
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
  useRecentPages,
} from '@/hooks/use-workspace';
import { BlockEditor } from '@/components/workspace/BlockEditor';
import { PageInfoPanel } from '@/components/workspace/PageInfoPanel';
import {
  MessageSquareIcon,
  NotebookIcon,
  PanelRightIcon,
  PlusIcon,
  ArrowUpRightIcon,
  Clock3Icon,
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
  const { detail, reload: reloadDetail } = usePageDetail(pageId ?? null);
  const [infoOpen, setInfoOpen] = useState(true);

  // Prefer the loaded page's own notebook (a cross-notebook link may have
  // navigated with a stale :notebookId).
  const contextNotebookId = detail?.page.notebook_id ?? notebookId ?? null;
  const activeNotebook =
    notebooks.find((n) => n.id === contextNotebookId) ?? null;

  const crumbs: PageCrumb[] = [
    { label: 'Knowledge', to: '/workspace' },
    ...(activeNotebook
      ? [{ label: activeNotebook.title, to: `/workspace/${activeNotebook.id}` }]
      : []),
    ...(detail ? [{ label: detail.page.title || 'Untitled' }] : []),
  ];

  const handleCreateNotebook = async (
    title: string,
    projectId?: string | null,
  ) => {
    const notebook = await window.electron.ipc.invoke<Notebook>(
      'notebooks:create',
      { title, projectId },
    );
    await reloadNotebooks();
    navigate(`/workspace/${notebook.id}`);
  };

  const handleCreatePage = async (targetNotebookId: string) => {
    try {
      const page = await window.electron.ipc.invoke<Page>('pages:create', {
        notebookId: targetNotebookId,
        title: 'Untitled',
        parentPageId: null,
      });
      navigate(`/workspace/${targetNotebookId}/${page.id}`);
    } catch {
      toast.error('Failed to create page.');
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    const ok = await window.electron.ipc.invoke<boolean>(
      'pages:restore-version',
      { versionId },
    );
    if (ok) {
      await reloadDetail(pageId ?? '');
      toast.success('Version restored.');
    }
  };

  const handleChatWithContext = (
    id: string,
    notebookContextId?: string,
    projectId?: string | null,
  ) => {
    navigate('/chat', {
      state: {
        chatContext: {
          pageId: id,
          notebookId: notebookContextId,
          ...(projectId ? { projectId } : {}),
        },
      },
    });
  };

  const handleResearchNotebook = (id: string) => {
    const notebook = notebooks.find((item) => item.id === id);
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
              {detail ? (
                <BlockEditor
                  pageId={detail.page.id}
                  title={detail.page.title}
                  initialBlocks={detail.blocks}
                  onSaved={pageId ? () => void reloadDetail(pageId) : undefined}
                />
              ) : (
                <KnowledgeHome
                  notebooks={notebooks}
                  projects={projectRollups.filter((p) => p.id !== 'inbox')}
                  selectedNotebookId={notebookId ?? null}
                  onCreateNotebook={handleCreateNotebook}
                  onCreatePage={handleCreatePage}
                  onOpenPage={(id, nbId) =>
                    navigate(`/workspace/${nbId}/${id}`)
                  }
                  onOpenNotebook={(nbId) => navigate(`/workspace/${nbId}`)}
                  onChat={handleChatWithContext}
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

function KnowledgeHome({
  notebooks,
  projects,
  selectedNotebookId,
  onCreateNotebook,
  onCreatePage,
  onOpenPage,
  onOpenNotebook,
  onChat,
  onResearchNotebook,
  onNotebookUpdated,
}: {
  notebooks: Notebook[];
  projects: { id: string; name: string }[];
  selectedNotebookId: string | null;
  onCreateNotebook: (title: string, projectId?: string | null) => Promise<void>;
  onCreatePage: (notebookId: string) => Promise<void>;
  onOpenPage: (id: string, notebookId: string) => void;
  onOpenNotebook: (notebookId: string) => void;
  onChat: (id: string, notebookId?: string, projectId?: string | null) => void;
  onResearchNotebook: (notebookId: string) => void;
  onNotebookUpdated: () => void;
}) {
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('none');
  const { pages: recent, loading } = useRecentPages();
  const { hits, searching, search } = usePageSearch();
  const activeNotebook = notebooks.find((n) => n.id === selectedNotebookId);
  const { pages: activePages } = usePages(selectedNotebookId);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(query), 180);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const saveNotebook = async () => {
    if (!title.trim()) return;
    try {
      await onCreateNotebook(
        title.trim(),
        projectId === 'none' ? null : projectId,
      );
      setCreateOpen(false);
      setTitle('');
    } catch {
      toast.error('Could not create notebook.');
    }
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
              Knowledge
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {activeNotebook?.title ?? 'Your knowledge, connected'}
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

        <div className="relative max-w-2xl">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your pages and research…"
            className="h-11 pl-9"
          />
          {searching && (
            <span className="absolute right-3 top-3 text-xs text-muted-foreground">
              Searching…
            </span>
          )}
        </div>

        {query.trim() ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Search results</h2>
            {hits.length ? (
              hits.map((hit) => (
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
              ))
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
                      {page.title || 'Untitled'}
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

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock3Icon className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Recently updated</h2>
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">
                  Loading recent pages…
                </p>
              ) : recent.length ? (
                <div className="divide-y rounded-lg border bg-card">
                  {recent.map((page) => (
                    <div key={page.id} className="flex items-center gap-3 p-3">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onOpenPage(page.id, page.notebook_id)}
                      >
                        <span className="block truncate text-sm font-medium">
                          {page.title || 'Untitled'}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {page.notebook_title} · Updated{' '}
                          {new Date(
                            page.updated_at * 1000,
                          ).toLocaleDateString()}
                        </span>
                      </button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onChat(page.id, page.notebook_id, page.project_id)
                        }
                      >
                        <FlaskConicalIcon className="mr-1.5 size-3.5" />
                        Ask Chat
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your latest notes and Chat-generated research will show up
                  here.
                </p>
              )}
            </section>
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
