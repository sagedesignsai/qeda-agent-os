import { migrateTraceProject } from '@/lib/trace/migrate'
import { applyOps } from '@/lib/trace/ops'
import {
  DEFAULT_SCENE_BACKGROUND,
  sceneAtTime,
  sceneBackgroundAtTime,
  sceneTransitionAtScene,
  sceneVeilAtTime,
  TRACE_SCENE_TRANSITION_MS,
} from '@/lib/trace/runtime/scenes'
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup'
import { createScene } from '@/lib/trace/storyboard'
import { createNovaTraceMarkProject } from '@/lib/trace/templates'
import type {
  TraceElement,
  TraceProject,
  TraceScene,
  SceneTransition,
} from '@/lib/trace/types'

function emptyProject(overrides: Partial<TraceProject> = {}): TraceProject {
  return {
    id: 'scene-test',
    name: 'Scene test',
    width: 1000,
    height: 500,
    durationMs: 3000,
    fps: 60,
    elements: {},
    rootElementIds: [],
    ...overrides,
  }
}

function scene(
  id: string,
  startMs: number,
  durationMs: number,
  extra: { transitionIn?: SceneTransition; background?: string } = {},
): TraceScene {
  return createScene({ id, name: id, startMs, durationMs, ...extra })
}

function element(id: string, sceneId: string | null): TraceElement {
  return {
    id,
    name: id,
    type: 'rect',
    visible: true,
    locked: false,
    sceneId,
    attributes: { x: 0, y: 0, width: 100, height: 100, fill: '#ffffff' },
    origin: { x: 0, y: 0 },
    tracks: [],
    parentId: null,
    childrenIds: [],
  }
}

const MID_FADE = TRACE_SCENE_TRANSITION_MS / 2

