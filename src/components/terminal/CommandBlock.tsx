/**
 * components/terminal/CommandBlock.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The core visual unit of the agentic terminal. Each CommandBlock represents
 * one shell command proposed/executed by the agent.
 *
 * State machine (mirrors TerminalBlock.status):
 *   pending  → approval card with approve / reject
 *   running  → animated spinner + live output stream placeholder
 *   done     → output with green exit-code badge, explain action
 *   error    → output with red exit-code badge, suggest-fix action
 *   skipped  → muted dismissal row
 *
 * Compound component pattern (matches existing ai-elements conventions):
 *   <CommandBlock>            context provider + outer shell
 *     <CommandBlockHeader>   status indicator + command line
 *     <CommandBlockThought>  collapsible agent reasoning (italic)
 *     <CommandBlockApproval> approve / reject buttons (pending only)
 *     <CommandBlockOutput>   ANSI-rendered stdout/stderr
 *     <CommandBlockFooter>   exit badge + explain/fix actions
 *   </CommandBlock>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Ansi from 'ansi-to-react';
import { motion, AnimatePresence, type HTMLMotionProps } from 'motion/react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilterIcon,
  GlobeIcon,
  Loader2Icon,
  LightbulbIcon,
  PlayIcon,
  RotateCwIcon,
  SearchIcon,
  SquareIcon,
  TerminalSquareIcon,
  WrenchIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  formatDuration,
  extractLocalhostUrls,
  isGitDiff,
  isInteractiveCommand,
} from '@/lib/terminal-input';
import type { FixSuggestion } from '@/hooks/use-terminal-session';
import type { TerminalBlock } from '@/main/ipc/channels';

// ─── Context ──────────────────────────────────────────────────────────────────

interface CommandBlockCtx {
  block: TerminalBlock;
  onApprove?: () => void;
  onReject?: () => void;
  onExplain?: () => void;
  isExplaining?: boolean;
  onRerun?: () => void;
  onStop?: () => void;
  onFix?: () => void;
  fix?: FixSuggestion;
  isFixing?: boolean;
  /** Send a proposed repair to the input bar for review (never auto-runs). */
  onUseFix?: (command: string) => void;
  onRunInShell?: (command: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  filterMode: boolean;
  setFilterMode: React.Dispatch<React.SetStateAction<boolean>>;
}

const Ctx = createContext<CommandBlockCtx | null>(null);

const useBlock = () => {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      'CommandBlock sub-components must be inside <CommandBlock>',
    );
  return ctx;
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_META = {
  pending: {
    icon: CircleDashedIcon,
    label: 'Awaiting approval',
    color: 'text-amber-400',
    ring: 'border-amber-400/30 bg-amber-400/5',
  },
  running: {
    icon: Loader2Icon,
    label: 'Running…',
    color: 'text-sky-400',
    ring: 'border-sky-400/30 bg-sky-400/5',
  },
  done: {
    icon: CheckCircle2Icon,
    label: 'Done',
    color: 'text-emerald-400',
    ring: 'border-emerald-400/20 bg-emerald-400/5',
  },
  error: {
    icon: XCircleIcon,
    label: 'Error',
    color: 'text-rose-400',
    ring: 'border-rose-400/20 bg-rose-400/5',
  },
  skipped: {
    icon: CircleSlashIcon,
    label: 'Skipped',
    color: 'text-muted-foreground',
    ring: 'border-border bg-muted/30',
  },
} satisfies Record<
  TerminalBlock['status'],
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
    ring: string;
  }
>;

// ─── Root ─────────────────────────────────────────────────────────────────────

// NOTE: these extend `HTMLMotionProps<'div'>`, not React's `HTMLAttributes`.
// motion.div redefines `onAnimationStart` (it takes an `AnimationDefinition`,
// not an `AnimationEvent`), so spreading plain HTML attribute types into it
// fails to type-check.

export interface CommandBlockProps extends HTMLMotionProps<'div'> {
  block: TerminalBlock;
  onApprove?: () => void;
  onReject?: () => void;
  onExplain?: () => void;
  isExplaining?: boolean;
  onRerun?: () => void;
  onStop?: () => void;
  onFix?: () => void;
  fix?: FixSuggestion;
  isFixing?: boolean;
  onUseFix?: (command: string) => void;
  onRunInShell?: (command: string) => void;
}

