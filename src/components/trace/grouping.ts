/**
 * components/trace/grouping.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DOM-assisted helpers for layer grouping. Bounds are only needed to pick a
 * sensible rotation pivot, so they live outside the pure ops layer.
 */

import {
  applyMatrix,
  commonParentId,
  invertMatrix,
  topmostSelectedIds,
  worldMatrix,
} from '@/lib/trace/hierarchy';
import { findElementDom, measureElementBBox } from '@/lib/trace/runtime/dom-renderer';
import type { Point, TraceProject } from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';

/**
 * Centre of the selected layers' artboard bounds, expressed in the group's
 * local space (the common parent's coordinate system).
 */
export function groupOriginForSelection(
  project: TraceProject,
  elementIds: string[],
): Point | undefined {
  if (typeof document === 'undefined' || elementIds.length === 0) {
    return undefined;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let measured = false;

  for (const elementId of elementIds) {
    if (!project.elements[elementId]) continue;
    const node = findElementDom(elementId) as SVGGraphicsElement | null;
    if (!node) continue;
    const box = measureElementBBox(node);
    if (!box || box.width <= 0 || box.height <= 0) continue;

    const world = worldMatrix(project, elementId);
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ];
    for (const corner of corners) {
      const point = applyMatrix(world, corner);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      measured = true;
    }
  }

  if (!measured) return undefined;

  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const parentId = commonParentId(project, elementIds);
  if (!parentId) return centre;
  return applyMatrix(invertMatrix(worldMatrix(project, parentId)), centre);
}

/** Selected layer ids that can be ungrouped (actual groups with children). */
export function ungroupableIds(
  project: TraceProject,
  elementIds: string[],
): string[] {
  return elementIds.filter((id) => {
    const element = project.elements[id];
    return Boolean(element?.type === 'group' && element.childrenIds?.length);
  });
}

/** Group the current layer selection and focus the new group. */
export function groupSelectedElements(): void {
  const state = useTraceStore.getState();
  const project = state.project;
  if (!project) return;
  const ids = topmostSelectedIds(project, state.selection.selectedElementIds);
  if (ids.length < 2) return;

  const origin = groupOriginForSelection(project, ids);
  const result = state.dispatch([{ type: 'groupElements', elementIds: ids, origin }]);
  const groupId = result?.diff.added.find(
    (id) => result.project.elements[id]?.type === 'group',
  );
  if (groupId) state.selectElement(groupId);
}

/** Dissolve every selected group and select the freed children. */
export function ungroupSelectedElements(): void {
  const state = useTraceStore.getState();
  const project = state.project;
  if (!project) return;
  const groups = ungroupableIds(project, state.selection.selectedElementIds);
  if (groups.length === 0) return;

  const childIds = [
    ...new Set(
      groups.flatMap((id) => project.elements[id]?.childrenIds ?? []),
    ),
  ];
  state.dispatch(
    groups.map((id) => ({ type: 'ungroupElement', id }) as const),
  );
  if (childIds.length > 0) state.selectElements(childIds);
}
