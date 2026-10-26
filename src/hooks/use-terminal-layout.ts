/**
 * hooks/use-terminal-layout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * VSCode-inspired terminal workspace layout: each pane (leaf in the panel tree)
 * holds multiple tabs, each with its own tab bar. Panes are splittable and
 * resizable via react-resizable-panels.
 *
 * Key model: a `PanelLeaf` contains `tabs[]` and `activeTabIndex`, not a single
 * tab ID. Closing the last tab in a pane removes that pane entirely. Splitting
 * a pane creates a sibling pane with a new default tab.
 *
 * Layout state is persisted in localStorage via useDefaultLayout so panel sizes
 * survive focus changes within a session.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import type { TerminalMode } from '@/components/terminal/TerminalTab';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalTabInfo {
  tabId: string;
  sessionId?: string;
  mode: TerminalMode;
  title: string;
}

/** A leaf pane holding multiple tabs (VSCode model). */
export interface PanelLeaf {
  type: 'leaf';
  paneId: string;
  tabs: TerminalTabInfo[];
  activeTabIndex: number;
}

/** A split node containing child panels. */
export interface PanelSplit {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  children: PanelNode[];
  /** Relative sizes for children (sums to 100). */
  sizes?: number[];
}

export type PanelNode = PanelLeaf | PanelSplit;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
const nextId = (): string => `id-${Date.now()}-${++idCounter}`;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTerminalLayout() {
  const [panelTree, setPanelTree] = useState<PanelNode>(null as any);
  const [activePaneId, setActivePaneId] = useState<string | undefined>();

  const layout = useDefaultLayout({ id: 'qeda-terminal-layout-v2' });

  // Initialize: single pane with one agent tab
  useEffect(() => {
    const paneId = nextId();
    const tabId = nextId();
    const initialPane: PanelLeaf = {
      type: 'leaf',
      paneId,
      tabs: [{ tabId, mode: 'agent', title: 'New session' }],
      activeTabIndex: 0,
    };
    setPanelTree(initialPane);
    setActivePaneId(paneId);
  }, []);

  // ── Derived state helpers ────────────────────────────────────────────────

  // Get the active pane's active tab ID
  const getActiveTabId = useCallback((): string | undefined => {
    if (!activePaneId || !panelTree) return undefined;
    const pane = findPane(panelTree, activePaneId);
    if (!pane || pane.tabs.length === 0) return undefined;
    return pane.tabs[pane.activeTabIndex]?.tabId;
  }, [activePaneId, panelTree]);

  // Collect all tabs from the tree into a flat Map (for the tab bar)
  const getAllTabs = useCallback((): Map<string, TerminalTabInfo> => {
    const tabs = new Map<string, TerminalTabInfo>();
    const collect = (node: PanelNode) => {
      if (node.type === 'leaf') {
        node.tabs.forEach((tab) => tabs.set(tab.tabId, tab));
      } else {
        node.children.forEach(collect);
      }
    };
    if (panelTree) collect(panelTree);
    return tabs;
  }, [panelTree]);

  // ── Tab actions ──────────────────────────────────────────────────────────

  const addTab = useCallback((paneId: string, mode: TerminalMode = 'agent') => {
    const tabId = nextId();
    const info: TerminalTabInfo = {
      tabId,
      mode,
      title: mode === 'agent' ? 'New goal' : 'New shell',
    };

    setPanelTree((prev) => {
      return addTabToPane(prev, paneId, info);
    });
    setActivePaneId(paneId);
  }, []);

  const closeTab = useCallback(
    (paneId: string, tabId: string) => {
      setPanelTree((prev) => {
        // Try to remove the tab from the pane
        const result = removeTabFromPane(prev, paneId, tabId);

        // If the pane has no tabs left, remove the pane entirely
        if (result === null) {
          // Remove the pane from the tree
          return removePane(prev, paneId);
        }
        return result;
      });

      // If we were focused on the closed tab, update focus
      if (activePaneId === paneId) {
        setPanelTree((tree) => {
          const pane = findPane(tree, paneId);
          if (!pane || pane.tabs.length === 0) {
            // Pane was removed; activate a sibling
            const anyPane = findAnyPane(tree);
            setActivePaneId(anyPane?.paneId);
          } else {
            setActivePaneId(paneId);
          }
          return tree;
        });
      }
    },
    [activePaneId],
  );

  const selectTab = useCallback((paneId: string, tabId: string) => {
    setPanelTree((prev) => {
      return selectTabInPane(prev, paneId, tabId);
    });
    setActivePaneId(paneId);
  }, []);

  const updateTitle = useCallback((tabId: string, title: string) => {
    setPanelTree((prev) => {
      return updateTabTitle(prev, tabId, title);
    });
  }, []);

  const updateSessionId = useCallback((tabId: string, sessionId: string) => {
    setPanelTree((prev) => {
      return updateTabSessionId(prev, tabId, sessionId);
    });
  }, []);

  const focusPane = useCallback((paneId: string) => {
    setActivePaneId(paneId);
  }, []);

  // ── Split actions ────────────────────────────────────────────────────────

  const splitRight = useCallback((paneId: string) => {
    const newPaneId = nextId();
    const newTabId = nextId();
    const newTab: TerminalTabInfo = {
      tabId: newTabId,
      mode: 'agent',
      title: 'New goal',
    };
    const newPane: PanelLeaf = {
      type: 'leaf',
      paneId: newPaneId,
      tabs: [newTab],
      activeTabIndex: 0,
    };

    setPanelTree((prev) => {
      return splitPane(prev, paneId, 'horizontal', newPane);
    });
    setActivePaneId(newPaneId);
  }, []);

  const splitDown = useCallback((paneId: string) => {
    const newPaneId = nextId();
    const newTabId = nextId();
    const newTab: TerminalTabInfo = {
      tabId: newTabId,
      mode: 'agent',
      title: 'New goal',
    };
    const newPane: PanelLeaf = {
      type: 'leaf',
      paneId: newPaneId,
      tabs: [newTab],
      activeTabIndex: 0,
    };

    setPanelTree((prev) => {
      return splitPane(prev, paneId, 'vertical', newPane);
    });
    setActivePaneId(newPaneId);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || !activePaneId) return;

      // Cmd+T: new tab in active pane
      if (e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        addTab(activePaneId, 'agent');
      }
      // Cmd+W: close active tab in active pane
      if (e.key.toLowerCase() === 'w' && !e.shiftKey) {
        e.preventDefault();
        const tabId = getActiveTabId();
        if (tabId) closeTab(activePaneId, tabId);
      }
      // Cmd+\: split right
      if (e.key === '\\' && !e.shiftKey) {
        e.preventDefault();
        splitRight(activePaneId);
      }
      // Cmd+Shift+\: split down
      if (e.key === '\\' && e.shiftKey) {
        e.preventDefault();
        splitDown(activePaneId);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addTab, closeTab, splitRight, splitDown, activePaneId, getActiveTabId]);

  return {
    panelTree,
    activePaneId,
    getActiveTabId,
    getAllTabs,
    addTab,
    closeTab,
    selectTab,
    updateTitle,
    updateSessionId,
    focusPane,
    splitRight,
    splitDown,
    layout,
  };
}

