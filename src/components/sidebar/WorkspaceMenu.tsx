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
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useNotebooks, usePages } from '@/hooks/use-workspace';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeftIcon,
  FileTextIcon,
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
  const { pages, loading, setPages } = usePages(activeNotebookId ?? null);

  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [notebookTitle, setNotebookTitle] = useState('');

  const reloadPages = async (notebookId: string) => {
    try {
      const list = await window.electron.ipc.invoke<Page[]>('pages:list', {
        notebookId,
      });
      setPages(list ?? []);
    } catch {
      // Best-effort.
    }
  };

  // ── Notebook actions ──────────────────────────────────────────────────────

  const submitNotebook = async () => {
    const title = notebookTitle.trim();
    setNotebookTitle('');
    setCreatingNotebook(false);
    if (!title) return;
    try {
      const notebook = await window.electron.ipc.invoke<{ id: string }>(
        'notebooks:create',
        { title },
      );
      await reloadNotebooks();
      navigate(`/workspace/${notebook.id}`);
    } catch {
      toast.error('Failed to create notebook.');
    }
  };

  const renameNotebook = async (id: string, current: string) => {
    const title = window.prompt('Rename notebook', current);
    if (!title?.trim()) return;
    await window.electron.ipc.invoke('notebooks:update', {
      id,
      title: title.trim(),
    });
    void reloadNotebooks();
  };

  const deleteNotebook = async (id: string) => {
    if (!window.confirm('Delete this notebook and all its pages?')) return;
    await window.electron.ipc.invoke('notebooks:delete', { id });
    if (activeNotebookId === id) navigate('/workspace');
    void reloadNotebooks();
    toast.success('Notebook deleted.');
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
      navigate(`/workspace/${notebookId}/${page.id}`);
    } catch {
      toast.error('Failed to create page.');
    }
  };

  const renamePage = async (id: string, current: string) => {
    const title = window.prompt('Rename page', current);
    if (!title?.trim()) return;
    await window.electron.ipc.invoke('pages:rename', {
      id,
      title: title.trim(),
    });
    if (activeNotebookId) void reloadPages(activeNotebookId);
  };

  const deletePage = async (id: string) => {
    if (!window.confirm('Delete this page?')) return;
    await window.electron.ipc.invoke('pages:delete', { id });
    if (activePageId === id && activeNotebookId) {
      navigate(`/workspace/${activeNotebookId}`);
    }
    if (activeNotebookId) void reloadPages(activeNotebookId);
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

  const orderedPages = [...pages].sort((a, b) => a.sort_order - b.sort_order);

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
            <div className="px-1 pt-1">
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
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {notebooks.length === 0 && (
        <p className="px-4 py-2 text-xs text-muted-foreground">
          No notebooks yet. Create one to start writing.
        </p>
      )}

      {notebooks.map((notebook) => {
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
                    onClick={() => navigate(`/workspace/${notebook.id}`)}
                  >
                    <NotebookIcon />
                    <span>{notebook.title}</span>
                  </SidebarMenuButton>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label="Notebook actions">
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
                          void renameNotebook(notebook.id, notebook.title)
                        }
                      >
                        <PencilIcon className="mr-2 h-3.5 w-3.5" />
                        <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => void deleteNotebook(notebook.id)}
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

                {isActiveNotebook &&
                  orderedPages.map((page) => (
                    <SidebarMenuItem key={page.id}>
                      <SidebarMenuButton
                        size="sm"
                        isActive={page.id === activePageId}
                        tooltip={page.title || 'Untitled'}
                        onClick={() =>
                          navigate(`/workspace/${notebook.id}/${page.id}`)
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
                            onSelect={() => void createPage(notebook.id, page.id)}
                          >
                            <PlusIcon className="mr-2 h-3.5 w-3.5" />
                            <span>Add sub-page</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void renamePage(page.id, page.title)}
                          >
                            <PencilIcon className="mr-2 h-3.5 w-3.5" />
                            <span>Rename</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => void deletePage(page.id)}
                          >
                            <TrashIcon className="mr-2 h-3.5 w-3.5" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}

                {isActiveNotebook && !loading && pages.length === 0 && (
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
    </SidebarContent>
  );
}
