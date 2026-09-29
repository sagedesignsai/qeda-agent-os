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
  PromptInputSubmit,
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
import {
  isDirectCommandInput,
  isInteractiveCommand,
} from '@/lib/terminal-input';
import { WorkflowsDialog } from '@/components/terminal/WorkflowsDialog';
import { TerminalHistoryDialog } from '@/components/terminal/TerminalHistoryDialog';
import {
  addCommandHistory,
  getHistorySuggestion,
} from '@/lib/terminal-history';
import {
  AlertTriangleIcon,
  BookOpenIcon,
  ClockIcon,
  GitBranchIcon,
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
  /** Active git branch name (if any). */
  gitBranch?: string | null;
}

export function TerminalGoalInput({
  onSubmit,
  onRunInShell,
  isRunning = false,
  disabled = false,
  className,
  prefill,
  cwd,
  gitBranch,
}: TerminalGoalInputProps) {
  const [text, setText] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [interactivePrompt, setInteractivePrompt] = useState<string | null>(
    null,
  );

  // Adopt an external prefill whenever it changes identity.
  useEffect(() => {
    if (prefill !== undefined) setText(prefill);
  }, [prefill]);

  // A leading ! or $ means "run this directly", mirroring Warp's convention of
  // letting the shell handle what you type instead of routing it to the agent.
  const isCommand = isDirectCommandInput(text);

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

  return (
    <PromptInput onSubmit={handleSubmit} className={cn('font-mono', className)}>
      <PromptInputBody>
        {/* Terminal-flavored rich prompt header (Warp Pillar 2) */}
        <div className="flex items-center justify-between px-3 pt-2">
          <div className="flex items-center gap-2 min-w-0">
            <TerminalIcon
              className={cn(
                'size-3.5 shrink-0',
                isCommand ? 'text-sky-400' : 'text-emerald-400',
              )}
            />
            <span className="text-xs text-muted-foreground/75 shrink-0">
              {isCommand ? 'command' : 'goal'}
            </span>
            <span className="text-muted-foreground/45 shrink-0">›</span>
            {isCommand && (
              <Badge
                variant="outline"
                className="h-4 border-sky-700/40 bg-sky-900/60 px-1.5 font-mono text-[9px] uppercase tracking-wide text-sky-300 shrink-0"
              >
                runs directly
              </Badge>
            )}
          </div>

          {/* Rich prompt metadata: path and git branch */}
          {(cwd || gitBranch) && (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/75 truncate pl-2">
              {cwd && (
                <span className="truncate max-w-[220px]" title={cwd}>
                  {cwd.replace(/^\/home\/[^/]+/, '~')}
                </span>
              )}
              {gitBranch && (
                <Badge
                  variant="outline"
                  className="h-3.5 border-purple-700/40 bg-purple-950/40 px-1 font-mono text-[9px] text-purple-300 gap-1 shrink-0"
                >
                  <GitBranchIcon className="size-2.5" />
                  {gitBranch}
                </Badge>
              )}
            </div>
          )}
        </div>

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
                  addCommandHistory(cmd, cwd);
                  onSubmit(cmd);
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
          className="min-h-[52px] resize-none pl-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60"
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

      <PromptInputFooter className="justify-between">
        <PromptInputTools>
          {/* Preset goals popover */}
          <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-[11px] font-sans text-muted-foreground/75 hover:text-muted-foreground"
                disabled={isRunning}
              >
                <ZapIcon className="size-3" />
                Quick goals
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
          >
            <BookOpenIcon className="size-3 text-emerald-400" />
            Workflows
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
            History
            <kbd className="font-mono text-[9px] text-muted-foreground/60 bg-muted/60 px-1 rounded ml-0.5">
              ^R
            </kbd>
          </Button>
        </PromptInputTools>

        <PromptInputSubmit
          status={isRunning ? 'streaming' : undefined}
          disabled={!text.trim() && !isRunning}
        />
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
