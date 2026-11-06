import { stageOf, stageOrNull } from '@/lib/trace/document';
/**
 * stores/trace/slices/selection-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Selection and tree expansion. Selecting a nested layer opens its ancestors so
 * the timeline never hides the current selection.
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
    selectedKeyframeIds: [],
    expandedElementIds: [],
    collapsedElementIds: [],
    activeSceneId: null,
    editingPathElementId: null,
  },

  selectElement: (elementId) => {
    const stage = stageOrNull(get().project);
    if (!elementId || !stage?.elements[elementId]) {
      set((state) => ({
        selection: {
          ...state.selection,
          selectedElementId: null,
          selectedKeyframeIds: [],
          editingPathElementId: null,
        },
      }));
      return;
    }

    const ancestors = ancestorsOf(stage.elements, elementId);
    set((state) => {
      const expanded = new Set(state.selection.expandedElementIds);
      expanded.add(elementId);
      ancestors.forEach((id) => expanded.add(id));

      return {
        selection: {
          ...state.selection,
          selectedElementId: elementId,
          selectedKeyframeIds: [],
          editingPathElementId:
            state.selection.editingPathElementId === elementId
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
      return {
        selection: {
          ...state.selection,
          selectedElementId: elementId || state.selection.selectedElementId,
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
        collapsedElementIds: Object.values(stageOf(project).elements).map(
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
    if (!stageOrNull(project)?.elements[elementId]) return;
    set((state) => ({
      selection: {
        ...state.selection,
        selectedElementId: elementId,
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
