/**
 * stores/trace/slices/selection-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Selection and tree expansion. Selecting a nested layer opens its ancestors so
 * the timeline never hides the current selection.
 *
 * `selectedElementId` stays the primary selection (inspector + gizmo); the full
 * layer selection lives in `selectedElementIds` for grouping, batching and DnD.
 */

import type {
  TraceSliceCreator,
  TraceSelectionActions,
  TraceSelectionState,
} from './types';

function ancestorsOf(
  elements: Record<string, { parentId?: string | null }>,
  elementId: string,
): string[] {
  const ancestors: string[] = [];
  let current = elements[elementId]?.parentId ?? null;
  const guard = new Set<string>([elementId]);

  while (current && !guard.has(current)) {
    guard.add(current);
    ancestors.push(current);
    current = elements[current]?.parentId ?? null;
  }
  return ancestors;
}

export const createSelectionSlice: TraceSliceCreator<
  TraceSelectionState & TraceSelectionActions
> = (set, get) => ({
  selection: {
    selectedElementId: null,
    selectedElementIds: [],
    selectedKeyframeIds: [],
    expandedElementIds: [],
    collapsedElementIds: [],
    activeSceneId: null,
    editingPathElementId: null,
  },

  selectElement: (elementId, options = {}) => {
    const project = get().project;
    if (!elementId || !project?.elements[elementId]) {
      set((state) => ({
        selection: {
          ...state.selection,
          selectedElementId: null,
          selectedElementIds: [],
          selectedKeyframeIds: [],
          editingPathElementId: null,
        },
      }));
      return;
    }

    const ancestors = ancestorsOf(project.elements, elementId);
    set((state) => {
      const expanded = new Set(state.selection.expandedElementIds);
      expanded.add(elementId);
      ancestors.forEach((id) => expanded.add(id));

      const previous = state.selection.selectedElementIds ?? [];
      let selectedElementIds: string[];
      if (options.additive) {
        selectedElementIds = previous.includes(elementId)
          ? previous.filter((id) => id !== elementId)
          : [...previous, elementId];
      } else {
        selectedElementIds = [elementId];
      }

      if (selectedElementIds.length === 0) {
        return {
          selection: {
            ...state.selection,
            selectedElementId: null,
            selectedElementIds: [],
            selectedKeyframeIds: [],
            editingPathElementId: null,
            expandedElementIds: [...expanded],
            collapsedElementIds: state.selection.collapsedElementIds.filter(
              (id) => !ancestors.includes(id),
            ),
          },
        };
      }

      const primary = selectedElementIds.includes(elementId)
        ? elementId
        : selectedElementIds[selectedElementIds.length - 1];

      return {
        selection: {
          ...state.selection,
          selectedElementId: primary,
          selectedElementIds,
          selectedKeyframeIds: [],
          editingPathElementId:
            selectedElementIds.length === 1 &&
            state.selection.editingPathElementId === primary
              ? state.selection.editingPathElementId
              : null,
          expandedElementIds: [...expanded],
          collapsedElementIds: state.selection.collapsedElementIds.filter(
            (id) => !ancestors.includes(id),
          ),
        },
      };
    });
  },

  selectElements: (elementIds, primaryId) => {
    const project = get().project;
    const ids = [...new Set(elementIds)].filter((id) =>
      Boolean(project?.elements[id]),
    );
    if (ids.length === 0) {
      set((state) => ({
        selection: {
          ...state.selection,
          selectedElementId: null,
          selectedElementIds: [],
          selectedKeyframeIds: [],
          editingPathElementId: null,
        },
      }));
      return;
    }

    const expanded = new Set(get().selection.expandedElementIds);
    const revealed = new Set<string>();
    if (project) {
      for (const id of ids) {
        expanded.add(id);
        ancestorsOf(project.elements, id).forEach((ancestor) => {
          expanded.add(ancestor);
          revealed.add(ancestor);
        });
      }
    }

    const primary =
      primaryId && ids.includes(primaryId) ? primaryId : ids[ids.length - 1];
    set((state) => ({
      selection: {
        ...state.selection,
        selectedElementId: primary,
        selectedElementIds: ids,
        selectedKeyframeIds: [],
        editingPathElementId:
          ids.length === 1 &&
          state.selection.editingPathElementId === primary
            ? state.selection.editingPathElementId
            : null,
        expandedElementIds: [...expanded],
        collapsedElementIds: state.selection.collapsedElementIds.filter(
          (id) => !revealed.has(id),
        ),
      },
    }));
  },

  selectAllElements: () => {
    const project = get().project;
    if (!project) return;
    const ids = Object.keys(project.elements);
    if (ids.length === 0) {
      set((state) => ({
        selection: {
          ...state.selection,
          selectedElementId: null,
          selectedElementIds: [],
          selectedKeyframeIds: [],
          editingPathElementId: null,
        },
      }));
      return;
    }
    set((state) => ({
      selection: {
        ...state.selection,
        selectedElementId: ids[ids.length - 1],
        selectedElementIds: ids,
        selectedKeyframeIds: [],
        editingPathElementId: null,
      },
    }));
  },

  selectKeyframe: (keyframeKey, additive = false) => {
    if (!keyframeKey) {
      set((state) => ({
        selection: { ...state.selection, selectedKeyframeIds: [] },
      }));
      return;
    }

    set((state) => {
      const current = state.selection.selectedKeyframeIds;
      const selectedKeyframeIds = additive
        ? current.includes(keyframeKey)
          ? current.filter((key) => key !== keyframeKey)
          : [...current, keyframeKey]
        : [keyframeKey];

      const [elementId] = keyframeKey.split(':');
      const isKnown = Boolean(elementId && state.project?.elements[elementId]);
      return {
        selection: {
          ...state.selection,
          selectedElementId: isKnown
            ? elementId
            : state.selection.selectedElementId,
          selectedElementIds: isKnown
            ? state.selection.selectedElementIds.includes(elementId)
              ? state.selection.selectedElementIds
              : [elementId]
            : state.selection.selectedElementIds,
          selectedKeyframeIds,
        },
      };
    });
  },

  toggleExpandElement: (elementId) =>
    set((state) => {
      const expanded = new Set(state.selection.expandedElementIds);
      if (expanded.has(elementId)) expanded.delete(elementId);
      else expanded.add(elementId);
      return {
        selection: { ...state.selection, expandedElementIds: [...expanded] },
      };
    }),

  toggleCollapseElement: (elementId) =>
    set((state) => {
      const collapsed = new Set(state.selection.collapsedElementIds);
      if (collapsed.has(elementId)) collapsed.delete(elementId);
      else collapsed.add(elementId);
      return {
        selection: { ...state.selection, collapsedElementIds: [...collapsed] },
      };
    }),

  collapseAllElements: () => {
    const project = get().project;
    if (!project) return;
    set((state) => ({
      selection: {
        ...state.selection,
        collapsedElementIds: Object.values(project.elements).map(
          (element) => element.id,
        ),
        expandedElementIds: [],
      },
    }));
  },

  expandAllElements: () =>
    set((state) => ({
      selection: {
        ...state.selection,
        collapsedElementIds: [],
        expandedElementIds: [],
      },
    })),

  setActiveScene: (sceneId) =>
    set((state) => ({
      selection: { ...state.selection, activeSceneId: sceneId },
    })),

  startPathEdit: (elementId) => {
    const project = get().project;
    if (!project?.elements[elementId]) return;
    set((state) => ({
      selection: {
        ...state.selection,
        selectedElementId: elementId,
        selectedElementIds: [elementId],
        selectedKeyframeIds: [],
        editingPathElementId: elementId,
      },
    }));
  },

  endPathEdit: () =>
    set((state) => ({
      selection: { ...state.selection, editingPathElementId: null },
    })),
});
