/**
 * components/chat/ChatContextPicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lets the user bind a chat to workspace context — a page or a whole notebook —
 * so "chat with this notebook" is a first-class flow. Renders as a small chip
 * in the chat header; the popover lists notebooks and their pages.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import type { ChatContext, Notebook, Page, Task } from '@/main/ipc/channels';
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
  CheckSquareIcon,
  ListTodoIcon,
} from 'lucide-react';

interface ChatContextPickerProps {
  value?: ChatContext;
  onChange: (context: ChatContext | undefined) => void;
}

export function ChatContextPicker({ value, onChange }: ChatContextPickerProps) {
  const [open, setOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!open) return;
    void window.electron.ipc
      .invoke<Notebook[]>('notebooks:list')
      .then((data) => setNotebooks(data ?? []))
      .catch(() => setNotebooks([]));

    void window.electron.ipc
      .invoke<Task[]>('tasks:list')
      .then((data) => setTasks((data ?? []).filter((t) => t.status !== 'done')))
      .catch(() => setTasks([]));
  }, [open]);

  // Load pages for the selected notebook (or the notebook of a bound page).
  useEffect(() => {
    if (!open || !value?.notebookId) return;
    void window.electron.ipc
      .invoke<Page[]>('pages:list', { notebookId: value.notebookId })
      .then((data) => setPages(data ?? []))
      .catch(() => setPages([]));
  }, [open, value?.notebookId]);

  // Keep active task fresh
  useEffect(() => {
    if (!value?.taskId) {
      setActiveTask(null);
      return;
    }
    void window.electron.ipc
      .invoke<Task | null>('tasks:get', { id: value.taskId })
      .then((t) => setActiveTask(t ?? null))
      .catch(() => setActiveTask(null));
  }, [value?.taskId]);

  const label = value
    ? value.taskId
      ? activeTask
        ? `Task: ${activeTask.title.length > 18 ? `${activeTask.title.slice(0, 16)}…` : activeTask.title}`
        : 'Task context'
      : value.pageId
        ? 'Page context'
        : value.notebookId
          ? 'Notebook context'
          : 'Context'
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
            title="Bind this chat to a task, page, or notebook"
          >
            {value?.taskId ? (
              <CheckSquareIcon className="h-3 w-3 text-amber-500" />
            ) : value?.pageId ? (
              <FileTextIcon className="h-3 w-3" />
            ) : (
              <BookOpenIcon className="h-3 w-3" />
            )}
            {label}
            <ChevronDownIcon className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          {/* Tasks Section */}
          <div className="mb-1.5">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ListTodoIcon className="h-3 w-3 text-amber-500" /> Tasks
            </div>
            {tasks.length === 0 ? (
              <p className="px-1 py-1 text-[11px] text-muted-foreground">
                No active tasks to bind.
              </p>
            ) : (
              <div className="max-h-36 space-y-0.5 overflow-y-auto">
                {tasks.slice(0, 6).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => {
                      onChange({
                        ...value,
                        taskId: task.id,
                        projectId: task.project_id ?? value?.projectId,
                      });
                      setOpen(false);
                    }}
                  >
                    <CheckSquareIcon
                      className={
                        value?.taskId === task.id
                          ? 'h-3.5 w-3.5 shrink-0 text-amber-500'
                          : 'h-3.5 w-3.5 shrink-0 text-muted-foreground'
                      }
                    />
                    <span className="flex-1 truncate">{task.title}</span>
                    {value?.taskId === task.id && (
                      <span className="text-xs font-semibold text-primary">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="my-1.5 border-t border-border/50" />

          {/* Notebooks & Pages Section */}
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <LibraryIcon className="h-3 w-3" /> Knowledge & Pages
            </div>
            {notebooks.length === 0 ? (
              <p className="px-1 py-1 text-[11px] text-muted-foreground">
                No notebooks yet.
              </p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto">
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
            )}
          </div>

          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-6 w-full text-[11px] text-muted-foreground"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
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
