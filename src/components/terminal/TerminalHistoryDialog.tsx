/**
 * components/terminal/TerminalHistoryDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual Command History palette (Warp Pillar 3 - Ctrl+R).
 *
 * Allows developers to fuzzy-search past commands, view execution times, and
 * quickly insert or re-execute with keyboard navigation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getCommandHistory,
  searchCommandHistory,
  type HistoryEntry,
} from '@/lib/terminal-history';
import { cn } from '@/lib/utils';
import { ClockIcon, PlayIcon, SearchIcon, TerminalIcon } from 'lucide-react';

interface TerminalHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCommand: (command: string, runDirectly: boolean) => void;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function TerminalHistoryDialog({
  open,
  onOpenChange,
  onSelectCommand,
}: TerminalHistoryDialogProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setHistory(getCommandHistory());
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    return query ? searchCommandHistory(query) : history;
  }, [query, history]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + filtered.length) % filtered.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) {
        // Shift+Enter runs directly, Enter inserts
        onSelectCommand(target.command, e.shiftKey);
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[85vw] max-w-2xl min-w-[480px] p-0 gap-0 overflow-hidden border-border bg-background shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <ClockIcon className="size-4 text-sky-400" />
            <DialogTitle className="text-sm font-semibold">
              Command History
            </DialogTitle>
            <DialogDescription className="sr-only">
              Search and recall past terminal commands
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="p-3 border-b border-border/60">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground/60" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search previous commands (Ctrl+R)..."
              className="h-8 pl-8 font-mono text-xs"
            />
          </div>
        </div>

        <ScrollArea className="h-72">
          <div className="p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="py-10 text-center font-sans text-xs text-muted-foreground">
                No commands in history match &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectCommand(item.command, false);
                      onOpenChange(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'group flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 cursor-pointer font-mono text-xs transition-colors',
                      isSelected
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TerminalIcon className="size-3 shrink-0 opacity-60" />
                      <span className="truncate text-foreground">
                        {item.command}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-sans text-[10px] text-muted-foreground/60">
                      <span>{formatRelativeTime(item.timestamp)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCommand(item.command, true);
                          onOpenChange(false);
                        }}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 font-sans px-1.5 py-0.5 rounded bg-sky-950/40 border border-sky-800/40"
                        title="Run immediately"
                      >
                        <PlayIcon className="size-2.5" />
                        Run
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/60 bg-muted/20 px-3 py-1.5 flex items-center justify-between text-[10px] font-sans text-muted-foreground/75">
          <span>
            Press{' '}
            <kbd className="font-mono text-[9px] bg-muted px-1 rounded">
              Enter
            </kbd>{' '}
            to insert,{' '}
            <kbd className="font-mono text-[9px] bg-muted px-1 rounded">
              Shift+Enter
            </kbd>{' '}
            to run
          </span>
          <span>
            <kbd className="font-mono text-[9px] bg-muted px-1 rounded">↑</kbd>{' '}
            <kbd className="font-mono text-[9px] bg-muted px-1 rounded">↓</kbd>{' '}
            navigate
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
