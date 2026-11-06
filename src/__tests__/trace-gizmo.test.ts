import {
  artboardToLocal,
  getObbCorners,
  getPivot,
  localToArtboard,
  originTransform,
  rotateTransform,
  roundGizmoTransform,
  scaleTransformAboutOrigin,
  translateTransform,
  type GizmoBBox,
  type GizmoTransform,
} from '@/lib/trace/gizmo/geometry';
import { transformPatch } from '@/lib/trace/resolve';
import { createBlankTraceDocument, stageOrNull } from '@/lib/trace/document';
import { useTraceStore } from '@/stores/trace-store';
import type { TraceElement } from '@/lib/trace/types';

const BBOX: GizmoBBox = { x: 0, y: 0, width: 200, height: 100 };
const ORIGIN = { x: 0, y: 0 };
const START: GizmoTransform = {
  x: 100,
  y: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};

function closeTo(point: { x: number; y: number }, x: number, y: number) {
  expect(point.x).toBeCloseTo(x, 6);
  expect(point.y).toBeCloseTo(y, 6);
}

describe('gizmo geometry: local <-> artboard', () => {
  it('maps an unrotated bbox corner to its artboard position', () => {
    closeTo(localToArtboard({ x: 0, y: 0 }, START, ORIGIN), 100, 100);
    closeTo(localToArtboard({ x: 200, y: 100 }, START, ORIGIN), 300, 200);
    expect(getPivot(START, ORIGIN)).toEqual({ x: 100, y: 100 });
  });

  it('round-trips through artboardToLocal', () => {
    const rotated: GizmoTransform = {
      x: 50,
      y: 80,
      rotation: 33,
      scaleX: 1.4,
      scaleY: 0.7,
    };
    const origin = { x: 40, y: 20 };
    const local = { x: 120, y: 60 };
    const artboard = localToArtboard(local, rotated, origin);
    const back = artboardToLocal(artboard, rotated, origin);
    expect(back.x).toBeCloseTo(local.x, 6);
    expect(back.y).toBeCloseTo(local.y, 6);
  });

  it('computes a rotated OBB', () => {
    const corners = getObbCorners(
      BBOX,
      { ...START, rotation: 90 },
      ORIGIN,
    );
    closeTo(corners.nw, 100, 100);
    closeTo(corners.ne, 100, 300);
    closeTo(corners.se, 0, 300);
    closeTo(corners.sw, 0, 100);
    closeTo(corners.center, 50, 200);
  });

  it('computes a scaled OBB about a centre origin', () => {
    const corners = getObbCorners(
      BBOX,
      { x: 100, y: 100, rotation: 0, scaleX: 2, scaleY: 2 },
      { x: 100, y: 50 },
    );
    closeTo(corners.nw, 0, 50);
    closeTo(corners.se, 400, 250);
  });
});

describe('gizmo geometry: translate / rotate', () => {
  it('translates freely and axis-locks on Shift', () => {
    expect(translateTransform(START, { x: 20, y: 30 })).toMatchObject({
      x: 120,
      y: 130,
    });
    expect(
      translateTransform(START, { x: 20, y: 30 }, { axisLock: true }),
    ).toMatchObject({ x: 120, y: 100 });
    expect(
      translateTransform(START, { x: 10, y: 30 }, { axisLock: true }),
    ).toMatchObject({ x: 100, y: 130 });
  });

  it('rotates about the pivot by pointer angle delta', () => {
    // Pivot at (100,100); pointer east -> north is +90° in SVG y-down.
    const next = rotateTransform(
      START,
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 100, y: 200 },
    );
    expect(next.rotation).toBeCloseTo(90, 6);
    expect(next.x).toBe(100);
    expect(next.y).toBe(100);
  });

  it('snaps rotation to 15° when requested', () => {
    // ~17° of movement snaps to 15°.
    const next = rotateTransform(
      START,
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 31 },
      { snap: true },
    );
    expect(next.rotation).toBe(15);
  });
});

