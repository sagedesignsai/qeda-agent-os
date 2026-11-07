import { applyOps } from '@/lib/trace/ops'
import {
  applyMatrix,
  checkReparent,
  elementMatrix,
  worldMatrix,
} from '@/lib/trace/hierarchy'
import type { TraceProject } from '@/lib/trace/types'

function emptyProject(overrides: Partial<TraceProject> = {}): TraceProject {
  return {
    id: 'project-hierarchy',
    name: 'Hierarchy',
    width: 1280,
    height: 720,
    durationMs: 2000,
    fps: 60,
    elements: {},
    rootElementIds: [],
    ...overrides,
  }
}

function addElements(ids: string[]): TraceProject {
  const result = applyOps(
    emptyProject(),
    ids.map((id, index) => ({
      type: 'addElement' as const,
      element: {
        id,
        type: 'rect' as const,
        x: 100 + index * 40,
        y: 50 + index * 40,
        width: 40,
        height: 40,
        name: id,
      },
    })),
  )
  expect(result.ok).toBe(true)
  return result.project
}

function position(project: TraceProject, id: string) {
  const matrix = worldMatrix(project, id)
  return applyMatrix(matrix, { x: 0, y: 0 })
}

describe('Trace hierarchy ops', () => {
  it('reorders to an absolute paint index', () => {
    const project = addElements(['a', 'b', 'c'])
    expect(project.rootElementIds).toEqual(['a', 'b', 'c'])

    const result = applyOps(project, [
      { type: 'reorderElement', id: 'c', index: 0 },
    ])

    expect(result.ok).toBe(true)
    expect(result.project.rootElementIds).toEqual(['c', 'a', 'b'])
  })

  it('reparents into a translated group without moving the layer', () => {
    const project = addElements(['a'])
    const withGroup = applyOps(project, [
      {
        type: 'addElement',
        element: { id: 'group', type: 'group', x: 30, y: 20, name: 'Group' },
      },
    ]).project
    const before = position(withGroup, 'a')

    const result = applyOps(withGroup, [
      { type: 'reparentElement', id: 'a', parentId: 'group' },
    ])

    expect(result.ok).toBe(true)
    expect(result.project.elements.a.parentId).toBe('group')
    expect(result.project.elements.a.attributes.x).toBeCloseTo(70)
    expect(result.project.elements.a.attributes.y).toBeCloseTo(30)
    expect(position(result.project, 'a')).toEqual(before)

    const back = applyOps(result.project, [
      { type: 'reparentElement', id: 'a', parentId: null, index: 0 },
    ])
    expect(back.project.elements.a.attributes.x).toBeCloseTo(100)
    expect(back.project.elements.a.attributes.y).toBeCloseTo(50)
    expect(back.project.rootElementIds).toEqual(['a', 'group'])
  })

  it('compensates rotation and scale when reparenting', () => {
    const project = addElements(['a'])
    const withGroup = applyOps(project, [
      {
        type: 'addElement',
        element: { id: 'group', type: 'group', x: 0, y: 0, name: 'Group' },
      },
      {
        type: 'updateElement',
        id: 'group',
        attributes: { rotation: 90, scaleX: 2, scaleY: 2 },
      },
    ]).project
    const before = position(withGroup, 'a')

    const result = applyOps(withGroup, [
      { type: 'reparentElement', id: 'a', parentId: 'group' },
    ])

    expect(result.ok).toBe(true)
    expect(position(result.project, 'a').x).toBeCloseTo(before.x)
    expect(position(result.project, 'a').y).toBeCloseTo(before.y)
    expect(result.project.elements.a.attributes.rotation).toBeCloseTo(-90)
    expect(result.project.elements.a.attributes.scaleX).toBeCloseTo(0.5)
    expect(result.project.elements.a.attributes.scaleY).toBeCloseTo(0.5)
  })

  it('rejects reparenting an ancestor into its own subtree', () => {
    const project = addElements(['a', 'b'])
    const grouped = applyOps(project, [
      {
        type: 'groupElements',
        elementIds: ['a'],
        groupId: 'group',
      },
    ]).project

    expect(checkReparent(grouped, 'group', 'a').allowed).toBe(false)

    const result = applyOps(grouped, [
      { type: 'reparentElement', id: 'group', parentId: 'a' },
    ])
    expect(result.ok).toBe(false)
    expect(result.project.rootElementIds).toEqual(grouped.rootElementIds)
  })

  it('groups into the topmost selected slot and preserves paint order', () => {
    const project = addElements(['a', 'b', 'c', 'd'])

    const result = applyOps(project, [
      {
        type: 'groupElements',
        elementIds: ['b', 'c'],
        groupId: 'group',
        origin: { x: 12, y: 34 },
      },
    ])

    expect(result.ok).toBe(true)
    expect(result.project.rootElementIds).toEqual(['a', 'group', 'd'])
    expect(result.project.elements.group.childrenIds).toEqual(['b', 'c'])
    expect(result.project.elements.group.origin).toEqual({ x: 12, y: 34 })
    expect(result.project.elements.a.parentId).toBeNull()
  })

  it('ungroups back into the group slot and keeps world transforms', () => {
    const project = addElements(['a', 'b', 'c'])
    const grouped = applyOps(project, [
      {
        type: 'groupElements',
        elementIds: ['c'],
        groupId: 'group',
      },
    ]).project
    const translated = applyOps(grouped, [
      {
        type: 'updateElement',
        id: 'group',
        attributes: { x: 25, y: 15 },
      },
    ]).project
    const before = position(translated, 'c')

    const result = applyOps(translated, [
      { type: 'ungroupElement', id: 'group' },
    ])

    expect(result.ok).toBe(true)
    expect(result.project.elements.group).toBeUndefined()
    expect(result.project.elements.c.parentId).toBeNull()
    expect(result.project.rootElementIds).toEqual(['a', 'b', 'c'])
    expect(position(result.project, 'c')).toEqual(before)
  })

  it('handles cross-parent grouping with world preservation', () => {
    const project = addElements(['a', 'b', 'c'])
    const nested = applyOps(project, [
      { type: 'groupElements', elementIds: ['b'], groupId: 'inner' },
      {
        type: 'updateElement',
        id: 'inner',
        attributes: { x: 50, y: 10 },
      },
    ]).project
    const beforeB = position(nested, 'b')

    const result = applyOps(nested, [
      {
        type: 'groupElements',
        elementIds: ['a', 'b'],
        groupId: 'outer',
      },
    ])

    expect(result.ok).toBe(true)
    expect(result.project.elements.outer.childrenIds).toEqual(['a', 'b'])
    expect(position(result.project, 'b').x).toBeCloseTo(beforeB.x)
    expect(position(result.project, 'b').y).toBeCloseTo(beforeB.y)
  })

  it('duplicates a nested layer inside its parent', () => {
    const project = addElements(['a', 'b'])
    const grouped = applyOps(project, [
      { type: 'groupElements', elementIds: ['a'], groupId: 'group' },
    ]).project

    const result = applyOps(grouped, [
      { type: 'duplicateElement', id: 'a', newId: 'a-copy' },
    ])

    expect(result.ok).toBe(true)
    expect(result.project.elements['a-copy'].parentId).toBe('group')
    expect(result.project.elements.group.childrenIds).toEqual(['a', 'a-copy'])
  })

  it('keeps matrix composition consistent with elementMatrix', () => {
    const project = addElements(['a'])
    const element = project.elements.a
    const matrix = elementMatrix(element)
    expect(matrix.a).toBeCloseTo(1)
    expect(matrix.e).toBeCloseTo(100)
    expect(matrix.f).toBeCloseTo(50)
  })
})
