import { instantiateBlock } from '@/lib/trace/blocks'
import { applyLookToElements, styleFromLook, stylePalette } from '@/lib/trace/look'
import { lintTraceProject } from '@/lib/trace/lint'
import { applyOps } from '@/lib/trace/ops'
import type {
  PropertyTrack,
  TraceElement,
  TraceProject,
} from '@/lib/trace/types'

function text(
  id: string,
  fill: string,
  fontSize = 40,
  tracks: PropertyTrack[] = [],
): TraceElement {
  return {
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    sceneId: null,
    attributes: {
      x: 0,
      y: 0,
      text: 'Hello',
      fontSize,
      fontWeight: 600,
      fontFamily: 'Inter, system-ui, sans-serif',
      fill,
    },
    origin: { x: 0, y: 0 },
    tracks,
    parentId: null,
    childrenIds: [],
  }
}

function rect(
  id: string,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
): TraceElement {
  return {
    id,
    name: id,
    type: 'rect',
    visible: true,
    locked: false,
    sceneId: null,
    attributes,
    origin: { x: 0, y: 0 },
    tracks,
    parentId: null,
    childrenIds: [],
  }
}

function motionTrack(id: string, start: number, end: number): PropertyTrack {
  return {
    id,
    property: 'x',
    label: 'X',
    keyframes: [
      { id: `${id}-a`, timeMs: start, value: 0, easing: 'power2.out' },
      { id: `${id}-b`, timeMs: end, value: 100, easing: 'power2.out' },
    ],
  }
}

function project(overrides: Partial<TraceProject> = {}): TraceProject {
  return {
    id: 'look-test',
    name: 'Look test',
    width: 1000,
    height: 600,
    durationMs: 4000,
    fps: 60,
    elements: {},
    rootElementIds: [],
    ...overrides,
  }
}

describe('Trace look tokens', () => {
  it('resolves presets and merges partial tokens over defaults', () => {
    const warm = styleFromLook('warm-film')
    expect(warm.lookId).toBe('warm-film')
    expect(warm.palette?.accent).toBe('#f59e0b')
    expect(warm.fonts?.heading).toContain('Georgia')

    const merged = stylePalette({ palette: { accent: '#123456' } })
    expect(merged.accent).toBe('#123456')
    expect(merged.background).toBe('#0b1120')
  })

  it('sets and clears the style through atomic ops', () => {
    const base = project()
    const styled = applyOps(base, [
      { type: 'setStyle', style: styleFromLook('noir') },
    ])
    expect(styled.ok).toBe(true)
    expect(styled.diff.styleChanged).toBe(true)
    expect(styled.project.style?.lookId).toBe('noir')

    const cleared = applyOps(styled.project, [
      { type: 'setStyle', style: null },
    ])
    expect(cleared.ok).toBe(true)
    expect(cleared.project.style).toBeUndefined()
    expect(cleared.diff.styleChanged).toBe(true)
  })

  it('restyles role-matched layers and scenes when asked', () => {
    const base = project({
      style: styleFromLook('nova-dark'),
      elements: {
        headline: text('headline', '#f8fafc', 44),
        accent: rect('accent', {
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          fill: '#38bdf8',
        }),
        muted: rect('muted', {
          x: 0,
          y: 0,
          width: 100,
          height: 2,
          stroke: '#94a3b8',
          strokeWidth: 2,
        }),
        custom: rect('custom', {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: '#123456',
        }),
      },
      rootElementIds: ['headline', 'accent', 'muted', 'custom'],
      storyboard: {
        scenes: [
          {
            id: 'scene-1',
            name: 'Scene 1',
            startMs: 0,
            durationMs: 4000,
            transitionIn: 'cut',
            background: '#0b1120',
          },
        ],
      },
    })

    const ops = applyLookToElements(base, styleFromLook('warm-film'), {
      background: true,
    })

    const headline = ops.find(
      (op) => op.type === 'updateElement' && op.id === 'headline',
    )
    expect(headline?.type).toBe('updateElement')
    if (headline?.type === 'updateElement') {
      expect(headline.attributes?.fill).toBe('#fdf6ec')
      expect(String(headline.attributes?.fontFamily)).toContain('Georgia')
    }

    const accent = ops.find(
      (op) => op.type === 'updateElement' && op.id === 'accent',
    )
    if (accent?.type === 'updateElement') {
      expect(accent.attributes?.fill).toBe('#f59e0b')
    }

    const muted = ops.find(
      (op) => op.type === 'updateElement' && op.id === 'muted',
    )
    if (muted?.type === 'updateElement') {
      expect(muted.attributes?.stroke).toBe('#c7a98a')
    }

    expect(
      ops.some((op) => op.type === 'updateElement' && op.id === 'custom'),
    ).toBe(false)

    const scene = ops.find((op) => op.type === 'updateScene')
    if (scene?.type === 'updateScene') {
      expect(scene.background).toBe('#14100c')
    }
  })

  it('feeds the look palette and fonts into new blocks', () => {
    const { options, fragment } = instantiateBlock(
      'title-card',
      {},
      {
        canvas: { width: 1000, height: 600 },
        style: styleFromLook('editorial'),
      },
    )
    expect(options.accentColor).toBe('#b45309')
    expect(options.textColor).toBe('#1f2937')

    const headline = Object.values(fragment.elements).find(
      (element) => element.attributes?.text === 'Make it move.',
    )
    expect(headline?.attributes.fontFamily).toContain('Georgia')
  })

  it('seeds recipe blocks from the look as well', () => {
    const { options } = instantiateBlock(
      'counter',
      {},
      {
        canvas: { width: 1000, height: 600 },
        style: styleFromLook('neon'),
      },
    )
    expect(options.fill).toBe('#f0f4ff')
  })

  it('flags linear motion, pure black and uniform timing', () => {
    const linear = motionTrack('linear', 0, 1000)
    linear.keyframes[0].easing = 'linear'

    const base = project({
      elements: {
        black: rect('black', {
          x: 0,
          y: 0,
          width: 1000,
          height: 600,
          fill: '#000000',
        }),
        moving: rect(
          'moving',
          { x: 0, y: 0, width: 40, height: 40, fill: '#38bdf8' },
          [linear],
        ),
        a: rect('a', { x: 0, y: 0, width: 20, height: 20 }, [
          motionTrack('a-x', 0, 1000),
        ]),
        b: rect('b', { x: 0, y: 0, width: 20, height: 20 }, [
          motionTrack('b-x', 0, 1000),
        ]),
        c: rect('c', { x: 0, y: 0, width: 20, height: 20 }, [
          motionTrack('c-x', 0, 1000),
        ]),
      },
      rootElementIds: ['black', 'moving', 'a', 'b', 'c'],
    })

    const lint = lintTraceProject(base)
    const codes = lint.diagnostics.map((entry) => entry.code)
    expect(codes).toContain('STYLE_LINEAR_MOTION')
    expect(codes).toContain('STYLE_PURE_BLACK')
    expect(codes).toContain('STYLE_UNIFORM_TIMING')
  })
})