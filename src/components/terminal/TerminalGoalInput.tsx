/**
 * components/terminal/TerminalGoalInput.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The goal input bar at the bottom of the terminal page.
 *
 * Uses the existing PromptInput ai-element for consistency with ChatInput.
 * Adds a terminal-flavored prefix and a preset goal quick-select popover.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isInteractiveCommand } from '@/lib/terminal-input';
import { WorkflowsDialog } from '@/components/terminal/WorkflowsDialog';
import { TerminalHistoryDialog } from '@/components/terminal/TerminalHistoryDialog';
import {
  addCommandHistory,
  getHistorySuggestion,
} from '@/lib/terminal-history';
import {
  AlertTriangleIcon,
  BotIcon,
  BookOpenIcon,
  ChevronUpIcon,
  ClockIcon,
  FolderIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  SearchIcon,
  SquareIcon,
  TerminalIcon,
  ZapIcon,
} from 'lucide-react';

// ─── Preset goals ─────────────────────────────────────────────────────────────

const PRESET_GOALS: { label: string; goal: string; tag: string }[] = [
  {
    label: 'What is this folder?',
    goal: 'Explore the current directory and summarize what this project is, its structure, and key files.',
    tag: 'explore',
  },
  {
    label: 'Check disk usage',
    goal: 'Show disk usage by folder in the current directory, sorted by size.',
    tag: 'system',
  },
  {
    label: 'Find large files',
    goal: 'Find files larger than 50MB in the current directory and its subdirectories.',
    tag: 'system',
  },
  {
    label: 'Fix sound issues',
    goal: 'Diagnose and attempt to fix sound/audio issues on this Linux system.',
    tag: 'diagnose',
  },
  {
    label: 'Git status & log',
    goal: 'Show git status, recent commits, and any uncommitted changes in the current repo.',
    tag: 'git',
  },
  {
    label: 'List running processes',
    goal: 'Show the top CPU and memory consuming processes currently running.',
    tag: 'system',
  },
  {
    label: 'Check Node.js setup',
    goal: 'Check Node.js version, npm version, and list globally installed packages.',
    tag: 'dev',
  },
  {
    label: 'Find TODO comments',
    goal: 'Search for TODO, FIXME, and HACK comments in all source files in the current directory.',
    tag: 'dev',
  },
];

const TAG_COLORS: Record<string, string> = {
  explore: 'bg-sky-900/60 text-sky-300 border-sky-700/40',
  system: 'bg-orange-900/60 text-orange-300 border-orange-700/40',
  diagnose: 'bg-rose-900/60 text-rose-300 border-rose-700/40',
  git: 'bg-purple-900/60 text-purple-300 border-purple-700/40',
  dev: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface TerminalGoalInputProps {
  onSubmit: (goal: string) => void;
  onRunInShell?: (cmd: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Text pushed in from outside (e.g. "Use" on a proposed fix). Changing this
   * replaces the composer contents; the user still presses Enter to run it.
   */
  prefill?: string;
  /** Working directory to display in the rich prompt. */
  cwd?: string;
  /** Git repository root, if the current directory is inside a repository. */
  gitRoot?: string | null;
  /** Active git branch name (if any). */
  gitBranch?: string | null;
  changedFiles?: number;
  additions?: number;
  deletions?: number;
  onCwdChange?: (cwd: string) => void;
}

