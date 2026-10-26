/**
 * pages/Terminal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * VSCode-inspired multi-pane terminal workspace.
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │  PageHeader (Terminal breadcrumb + project)     │
 *   ├─────────────────────────────────────────────────┤
 *   │ ┌──────────────────┬──────────────────────────┐ │
 *   │ │ [Tab1 ●] [Tab2]  │ [Tab3 ●] [+]            │ │
 *   │ │  (pane 1 tabs)   │  (pane 2 tabs)           │ │
 *   │ ├──────────────────┤                          │ │
 *   │ │  TerminalTab     │                          │ │
 *   │ │  (active: Tab1)  │  TerminalTab             │ │
 *   │ │                  │  (active: Tab3)          │ │
 *   │ └──────────────────┴──────────────────────────┘ │
 *   └─────────────────────────────────────────────────┘
 *
 * Each pane has its own tab bar. Tabs are owned by their pane. Closing the
 * last tab in a pane removes that pane. Splitting creates a new pane with a
 * new default tab.
 *
 * Keyboard shortcuts:
 *   Cmd+T       — New agent tab in active pane
 *   Cmd+W       — Close active tab
 *   Cmd+\       — Split right (horizontal)
 *   Cmd+Shift+\ — Split down (vertical)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
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
    panelTree,
    activePaneId,
    addTab,
    closeTab,
    selectTab,
    updateTitle,
    updateSessionId,
    focusPane,
  } = useTerminalLayout();

  // Collect session statuses for tab bars (from useTerminalSession in each tab)
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
  useEffect(() => {
    const goal = searchParams.get('goal');
    if (goal) {
      const next = new URLSearchParams(searchParams);
      next.delete('goal');
      next.delete('task');
      setSearchParams(next, { replace: true });
      // The goal will be handled by the active tab's input
    }
  }, [searchParams, setSearchParams]);

  // If URL has a session ID, assign it to the first tab
  useEffect(() => {
    if (urlSessionId && activePaneId) {
      // Find the first tab in the active pane and assign the session
      // This is handled by the TerminalTab component via onSessionAssigned
    }
  }, [urlSessionId, activePaneId]);

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
    (paneId: string, mode: TerminalMode) => {
      addTab(paneId, mode);
    },
    [addTab],
  );

  const handleTabClose = useCallback(
    (paneId: string, tabId: string) => {
      closeTab(paneId, tabId);
    },
    [closeTab],
  );

  const handleTabSelect = useCallback(
    (paneId: string, tabId: string) => {
      selectTab(paneId, tabId);
    },
    [selectTab],
  );

  const handleFocusPane = useCallback(
    (paneId: string) => {
      focusPane(paneId);
    },
    [focusPane],
  );

  // Check if there are any panes with tabs
  const hasContent = panelTree !== null;

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

      {/* ── Panel area ─────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {hasContent ? (
          <TerminalPanel
            node={panelTree}
            activePaneId={activePaneId}
            tabStatuses={tabStatuses}
            onTitleChange={handleTitleChange}
            onSessionAssigned={handleSessionAssigned}
            onCloseTab={handleTabClose}
            onTabSelect={handleTabSelect}
            onNewTab={handleNewTab}
            onFocusPane={handleFocusPane}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/75">
            <span className="text-2xl">⌨️</span>
            <p className="font-sans text-sm">Loading terminal workspace...</p>
          </div>
        )}
      </div>
    </div>
  );
}