export function CommandBlock({
  block,
  onApprove,
  onReject,
  onExplain,
  isExplaining,
  onRerun,
  onStop,
  onFix,
  fix,
  isFixing,
  onUseFix,
  onRunInShell,
  children,
  className,
  ...props
}: CommandBlockProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState(true);

  const ctx = useMemo(
    () => ({
      block,
      onApprove,
      onReject,
      onExplain,
      isExplaining,
      onRerun,
      onStop,
      onFix,
      fix,
      isFixing,
      onUseFix,
      onRunInShell,
      isSearchOpen,
      setIsSearchOpen,
      searchQuery,
      setSearchQuery,
      filterMode,
      setFilterMode,
    }),
    [
      block,
      onApprove,
      onReject,
      onExplain,
      isExplaining,
      onRerun,
      onStop,
      onFix,
      fix,
      isFixing,
      onUseFix,
      onRunInShell,
      isSearchOpen,
      searchQuery,
      filterMode,
    ],
  );

  const meta = STATUS_META[block.status];

  return (
    <Ctx.Provider value={ctx}>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={cn(
          'rounded-xl border font-mono text-sm',
          'bg-background text-foreground',
          meta.ring,
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <CommandBlockHeader />
            <CommandBlockThought />
            <CommandBlockApproval />
            <CommandBlockFilterBar />
            <CommandBlockOutput />
            <CommandBlockFooter />
          </>
        )}
      </motion.div>
    </Ctx.Provider>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

export function CommandBlockHeader({ className }: { className?: string }) {
  const { block, onRerun, onStop, isSearchOpen, setIsSearchOpen } = useBlock();
  const meta = STATUS_META[block.status];
  const StatusIcon = meta.icon;
  const canRerun =
    Boolean(onRerun) &&
    block.status !== 'pending' &&
    block.status !== 'running';
  const hasOutput = Boolean(block.output && block.output.length > 0);

  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex items-center gap-2.5 border-b border-border/60 bg-background/95 backdrop-blur-xs px-4 py-2.5 rounded-t-xl',
        className,
      )}
    >
      {/* Status icon */}
      <StatusIcon
        className={cn(
          'size-4 shrink-0',
          meta.color,
          block.status === 'running' && 'animate-spin',
        )}
      />

      {/* Command */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-muted-foreground/75">$</span>
        <span className="truncate text-foreground font-mono">
          {block.command || '…'}
        </span>
      </div>

      {/* Running pulse badge & Stop action button (Pillar 1 & 4) */}
      {block.status === 'running' && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2 py-0.5 font-sans text-[10px] font-medium text-sky-400">
            <span className="size-1.5 rounded-full bg-sky-400 animate-ping" />
            Running…
          </span>
          {onStop && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 gap-1 px-2 font-sans text-[10px] font-semibold bg-rose-600/90 text-white hover:bg-rose-500 transition-colors shadow-xs"
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              title="Stop running process (Ctrl+C)"
              aria-label="Stop running command"
            >
              <SquareIcon className="size-2.5 fill-current" />
              Stop{' '}
              <kbd className="ml-0.5 rounded bg-rose-800/80 px-1 py-0.2 font-mono text-[9px]">
                ^C
              </kbd>
            </Button>
          )}
        </div>
      )}

      {/* In-block Search / Filter toggle (Warp Pillar 1) */}
      {hasOutput && (
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-6 shrink-0 transition-colors',
            isSearchOpen
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground/75 hover:text-muted-foreground',
          )}
          onClick={() => setIsSearchOpen((v) => !v)}
          title="Filter and search output lines"
          aria-label="Filter output"
        >
          <SearchIcon className="size-3" />
        </Button>
      )}

      {/* Re-run — a fresh block, so history is preserved */}
      {canRerun && (
        <Button
          size="icon"
          variant="ghost"
          className="size-6 shrink-0 text-muted-foreground/75 hover:text-muted-foreground"
          onClick={onRerun}
          title="Re-run command"
          aria-label={`Re-run ${block.command}`}
        >
          <RotateCwIcon className="size-3" />
        </Button>
      )}

      {/* Position badge */}
      <span className="shrink-0 font-sans text-[10px] tabular-nums text-muted-foreground/60">
        #{block.position + 1}
      </span>
    </div>
  );
}