export function TerminalGoalInput({
  onSubmit,
  onRunInShell,
  onStop,
  isRunning = false,
  disabled = false,
  className,
  prefill,
  cwd,
  gitRoot,
  gitBranch,
  changedFiles = 0,
  additions = 0,
  deletions = 0,
  onCwdChange,
}: TerminalGoalInputProps) {
  const [text, setText] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directories, setDirectories] = useState<string[]>([]);
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [interactivePrompt, setInteractivePrompt] = useState<string | null>(
    null,
  );

  // Adopt an external prefill whenever it changes identity.
  useEffect(() => {
    if (prefill !== undefined) setText(prefill);
  }, [prefill]);

  useEffect(() => {
    if (!directoryPickerOpen || !cwd) return;
    let cancelled = false;
    setIsLoadingDirectories(true);
    setDirectoryError(null);
    void window.electron.ipc
      .invoke<{ parentDir: string | null; directories: string[] }>(
        'terminal:list-directories',
        { cwd },
      )
      .then((result) => {
        if (cancelled) return null;
        setParentDir(result.parentDir);
        setDirectories(result.directories);
        return null;
      })
      .catch(() => {
        if (!cancelled) setDirectoryError('Could not read this directory.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDirectories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [directoryPickerOpen, cwd]);

  // A leading ! or $ means "run this directly", mirroring Warp's convention of
  // letting the shell handle what you type instead of routing it to the agent.
  const isDirectMode = /^[!$]\s?/.test(text.trimStart());

  // Ghost text autosuggestion suffix from command history
  const suggestion = getHistorySuggestion(text);

  const handleSubmit = (message: PromptInputMessage) => {
    const goal = message.text.trim();
    if (!goal || disabled || isRunning) return;

    // Check if command requires interactive TTY input
    const rawCmd = goal.replace(/^[!$]\s?/, '').trim();
    if (isInteractiveCommand(rawCmd)) {
      setInteractivePrompt(rawCmd);
      return;
    }

    addCommandHistory(goal, cwd);
    onSubmit(goal);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+R opens visual command history palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      setHistoryOpen(true);
      return;
    }

    // Tab accepts ghost text auto-suggestion
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setText(text + suggestion);
      return;
    }

    // ArrowRight at end of line accepts ghost text
    if (e.key === 'ArrowRight' && suggestion) {
      const target = e.currentTarget;
      if (target.selectionStart === text.length) {
        e.preventDefault();
        setText(text + suggestion);
      }
    }
  };

  const selectPreset = (goal: string) => {
    setText(goal);
    setPresetsOpen(false);
  };

  const toggleDirectMode = () => {
    setText((current) => {
      if (/^[!$]\s?/.test(current.trimStart())) {
        return current.trimStart().replace(/^[!$]\s?/, '');
      }
      return `! ${current}`;
    });
  };

  const chooseDirectory = (nextCwd: string) => {
    setDirectoryPickerOpen(false);
    setDirectorySearch('');
    onCwdChange?.(nextCwd);
  };

  const filteredDirectories = directories.filter((directory) =>
    directory
      .split(/[\\/]/)
      .filter(Boolean)
      .at(-1)
      ?.toLocaleLowerCase()
      .includes(directorySearch.trim().toLocaleLowerCase()),
  );

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className={cn(
        'relative isolate rounded-md border border-border/60 bg-card/70 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
        isRunning && 'terminal-composer-running',
        className,
      )}
    >
      <PromptInputBody className="bg-transparent">
        {/* Interactive TTY warning prompt banner */}
        {interactivePrompt && (
          <div className="mx-2 mb-2 mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium text-amber-300">
                <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-400" />
                <span>Interactive TTY Command Detected</span>
              </div>
              <button
                type="button"
                onClick={() => setInteractivePrompt(null)}
                className="text-muted-foreground hover:text-foreground text-xs px-1"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
                {interactivePrompt}
              </code>{' '}
              requires interactive terminal input (prompts, passwords, or curses
              UI) and may hang in block mode.
            </p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const cmd = interactivePrompt;
                  setInteractivePrompt(null);
                  addCommandHistory(`!${cmd}`, cwd);
                  onSubmit(`!${cmd}`);
                  setText('');
                }}
              >
                Run in Block Mode Anyway
              </Button>
              <Button
                type="button"
                size="xs"
                className="h-6 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  const cmd = interactivePrompt;
                  setInteractivePrompt(null);
                  setText('');
                  onRunInShell?.(cmd);
                }}
              >
                Run in Shell Mode ↗
              </Button>
            </div>
          </div>
        )}

        <PromptInputTextarea
          placeholder="Describe a goal, or start with ! to run a command…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isRunning}
          className="min-h-[64px] resize-none border-0 bg-transparent px-3 py-3 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0"
        />

        {/* Ghost text autosuggestion indicator */}
        {suggestion && (
          <div className="flex items-center gap-1.5 px-3 pb-1 font-mono text-[11px] text-muted-foreground/60">
            <span className="opacity-40">suggest:</span>
            <span className="text-foreground/80">{text}</span>
            <span className="font-semibold text-sky-400">{suggestion}</span>
            <span className="ml-1 rounded bg-muted/60 px-1 font-sans text-[9px] text-muted-foreground/80">
              Tab or →
            </span>
          </div>
        )}
      </PromptInputBody>

      <PromptInputFooter className="flex-wrap justify-between border-t border-border/40 bg-background/40 px-2 py-1.5">
        <PromptInputTools className="flex-wrap gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              'size-7 text-muted-foreground/75 hover:text-foreground',
              isDirectMode && 'bg-muted text-foreground',
            )}
            onClick={toggleDirectMode}
            disabled={disabled || isRunning}
            aria-label={
              isDirectMode ? 'Switch to goal mode' : 'Switch to command mode'
            }
            aria-pressed={isDirectMode}
            title={isDirectMode ? 'Command mode' : 'Goal mode'}
          >
            {isDirectMode ? (
              <TerminalIcon className="size-3.5" />
            ) : (
              <BotIcon className="size-3.5" />
            )}
          </Button>

          {/* Preset goals popover */}
          <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-[11px] font-sans text-muted-foreground/75 hover:text-muted-foreground"
                disabled={isRunning}
                title="Choose a common goal"
              >
                <ZapIcon className="size-3" />
                <span className="hidden sm:inline">Quick goals</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-80 border-border bg-background p-1.5"
            >
              <p className="mb-1.5 px-2 font-sans text-[10px] uppercase tracking-wide text-muted-foreground/75">
                Common goals
              </p>
              <div className="flex flex-col gap-0.5">
                {PRESET_GOALS.map((preset) => (
                  <button
                    key={preset.label}
                    className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/80"
                    onClick={() => selectPreset(preset.goal)}
                  >
                    <Badge
                      className={cn(
                        'h-4 shrink-0 border px-1.5 text-[9px] font-mono uppercase tracking-wide',
                        TAG_COLORS[preset.tag] ?? '',
                      )}
                      variant="outline"
                    >
                      {preset.tag}
                    </Badge>
                    <span className="font-sans text-xs text-muted-foreground group-hover:text-foreground">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Warp-style Workflows (Pillar 4) */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-[11px] font-sans text-muted-foreground/75 hover:text-muted-foreground"
            disabled={isRunning}
            onClick={() => setWorkflowsOpen(true)}
            title="Open workflows"
          >
            <BookOpenIcon className="size-3 text-emerald-400" />
            <span className="hidden sm:inline">Workflows</span>
          </Button>

          {/* Warp-style Visual History (Pillar 3 - Ctrl+R) */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-[11px] font-sans text-muted-foreground/75 hover:text-muted-foreground"
            disabled={isRunning}
            onClick={() => setHistoryOpen(true)}
            title="Search command history (Ctrl+R)"
          >
            <ClockIcon className="size-3 text-sky-400" />
            <span className="hidden sm:inline">History</span>
            <kbd className="ml-0.5 rounded bg-muted/60 px-1 font-mono text-[9px] text-muted-foreground/60 max-sm:hidden">
              ^R
            </kbd>
          </Button>
        </PromptInputTools>

        <div className="ml-auto flex min-w-0 items-center gap-1">
          {cwd && (
            <Popover
              open={directoryPickerOpen}
              onOpenChange={setDirectoryPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 min-w-0 max-w-[min(52vw,360px)] justify-start gap-1.5 px-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  disabled={disabled || isRunning}
                  title={`Change directory: ${cwd}`}
                >
                  <FolderIcon className="size-3 shrink-0" />
                  <span className="min-w-0 truncate">
                    {cwd.replace(/^\/home\/[^/]+/, '~')
                      ? cwd.replace(/^\/home\/[^/]+/, '~')
                      : cwd}
                  </span>
                  {gitRoot && (
                    <>
                      <span className="shrink-0 text-muted-foreground/45">
                        ·
                      </span>
                      <GitBranchIcon className="size-3 shrink-0" />
                      <span className="max-w-24 shrink-0 truncate">
                        {gitBranch ||
                          gitRoot.split(/[\\/]/).filter(Boolean).pop()}
                      </span>
                    </>
                  )}
                  {gitRoot && changedFiles > 0 && (
                    <span className="ml-1 hidden shrink-0 items-center gap-1 tabular-nums md:flex">
                      <span className="text-muted-foreground/60">
                        {changedFiles}
                      </span>
                      <span className="text-emerald-500">+{additions}</span>
                      <span className="text-rose-500">-{deletions}</span>
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                className="w-[min(360px,calc(100vw-32px))] gap-1.5 border-border bg-popover p-1.5"
              >
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2">
                  <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={directorySearch}
                    onChange={(event) => setDirectorySearch(event.target.value)}
                    placeholder="Search directories..."
                    className="h-8 min-w-0 flex-1 bg-transparent font-sans text-xs outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {parentDir && (
                    <button
                      type="button"
                      onClick={() => chooseDirectory(parentDir)}
                      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left font-sans text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <ChevronUpIcon className="size-3.5 shrink-0" />
                      <span>.. (Parent Directory)</span>
                    </button>
                  )}
                  {isLoadingDirectories ? (
                    <div className="flex h-12 items-center justify-center text-muted-foreground">
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    </div>
                  ) : directoryError ? (
                    <p className="px-2 py-3 font-sans text-xs text-destructive">
                      {directoryError}
                    </p>
                  ) : filteredDirectories.length ? (
                    filteredDirectories.map((directory) => (
                      <button
                        key={directory}
                        type="button"
                        onClick={() => chooseDirectory(directory)}
                        className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left font-sans text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
                        title={directory}
                      >
                        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {directory.split(/[\\/]/).filter(Boolean).pop()}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-2 py-3 font-sans text-xs text-muted-foreground">
                      {directorySearch
                        ? 'No matching directories.'
                        : 'No subdirectories.'}
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {isRunning && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onStop}
              disabled={!onStop}
              aria-label="Stop running task"
              title="Stop running task"
            >
              <SquareIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </PromptInputFooter>

      <WorkflowsDialog
        open={workflowsOpen}
        onOpenChange={setWorkflowsOpen}
        onSelectWorkflow={(cmd, runDirectly) => {
          if (runDirectly) {
            onSubmit(`!${cmd}`);
          } else {
            setText(`!${cmd}`);
          }
        }}
      />

      <TerminalHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onSelectCommand={(cmd, runDirectly) => {
          if (runDirectly) {
            onSubmit(
              cmd.startsWith('!') || cmd.startsWith('$') ? cmd : `!${cmd}`,
            );
          } else {
            setText(
              cmd.startsWith('!') || cmd.startsWith('$') ? cmd : `!${cmd}`,
            );
          }
        }}
      />
    </PromptInput>
  );
}
