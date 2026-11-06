import {
  addPointOnSegment,
  cubicPointAt,
  deleteAnchor,
  moveAnchor,
  moveHandle,
  nearestPointOnSegment,
  toggleSmooth,
} from '@/lib/trace/path/edit';
import {
  countAnchors,
  isPathEditableType,
  parsePathData,
  parsePointsString,
  serializePathData,
  serializePointsString,
} from '@/lib/trace/path/model';
import { createBlankTraceProject } from '@/lib/trace/defaults';
import { useTraceStore } from '@/stores/trace-store';

describe('path parse / serialize', () => {
  it('round-trips a polyline path', () => {
    const model = parsePathData('M 190 350 L 285 350 L 330 245');
    expect(countAnchors(model)).toBe(3);
    expect(serializePathData(model)).toBe(
      'M 190 350 L 285 350 L 330 245',
    );
  });

  it('parses relative commands into absolute anchors', () => {
    const model = parsePathData('m 10 10 l 20 0 l 0 20 z');
    const nodes = model.subpaths[0].nodes;
    expect(nodes.map((node) => node.point)).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
    ]);
    expect(model.subpaths[0].closed).toBe(true);
    expect(serializePathData(model)).toBe(
      'M 10 10 L 30 10 L 30 30 Z',
    );
  });

  it('converts H/V and implicit M->L pairs', () => {
    const model = parsePathData('M 0 0 10 10 H 20 V 30');
    expect(countAnchors(model)).toBe(4);
    expect(serializePathData(model)).toBe(
      'M 0 0 L 10 10 L 20 10 L 20 30',
    );
  });

  it('round-trips cubic curves with handles', () => {
    const d = 'M 0 0 C 10 0 20 10 30 10 L 40 20';
    expect(serializePathData(parsePathData(d))).toBe(d);
  });

  it('converts quadratic curves to geometrically equivalent cubics', () => {
    const model = parsePathData('M 0 0 Q 30 0 30 30');
    const serialized = serializePathData(model);
    expect(serialized).toMatch(/^M 0 0 C /);
    // Cubic midpoint of a quadratic lies on the quadratic at t=0.5:
    // Q(0.5) = 0.25*P0 + 0.5*Q + 0.25*P1 = (22.5, 7.5).
    const mid = cubicPointAt(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 20 },
      { x: 30, y: 30 },
      0.5,
    );
    expect(mid.x).toBeCloseTo(22.5, 6);
    expect(mid.y).toBeCloseTo(7.5, 6);
  });

  it('handles S/T reflection and closed curve segments', () => {
    const model = parsePathData('M 0 0 C 10 0 20 10 30 10 S 50 20 60 10 Z');
    expect(countAnchors(model)).toBe(3);
    expect(serializePathData(model)).toContain('C');
    expect(serializePathData(model)).toContain('Z');
  });

  it('parses the sponsor logo relative path without losing anchors', () => {
    const d =
      'm 99.33,165.81 c -9.57,-0.71 -18.08,-5.25 -24.26,-12.95 l -0.79,-1.16 z m 38.49,22.92 c -2.4,-2.19 -17.29,-16.16 -21.5,-20.17 z';
    const model = parsePathData(d);
    expect(model.subpaths).toHaveLength(2);
    expect(countAnchors(model)).toBeGreaterThanOrEqual(4);
    expect(serializePathData(model)).not.toContain('m ');
  });

  it('parses and serialises points strings', () => {
    const model = parsePointsString('0,0 10,0 10,10', true);
    expect(countAnchors(model)).toBe(3);
    expect(serializePointsString(model)).toBe('0,0 10,0 10,10');
  });

  it('identifies editable element types', () => {
    expect(isPathEditableType('path')).toBe(true);
    expect(isPathEditableType('polyline')).toBe(true);
    expect(isPathEditableType('polygon')).toBe(true);
    expect(isPathEditableType('rect')).toBe(false);
    expect(isPathEditableType('text')).toBe(false);
  });
});

