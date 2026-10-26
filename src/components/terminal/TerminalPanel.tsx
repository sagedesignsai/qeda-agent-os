/**
 * components/terminal/TerminalPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Recursive panel renderer for the VSCode-style terminal workspace.
 *
 * Each leaf pane renders its own TerminalTabBar (with the pane's tabs) above a
 * single TerminalTab for the active tab. Split nodes render ResizablePanelGroup
 * with children recursively.
 *
 * Uses react-resizable-panels for draggable split handles and localStorage
 * layout persistence via useDefaultLayout.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { TerminalTab } from '@/components/terminal/TerminalTab';
import { TerminalTabBar } from '@/components/terminal/TerminalTabBar';
import { cn } from '@/lib/utils';
import type { PanelNode, PanelLeaf } from '@/hooks/use-terminal-layout';
import type { TerminalMode } from '@/components/terminal/TerminalTab';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  node: PanelNode;
  activePaneId: string | undefined;
  /** Session status per tab ID (for status dots in tab bars). */
  tabStatuses?: Map<string, string>;
  onTitleChange: (tabId: string, title: string) => void;
  onSessionAssigned: (tabId: string, sessionId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onTabSelect: (paneId: string, tabId: string) => void;
  onNewTab: (paneId: string, mode: TerminalMode) => void;
  onFocusPane: (paneId: string) => void;
  /** Unique key prefix for this panel group (for React keys). */
  keyPrefix?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TerminalPanel({
  node,
  activePaneId,
  tabStatuses,
  onTitleChange,
  onSessionAssigned,
  onCloseTab,
  onTabSelect,
  onNewTab,
  onFocusPane,
  keyPrefix = 'root',
}: TerminalPanelProps) {
  if (node.type === 'leaf') {
    return (
      <PaneContent
        pane={node}
        tabStatuses={tabStatuses}
        onTitleChange={onTitleChange}
        onSessionAssigned={onSessionAssigned}
        onCloseTab={onCloseTab}
        onTabSelect={onTabSelect}
        onNewTab={onNewTab}
        onFocusPane={onFocusPane}
      />
    );
  }

  // Split: render a ResizablePanelGroup with children
  const direction = node.direction;
  const panelGroupId = `${keyPrefix}-group`;

  return (
    <ResizablePanelGroup
      id={panelGroupId}
      className={cn(
        'h-full w-full',
        direction === 'vertical' ? 'flex-col' : 'flex-row',
      )}
    >
      {node.children.map((child, index) => {
        const childKey = `${keyPrefix}-child-${index}`;
        const defaultSize = node.sizes?.[index] ?? 50;

        return (
          <div key={childKey} className="flex flex-col min-h-0">
            {index > 0 && (
              <ResizableHandle
                className={cn(
                  'bg-border/60 hover:bg-accent/30 transition-colors',
                  direction === 'vertical' ? 'w-full h-px' : 'h-full w-px',
                )}
              />
            )}
            <ResizablePanel
              id={`${childKey}-panel`}
              defaultSize={defaultSize}
              minSize={15}
              className="h-full w-full"
            >
              <TerminalPanel
                node={child}
                activePaneId={activePaneId}
                tabStatuses={tabStatuses}
                onTitleChange={onTitleChange}
                onSessionAssigned={onSessionAssigned}
                onCloseTab={onCloseTab}
                onTabSelect={onTabSelect}
                onNewTab={onNewTab}
                onFocusPane={onFocusPane}
                keyPrefix={childKey}
              />
            </ResizablePanel>
          </div>
        );
      })}
    </ResizablePanelGroup>
  );
}

// ─── Pane content (tab bar + active tab) ──────────────────────────────────────

interface PaneContentProps {
  pane: PanelLeaf;
  tabStatuses?: Map<string, string>;
  onTitleChange: (tabId: string, title: string) => void;
  onSessionAssigned: (tabId: string, sessionId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onTabSelect: (paneId: string, tabId: string) => void;
  onNewTab: (paneId: string, mode: TerminalMode) => void;
  onFocusPane: (paneId: string) => void;
}

function PaneContent({
  pane,
  tabStatuses,
  onTitleChange,
  onSessionAssigned,
  onCloseTab,
  onTabSelect,
  onNewTab,
  onFocusPane,
}: PaneContentProps) {
  const { paneId, tabs, activeTabIndex } = pane;

  // Empty pane — no tabs
  if (tabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/75">
        <span className="text-2xl">⌨️</span>
        <p className="font-sans text-sm">No terminal tabs in this pane.</p>
      </div>
    );
  }

  const activeTab = tabs[activeTabIndex];
  if (!activeTab) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Per-pane tab bar */}
      <TerminalTabBar
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        tabStatuses={tabStatuses}
        onTabSelect={(tabId) => {
          onTabSelect(paneId, tabId);
          onFocusPane(paneId);
        }}
        onTabClose={(tabId) => onCloseTab(paneId, tabId)}
        onNewTab={(mode) => onNewTab(paneId, mode)}
      />

      {/* Active tab content */}
      <div className="relative flex-1 min-h-0">
        <TerminalTab
          tabId={activeTab.tabId}
          sessionId={activeTab.sessionId}
          mode={activeTab.mode}
          onTitleChange={onTitleChange}
          onSessionAssigned={onSessionAssigned}
        />
      </div>
    </div>
  );
}
