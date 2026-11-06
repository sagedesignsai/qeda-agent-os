import { TRACE_HISTORY_LIMIT, useTraceStore } from '@/stores/trace-store';
import { createBlankTraceProject } from '@/lib/trace/defaults';
import type { TraceProject } from '@/lib/trace/types';

function loadBlank(): TraceProject {
  const project = createBlankTraceProject('Store Test');
  useTraceStore
    .getState()
    .loadProject(project, { path: '/tmp/trace', revision: 3 });
  return project;
}

beforeEach(() => {
  useTraceStore.getState().closeProject();
});

describe('Trace store', () => {
  it('loads a project and resets transient state', () => {
    loadBlank();
    const state = useTraceStore.getState();

    expect(state.project?.name).toBe('Store Test');
    expect(state.revision).toBe(3);
    expect(state.dirty).toBe(false);
    expect(state.canUndo).toBe(false);
    expect(state.playback.currentTimeMs).toBe(0);
    expect(state.selection.selectedElementId).toBeNull();
  });

  it('applies ops through the doc engine and marks the document dirty', () => {
    loadBlank();

    const result = useTraceStore.getState().dispatch([
      {
        type: 'addElement',
        element: { type: 'text', text: 'Hello', x: 100, y: 100 },
      },
    ]);

    expect(result?.ok).toBe(true);
    const state = useTraceStore.getState();
    expect(state.dirty).toBe(true);
    expect(state.canUndo).toBe(true);
    expect(Object.keys(state.project?.elements ?? {})).toHaveLength(1);
  });

  it('undoes and redoes a batch', () => {
    loadBlank();
    useTraceStore
      .getState()
      .dispatch([
        { type: 'addElement', element: { type: 'text', text: 'Undo me' } },
      ]);

    useTraceStore.getState().undo();
    expect(
      Object.keys(useTraceStore.getState().project?.elements ?? {}),
    ).toHaveLength(0);
    expect(useTraceStore.getState().canRedo).toBe(true);

    useTraceStore.getState().redo();
    expect(
      Object.keys(useTraceStore.getState().project?.elements ?? {}),
    ).toHaveLength(1);
  });

  it('leaves state untouched when a batch fails', () => {
    const project = loadBlank();

    const result = useTraceStore
      .getState()
      .dispatch([{ type: 'deleteElement', id: 'not-a-real-element' }]);

    expect(result?.ok).toBe(false);
    const state = useTraceStore.getState();
    expect(state.project).toBe(project);
    expect(state.dirty).toBe(false);
    expect(state.canUndo).toBe(false);
  });

  it('caps the undo stack', () => {
    loadBlank();

    for (let index = 0; index < TRACE_HISTORY_LIMIT + 5; index += 1) {
      useTraceStore
        .getState()
        .dispatch([
          { type: 'addElement', element: { type: 'rect', x: index, y: index } },
        ]);
    }

    expect(useTraceStore.getState().past.length).toBe(TRACE_HISTORY_LIMIT);
  });

  it('clamps the playhead to the document duration', () => {
    loadBlank();

    useTraceStore.getState().setPlayhead(999_999);
    expect(useTraceStore.getState().playback.currentTimeMs).toBe(6000);

    useTraceStore.getState().setPlayhead(-50);
    expect(useTraceStore.getState().playback.currentTimeMs).toBe(0);
  });

  it('creates and edits property tracks', () => {
    loadBlank();
    const added = useTraceStore
      .getState()
      .dispatch([
        { type: 'addElement', element: { type: 'text', text: 'Animate' } },
      ]);
    const elementId = added?.diff.added[0] as string;

    useTraceStore.getState().addPropertyTrack(elementId, 'opacity');
    useTraceStore.getState().setPlayhead(1000);
    useTraceStore.getState().addKeyframe(elementId, 'opacity', 1000, 0);

    const element = useTraceStore.getState().project?.elements[elementId];
    const track = element?.tracks.find((entry) => entry.property === 'opacity');
    expect(track?.keyframes).toHaveLength(2);
    expect(track?.keyframes.some((keyframe) => keyframe.timeMs === 1000)).toBe(
      true,
    );
    expect(
      useTraceStore.getState().selection.expandedElementIds.includes(elementId),
    ).toBe(true);
  });

  it('auto-keyframes edits to an already animated property', () => {
    loadBlank();
    const added = useTraceStore
      .getState()
      .dispatch([
        { type: 'addElement', element: { type: 'rect', x: 100, y: 100 } },
      ]);
    const elementId = added?.diff.added[0] as string;

    useTraceStore.getState().addPropertyTrack(elementId, 'x');
    useTraceStore.getState().setPlayhead(1500);
    useTraceStore.getState().updateAttributes(elementId, { x: 420 });

    const track = useTraceStore
      .getState()
      .project?.elements[elementId].tracks.find(
        (entry) => entry.property === 'x',
      );
    expect(track?.keyframes.some((keyframe) => keyframe.timeMs === 1500)).toBe(
      true,
    );
  });

  it('tracks save lifecycle', () => {
    loadBlank();

    useTraceStore.getState().markSaving();
    expect(useTraceStore.getState().saveState).toBe('saving');

    useTraceStore.getState().markSaved(4);
    expect(useTraceStore.getState().saveState).toBe('saved');
    expect(useTraceStore.getState().revision).toBe(4);
    expect(useTraceStore.getState().dirty).toBe(false);

    useTraceStore.getState().markSaveFailed('disk full');
    expect(useTraceStore.getState().saveState).toBe('error');
    expect(useTraceStore.getState().saveError).toBe('disk full');
  });
});
