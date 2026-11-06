import { createBlankTraceDocument, stageOf } from '@/lib/trace/document';
import { applyOps } from '@/lib/trace/ops'
import { lintTraceDocument } from '@/lib/trace/lint'
import { evaluateEasing } from '@/lib/trace/animation/easing'
import { getValueAtTime } from '@/lib/trace/animation/interpolator'
import {
  createScene,
  ensureStoryboard,
  getStoryboardDuration,
  layoutScenes,
} from '@/lib/trace/storyboard'
import type { PropertyTrack, TraceDocument, TraceStage } from '@/lib/trace/types'

function emptyProject(overrides: Partial<TraceStage> = {}): TraceDocument {
  return createBlankTraceDocument('Test Composition', {
    id: 'project-1',
    width: 1280,
    height: 720,
    durationMs: 2000,
    fps: 60,
    ...overrides,
  })
}

describe('Trace animation', () => {
  it('evaluates named easings inside [0, 1]', () => {
    expect(evaluateEasing('linear', 0.25)).toBeCloseTo(0.25)
    expect(evaluateEasing('ease-out', 0)).toBeCloseTo(0)
    expect(evaluateEasing('ease-out', 1)).toBeCloseTo(1)

    const mid = evaluateEasing('ease-out', 0.5)
    expect(mid).toBeGreaterThan(0.5)
    expect(mid).toBeLessThan(1)
  })

  it('interpolates numbers between keyframes', () => {
    const track: PropertyTrack = {
      id: 'track-1',
      property: 'opacity',
      label: 'Opacity',
      keyframes: [
        { id: 'kf-1', timeMs: 0, value: 0, easing: 'linear' },
        { id: 'kf-2', timeMs: 1000, value: 1, easing: 'linear' },
      ],
    }

    expect(getValueAtTime(track, 0)).toBeCloseTo(0)
    expect(getValueAtTime(track, 500)).toBeCloseTo(0.5)
    expect(getValueAtTime(track, 1000)).toBeCloseTo(1)
    expect(getValueAtTime(track, 5000)).toBeCloseTo(1)
  })
})

describe('Trace storyboard', () => {
  it('lays scenes out back to back and reports the total duration', () => {
    const scenes = layoutScenes([
      createScene({ id: 's1', name: 'One', durationMs: 500 }),
      createScene({ id: 's2', name: 'Two', durationMs: 750 }),
    ])

    expect(scenes.map((scene) => scene.startMs)).toEqual([0, 500])
    expect(getStoryboardDuration({ scenes })).toBe(1250)
  })

  it('creates a default scene for projects without a storyboard', () => {
    const storyboard = ensureStoryboard(emptyProject())
    expect(storyboard.scenes).toHaveLength(1)
    expect(storyboard.activeSceneId).toBe(storyboard.scenes[0].id)
  })
})

describe('Trace ops', () => {
  it('adds an element, assigns the active scene and records the diff', () => {
    const result = applyOps(emptyProject(), [
      {
        type: 'addElement',
        element: { type: 'text', text: 'Hello Trace', x: 640, y: 360, name: 'Headline' },
      },
    ])

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(1)
    expect(result.diff.added).toHaveLength(1)

    const [elementId] = result.diff.added
    const element = stageOf(result.project).elements[elementId]
    expect(element.name).toBe('Headline')
    expect(element.attributes.text).toBe('Hello Trace')
    expect(stageOf(result.project).rootElementIds).toContain(elementId)
    expect(element.sceneId).toBe(result.project.storyboard?.activeSceneId)
  })

  it('applies a track and animates the resulting element', () => {
    const added = applyOps(emptyProject(), [
      { type: 'addElement', element: { type: 'text', text: 'Animate me', x: 0, y: 0 } },
    ])
    const elementId = added.diff.added[0]

    const tracked = applyOps(added.project, [
      {
        type: 'setTrack',
        elementId,
        property: 'opacity',
        keyframes: [
          { timeMs: 0, value: 0, easing: 'linear' },
          { timeMs: 1000, value: 1, easing: 'linear' },
        ],
      },
    ])

    expect(tracked.ok).toBe(true)
    expect(tracked.diff.updated).toContain(elementId)

    const track = stageOf(tracked.project).elements[elementId].tracks[0]
    expect(track.keyframes).toHaveLength(2)
    expect(getValueAtTime(track, 500)).toBeCloseTo(0.5)
  })

  it('is atomic: a failing op leaves the project untouched', () => {
    const project = emptyProject()
    const result = applyOps(project, [
      { type: 'addElement', element: { type: 'text', text: 'Should not survive' } },
      { type: 'deleteElement', id: 'missing-element' },
    ])

    expect(result.ok).toBe(false)
    expect(result.applied).toBe(0)
    expect(result.diff.added).toHaveLength(0)
    expect(Object.keys(stageOf(result.project).elements)).toHaveLength(0)
    expect(result.diagnostics.some((entry) => entry.code === 'OP_EXECUTION_ERROR')).toBe(true)
  })

  it('returns a restore op when an inverse is requested', () => {
    const result = applyOps(
      emptyProject(),
      [{ type: 'addElement', element: { type: 'text', text: 'Temporary' } }],
      { includeInverse: true }
    )

    expect(result.inverse).toHaveLength(1)
    const [inverse] = result.inverse
    expect(inverse.type).toBe('restore')

    const reverted = applyOps(result.project, result.inverse)
    expect(Object.keys(stageOf(reverted.project).elements)).toHaveLength(0)
  })

  it('groups and ungroups elements without losing children', () => {
    const added = applyOps(emptyProject(), [
      { type: 'addElement', element: { type: 'text', text: 'A' } },
      { type: 'addElement', element: { type: 'rect', x: 10, y: 10 } },
    ])
    const ids = added.diff.added

    const grouped = applyOps(added.project, [
      { type: 'groupElements', elementIds: ids, groupId: 'group-1', name: 'Stack' },
    ])

    expect(grouped.ok).toBe(true)
    expect(stageOf(grouped.project).elements['group-1'].childrenIds).toEqual(ids)
    expect(stageOf(grouped.project).rootElementIds).toEqual(['group-1'])
    expect(stageOf(grouped.project).elements[ids[0]].parentId).toBe('group-1')

    const ungrouped = applyOps(grouped.project, [{ type: 'ungroupElement', id: 'group-1' }])

    expect(stageOf(ungrouped.project).elements['group-1']).toBeUndefined()
    expect(stageOf(ungrouped.project).rootElementIds).toEqual(ids)
    expect(stageOf(ungrouped.project).elements[ids[0]].parentId).toBeNull()
  })
})

describe('Trace lint', () => {
  it('reports orphaned elements as errors', () => {
    const project = emptyProject({
      elements: {
        'text-1': {
          id: 'text-1',
          name: 'Orphan',
          type: 'text',
          visible: true,
          locked: false,
          origin: { x: 0, y: 0 },
          attributes: { text: 'Hi', fontSize: 24 },
          tracks: [],
          parentId: 'does-not-exist',
        },
      },
      rootElementIds: [],
    })

    const result = lintTraceDocument(project)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((entry) => entry.code === 'ORPHAN_ELEMENT')).toBe(true)
  })

  it('accepts a clean project', () => {
    const added = applyOps(emptyProject(), [
      { type: 'addElement', element: { type: 'text', text: 'Clean', x: 640, y: 360 } },
    ])

    expect(lintTraceDocument(added.project).errorCount).toBe(0)
  })
})
