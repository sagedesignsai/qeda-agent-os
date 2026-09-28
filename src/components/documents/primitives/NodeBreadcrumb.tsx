/**
 * components/documents/primitives/NodeBreadcrumb.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive breadcrumb navigation bar showing the ancestor hierarchy of the
 * currently selected node (e.g. Document > Section [Col] > Badge [Row] > Text).
 *
 * Clicking any ancestor immediately selects it in the canvas and inspector.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { ChevronRightIcon, LayersIcon } from 'lucide-react';
import type { DocNode } from '@/lib/pdf-studio/primitives-ast';
import { isContainerNode } from '@/lib/pdf-studio/primitives-ast';

interface NodeBreadcrumbProps {
  nodes: DocNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

export function findNodePath(
  nodes: DocNode[],
  targetId: string,
  currentPath: DocNode[] = [],
): DocNode[] | null {
  for (const node of nodes) {
    const nextPath = [...currentPath, node];
    if (node.id === targetId) return nextPath;
    if (isContainerNode(node)) {
      const found = findNodePath(node.children, targetId, nextPath);
      if (found) return found;
    }
  }
  return null;
}

export function NodeBreadcrumb({
  nodes,
  selectedNodeId,
  onSelectNode,
}: NodeBreadcrumbProps) {
  if (!selectedNodeId) {
    return (
      <div className="flex h-7 items-center gap-1.5 px-4 text-xs text-muted-foreground/60 border-b border-border/50 bg-background/50 select-none">
        <LayersIcon className="h-3 w-3" />
        <span className="text-[11px]">No element selected</span>
      </div>
    );
  }

  const path = findNodePath(nodes, selectedNodeId) || [];

  return (
    <div className="flex h-7 items-center gap-1 overflow-x-auto px-4 text-xs border-b border-border/50 bg-background/50 select-none">
      <button
        type="button"
        onClick={() => onSelectNode(null)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <LayersIcon className="h-3 w-3" />
        <span>Document</span>
      </button>

      {path.map((node, index) => {
        const isLast = index === path.length - 1;
        const label =
          node.name ||
          (node.type === 'text' && (node as any).content
            ? `"${(node as any).content.slice(0, 10)}..."`
            : `${node.type}`);

        return (
          <React.Fragment key={node.id}>
            <ChevronRightIcon className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <button
              type="button"
              onClick={() => onSelectNode(node.id)}
              className={`rounded px-1.5 py-0.5 text-[11px] font-mono transition-colors cursor-pointer truncate max-w-[140px] ${
                isLast
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
