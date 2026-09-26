/**
 * components/workspace/WorkspaceSidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Left panel of the Workspace page: global page search, notebook list with
 * inline create/rename/delete, nested page tree, and tag filtering.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import type { Notebook, Page, SearchHit } from '@/main/ipc/channels';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SearchIcon,
  PlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
  NotebookIcon,
  FileTextIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  LoaderIcon,
  TagIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkspaceSidebarProps {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  pages: Page[];
  activePageId: string | null;
  loading: boolean;
  searchQuery: string;
  searchHits: SearchHit[];
  searching: boolean;
  tags: { name: string; count: number }[];
  activeTag: string | null;
  onSearch: (query: string) => void;
  onSearchSelect: (pageId: string) => void;
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: (title: string) => void;
  onRenameNotebook: (id: string, title: string) => void;
  onDeleteNotebook: (id: string) => void;
  onSelectPage: (id: string) => void;
  onCreatePage: (notebookId: string, parentPageId?: string) => void;
  onRenamePage: (id: string, title: string) => void;
  onDeletePage: (id: string) => void;
  onSelectTag: (tag: string | null) => void;
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [notebookTitle, setNotebookTitle] = useState('');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  const submitNotebook = () => {
    const title = notebookTitle.trim();
    if (title) props.onCreateNotebook(title);
    setNotebookTitle('');
    setCreatingNotebook(false);
  };

  const toggleExpanded = (id: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Filter pages to the active tag (title match as a fallback filter). */
  const visiblePages = props.activeTag
    ? props.pages // tag filtering happens in the parent via relatedPages/tags
    : props.pages;

  const renderPageRow = (page: Page, depth: number) => {
    const children = props.pages.filter((p) => p.parent_page === page.id);
    const expanded = expandedPages.has(page.id);
    return (
      <div key={page.id}>
        <div
          className={cn(
            'group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm',
            props.activePageId === page.id
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-foreground/80 hover:bg-accent',
          )}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleExpanded(page.id)}
              className="flex h-4 w-4 items-center justify-center text-muted-foreground"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <button
            type="button"
            className="flex-1 truncate text-left"
            onClick={() => props.onSelectPage(page.id)}
          >
            {page.title}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                aria-label="Page actions"
              >
                <MoreHorizontalIcon className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => props.onCreatePage(page.notebook_id, page.id)}>
                <PlusIcon className="h-3.5 w-3.5" /> Add sub-page
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => {
                const title = window.prompt('Rename page', page.title);
                if (title?.trim()) props.onRenamePage(page.id, title.trim());
              }}>
                <PencilIcon className="h-3.5 w-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={() => props.onDeletePage(page.id)}>
                <TrashIcon className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {expanded && children.map((child) => renderPageRow(child, depth + 1))}
      </div>
    );
  };

  const rootPages = props.pages.filter((p) => !p.parent_page);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search */}
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={props.searchQuery}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="Search pages…"
            className="h-8 pl-8 text-xs"
          />
          {props.searching && (
            <LoaderIcon className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {props.searchHits.length > 0 && (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background/60 p-1">
            {props.searchHits.map((hit) => (
              <button
                key={hit.page_id}
                type="button"
                className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                onClick={() => props.onSearchSelect(hit.page_id)}
              >
                <div className="font-medium">{hit.title}</div>
                <div className="truncate text-muted-foreground" dangerouslySetInnerHTML={{ __html: hit.snippet }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notebooks */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-1 flex items-center justify-between px-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notebooks</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setCreatingNotebook(true)}
            aria-label="New notebook"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {creatingNotebook && (
          <Input
            autoFocus
            value={notebookTitle}
            onChange={(e) => setNotebookTitle(e.target.value)}
            onBlur={submitNotebook}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNotebook();
              if (e.key === 'Escape') {
                setCreatingNotebook(false);
                setNotebookTitle('');
              }
            }}
            placeholder="Notebook name…"
            className="mb-1 h-7 text-xs"
          />
        )}

        {props.notebooks.map((notebook) => (
          <div key={notebook.id}>
            <div
              className={cn(
                'group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm',
                props.activeNotebookId === notebook.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-accent',
              )}
            >
              <NotebookIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => props.onSelectNotebook(notebook.id)}
              >
                {notebook.title}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground"
                    aria-label="Notebook actions"
                  >
                    <MoreHorizontalIcon className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => props.onCreatePage(notebook.id)}>
                    <PlusIcon className="h-3.5 w-3.5" /> New page
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => {
                    const title = window.prompt('Rename notebook', notebook.title);
                    if (title?.trim()) props.onRenameNotebook(notebook.id, title.trim());
                  }}>
                    <PencilIcon className="h-3.5 w-3.5" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onSelect={() => props.onDeleteNotebook(notebook.id)}>
                    <TrashIcon className="h-3.5 w-3.5" /> Delete notebook
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {props.activeNotebookId === notebook.id && (
              <div className="pb-1">
                {props.loading && (
                  <div className="flex items-center gap-2 px-6 py-1 text-xs text-muted-foreground">
                    <LoaderIcon className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                )}
                {rootPages.map((page) => renderPageRow(page, 1))}
                {visiblePages.length === 0 && !props.loading && (
                  <button
                    type="button"
                    className="ml-6 mt-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => props.onCreatePage(notebook.id)}
                  >
                    + First page
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-6 w-full justify-start gap-1 px-6 text-xs text-muted-foreground"
                  onClick={() => props.onCreatePage(notebook.id)}
                >
                  <PlusIcon className="h-3 w-3" /> New page
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tags */}
      {props.tags.length > 0 && (
        <div className="shrink-0 border-t p-3">
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <TagIcon className="h-3 w-3" /> Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {props.tags.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() => props.onSelectTag(props.activeTag === tag.name ? null : tag.name)}
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono text-[10px]',
                  props.activeTag === tag.name
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                #{tag.name} {tag.count}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