describe('path edit operations', () => {
  const line = () => parsePathData('M 0 0 L 100 0 L 100 100');

  it('moves an anchor together with its handles', () => {
    const model = parsePathData('M 0 0 C 10 0 20 10 30 10');
    const next = moveAnchor(model, { subpath: 0, index: 1 }, { x: 40, y: 20 });
    const node = next.subpaths[0].nodes[1];
    expect(node.point).toEqual({ x: 40, y: 20 });
    expect(node.handleIn).toEqual({ x: 30, y: 20 });
    // Original model untouched (clone semantics).
    expect(model.subpaths[0].nodes[1].point).toEqual({ x: 30, y: 10 });
  });

  it('mirrors the opposite handle for smooth nodes, Alt breaks it', () => {
    const model = parsePathData('M 0 0 C 10 0 20 10 30 10 S 50 20 60 10');
    // Middle node is smooth via S reflection.
    expect(model.subpaths[0].nodes[1].smooth).toBe(true);
    const mirrored = moveHandle(
      model,
      { subpath: 0, index: 1 },
      'out',
      { x: 40, y: 10 },
    );
    const node = mirrored.subpaths[0].nodes[1];
    expect(node.handleOut).toEqual({ x: 40, y: 10 });
    expect(node.handleIn.x).toBeCloseTo(2 * 30 - 40, 6);
    expect(node.handleIn.y).toBeCloseTo(2 * 10 - 10, 6);

    const broken = moveHandle(
      model,
      { subpath: 0, index: 1 },
      'out',
      { x: 40, y: 10 },
      { breakSmooth: true },
    );
    expect(broken.subpaths[0].nodes[1].smooth).toBe(false);
    expect(broken.subpaths[0].nodes[1].handleIn).toEqual(
      model.subpaths[0].nodes[1].handleIn,
    );
  });

  it('inserts a point on a line segment without changing the shape', () => {
    const split = addPointOnSegment(line(), 0, 0, 0.5);
    expect(split).not.toBeNull();
    expect(countAnchors(split!.model)).toBe(4);
    expect(split!.model.subpaths[0].nodes[1].point).toEqual({
      x: 50,
      y: 0,
    });
    expect(split!.ref).toEqual({ subpath: 0, index: 1 });
  });

  it('splits a cubic at its midpoint on the curve', () => {
    const model = parsePathData('M 0 0 C 0 100 100 100 100 0');
    const split = addPointOnSegment(model, 0, 0, 0.5);
    expect(split).not.toBeNull();
    const inserted = split!.model.subpaths[0].nodes[1];
    // Symmetric cubic midpoint is (50, 75).
    expect(inserted.point.x).toBeCloseTo(50, 6);
    expect(inserted.point.y).toBeCloseTo(75, 6);
    expect(inserted.smooth).toBe(true);
  });

  it('finds the nearest sampled point on a segment', () => {
    const model = line();
    const nearest = nearestPointOnSegment(
      model.subpaths[0].nodes[0],
      model.subpaths[0].nodes[1],
      { x: 30, y: 4 },
    );
    expect(nearest.t).toBeCloseTo(0.3, 2);
    expect(nearest.point.x).toBeCloseTo(30, 2);
  });

  it('deletes an anchor but refuses below two', () => {
    const three = line();
    const next = deleteAnchor(three, { subpath: 0, index: 1 });
    expect(countAnchors(next)).toBe(2);
    const two = parsePathData('M 0 0 L 10 10');
    expect(deleteAnchor(two, { subpath: 0, index: 0 })).toBe(two);
  });

  it('toggles smooth without moving handles', () => {
    const model = line();
    const next = toggleSmooth(model, { subpath: 0, index: 1 });
    expect(next.subpaths[0].nodes[1].smooth).toBe(true);
    expect(next.subpaths[0].nodes[1].point).toEqual({ x: 100, y: 0 });
  });
});

describe('path edit activation in the store', () => {
  beforeEach(() => {
    useTraceStore.getState().closeProject();
    useTraceStore
      .getState()
      .loadProject(createBlankTraceProject('Path Test'));
  });

  function addPath(): string {
    const result = useTraceStore.getState().dispatch([
      {
        type: 'addElement',
        element: {
          type: 'path',
          d: 'M 0 0 L 100 0 L 100 100',
          name: 'My Path',
        },
      },
    ]);
    return result?.diff.added[0] as string;
  }

  it('enters and exits path edit mode, clearing on reselect', () => {
    const id = addPath();
    useTraceStore.getState().startPathEdit(id);
    expect(
      useTraceStore.getState().selection.editingPathElementId,
    ).toBe(id);
    expect(
      useTraceStore.getState().selection.selectedElementId,
    ).toBe(id);

    useTraceStore.getState().endPathEdit();
    expect(
      useTraceStore.getState().selection.editingPathElementId,
    ).toBeNull();

    useTraceStore.getState().startPathEdit(id);
    useTraceStore.getState().selectElement(null);
    expect(
      useTraceStore.getState().selection.editingPathElementId,
    ).toBeNull();
  });

  it('commits edited path data as a single undoable update', () => {
    const id = addPath();
    const pastBefore = useTraceStore.getState().past.length;
    useTraceStore
      .getState()
      .updateAttributes(id, { d: 'M 0 0 L 50 0 L 50 50' });
    expect(useTraceStore.getState().past.length).toBe(pastBefore + 1);
    expect(
      useTraceStore.getState().project?.elements[id].attributes.d,
    ).toBe('M 0 0 L 50 0 L 50 50');
    useTraceStore.getState().undo();
    expect(
      useTraceStore.getState().project?.elements[id].attributes.d,
    ).toBe('M 0 0 L 100 0 L 100 100');
  });
});
