/**
 * components/sidebar/WorkspaceMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Level-2 rail content for the Workspace section: notebooks and their page
 * tree, with create / rename / delete and a back row to the main menu.
 *
 * Selection is mirrored into the route (`/workspace/:notebookId/:pageId`), so
 * the Workspace page carries no tree panel of its own.
 *
 * Pages are listed flat with indentation reflecting their nesting (the rail is
 * too narrow for animated disclosure), which keeps the markup simple and avoids
 * nested interactive elements.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useNotebooks, usePages } from '@/hooks/use-workspace';
import { useProjects } from '@/hooks/use-projects';
import { useProjectScope } from '@/hooks/use-project-scope';
import type { Page } from '@/main/ipc/channels';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  ArrowLeftIcon,
  FileTextIcon,
  FolderInputIcon,
  MoreHorizontalIcon,
  NotebookIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react';
import { toast } from 'sonner';

export function WorkspaceMenu({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { notebookId: activeNotebookId, pageId: activePageId } = useParams<{
    notebookId?: string;
    pageId?: string;
  }>();

  const { notebooks, reload: reloadNotebooks } = useNotebooks();
  const {
    pages,
    loading,
    reload: reloadPages,
  } = usePages(activeNotebookId ?? null);
  const { projects } = useProjects();
  const { projectId, withScope } = useProjectScope();

  // Filter notebooks to active project if one is scoped, otherwise show all
  const filteredNotebooks = projectId
    ? notebooks.filter((n) => n.project_id === projectId)
    : notebooks;

  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [notebookTitle, setNotebookTitle] = useState('');
  // New work inherits the active `?project=` scope, like tasks and captures.
  const [notebookProjectId, setNotebookProjectId] = useState(
    projectId ?? 'none',
  );

  // ── Rename/delete dialogs (replaces window.prompt / window.confirm) ────
  const [renameNotebookOpen, setRenameNotebookOpen] = useState(false);
  const [renameNotebookId, setRenameNotebookId] = useState('');
  const [renameNotebookTitle, setRenameNotebookTitle] = useState('');
  const [deleteNotebookOpen, setDeleteNotebookOpen] = useState(false);
  const [deleteNotebookId, setDeleteNotebookId] = useState('');
  const [renamePageOpen, setRenamePageOpen] = useState(false);
  const [renamePageId, setRenamePageId] = useState('');
  const [renamePageTitle, setRenamePageTitle] = useState('');
  const [deletePageOpen, setDeletePageOpen] = useState(false);
  const [deletePageId, setDeletePageId] = useState('');
  const [deletePageDescendants, setDeletePageDescendants] = useState(0);

  // ── Inline page filter + keyboard nav ─────────────────────────────────
  const [pageFilter, setPageFilter] = useState('');
  const focusedPageIndex = useRef(0);
  const pageListRef = useRef<HTMLDivElement>(null);

  const orderedPages = [...pages].sort((a, b) => a.sort_order - b.sort_order);

  const filteredPages = orderedPages.filter((page) =>
    page.title.toLowerCase().includes(pageFilter.toLowerCase()),
  );

  const handlePageListKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (filteredPages.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedPageIndex.current =
        (focusedPageIndex.current + 1) % filteredPages.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedPageIndex.current =
        (focusedPageIndex.current - 1 + filteredPages.length) %
        filteredPages.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const page = filteredPages[focusedPageIndex.current];
      if (page && activeNotebookId) {
        navigate(withScope(`/workspace/${activeNotebookId}/${page.id}`));
      }
    }
  };

  useEffect(() => {
    setNotebookProjectId(projectId ?? 'none');
  }, [projectId]);

  // ── Notebook actions ──────────────────────────────────────────────────────

  const submitNotebook = useCallback(async () => {
    const title = notebookTitle.trim();
    setNotebookTitle('');
    setCreatingNotebook(false);
    if (!title) {
      toast.error('Notebook name is required.');
      return;
    }
    const duplicate = notebooks.find(
      (n) => n.title.trim().toLowerCase() === title.toLowerCase(),
    );
    if (duplicate) {
      toast.error(`A notebook named “${title}” already exists.`);
      return;
    }
    try {
      const notebook = await window.electron.ipc.invoke<{ id: string }>(
        'notebooks:create',
        { title, projectId: notebookProjectId === 'none' ? null : notebookProjectId },
      );
      await reloadNotebooks();
      navigate(withScope(`/workspace/${notebook.id}`));
      setNotebookProjectId(projectId ?? 'none');
      toast.success('Notebook created.');
    } catch {
      toast.error('Failed to create notebook.');
    }
  }, [notebooks, reloadNotebooks, projectId, withScope, navigate]);

  const openRenameNotebook = (id: string, current: string) => {
    setRenameNotebookId(id);
    setRenameNotebookTitle(current);
    setRenameNotebookOpen(true);
  };

  const submitRenameNotebook = async () => {
    const title = renameNotebookTitle.trim();
    if (!title) return;
    try {
      await window.electron.ipc.invoke('notebooks:update', {
        id: renameNotebookId,
        title,
      });
      setRenameNotebookOpen(false);
      setRenameNotebookTitle('');
      void reloadNotebooks();
      toast.success('Notebook renamed.');
    } catch {
      toast.error('Failed to rename notebook.');
    }
  };

  const openDeleteNotebook = (id: string) => {
    setDeleteNotebookId(id);
    setDeleteNotebookOpen(true);
  };

  const submitDeleteNotebook = async () => {
    try {
      await window.electron.ipc.invoke('notebooks:delete', {
        id: deleteNotebookId,
      });
      if (activeNotebookId === deleteNotebookId)
        navigate(withScope('/workspace'));
      setDeleteNotebookOpen(false);
      void reloadNotebooks();
      toast.success('Notebook deleted.');
    } catch {
      toast.error('Failed to delete notebook.');
    }
  };

  // ── Page actions ──────────────────────────────────────────────────────────

  const createPage = async (notebookId: string, parentPageId?: string) => {
    if (!notebookId) {
      toast.error('Create a notebook first.');
      return;
    }
    try {
      const page = await window.electron.ipc.invoke<Page>('pages:create', {
        notebookId,
        title: 'Untitled',
        parentPageId: parentPageId ?? null,
      });
      await reloadPages(notebookId);
      navigate(withScope(`/workspace/${notebookId}/${page.id}`));
    } catch {
      toast.error('Failed to create page.');
    }
  };

  const openRenamePage = (id: string, current: string) => {
    setRenamePageId(id);
    setRenamePageTitle(current);
    setRenamePageOpen(true);
  };

  const submitRenamePage = async () => {
    const title = renamePageTitle.trim();
    if (!title) return;
    try {
      await window.electron.ipc.invoke('pages:rename', {
        id: renamePageId,
        title,
      });
      setRenamePageOpen(false);
      setRenamePageTitle('');
      if (activeNotebookId) void reloadPages(activeNotebookId);
      toast.success('Page renamed.');
    } catch {
      toast.error('Failed to rename page.');
    }
  };

  const openDeletePage = (id: string) => {
    const descendants = descendantCount(id);
    setDeletePageDescendants(descendants);
    setDeletePageId(id);
    setDeletePageOpen(true);
  };

  const submitDeletePage = async () => {
    try {
      await window.electron.ipc.invoke('pages:delete', { id: deletePageId });
      if (activePageId === deletePageId && activeNotebookId) {
        navigate(withScope(`/workspace/${activeNotebookId}`));
      }
      setDeletePageOpen(false);
      if (activeNotebookId) void reloadPages(activeNotebookId);
      toast.success('Page deleted.');
    } catch {
      toast.error('Failed to delete page.');
    }
  };

  /** Move a page (and its subtree) into another notebook, as a top-level page. */
  const movePage = async (id: string, notebookId: string) => {
    try {
      await window.electron.ipc.invoke('pages:move', {
        id,
        notebookId,
        parentPageId: null,
      });
      if (activePageId === id) navigate(withScope(`/workspace/${notebookId}`));
      toast.success('Page moved.');
    } catch {
      toast.error('Failed to move page.');
    }
  };

  /** Number of pages below `id` (deleting a parent removes them all). */
  const descendantCount = (id: string): number => {
    let count = 0;
    const stack = [id];
    const seen = new Set<string>([id]);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const candidate of pages) {
        if (candidate.parent_page !== current || seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        count += 1;
        stack.push(candidate.id);
      }
    }
    return count;
  };

  /** Nesting depth of a page, for indentation. */
  const depthOf = (page: Page): number => {
    let depth = 0;
    let current = page;
    while (current.parent_page) {
      const parent = pages.find((p) => p.id === current.parent_page);
      if (!parent) break;
      depth += 1;
      current = parent;
    }
    return depth;
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
              <SidebarMenuButton
                size="sm"
                onClick={() => setCreatingNotebook(true)}
              >
                <PlusIcon />
                <span>New notebook</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {creatingNotebook && (
            <div className="px-1 pt-1 pb-2 space-y-2">
              <Input
                autoFocus
                value={notebookTitle}
                onChange={(e) => setNotebookTitle(e.target.value)}
                onBlur={() => void submitNotebook()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNotebook();
                  if (e.key === 'Escape') {
                    setCreatingNotebook(false);
                    setNotebookTitle('');
                  }
                }}
                placeholder="Notebook name…"
                className="h-7 text-xs"
              />
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Project (optional)
                </label>
                <Select
                  value={notebookProjectId}
                  onValueChange={setNotebookProjectId}
                >
                  <SelectTrigger className="h-7 text-xs border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="p-1 text-xs">
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
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {notebooks.length === 0 && (
        <p className="px-4 py-2 text-xs text-muted-foreground">
          No notebooks yet. Create one to start writing.
        </p>
      )}

      {activeNotebookId && (
        <div className="px-3 pb-2 space-y-1">
          <Input
            value={pageFilter}
            onChange={(e) => setPageFilter(e.target.value)}
            placeholder="Filter pages…"
            className="h-7 text-xs"
          />
        </div>
      )}

      {filteredNotebooks.map((notebook) => {
        const isActiveNotebook = notebook.id === activeNotebookId;
        return (
          <SidebarGroup key={notebook.id}>
            <SidebarGroupLabel>Notebook</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    isActive={isActiveNotebook}
                    onClick={() => navigate(withScope(`/workspace/${notebook.id}`))}
                  >
                    <NotebookIcon />
                    <span>{notebook.title}</span>
                  </SidebarMenuButton>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction
                        showOnHover
                        aria-label="Notebook actions"
                      >
                        <MoreHorizontalIcon />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right">
                      <DropdownMenuItem
                        onSelect={() => void createPage(notebook.id)}
                      >
                        <PlusIcon className="mr-2 h-3.5 w-3.5" />
                        <span>New page</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void openRenameNotebook(notebook.id, notebook.title)
                        }
                      >
                        <PencilIcon className="mr-2 h-3.5 w-3.5" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => void openDeleteNotebook(notebook.id)}
                      >
                        <TrashIcon className="mr-2 h-3.5 w-3.5" />
                        <span>Delete notebook</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {isActiveNotebook && loading && (
                    <span className="px-3 py-1 text-[11px] text-muted-foreground">
                      Loading pages…
                    </span>
                  )}
                </SidebarMenuItem>

                {isActiveNotebook && (
                  <div
                    ref={pageListRef}
                    onKeyDown={handlePageListKeyDown}
                    tabIndex={0}
                    className="outline-none"
                  >
                    {filteredPages.map((page) => (
                      <SidebarMenuItem key={page.id}>
                        <SidebarMenuButton
                          size="sm"
                          isActive={
                            page.id === activePageId ||
                            filteredPages[focusedPageIndex.current]?.id ===
                              page.id
                          }
                        tooltip={page.title || 'Untitled'}
                        onClick={() =>
                          navigate(withScope(`/workspace/${notebook.id}/${page.id}`))
                        }
                        style={{ paddingLeft: `${8 + depthOf(page) * 12}px` }}
                      >
                        <FileTextIcon />
                        <span>{page.title || 'Untitled'}</span>
                      </SidebarMenuButton>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction
                            showOnHover
                            aria-label="Page actions"
                          >
                            <MoreHorizontalIcon />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="right">
                          <DropdownMenuItem
                            onSelect={() =>
                              void createPage(notebook.id, page.id)
                            }
                          >
                            <PlusIcon className="mr-2 h-3.5 w-3.5" />
                            <span>Add sub-page</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              void openRenamePage(page.id, page.title)
                            }
                          >
                            <PencilIcon className="mr-2 h-3.5 w-3.5" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                          {notebooks.some((n) => n.id !== notebook.id) && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <FolderInputIcon className="mr-2 h-3.5 w-3.5" />
                                <span>Move to</span>
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {notebooks
                                  .filter((n) => n.id !== notebook.id)
                                  .map((target) => (
                                    <DropdownMenuItem
                                      key={target.id}
                                      onSelect={() =>
                                        void movePage(page.id, target.id)
                                      }
                                    >
                                      <NotebookIcon className="mr-2 h-3.5 w-3.5" />
                                      <span>{target.title}</span>
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => void openDeletePage(page.id)}
                          >
                            <TrashIcon className="mr-2 h-3.5 w-3.5" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                    ))}
                  </div>
                )}

                {isActiveNotebook &&
                  !loading &&
                  !pageFilter &&
                  filteredPages.length === 0 && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => void createPage(notebook.id)}
                    >
                      <PlusIcon />
                      <span>First page</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
      {/* ── Rename/delete dialogs ───────────────────────────────────────── */}
      <Dialog open={renameNotebookOpen} onOpenChange={setRenameNotebookOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="wm-rename-notebook-title">Name</Label>
            <Input
              id="wm-rename-notebook-title"
              value={renameNotebookTitle}
              onChange={(e) => setRenameNotebookTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRenameNotebook();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameNotebookOpen(false)}
              disabled={!renameNotebookTitle.trim()}
            >
              Cancel
            </Button>
            <Button onClick={submitRenameNotebook} disabled={!renameNotebookTitle.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteNotebookOpen} onOpenChange={setDeleteNotebookOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete notebook</DialogTitle>
            <DialogDescription>
              This will also delete every page in the notebook.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNotebookOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDeleteNotebook} className="text-destructive">
              Delete notebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renamePageOpen} onOpenChange={setRenamePageOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="wm-rename-page-title">Title</Label>
            <Input
              id="wm-rename-page-title"
              value={renamePageTitle}
              onChange={(e) => setRenamePageTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRenamePage();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenamePageOpen(false)}
              disabled={!renamePageTitle.trim()}
            >
              Cancel
            </Button>
            <Button onClick={submitRenamePage} disabled={!renamePageTitle.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deletePageOpen} onOpenChange={setDeletePageOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete page</DialogTitle>
            <DialogDescription>
              {deletePageDescendants > 0
                ? `This will also delete its ${deletePageDescendants} sub-page${
                    deletePageDescendants === 1 ? '' : 's'
                  }.`
                : 'This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitDeletePage} className="text-destructive">
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarContent>
  );
}
