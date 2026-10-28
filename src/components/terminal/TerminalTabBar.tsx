/**
 * components/terminal/TerminalTabBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-pane tab bar — VSCode-style compact tab strip rendered inside each pane.
 *
 * Each pane has its own tab bar showing the tabs belonging to that pane, with
 * a "+" button that opens a dropdown to choose the tab type (Shell or AI
 * Terminal). Active tab is highlighted with a bottom border accent.
 *
 * Tabs show: mode icon (Bot/Terminal), title, status dot, and close button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { BotIcon, PlusIcon, TerminalIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { TerminalTabInfo } from '@/hooks/use-terminal-layout';
import type { TerminalMode } from '@/components/terminal/TerminalTab';

// ─── Tab item ─────────────────────────────────────────────────────────────────

interface TabItemProps {
  info: TerminalTabInfo;
  isActive: boolean;
  status?: string;
  onSelect: () => void;
  onClose: () => void;
}

function TabItem({ info, isActive, status, onSelect, onClose }: TabItemProps) {
  const Icon = info.mode === 'agent' ? BotIcon : TerminalIcon;

  const statusColor =
    status === 'running'
      ? 'bg-sky-400'
      : status === 'done'
        ? 'bg-emerald-400'
        : status === 'error'
          ? 'bg-rose-400'
          : 'bg-muted-foreground/40';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-1.5 px-2.5 py-1.5 text-left transition-all',
        'max-w-[160px] min-w-[100px] border-b border-transparent',
        isActive
          ? 'border-b-primary/80 bg-card/85 text-foreground'
          : 'border-b-transparent text-muted-foreground hover:bg-card/50 hover:text-foreground',
      )}
    >
      {/* Mode icon */}
      <Icon className="size-3 shrink-0 opacity-60" />

      {/* Title */}
      <span className="truncate text-[11px] font-medium">
        {info.title || 'Untitled'}
      </span>

      {/* Status dot */}
      {status && status !== 'idle' && (
        <span
          className={cn(
            'size-1 rounded-full shrink-0',
            statusColor,
            status === 'running' && 'animate-pulse',
          )}
        />
      )}

      {/* Close button */}
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          'ml-auto flex size-4 shrink-0 items-center justify-center rounded',
          'opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100 hover:bg-muted',
        )}
      >
        <XIcon className="size-2.5" />
      </span>
    </button>
  );
}

// ─── Tab bar (per-pane) ───────────────────────────────────────────────────────

interface TerminalTabBarProps {
  /** Tabs belonging to this pane only. */
  tabs: TerminalTabInfo[];
  /** Index of the active tab in the tabs array. */
  activeTabIndex: number;
  /** Session status per tab ID (for status dots). */
  tabStatuses?: Map<string, string>;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: (mode: TerminalMode) => void;
}

export function TerminalTabBar({
  tabs,
  activeTabIndex,
  tabStatuses,
  onTabSelect,
  onTabClose,
  onNewTab,
}: TerminalTabBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-px border-b border-border/40 bg-background/80">
      {/* Tab items */}
      {tabs.map((info, index) => (
        <TabItem
          key={info.tabId}
          info={info}
          isActive={index === activeTabIndex}
          status={tabStatuses?.get(info.tabId)}
          onSelect={() => onTabSelect(info.tabId)}
          onClose={() => onTabClose(info.tabId)}
        />
      ))}

      {/* New tab dropdown */}
      <div className="ml-auto flex items-center gap-1 px-1">
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="New tab"
            >
              <PlusIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem
              className="flex items-center gap-2"
              onClick={() => onNewTab('agent')}
            >
              <BotIcon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">AI Terminal</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center gap-2"
              onClick={() => onNewTab('shell')}
            >
              <TerminalIcon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">Shell</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