// ─── Agent thought (collapsible) ──────────────────────────────────────────────

export function CommandBlockThought({ className }: { className?: string }) {
  const { block } = useBlock();
  if (!block.agent_thought) return null;

  return (
    <Collapsible defaultOpen={block.status === 'pending'}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 border-b border-border/40 px-4 py-2 text-left hover:bg-card/50">
        <LightbulbIcon className="size-3 shrink-0 text-amber-400/70" />
        <span className="flex-1 truncate font-sans text-[11px] italic text-muted-foreground">
          {block.agent_thought}
        </span>
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-b border-border/40 px-4 py-2.5 font-sans text-xs italic text-muted-foreground/80 leading-relaxed">
          {block.agent_thought}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Approval UI ──────────────────────────────────────────────────────────────

export function CommandBlockApproval({ className }: { className?: string }) {
  const { block, onApprove, onReject } = useBlock();
  if (block.status !== 'pending') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className={cn(
          'border-b border-border/40 bg-amber-950/20 px-4 py-3',
          className,
        )}
      >
        <p className="mb-3 font-sans text-[11px] text-amber-300/80">
          Allow this command to run?
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 gap-1.5 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-500"
            onClick={onApprove}
          >
            <PlayIcon className="size-3" />
            Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-border px-3 text-xs text-muted-foreground hover:bg-muted"
            onClick={onReject}
          >
            <CircleSlashIcon className="size-3" />
            Skip
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Search / Filter Bar (Warp Pillar 1) ──────────────────────────────────────

export function CommandBlockFilterBar({ className }: { className?: string }) {
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    filterMode,
    setFilterMode,
    block,
  } = useBlock();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      inputRef.current?.focus();
    }
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  const rawLines = block.output ? block.output.split('\n') : [];
  const q = searchQuery.trim().toLowerCase();
  const matchCount = q
    ? rawLines.filter((l) =>
        l
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
          .toLowerCase()
          .includes(q),
      ).length
    : rawLines.length;

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border/40 bg-card/70 px-3 py-1.5 font-sans text-xs',
        className,
      )}
    >
      <SearchIcon className="size-3 text-muted-foreground/70 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsSearchOpen(false);
            setSearchQuery('');
          }
        }}
        placeholder="Filter output lines (text or /regex/)..."
        className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
      {searchQuery && (
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0">
          {matchCount} / {rawLines.length} lines
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'h-5 px-1.5 text-[10px] font-sans shrink-0',
          filterMode
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground',
        )}
        onClick={() => setFilterMode((v) => !v)}
        title={filterMode ? 'Showing filtered lines only' : 'Showing all lines'}
      >
        <FilterIcon className="size-2.5 mr-1" />
        {filterMode ? 'Filtered' : 'All'}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          setIsSearchOpen(false);
          setSearchQuery('');
        }}
        title="Close filter (Esc)"
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

// ─── Helpers: Git Diff Renderer ──────────────────────────────────────────────

