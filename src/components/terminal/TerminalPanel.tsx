/**
 * components/terminal/TerminalPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Recursive panel renderer for the terminal workspace.
 *
 * Renders a ResizablePanelGroup with child panels. Each leaf panel contains a
 * TerminalTab for the active tab. Supports nested splits (recursive rendering).
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
import { cn } from '@/lib/utils';
import type { PanelNode, TerminalTabInfo } from '@/hooks/use-terminal-layout';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  node: PanelNode;
  tabs: Map<string, TerminalTabInfo>;
  activeTabId: string | undefined;
  onTitleChange: (tabId: string, title: string) => void;
  onSessionAssigned: (tabId: string, sessionId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTabSelect: (tabId: string) => void;
  /** Unique key prefix for this panel group (for React keys). */
  keyPrefix?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TerminalPanel({
  node,
  tabs,
  activeTabId,
  onTitleChange,
  onSessionAssigned,
  onCloseTab,
  onTabSelect,
  keyPrefix = 'root',
}: TerminalPanelProps) {
  if (node.type === 'leaf') {
    // Leaf: render a single TerminalTab
    const info = tabs.get(node.tabId);
    if (!info) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground/50">
          <span className="text-sm">Empty panel</span>
        </div>
      );
    }

    return (
      <TerminalTab
        tabId={node.tabId}
        sessionId={info.sessionId}
        initialMode={info.mode}
        onTitleChange={onTitleChange}
        onSessionAssigned={onSessionAssigned}
        onClose={() => onCloseTab(node.tabId)}
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
                tabs={tabs}
                activeTabId={activeTabId}
                onTitleChange={onTitleChange}
                onSessionAssigned={onSessionAssigned}
                onCloseTab={onCloseTab}
                onTabSelect={onTabSelect}
                keyPrefix={childKey}
              />
            </ResizablePanel>
          </div>
        );
      })}
    </ResizablePanelGroup>
  );
}
