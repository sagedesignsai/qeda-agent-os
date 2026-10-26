/**
 * hooks/use-terminal-layout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the terminal workspace layout: tabs, panel splits, and focus state.
 *
 * Each tab owns a terminal session (agent or shell). Tabs live in a panel tree
 * that supports recursive horizontal and vertical splits via nested
 * react-resizable-panels groups.
 *
 * Layout state is persisted in localStorage via useDefaultLayout so panel sizes
 * survive focus changes within a session.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import type { TerminalMode } from '@/components/terminal/TerminalTab';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalTabInfo {
  tabId: string;
  sessionId?: string;
  mode: TerminalMode;
  title: string;
}

/** A leaf panel holding a single tab. */
export interface PanelLeaf {
  type: 'leaf';
  tabId: string;
}

/** A split panel containing child panels. */
export interface PanelSplit {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  children: PanelNode[];
  /** Relative sizes for children (sums to 100). */
  sizes?: number[];
}

export type PanelNode = PanelLeaf | PanelSplit;

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tabCounter = 0;
const nextTabId = (): string => `tab-${Date.now()}-${++tabCounter}`;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTerminalLayout() {
  const [tabs, setTabs] = useState<Map<string, TerminalTabInfo>>(new Map());
  const [activeTabId, setActiveTabId] = useState<string | undefined>();
  const [panelTree, setPanelTree] = useState<PanelNode>({
    type: 'leaf',
    tabId: nextTabId(),
  });

  // Track the initial leaf tab ID so we can populate it
  const initialTabIdRef = useRef((panelTree as PanelLeaf).tabId);

  const layout = useDefaultLayout({ id: 'qeda-terminal-layout-v1' });

  // Initialize: create a default agent tab
  useEffect(() => {
    const tabId = initialTabIdRef.current;
    setTabs((prev) => {
      const next = new Map(prev);
      next.set(tabId, {
        tabId,
        mode: 'agent',
        title: 'New session',
      });
      return next;
    });
    setActiveTabId(tabId);
  }, []);

  // ── Tab actions ──────────────────────────────────────────────────────────

  const addTab = useCallback((mode: TerminalMode = 'agent') => {
    const tabId = nextTabId();
    const info: TerminalTabInfo = {
      tabId,
      mode,
      title: mode === 'agent' ? 'New goal' : 'New shell',
    };

    setTabs((prev) => {
      const next = new Map(prev);
      next.set(tabId, info);
      return next;
    });
    setActiveTabId(tabId);

    // Add to panel tree: if single leaf, split horizontally; otherwise add to root
    setPanelTree((prev) => {
      if (prev.type === 'leaf') {
        // Split the current leaf and the new tab horizontally
        return {
          type: 'split',
          direction: 'horizontal',
          children: [
            { type: 'leaf', tabId: prev.tabId },
            { type: 'leaf', tabId },
          ],
          sizes: [50, 50],
        };
      }
      // Already split — add as a new sibling to the last child
      const addToList = (nodes: PanelNode[]): PanelNode[] => {
        const last = nodes[nodes.length - 1];
        if (last.type === 'leaf') {
          return [
            ...nodes.slice(0, -1),
            {
              type: 'split',
              direction: 'horizontal',
              children: [
                { type: 'leaf', tabId: last.tabId },
                { type: 'leaf', tabId },
              ],
              sizes: [50, 50],
            },
          ];
        }
        return [
          ...nodes.slice(0, -1),
          { ...last, children: addToList(last.children) },
        ];
      };
      return { ...prev, children: addToList(prev.children) };
    });
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const next = new Map(prev);
        next.delete(tabId);

        // If closing the active tab, switch to another
        if (activeTabId === tabId) {
          setActiveTabId(
            next.size > 0 ? Array.from(next.keys())[0] : undefined,
          );
        }

        // Remove from panel tree
        setPanelTree((tree) => removeTabFromTree(tree, tabId));

        return next;
      });
    },
    [activeTabId],
  );

  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const updateTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => {
      const info = prev.get(tabId);
      if (info) {
        const next = new Map(prev);
        next.set(tabId, { ...info, title });
        return next;
      }
      return prev;
    });
  }, []);

  const updateSessionId = useCallback((tabId: string, sessionId: string) => {
    setTabs((prev) => {
      const info = prev.get(tabId);
      if (info) {
        const next = new Map(prev);
        next.set(tabId, { ...info, sessionId });
        return next;
      }
      return prev;
    });
  }, []);

  // ── Split actions ────────────────────────────────────────────────────────

  const splitRight = useCallback(() => {
    const newTabId = nextTabId();
    const info: TerminalTabInfo = {
      tabId: newTabId,
      mode: 'agent',
      title: 'New goal',
    };

    setTabs((prev) => {
      const next = new Map(prev);
      next.set(newTabId, info);
      return next;
    });
    setActiveTabId(newTabId);

    setPanelTree((prev) => {
      // Split the panel containing the active tab
      return splitNode(prev, activeTabId ?? newTabId, 'horizontal', newTabId);
    });
  }, [activeTabId]);

  const splitDown = useCallback(() => {
    const newTabId = nextTabId();
    const info: TerminalTabInfo = {
      tabId: newTabId,
      mode: 'agent',
      title: 'New goal',
    };

    setTabs((prev) => {
      const next = new Map(prev);
      next.set(newTabId, info);
      return next;
    });
    setActiveTabId(newTabId);

    setPanelTree((prev) => {
      return splitNode(prev, activeTabId ?? newTabId, 'vertical', newTabId);
    });
  }, [activeTabId]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;

      // Cmd+T: new tab
      if (e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        addTab('agent');
      }
      // Cmd+W: close active tab
      if (e.key.toLowerCase() === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      }
      // Cmd+\: split right
      if (e.key === '\\' && !e.shiftKey) {
        e.preventDefault();
        splitRight();
      }
      // Cmd+Shift+\: split down
      if (e.key === '\\' && e.shiftKey) {
        e.preventDefault();
        splitDown();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addTab, closeTab, splitRight, splitDown, activeTabId]);

  // ── Collect all tab IDs from the tree ────────────────────────────────────

  const getAllTabIds = (() => {
    const collect = (node: PanelNode): string[] => {
      if (node.type === 'leaf') return [node.tabId];
      return node.children.flatMap(collect);
    };
    return collect;
  })();

  return {
    tabs,
    activeTabId,
    panelTree,
    layout,
    addTab,
    closeTab,
    selectTab,
    updateTitle,
    updateSessionId,
    splitRight,
    splitDown,
    getAllTabIds,
  };
}

// ─── Tree manipulation helpers ────────────────────────────────────────────────

function removeTabFromTree(tree: PanelNode, tabId: string): PanelNode {
  if (tree.type === 'leaf') {
    return tree.tabId === tabId ? { type: 'leaf', tabId: nextTabId() } : tree;
  }

  const children = tree.children
    .map((child) => removeTabFromTree(child, tabId))
    .filter((child): child is PanelNode => child !== null);

  // If a split has only one child left, collapse it
  if (children.length === 1) {
    return children[0];
  }

  return { ...tree, children };
}

function splitNode(
  node: PanelNode,
  targetTabId: string,
  direction: 'horizontal' | 'vertical',
  newTabId: string,
): PanelNode {
  if (node.type === 'leaf') {
    if (node.tabId === targetTabId) {
      return {
        type: 'split',
        direction,
        children: [
          { type: 'leaf', tabId: node.tabId },
          { type: 'leaf', tabId: newTabId },
        ],
        sizes: [50, 50],
      };
    }
    return node;
  }

  const children = node.children.map((child) =>
    splitNode(child, targetTabId, direction, newTabId),
  );

  return { ...node, children };
}