function renderGitDiff(text: string) {
  const lines = text.split('\n');
  return (
    <div className="font-mono text-[12px] leading-relaxed select-text">
      {lines.map((line, idx) => {
        if (line.startsWith('diff --git')) {
          return (
            <div
              key={idx}
              className="mt-2.5 border-t border-border/50 pt-2 font-bold text-foreground first:mt-0 first:border-0 first:pt-0"
            >
              {line}
            </div>
          );
        }
        if (
          line.startsWith('index ') ||
          line.startsWith('old mode ') ||
          line.startsWith('new mode ')
        ) {
          return (
            <div key={idx} className="text-muted-foreground/60">
              {line}
            </div>
          );
        }
        if (line.startsWith('--- ') || line.startsWith('+++ ')) {
          return (
            <div key={idx} className="font-semibold text-muted-foreground/80">
              {line}
            </div>
          );
        }
        if (line.startsWith('@@')) {
          return (
            <div
              key={idx}
              className="my-1 rounded bg-cyan-950/40 px-1 py-0.5 font-mono text-[11px] font-semibold text-cyan-400 border border-cyan-800/30"
            >
              {line}
            </div>
          );
        }
        if (line.startsWith('+')) {
          return (
            <div
              key={idx}
              className="bg-emerald-950/30 px-1.5 text-emerald-400 border-l-2 border-emerald-500"
            >
              {line}
            </div>
          );
        }
        if (line.startsWith('-')) {
          return (
            <div
              key={idx}
              className="bg-rose-950/30 px-1.5 text-rose-400 border-l-2 border-rose-500"
            >
              {line}
            </div>
          );
        }
        return (
          <div key={idx} className="px-1.5 text-foreground/85">
            {line || '\u00A0'}
          </div>
        );
      })}
    </div>
  );
}

// ─── Output ───────────────────────────────────────────────────────────────────

export function CommandBlockOutput({ className }: { className?: string }) {
  const { block, isSearchOpen, searchQuery, filterMode, onRunInShell } =
    useBlock();
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const output = block.output;
  const hasOutput = output && output.length > 0;
  const isVisible =
    block.status === 'running' ||
    block.status === 'done' ||
    block.status === 'error';

  // Detected dev server URLs (e.g. Next.js, Vite, Express on localhost:3000)
  const detectedUrls = useMemo(
    () => extractLocalhostUrls(output || ''),
    [output],
  );

  const handleOpenUrl = (url: string) => {
    void window.electron.ipc.invoke('terminal:open-url', { url });
  };

  const userScrolledBlockUpRef = useRef(false);

  const handleBlockScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    userScrolledBlockUpRef.current =
      scrollHeight - scrollTop - clientHeight > 40;
  }, []);

  // Auto-scroll to latest output while command is running unless user scrolled up
  useEffect(() => {
    if (
      block.status === 'running' &&
      containerRef.current &&
      !userScrolledBlockUpRef.current
    ) {
      requestAnimationFrame(() => {
        if (containerRef.current && !userScrolledBlockUpRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
  }, [block.status, output]);

  // In-block line filtering (Warp Pillar 1)
  const isFilteringActive =
    isSearchOpen && searchQuery.trim().length > 0 && filterMode;

  const displayOutput = useMemo(() => {
    if (!hasOutput || !isFilteringActive) return output;

    const q = searchQuery.trim().toLowerCase();
    const isRegex = q.startsWith('/') && q.endsWith('/') && q.length > 2;
    let regex: RegExp | null = null;
    if (isRegex) {
      try {
        regex = new RegExp(q.slice(1, -1), 'i');
      } catch {
        regex = null;
      }
    }

    const lines = output.split('\n');
    const matched = lines.filter((l) => {
      const clean = l.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      if (regex) return regex.test(clean);
      return clean.toLowerCase().includes(q);
    });

    return matched.join('\n');
  }, [output, hasOutput, isFilteringActive, searchQuery]);

  const lineCount = hasOutput ? output.split('\n').length : 0;
  const canFold =
    !isFilteringActive &&
    block.status !== 'running' &&
    lineCount > FOLD_THRESHOLD;
  const collapsed = canFold && !expanded;

  if (!isVisible && !hasOutput) return null;

  const hasMatches = isFilteringActive ? displayOutput.length > 0 : true;
  const isDiff = isGitDiff(block.command, displayOutput);

  return (
    <div className={cn('relative', className)}>
      {/* Interactive TTY Warning Banner */}
      {isInteractiveCommand(block.command) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2">
          <div className="flex items-center gap-1.5 font-sans text-[11px] font-medium text-amber-300">
            <AlertTriangleIcon className="size-3.5 text-amber-400 shrink-0" />
            <span>
              This command requires interactive TTY input (prompts/keybindings)
            </span>
          </div>
          {onRunInShell && (
            <Button
              type="button"
              size="xs"
              className="h-5 gap-1 px-2 font-sans text-[10px] bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => onRunInShell(block.command)}
            >
              Run in Shell Mode ↗
            </Button>
          )}
        </div>
      )}

      {/* Dev Server URL banner (1-click browser launch for Next.js, Vite, etc.) */}
      {detectedUrls.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-sky-950/25 px-4 py-2">
          <div className="flex items-center gap-1.5 font-sans text-[11px] font-medium text-sky-300">
            <GlobeIcon className="size-3.5 text-sky-400 animate-pulse" />
            <span>Active Server:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {detectedUrls.map((url) => (
              <button
                type="button"
                key={url}
                onClick={() => handleOpenUrl(url)}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] text-sky-200 transition-colors hover:border-sky-400 hover:bg-sky-500/25 cursor-pointer"
                title={`Open ${url} in default browser`}
              >
                {url}
                <ExternalLinkIcon className="size-3 text-sky-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleBlockScroll}
        className={cn(
          'overflow-auto px-4 py-3 text-[12px] leading-relaxed',
          collapsed ? 'max-h-32' : 'max-h-72',
          !hasOutput && 'flex items-center gap-2 text-muted-foreground/75',
        )}
      >
        {hasOutput ? (
          hasMatches ? (
            isDiff ? (
              renderGitDiff(displayOutput)
            ) : (
              <pre className="whitespace-pre-wrap break-words">
                <Ansi>{displayOutput}</Ansi>
                {block.status === 'running' && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-sky-400" />
                )}
              </pre>
            )
          ) : (
            <div className="py-2 font-sans text-xs italic text-muted-foreground/75">
              No lines matched &ldquo;{searchQuery}&rdquo;
            </div>
          )
        ) : block.status === 'running' ? (
          <>
            <Loader2Icon className="size-3 animate-spin" />
            <span className="font-sans text-xs">Executing…</span>
          </>
        ) : null}
      </div>

      {/* Fold control — only for output long enough to be worth hiding */}
      {canFold && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 border-t border-border/40',
            'bg-card/60 py-1 font-sans text-[10px] text-muted-foreground/75',
            'transition-colors hover:bg-card hover:text-muted-foreground',
          )}
        >
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform',
              expanded && 'rotate-180',
            )}
          />
          {collapsed ? `Show all ${lineCount} lines` : 'Collapse output'}
        </button>
      )}
    </div>
  );
}

