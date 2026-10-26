/**
 * pages/Terminal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-panel terminal workspace — Warp-inspired layout with tabs and splits.
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │  PageHeader (Terminal breadcrumb + project)     │
 *   ├─────────────────────────────────────────────────┤
 *   │  TabBar [Tab1 ●] [Tab2 ●] [+]                  │
 *   ├─────────────────────────────────────────────────┤
 *   │  ┌─────────────┬─────────────┐                 │
 *   │  │ TerminalTab │ TerminalTab │  (split panes)  │
 *   │  │  (agent)    │  (shell)    │                 │
 *   │  └─────────────┴─────────────┘                 │
 *   └─────────────────────────────────────────────────┘
 *
 * Each tab manages its own session independently. Panes can be split
 * horizontally or vertically. Layout is session-scoped with localStorage
 * persistence for panel sizes.
 *
 * Keyboard shortcuts:
 *   Cmd+T       — New agent tab
 *   Cmd+W       — Close active tab
 *   Cmd+\       — Split right (horizontal)
 *   Cmd+Shift+\ — Split down (vertical)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { TerminalTabBar } from '@/components/terminal/TerminalTabBar';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { useTerminalLayout } from '@/hooks/use-terminal-layout';
import { useProjectScope } from '@/hooks/use-project-scope';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { useIpcEvent } from '@/hooks/use-ipc';
import type { TerminalMode } from '@/components/terminal/TerminalTab';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Terminal() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectName, clear: clearProjectScope } = useProjectScope();

  const {
    tabs,
    activeTabId,
    panelTree,
    addTab,
    closeTab,
    selectTab,
    updateTitle,
    updateSessionId,
  } = useTerminalLayout();

  // Collect session statuses for the tab bar (from useTerminalSession in each tab)
  const [tabStatuses, setTabStatuses] = useState<Map<string, string>>(
    new Map(),
  );

  // Listen for session status changes from tabs
  useIpcEvent('terminal:session-status', (...args: unknown[]) => {
    const payload = args[0] as { tabId: string; status: string };
    if (payload?.tabId) {
      setTabStatuses((prev) => {
        const next = new Map(prev);
        next.set(payload.tabId, payload.status);
        return next;
      });
    }
  });

  // Auto-run goal from ?goal= URL param (set by Tasks "Hand to Agent")
  // This creates a new tab with the goal
  useEffect(() => {
    const goal = searchParams.get('goal');
    if (goal && tabs.size > 0) {
      const next = new URLSearchParams(searchParams);
      next.delete('goal');
      next.delete('task');
      setSearchParams(next, { replace: true });
      // The goal will be handled by the first tab's input
    }
  }, [searchParams, setSearchParams, tabs.size]);

  // If URL has a session ID, find or create a tab for it
  useEffect(() => {
    if (urlSessionId && tabs.size === 0) {
      // Create a tab with the URL session ID
      const tabId = Array.from(tabs.keys())[0];
      if (tabId) {
        updateSessionId(tabId, urlSessionId);
      }
    }
  }, [urlSessionId, tabs, updateSessionId]);

  // Handle tab callbacks
  const handleTitleChange = useCallback(
    (tabId: string, title: string) => {
      updateTitle(tabId, title);
    },
    [updateTitle],
  );

  const handleSessionAssigned = useCallback(
    (tabId: string, sessionId: string) => {
      updateSessionId(tabId, sessionId);
    },
    [updateSessionId],
  );

  const handleNewTab = useCallback(
    (mode: TerminalMode) => {
      addTab(mode);
    },
    [addTab],
  );

  const handleTabClose = useCallback(
    (tabId: string) => {
      closeTab(tabId);
    },
    [closeTab],
  );

  const handleTabSelect = useCallback(
    (tabId: string) => {
      selectTab(tabId);
    },
    [selectTab],
  );

  // Empty state — no tabs
  const hasTabs = tabs.size > 0;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        crumbs={[
          { label: 'Terminal' },
          ...(projectName ? [{ label: projectName }] : []),
        ]}
        meta={
          <ProjectScopeChip name={projectName} onClear={clearProjectScope} />
        }
      />

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <TerminalTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        tabStatuses={tabStatuses}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onNewTab={handleNewTab}
      />

      {/* ── Panel area ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {hasTabs ? (
          <TerminalPanel
            node={panelTree}
            tabs={tabs}
            activeTabId={activeTabId}
            onTitleChange={handleTitleChange}
            onSessionAssigned={handleSessionAssigned}
            onCloseTab={handleTabClose}
            onTabSelect={handleTabSelect}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/75">
            <span className="text-2xl">⌨️</span>
            <p className="font-sans text-sm">No terminal tabs open.</p>
            <p className="font-sans text-xs text-muted-foreground/50">
              Press{' '}
              <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                Cmd+T
              </kbd>{' '}
              to open a new tab
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
