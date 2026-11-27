import {
  cameraForwardPoint,
  cameraInversePoint,
  cameraTransformString,
  hasCamera,
  isCameraIdentity,
  resolveCameraAtTime,
} from '@/lib/trace/runtime/camera'
import { applyOps } from '@/lib/trace/ops'
import { lintTraceProject } from '@/lib/trace/lint'
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup'
import type {
  TraceCamera,
  TraceElement,
  TraceProject,
} from '@/lib/trace/types'

function element(id: string): TraceElement {
  return {
    id,
    name: id,
    type: 'rect',
    visible: true,
    locked: false,
    sceneId: null,
    attributes: { x: 10, y: 10, width: 100, height: 80, fill: '#ffffff' },
    origin: { x: 0, y: 0 },
    tracks: [],
    parentId: null,
    childrenIds: [],
  }
}

function project(overrides: Partial<TraceProject> = {}): TraceProject {
  return {
    id: 'camera-test',
    name: 'Camera test',
    width: 1000,
    height: 500,
    durationMs: 2000,
    fps: 60,
    elements: { subject: element('subject') },
    rootElementIds: ['subject'],
    ...overrides,
  }
}

describe('Trace camera', () => {
  it('defaults to the full artboard', () => {
    const state = resolveCameraAtTime(project(), 0)
    expect(state).toEqual({ x: 500, y: 250, zoom: 1, rotation: 0 })
    expect(isCameraIdentity(state, project())).toBe(true)
    expect(hasCamera(project())).toBe(false)
  })

  it('resolves animated framing from camera tracks', () => {
    const camera: TraceCamera = {
      tracks: [
        {
          id: 'camera-zoom',
          property: 'zoom',
          label: 'Zoom',
          keyframes: [
            { id: 'z0', timeMs: 0, value: 1, easing: 'linear' },
            { id: 'z1', timeMs: 1000, value: 2, easing: 'linear' },
          ],
        },
      ],
    }
    const traced = project({ camera })
    expect(resolveCameraAtTime(traced, 500).zoom).toBeCloseTo(1.5)
    expect(hasCamera(traced)).toBe(true)
    expect(isCameraIdentity(resolveCameraAtTime(traced, 0), traced)).toBe(true)
  })

  it('round-trips points through the frame transform', () => {
    const traced = project()
    const state = { x: 620, y: 130, zoom: 1.7, rotation: 25 }
    const point = { x: 320, y: 410 }
    const framed = cameraForwardPoint(traced, state, point)
    const back = cameraInversePoint(traced, state, framed)
    expect(back.x).toBeCloseTo(point.x)
    expect(back.y).toBeCloseTo(point.y)
  })

  it('builds the shared transform string', () => {
    const traced = project({
      camera: { x: 600, y: 250, zoom: 2, rotation: 30 },
    })
    const state = resolveCameraAtTime(traced, 0)
    expect(cameraTransformString(traced, state)).toBe(
      'translate(500 250) rotate(30) scale(2) translate(-600 -250)',
    )
  })

  it('sets and clears the camera through ops', () => {
    const base = project()
    const set = applyOps(base, [
      {
        type: 'setCamera',
        camera: { x: 400, y: 200, zoom: 1.25, rotation: 0 },
      },
    ])
    expect(set.ok).toBe(true)
    expect(set.diff.cameraChanged).toBe(true)
    expect(set.project.camera?.zoom).toBe(1.25)

    const cleared = applyOps(set.project, [{ type: 'setCamera', camera: null }])
    expect(cleared.ok).toBe(true)
    expect(cleared.project.camera).toBeUndefined()
    expect(cleared.diff.cameraChanged).toBe(true)
  })

  it('rejects an invalid zoom or track property', () => {
    const badZoom = applyOps(project(), [
      { type: 'setCamera', camera: { zoom: 0 } },
    ])
    expect(badZoom.ok).toBe(false)

    const badTrack = applyOps(project(), [
      {
        type: 'setCamera',
        camera: {
          tracks: [
            {
              id: 'camera-opacity',
              property: 'opacity',
              label: 'Opacity',
              keyframes: [{ id: 'k', timeMs: 0, value: 1, easing: 'linear' }],
            },
          ],
        },
      },
    ])
    expect(badTrack.ok).toBe(false)
  })

  it('frames serialized roots only when the camera is active', () => {
    const flat = staticSvgMarkup(project(), 0)
    expect(flat).not.toContain('data-trace-camera')

    const framed = staticSvgMarkup(
      project({ camera: { x: 500, y: 250, zoom: 1.5 } }),
      0,
    )
    expect(framed).toContain('data-trace-camera="true"')
    expect(framed).toContain('scale(1.5)')
    // The camera moves the graph, not the composition frame.
    expect(framed.indexOf('data-trace-camera')).toBeLessThan(
      framed.indexOf('</svg>'),
    )
  })

  it('lints a non-positive camera zoom', () => {
    const traced = project({
      camera: {
        zoom: 0.5,
        tracks: [
          {
            id: 'camera-zoom',
            property: 'zoom',
            label: 'Zoom',
            keyframes: [
              { id: 'z0', timeMs: 0, value: 1, easing: 'linear' },
              { id: 'z1', timeMs: 1000, value: 0, easing: 'linear' },
            ],
          },
        ],
      },
    })
    const lint = lintTraceProject(traced)
    expect(lint.diagnostics.some((entry) => entry.code === 'CAMERA_ZOOM_INVALID')).toBe(
      true,
    )
  })
})