describe('Trace scene presentation', () => {
  it('lays the signature template scenes out back-to-back', () => {
    const project = createNovaTraceMarkProject()
    expect(project.storyboard?.scenes.map((entry) => entry.startMs)).toEqual([
      0, 1500, 3200,
    ])
  })

  it('repairs legacy scenes that all started at zero', () => {
    const project = emptyProject({
      storyboard: {
        scenes: [
          scene('a', 0, 1000),
          scene('b', 0, 2000),
          scene('c', 0, 500),
        ],
      },
    })
    const migrated = migrateTraceProject(project)
    expect(migrated.storyboard?.scenes.map((entry) => entry.startMs)).toEqual([
      0, 1000, 3000,
    ])
  })

  it('selects the scene that covers the playhead', () => {
    const project = emptyProject({
      storyboard: { scenes: [scene('a', 0, 1000), scene('b', 1000, 1000)] },
    })
    expect(sceneAtTime(project, 0)?.id).toBe('a')
    expect(sceneAtTime(project, 999)?.id).toBe('a')
    expect(sceneAtTime(project, 1000)?.id).toBe('b')
    // Past the authored range the last scene remains on screen.
    expect(sceneAtTime(project, 2500)?.id).toBe('b')
  })

  it('eases a fade entrance over the transition window', () => {
    const entering = scene('b', 1000, 1000, { transitionIn: 'fade' })
    const project = emptyProject({
      storyboard: { scenes: [scene('a', 0, 1000), entering] },
    })
    const middle = sceneTransitionAtScene(entering, 1000 + MID_FADE)
    expect(middle?.progress).toBeCloseTo(0.5)
    expect(middle?.eased).toBeCloseTo(0.875)
    expect(
      sceneTransitionAtScene(entering, 1000 + TRACE_SCENE_TRANSITION_MS),
    ).toBeNull()
  })

  it('dips from the background colour on fade', () => {
    const project = emptyProject({
      storyboard: {
        scenes: [
          scene('a', 0, 1000, { background: '#000000' }),
          scene('b', 1000, 1000, { background: '#ffffff', transitionIn: 'fade' }),
        ],
      },
    })
    const veil = sceneVeilAtTime(project, 1000 + MID_FADE)
    expect(veil?.opacity).toBeCloseTo(0.125)
    expect(veil?.translateX).toBe(0)
    // The veil tracks the blended background so the dip is seamless.
    expect(veil?.fill).toBe('rgb(223, 223, 223)')
  })

  it('wipes the veil off the right edge on slide', () => {
    const project = emptyProject({
      storyboard: {
        scenes: [
          scene('a', 0, 1000),
          scene('b', 1000, 1000, { transitionIn: 'slide' }),
        ],
      },
    })
    const veil = sceneVeilAtTime(project, 1000 + MID_FADE)
    expect(veil?.opacity).toBe(1)
    expect(veil?.translateX).toBeCloseTo(875) // 1000 * eased(0.5)
    expect(veil?.fill).toBe(DEFAULT_SCENE_BACKGROUND)
  })

  it('blends the previous scene background across an entrance', () => {
    const project = emptyProject({
      storyboard: {
        scenes: [
          scene('a', 0, 1000, { background: '#000000' }),
          scene('b', 1000, 1000, { background: '#ffffff', transitionIn: 'fade' }),
        ],
      },
    })
    expect(sceneBackgroundAtTime(project, 500)?.fill).toBe('#000000')
    expect(sceneBackgroundAtTime(project, 1000 + MID_FADE)?.fill).toBe(
      'rgb(223, 223, 223)',
    )
  })

  it('serializes the veil above the graph and per-scene backgrounds', () => {
    const project = emptyProject({
      elements: { second: element('second', 'b') },
      rootElementIds: ['second'],
      storyboard: {
        scenes: [
          scene('a', 0, 1000, { background: '#000000' }),
          scene('b', 1000, 1000, { background: '#ffffff', transitionIn: 'fade' }),
        ],
      },
    })

    const entering = staticSvgMarkup(project, 1000 + MID_FADE)
    expect(entering).toContain('data-trace-scene-veil="true"')
    expect(entering).toContain('opacity="0.125"')
    expect(entering).toContain('fill="rgb(223, 223, 223)"')
    // The veil must paint after the element graph.
    expect(entering.indexOf('data-trace-scene-veil')).toBeGreaterThan(
      entering.indexOf('data-trace-id="second"'),
    )

    const settled = staticSvgMarkup(project, 2000)
    expect(settled).not.toContain('data-trace-scene-veil')
    expect(settled).toContain('fill="#ffffff"')
  })

  it('omits the veil when an exporter bakes its own motion', () => {
    const project = emptyProject({
      storyboard: {
        scenes: [
          scene('a', 0, 1000),
          scene('b', 1000, 1000, { transitionIn: 'fade' }),
        ],
      },
    })
    const svg = staticSvgMarkup(project, 1000 + MID_FADE, {
      scenePresentation: false,
    })
    expect(svg).not.toContain('data-trace-scene-veil')
  })

  it('clears scene intent and background through updateScene nulls', () => {
    const project = emptyProject({
      storyboard: {
        scenes: [
          scene('a', 0, 1000, { background: '#111111' }),
        ],
      },
    })

    const set = applyOps(project, [
      { type: 'updateScene', id: 'a', intent: 'Open on the logo' },
    ])
    expect(set.project.storyboard?.scenes[0].intent).toBe('Open on the logo')

    const cleared = applyOps(set.project, [
      { type: 'updateScene', id: 'a', intent: null, background: null },
    ])
    const sceneAfter = cleared.project.storyboard?.scenes[0]
    expect(sceneAfter?.intent).toBeUndefined()
    expect(sceneAfter?.background).toBeUndefined()
    expect(cleared.diff.scenes.updated).toContain('a')
  })

  it('re-lays start times when scenes are reordered', () => {
    const project = emptyProject({
      storyboard: {
        scenes: [
          scene('a', 0, 1000),
          scene('b', 1000, 2000),
          scene('c', 3000, 500),
        ],
      },
    })

    const result = applyOps(project, [
      { type: 'reorderScene', id: 'c', index: 0 },
    ])

    expect(
      result.project.storyboard?.scenes.map((entry) => [
        entry.id,
        entry.startMs,
      ]),
    ).toEqual([
      ['c', 0],
      ['a', 500],
      ['b', 1500],
    ])
  })
})