// ─── Tree manipulation helpers ────────────────────────────────────────────────

function findPane(node: PanelNode, paneId: string): PanelLeaf | null {
  if (node.type === 'leaf') {
    return node.paneId === paneId ? node : null;
  }
  for (const child of node.children) {
    const found = findPane(child, paneId);
    if (found) return found;
  }
  return null;
}

function findAnyPane(node: PanelNode): PanelLeaf | null {
  if (node.type === 'leaf') return node;
  for (const child of node.children) {
    const found = findAnyPane(child);
    if (found) return found;
  }
  return null;
}

function addTabToPane(
  node: PanelNode,
  paneId: string,
  tab: TerminalTabInfo,
): PanelNode {
  if (node.type === 'leaf') {
    if (node.paneId === paneId) {
      return {
        ...node,
        tabs: [...node.tabs, tab],
        activeTabIndex: node.tabs.length, // new tab becomes active
      };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((child) => addTabToPane(child, paneId, tab)),
  };
}

function removeTabFromPane(
  node: PanelNode,
  paneId: string,
  tabId: string,
): PanelNode | null {
  if (node.type === 'leaf') {
    if (node.paneId === paneId) {
      const filtered = node.tabs.filter((t) => t.tabId !== tabId);
      if (filtered.length === 0) {
        return null; // signal that pane should be removed
      }
      let activeIndex = node.activeTabIndex;
      if (activeIndex >= filtered.length) {
        activeIndex = filtered.length - 1;
      }
      return { ...node, tabs: filtered, activeTabIndex: activeIndex };
    }
    return node;
  }
  const newChildren = node.children.map((child) =>
    removeTabFromPane(child, paneId, tabId),
  );
  // Filter out nulls (removed panes)
  const filtered = newChildren.filter((c): c is PanelNode => c !== null);
  if (filtered.length === 0) return null;
  if (filtered.length === 1 && node.children.length > 1) {
    // Collapse: sibling pane takes the space
    return filtered[0];
  }
  return { ...node, children: filtered };
}

function removePane(node: PanelNode, paneId: string): PanelNode {
  if (node.type === 'leaf') {
    // Should not reach here if pane exists, but return empty leaf as fallback
    return node;
  }
  const newChildren = node.children
    .map((child) => {
      if (child.type === 'leaf' && child.paneId === paneId) return null;
      return removePane(child, paneId);
    })
    .filter((c): c is PanelNode => c !== null);

  if (newChildren.length === 1) return newChildren[0];
  if (newChildren.length === 0) {
    // All panes removed — return a new empty leaf
    const newPaneId = nextId();
    return {
      type: 'leaf',
      paneId: newPaneId,
      tabs: [],
      activeTabIndex: 0,
    };
  }
  return { ...node, children: newChildren };
}

function selectTabInPane(
  node: PanelNode,
  paneId: string,
  tabId: string,
): PanelNode {
  if (node.type === 'leaf') {
    if (node.paneId === paneId) {
      const idx = node.tabs.findIndex((t) => t.tabId === tabId);
      if (idx >= 0) {
        return { ...node, activeTabIndex: idx };
      }
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((child) =>
      selectTabInPane(child, paneId, tabId),
    ),
  };
}

function updateTabTitle(
  node: PanelNode,
  tabId: string,
  title: string,
): PanelNode {
  if (node.type === 'leaf') {
    const tabs = node.tabs.map((t) =>
      t.tabId === tabId ? { ...t, title } : t,
    );
    return { ...node, tabs };
  }
  return {
    ...node,
    children: node.children.map((child) => updateTabTitle(child, tabId, title)),
  };
}

function updateTabSessionId(
  node: PanelNode,
  tabId: string,
  sessionId: string,
): PanelNode {
  if (node.type === 'leaf') {
    const tabs = node.tabs.map((t) =>
      t.tabId === tabId ? { ...t, sessionId } : t,
    );
    return { ...node, tabs };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      updateTabSessionId(child, tabId, sessionId),
    ),
  };
}

function splitPane(
  node: PanelNode,
  paneId: string,
  direction: 'horizontal' | 'vertical',
  newPane: PanelLeaf,
): PanelNode {
  if (node.type === 'leaf') {
    if (node.paneId === paneId) {
      return {
        type: 'split',
        direction,
        children: [node, newPane],
        sizes: [50, 50],
      };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((child) =>
      splitPane(child, paneId, direction, newPane),
    ),
  };
}