// ─── Explanation callout ──────────────────────────────────────────────────────

export function CommandBlockExplanation({ className }: { className?: string }) {
  const { block } = useBlock();
  if (!block.explanation) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'border-t border-border/40 bg-violet-950/20 px-4 py-2.5',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <WrenchIcon className="mt-0.5 size-3 shrink-0 text-violet-400" />
        <p className="font-sans text-[11px] leading-relaxed text-violet-200/80">
          {block.explanation}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

/** Output longer than this is folded by default. */
const FOLD_THRESHOLD = 15;

export function CommandBlockFooter({ className }: { className?: string }) {
  const { block, onExplain, isExplaining, onFix, fix, isFixing } = useBlock();
  const [copied, setCopied] = useState<'output' | 'command' | null>(null);

  const copy = useCallback((text: string, which: 'output' | 'command') => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);

  const copyOutput = useCallback(
    () => copy(block.output, 'output'),
    [copy, block.output],
  );
  const copyCommand = useCallback(
    () => copy(block.command, 'command'),
    [copy, block.command],
  );

  const isFinished = block.status === 'done' || block.status === 'error';
  if (!isFinished) return null;

  const exitOk = block.exit_code === 0;
  // A fix is only offered where a repair could plausibly help.
  const canFix = Boolean(onFix) && block.status === 'error';

  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-border/40 px-3 py-1.5',
        className,
      )}
    >
      {/* Exit code + duration */}
      <div className="flex items-center gap-2">
        <Badge
          variant={exitOk ? 'default' : 'destructive'}
          className={cn(
            'h-5 font-mono text-[10px]',
            exitOk
              ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40'
              : 'bg-rose-900/60 text-rose-300 border-rose-700/40',
          )}
        >
          exit {block.exit_code ?? '?'}
        </Badge>

        {typeof block.duration_ms === 'number' && (
          <span className="font-sans text-[10px] tabular-nums text-muted-foreground/75">
            {formatDuration(block.duration_ms)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {block.command && (
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground/75 hover:text-muted-foreground"
            onClick={copyCommand}
            title="Copy command"
            aria-label="Copy command"
          >
            {copied === 'command' ? (
              <CheckCircle2Icon className="size-3 text-emerald-400" />
            ) : (
              <TerminalSquareIcon className="size-3" />
            )}
          </Button>
        )}
        {block.output && (
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-muted-foreground/75 hover:text-muted-foreground"
            onClick={copyOutput}
            title="Copy output"
            aria-label="Copy output"
          >
            {copied === 'output' ? (
              <CheckCircle2Icon className="size-3 text-emerald-400" />
            ) : (
              <CopyIcon className="size-3" />
            )}
          </Button>
        )}
        {canFix && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'h-6 gap-1 px-2 text-[10px] font-sans',
              fix
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-muted-foreground/75 hover:text-muted-foreground',
            )}
            onClick={onFix}
            disabled={isFixing}
          >
            <WrenchIcon className={cn('size-3', isFixing && 'animate-pulse')} />
            {isFixing ? 'Diagnosing…' : fix ? 'Re-diagnose' : 'Fix with AI'}
          </Button>
        )}
        {onExplain && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'h-6 gap-1 px-2 text-[10px] font-sans',
              block.explanation
                ? 'text-violet-400 hover:text-violet-300'
                : 'text-muted-foreground/75 hover:text-muted-foreground',
            )}
            onClick={onExplain}
            disabled={isExplaining}
          >
            <LightbulbIcon
              className={cn('size-3', isExplaining && 'animate-pulse')}
            />
            {block.explanation ? 'Re-explain' : 'Explain'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Fix suggestion ───────────────────────────────────────────────────────────

/**
 * Renders the model's diagnosis of a failed command.
 *
 * The proposed command is offered, never run: clicking it writes the command
 * into the input bar so the user still reviews and submits it. Auto-executing
 * model output is the one thing this whole design refuses to do.
 */
export function CommandBlockFix({ className }: { className?: string }) {
  const { fix, onUseFix } = useBlock();
  if (!fix) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'border-t border-border/40 bg-amber-950/20 px-4 py-2.5',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <WrenchIcon className="mt-0.5 size-3 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[11px] leading-relaxed text-amber-200/80">
            {fix.diagnosis}
          </p>

          {fix.command && (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-amber-700/40 bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground">
                {fix.command}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-6 shrink-0 gap-1 border-amber-700/40 px-2 text-[10px] font-sans text-amber-300 hover:bg-amber-950/40"
                onClick={() => onUseFix?.(fix.command)}
                title="Put this in the input bar for review"
              >
                <PlayIcon className="size-3" />
                Use
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Skipped block (compact) ──────────────────────────────────────────────────

export function CommandBlockSkipped({ className }: { className?: string }) {
  const { block } = useBlock();
  if (block.status !== 'skipped') return null;

  return (
    <div
      className={cn(
        'px-4 py-2.5 font-sans text-xs text-muted-foreground/60',
        className,
      )}
    >
      Command skipped:{' '}
      <code className="text-muted-foreground/75">{block.command}</code>
    </div>
  );
}

// ─── Agent summary card ───────────────────────────────────────────────────────

export interface AgentSummaryProps extends HTMLMotionProps<'div'> {
  summary: string;
  isLoading?: boolean;
}

export function AgentSummary({
  summary,
  isLoading,
  className,
  ...props
}: AgentSummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border border-border/50 bg-card/80 px-4 py-3 font-sans text-sm text-foreground',
        className,
      )}
      {...props}
    >
      <div className="mb-2 flex items-center gap-2">
        <TerminalSquareIcon className="size-4 text-emerald-400" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Summary
        </span>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground/75">
          <Loader2Icon className="size-3 animate-spin" />
          <span className="text-xs">Agent is writing summary…</span>
        </div>
      ) : (
        <p className="whitespace-pre-wrap leading-relaxed">{summary}</p>
      )}
    </motion.div>
  );
}