describe('gizmo geometry: scale', () => {
  it('scales SE and pins NW (origin at top-left)', () => {
    const next = scaleTransformAboutOrigin(
      START,
      ORIGIN,
      BBOX,
      'se',
      { x: 20, y: 10 },
    );
    expect(next.scaleX).toBeCloseTo(1.1, 6);
    expect(next.scaleY).toBeCloseTo(1.1, 6);
    expect(next.x).toBeCloseTo(100, 6);
    expect(next.y).toBeCloseTo(100, 6);
    const corners = getObbCorners(BBOX, next, ORIGIN);
    closeTo(corners.nw, 100, 100);
    closeTo(corners.se, 320, 210);
  });

  it('scales E on one axis only and pins the west edge', () => {
    const next = scaleTransformAboutOrigin(
      START,
      ORIGIN,
      BBOX,
      'e',
      { x: 20, y: 50 },
    );
    expect(next.scaleX).toBeCloseTo(1.1, 6);
    expect(next.scaleY).toBeCloseTo(1, 6);
    const corners = getObbCorners(BBOX, next, ORIGIN);
    closeTo(corners.nw, 100, 100);
    closeTo(corners.ne, 320, 100);
  });

  it('scales from centre with Alt (twice the factor, centre pinned)', () => {
    const origin = { x: 100, y: 50 };
    const next = scaleTransformAboutOrigin(
      START,
      origin,
      BBOX,
      'se',
      { x: 20, y: 10 },
      { fromCenter: true },
    );
    expect(next.scaleX).toBeCloseTo(1.2, 6);
    expect(next.scaleY).toBeCloseTo(1.2, 6);
    const corners = getObbCorners(BBOX, next, origin);
    closeTo(corners.center, 200, 150);
    closeTo(corners.se, 320, 210);
    closeTo(corners.nw, 80, 90);
  });

  it('keeps aspect ratio with Shift (uniform)', () => {
    const next = scaleTransformAboutOrigin(
      START,
      ORIGIN,
      BBOX,
      'se',
      { x: 20, y: 0 },
      { uniform: true },
    );
    expect(next.scaleX).toBeCloseTo(1.05, 6);
    expect(next.scaleY).toBeCloseTo(1.05, 6);
  });

  it('scales in rotated local space', () => {
    // 90° rotation: local +X points down-screen. Dragging down (0,20)
    // grows scaleX; the NW corner (pinned) must stay put.
    const rotated: GizmoTransform = { ...START, rotation: 90 };
    const next = scaleTransformAboutOrigin(
      rotated,
      ORIGIN,
      BBOX,
      'se',
      { x: 0, y: 20 },
    );
    expect(next.scaleX).toBeCloseTo(1.1, 6);
    expect(next.scaleY).toBeCloseTo(1, 6);
    const before = getObbCorners(BBOX, rotated, ORIGIN);
    const after = getObbCorners(BBOX, next, ORIGIN);
    closeTo(after.nw, before.nw.x, before.nw.y);
  });

  it('clamps scale to a positive range', () => {
    const next = scaleTransformAboutOrigin(
      START,
      ORIGIN,
      BBOX,
      'se',
      { x: -10000, y: -10000 },
    );
    expect(next.scaleX).toBeGreaterThanOrEqual(0.05);
    expect(next.scaleY).toBeGreaterThanOrEqual(0.05);
  });
});

