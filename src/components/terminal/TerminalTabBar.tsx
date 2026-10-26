/**
 * components/terminal/TerminalTabBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tab bar for the terminal workspace — Warp-inspired compact tab strip.
 *
 * Shows open tabs with session title, mode icon (Bot / Terminal), status dot,
 * and close button. Active tab is highlighted with a bottom border accent.
 *
 * New tab button provides a dropdown to choose Agent or Shell mode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BotIcon, PlusIcon, TerminalIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
        'group flex items-center gap-1.5 rounded-t-lg border-border/30 px-3 py-1.5 text-left transition-all',
        'max-w-[180px] min-w-[120px]',
        isActive
          ? 'border-b-2 border-b-accent bg-card text-foreground'
          : 'border-b-2 border-b-transparent bg-transparent text-muted-foreground hover:bg-card/50 hover:text-foreground',
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          'size-1.5 rounded-full shrink-0',
          statusColor,
          status === 'running' && 'animate-pulse',
        )}
      />

      {/* Mode icon */}
      <Icon className="size-3 shrink-0 opacity-60" />

      {/* Title */}
      <span className="truncate text-[11px] font-medium">
        {info.title || 'Untitled'}
      </span>

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

// ─── Tab bar ──────────────────────────────────────────────────────────────────

interface TerminalTabBarProps {
  tabs: Map<string, TerminalTabInfo>;
  activeTabId: string | undefined;
  /** Session status per tab ID (for status dots). */
  tabStatuses?: Map<string, string>;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: (mode: TerminalMode) => void;
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  tabStatuses,
  onTabSelect,
  onTabClose,
  onNewTab,
}: TerminalTabBarProps) {
  return (
    <div className="flex items-center gap-px border-b border-border/40 bg-muted/30 px-1">
      {/* Tab items */}
      {Array.from(tabs.values()).map((info) => (
        <TabItem
          key={info.tabId}
          info={info}
          isActive={info.tabId === activeTabId}
          status={tabStatuses?.get(info.tabId)}
          onSelect={() => onTabSelect(info.tabId)}
          onClose={() => onTabClose(info.tabId)}
        />
      ))}

      {/* New tab button */}
      <div className="ml-auto flex items-center gap-1 px-1">
        <Button
          size="xs"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => onNewTab('agent')}
          title="New agent tab (Cmd+T)"
        >
          <PlusIcon className="size-3" />
        </Button>
      </div>
    </div>
  );
}
