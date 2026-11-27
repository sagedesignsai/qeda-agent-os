import {
  blockDefaults,
  blockPreviewSvg,
  getBlock,
  instantiateBlock,
  sanitizeBlockOptions,
  searchBlocks,
  TRACE_BLOCKS,
} from '@/lib/trace/blocks'
import { applyOps } from '@/lib/trace/ops'
import type { TraceElement, TraceProject } from '@/lib/trace/types'

function idFactory() {
  let counter = 0
  return (prefix: string) => `${prefix}-${++counter}`
}

function rect(id: string): TraceElement {
  return {
    id,
    name: id,
    type: 'rect',
    visible: true,
    locked: false,
    sceneId: null,
    attributes: { x: 0, y: 0, width: 100, height: 100, fill: '#ffffff' },
    origin: { x: 0, y: 0 },
    tracks: [],
    parentId: null,
    childrenIds: [],
  }
}

function project(): TraceProject {
  return {
    id: 'blocks-test',
    name: 'Blocks test',
    width: 1000,
    height: 600,
    durationMs: 4000,
    fps: 60,
    elements: { existing: rect('existing') },
    rootElementIds: ['existing'],
  }
}

describe('Trace block registry', () => {
  it('has unique ids and defaults for every declared field', () => {
    const ids = TRACE_BLOCKS.map((block) => block.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const block of TRACE_BLOCKS) {
      expect(block.defaults).toBeDefined()
      for (const field of block.fields) {
        expect(block.defaults).toHaveProperty(field.key)
      }
    }
  })

  it('ranks named searches and returns the catalogue for an empty query', () => {
    expect(searchBlocks('lower third')[0]?.id).toBe('lower-third')
    expect(searchBlocks('quote').map((block) => block.id)).toContain(
      'quote-card',
    )
    expect(searchBlocks('').length).toBe(TRACE_BLOCKS.length)
  })

  it('sanitizes options against the declared fields', () => {
    const title = getBlock('title-card')
    expect(title).toBeDefined()
    const options = sanitizeBlockOptions(title!, {
      headline: '  Ship it  ',
      align: 'diagonal',
      bogus: 'drop me',
      x: 12,
      y: 34,
    })
    expect(options.headline).toBe('Ship it')
    expect(options.align).toBe('center')
    expect(options).not.toHaveProperty('bogus')
    expect(options.x).toBe(12)
    expect(options.y).toBe(34)

    const counter = getBlock('counter')
    const clamped = sanitizeBlockOptions(counter!, { endVal: -5 })
    expect(Number(clamped.endVal)).toBe(0)
  })

  it('clones bar defaults so form state cannot mutate the registry', () => {
    const block = getBlock('bar-chart')!
    const first = blockDefaults(block)
    const second = blockDefaults(block)
    ;(first.bars as Array<{ value: number }>)[0].value = 111
    expect((second.bars as Array<{ value: number }>)[0].value).not.toBe(111)
  })

  it('builds a centred title card with editable tracks', () => {
    const { fragment } = instantiateBlock(
      'title-card',
      { headline: 'Ship it' },
      { canvas: { width: 1000, height: 600 }, idFactory: idFactory() },
    )
    expect(fragment.rootElementIds).toHaveLength(1)
    const rootId = fragment.rootElementIds[0]
    const root = fragment.elements[rootId]
    expect(root.type).toBe('group')
    expect(root.attributes.x).toBe(500)
    expect(root.tracks).toHaveLength(0)

    const children = Object.values(fragment.elements).filter(
      (element) => element.id !== rootId,
    )
    expect(children.length).toBeGreaterThanOrEqual(3)
    expect(
      children.every((child) => child.parentId === rootId),
    ).toBe(true)
    expect(
      children.some((element) => element.attributes.text === 'Ship it'),
    ).toBe(true)
    expect(children.some((element) => element.tracks.length > 0)).toBe(true)
  })

  it('anchors recipe blocks relative to the canvas', () => {
    const { fragment } = instantiateBlock(
      'lower-third',
      {},
      { canvas: { width: 1000, height: 600 }, idFactory: idFactory() },
    )
    const root = fragment.elements[fragment.rootElementIds[0]]
    expect(root.attributes.x).toBeCloseTo(60)
    expect(root.attributes.y).toBeCloseTo(408)
  })

  it('inserts a block atomically and keeps existing art', () => {
    const base = project()
    const { fragment } = instantiateBlock(
      'title-card',
      {},
      { canvas: { width: base.width, height: base.height }, idFactory: idFactory() },
    )
    const result = applyOps(base, [
      {
        type: 'insertFragment',
        fragment,
        sceneId: null,
        suffix: 'test',
      },
    ])
    expect(result.ok).toBe(true)
    expect(result.project.elements.existing).toBeDefined()
    expect(result.diff.added.length).toBeGreaterThan(3)
    expect(result.project.rootElementIds.at(-1)).toContain('title')
  })

  it('inserts background blocks at the back of the stack', () => {
    const base = project()
    const { fragment } = instantiateBlock(
      'background-treatment',
      {},
      { canvas: { width: base.width, height: base.height }, idFactory: idFactory() },
    )
    const result = applyOps(base, [
      {
        type: 'insertFragment',
        fragment,
        sceneId: null,
        position: 'back',
        suffix: 'bgtest',
      },
    ])
    expect(result.ok).toBe(true)
    expect(result.project.rootElementIds[0]).toMatch(/^bg-/)
    expect(result.project.rootElementIds[0]).toContain('bgtest')
    expect(result.project.rootElementIds.at(-1)).toBe('existing')
  })

  it('renders a block preview through the shared serializer', () => {
    const svg = blockPreviewSvg(getBlock('title-card')!)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Make it move.')
  })
})