describe('gizmo geometry: origin drag', () => {
  it('keeps the bbox centre fixed while moving the anchor', () => {
    const origin = { x: 100, y: 50 };
    const before = getObbCorners(BBOX, START, origin).center;
    const result = originTransform(START, origin, { x: 20, y: 0 });
    expect(result.origin.x).toBeCloseTo(120, 6);
    const after = getObbCorners(
      BBOX,
      result.transform,
      result.origin,
    ).center;
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe('gizmo geometry: rounding', () => {
  it('rounds a committed transform to stable precision', () => {
    expect(
      roundGizmoTransform({
        x: 100.126,
        y: 99.994,
        rotation: 45.678,
        scaleX: 1.234567,
        scaleY: 0.99999,
      }),
    ).toEqual({
      x: 100.13,
      y: 99.99,
      rotation: 45.68,
      scaleX: 1.2346,
      scaleY: 1,
    });
  });
});

describe('transformPatch', () => {
  function elementWith(
    attributes: Record<string, unknown>,
  ): TraceElement {
    return {
      id: 'el-1',
      name: 'El',
      type: 'rect',
      visible: true,
      locked: false,
      origin: { x: 0, y: 0 },
      attributes,
      tracks: [],
    };
  }

  it('writes x/y directly when there is no base position', () => {
    const patch = transformPatch(
      elementWith({ x: 10, y: 20 }),
      { x: 50, y: 60, rotation: 30, scaleX: 2, scaleY: 3 },
      0,
    );
    expect(patch).toEqual({
      x: 50,
      y: 60,
      rotation: 30,
      scaleX: 2,
      scaleY: 3,
    });
  });

  it('moves the base and preserves the animated offset', () => {
    // base (100,100) + offset (10,20) = resolved (110,120). Moving the
    // resolved position to (210,220) must move the base to (200,200).
    const patch = transformPatch(
      elementWith({ baseX: 100, baseY: 100, x: 10, y: 20 }),
      { x: 210, y: 220, rotation: 0, scaleX: 1, scaleY: 1 },
      0,
    );
    expect(patch.baseX).toBe(200);
    expect(patch.baseY).toBe(200);
    expect(patch.rotation).toBe(0);
  });
});

describe('store updateTransform', () => {
  beforeEach(() => {
    useTraceStore.getState().closeProject();
    useTraceStore.getState().loadProject(createBlankTraceDocument('Gizmo'));
  });

  function addRect(): string {
    const result = useTraceStore.getState().dispatch([
      {
        type: 'addElement',
        element: { type: 'rect', x: 100, y: 100, width: 200, height: 100 },
      },
    ]);
    return result?.diff.added[0] as string;
  }

  it('commits rotation and scale as a single undoable edit', () => {
    const elementId = addRect();
    const pastBefore = useTraceStore.getState().past.length;

    useTraceStore
      .getState()
      .updateTransform(elementId, {
        x: 120,
        y: 130,
        rotation: 45,
        scaleX: 1.5,
        scaleY: 1.5,
      });

    const state = useTraceStore.getState();
    expect(state.past.length).toBe(pastBefore + 1);
    expect(state.dirty).toBe(true);
    const attrs =
      stageOrNull(state.project)?.elements[elementId].attributes ?? {};
    expect(attrs.rotation).toBe(45);
    expect(attrs.scaleX).toBe(1.5);
    expect(attrs.x).toBe(120);

    useTraceStore.getState().undo();
    const undone =
      stageOrNull(useTraceStore.getState().project)?.elements[elementId].attributes ?? {};
    expect(undone.rotation).toBeUndefined();
    expect(undone.scaleX).toBeUndefined();
  });

  it('auto-keyframes a tracked rotation property at the playhead', () => {
    const elementId = addRect();
    useTraceStore.getState().addPropertyTrack(elementId, 'rotation');
    useTraceStore.getState().setPlayhead(1200);

    useTraceStore.getState().updateTransform(elementId, {
      x: 100,
      y: 100,
      rotation: 60,
      scaleX: 1,
      scaleY: 1,
    });

    const track = stageOrNull(useTraceStore.getState().project)?.elements[elementId].tracks.find(
        (entry) => entry.property === 'rotation',
      );
    expect(
      track?.keyframes.some(
        (keyframe) => keyframe.timeMs === 1200 && keyframe.value === 60,
      ),
    ).toBe(true);
  });

  it('applies an origin change atomically with the transform', () => {
    const elementId = addRect();
    useTraceStore
      .getState()
      .updateTransform(
        elementId,
        { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        { x: 50, y: 25 },
      );
    expect(
      stageOrNull(useTraceStore.getState().project)?.elements[elementId].origin,
    ).toEqual({ x: 50, y: 25 });
  });
});
