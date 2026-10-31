/**
 * lib/motion/hierarchy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene-tree ordering and reparent rules. The panel needs both to render rows and
 * to disable invalid drop targets; keeping them here means the tree can be tested
 * without simulating a pointer drag.
 */

import { getMotionNodeType } from './node-registry';
import type { MotionNode } from './types';

export type MotionHierarchyRow = {
  node: MotionNode;
  depth: number;
  /** Present for rows the user can expand or collapse. */
  childIds: readonly string[];
};

export type MotionReparentCheck =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Depth-first flatten that keeps orphans visible as roots instead of hiding them. */
export function buildMotionHierarchy(
  nodes: readonly MotionNode[],
  collapsed: ReadonlySet<string> = new Set(),
): MotionHierarchyRow[] {
  const ids = new Set(nodes.map((node) => node.id));
  const childrenByParent = new Map<string | null, MotionNode[]>();
  for (const node of nodes) {
    const parentId = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const bucket = childrenByParent.get(parentId);
    if (bucket) bucket.push(node);
    else childrenByParent.set(parentId, [node]);
  }

  const rows: MotionHierarchyRow[] = [];
  const visit = (parentId: string | null, depth: number, seen: Set<string>): void => {
    for (const node of childrenByParent.get(parentId) ?? []) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const childIds = (childrenByParent.get(node.id) ?? []).map((child) => child.id);
      rows.push({ node, depth, childIds });
      if (!collapsed.has(node.id)) visit(node.id, depth + 1, seen);
    }
  };
  visit(null, 0, new Set());
  return rows;
}

/** Descendant check used by both the drop rule and the op's own guard. */
export function isMotionNodeDescendant(
  nodes: readonly MotionNode[],
  nodeId: string,
  possibleAncestorId: string,
): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let cursor = byId.get(nodeId);
  while (cursor?.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.parentId === possibleAncestorId) return true;
    cursor = byId.get(cursor.parentId);
  }
  return false;
}

export function checkMotionReparent(
  nodes: readonly MotionNode[],
  nodeId: string,
  parentId: string | null,
): MotionReparentCheck {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return { allowed: false, reason: `Node "${nodeId}" does not exist.` };
  if (!parentId) return { allowed: true };
  if (parentId === nodeId) return { allowed: false, reason: 'A node cannot be its own parent.' };

  const parent = nodes.find((candidate) => candidate.id === parentId);
  if (!parent) return { allowed: false, reason: `Parent "${parentId}" does not exist.` };
  if (isMotionNodeDescendant(nodes, parentId, nodeId)) {
    return { allowed: false, reason: 'A node cannot be moved into its own subtree.' };
  }

  const allowedParents = getMotionNodeType(node.type)?.allowedParents;
  if (allowedParents && !allowedParents.includes(parent.type)) {
    return {
      allowed: false,
      reason: `"${node.type}" cannot be parented to "${parent.type}".`,
    };
  }
  return { allowed: true };
}
