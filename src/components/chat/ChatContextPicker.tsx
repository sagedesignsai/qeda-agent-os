/**
 * components/chat/ChatContextPicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets the user bind a chat to workspace context — a page or a whole notebook —
 * so "chat with this notebook" is a first-class flow. Renders as a small chip
 * in the chat header; the popover lists notebooks and their pages.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import type { ChatContext, Notebook, Page } from '@/main/ipc/channels';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  BookOpenIcon,
  FileTextIcon,
  XIcon,
  LibraryIcon,
  ChevronDownIcon,
} from 'lucide-react';

interface ChatContextPickerProps {
  value?: ChatContext;
  onChange: (context: ChatContext | undefined) => void;
}

export function ChatContextPicker({ value, onChange }: ChatContextPickerProps) {
  const [open, setOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pages, setPages] = useState<Page[]>([]);

  useEffect(() => {
    if (!open) return;
    void window.electron.ipc
      .invoke<Notebook[]>('notebooks:list')
      .then((data) => setNotebooks(data ?? []))
      .catch(() => setNotebooks([]));
  }, [open]);

  // Load pages for the selected notebook (or the notebook of a bound page).
  useEffect(() => {
    if (!open || !value?.notebookId) return;
    void window.electron.ipc
      .invoke<Page[]>('pages:list', { notebookId: value.notebookId })
      .then((data) => setPages(data ?? []))
      .catch(() => setPages([]));
  }, [open, value?.notebookId]);

  const label = value
    ? value.pageId
      ? 'Page context'
      : 'Notebook context'
    : 'No context';

  return (
    <div className="ml-1 flex items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={
              value
                ? 'h-6 gap-1 px-2 text-[11px] text-primary'
                : 'h-6 gap-1 px-2 text-[11px] text-muted-foreground'
            }
            title="Bind this chat to a page or notebook"
          >
            {value?.pageId ? (
              <FileTextIcon className="h-3 w-3" />
            ) : (
              <BookOpenIcon className="h-3 w-3" />
            )}
            {label}
            <ChevronDownIcon className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <LibraryIcon className="h-3 w-3" /> Chat with your knowledge
          </div>
          {notebooks.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              No notebooks yet — create one in the Workspace tab.
            </p>
          )}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {notebooks.map((notebook) => (
              <div key={notebook.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                  onClick={() => onChange({ notebookId: notebook.id })}
                >
                  <BookOpenIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{notebook.title}</span>
                  {value?.notebookId === notebook.id && (
                    <XIcon className="h-3 w-3 rotate-45 text-primary" />
                  )}
                </button>
                {value?.notebookId === notebook.id && (
                  <div className="ml-5 border-l pl-2">
                    {pages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-accent"
                        onClick={() => onChange({ pageId: page.id })}
                      >
                        <FileTextIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{page.title}</span>
                        {value?.pageId === page.id && (
                          <span className="text-primary">•</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-6 w-full text-[11px] text-muted-foreground"
              onClick={() => onChange(undefined)}
            >
              Clear context
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Clear chat context"
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
