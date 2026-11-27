import { applyElementAnimationAtTime } from '@/lib/trace/runtime/dom-renderer'
import type { TraceElement } from '@/lib/trace/types'

const NS = 'http://www.w3.org/2000/svg'

function bar(): TraceElement {
  return {
    id: 'bar',
    name: 'Bar',
    type: 'rect',
    visible: true,
    locked: false,
    attributes: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fill: '#38bdf8',
    },
    origin: { x: 0, y: 0 },
    tracks: [
      {
        property: 'height',
        keyframes: [
          { id: 'kf-a', timeMs: 0, value: 0, easing: 'linear' },
          { id: 'kf-b', timeMs: 1000, value: 100, easing: 'linear' },
        ],
      },
      {
        property: 'fill',
        keyframes: [
          { id: 'kf-c', timeMs: 0, value: '#ff0000', easing: 'linear' },
          { id: 'kf-d', timeMs: 1000, value: '#0000ff', easing: 'linear' },
        ],
      },
    ] as TraceElement['tracks'],
    parentId: null,
    childrenIds: [],
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Trace DOM renderer property targeting', () => {
  it('writes geometry and paint tracks to the body shape, not the wrapper <g>', () => {
    const wrapper = document.createElementNS(NS, 'g')
    wrapper.setAttribute('data-trace-id', 'bar')
    const body = document.createElementNS(NS, 'g')
    body.innerHTML =
      '<rect x="0" y="0" width="100" height="0" fill="#ff0000" />'
    wrapper.appendChild(body)
    document.body.appendChild(wrapper)

    const rect = body.querySelector('rect')!
    applyElementAnimationAtTime(wrapper, bar(), 500)

    // Geometry is not inherited: a track written to the wrapper would be a
    // silent no-op during playback while a paused re-render showed the value.
    expect(Number(rect.getAttribute('height'))).toBeCloseTo(50, 0)
    expect(wrapper.hasAttribute('height')).toBe(false)

    // Paint attributes are explicit on the body and shadow the wrapper.
    expect(rect.getAttribute('fill')).toMatch(/^rgb\(/)
    expect(wrapper.hasAttribute('fill')).toBe(false)
  })

  it('also writes directly when the shape is mounted without a body group', () => {
    const wrapper = document.createElementNS(NS, 'g')
    wrapper.setAttribute('data-trace-id', 'bar')
    const rect = document.createElementNS(NS, 'rect')
    rect.setAttribute('height', '0')
    wrapper.appendChild(rect)
    document.body.appendChild(wrapper)

    applyElementAnimationAtTime(wrapper, bar(), 1000)

    expect(Number(rect.getAttribute('height'))).toBe(100)
    expect(wrapper.hasAttribute('height')).toBe(false)
  })

  it('leaves a group element wrapper untouched when it has no body', () => {
    const group: TraceElement = {
      ...bar(),
      type: 'group',
      tracks: [],
      childrenIds: ['child'],
    }
    const wrapper = document.createElementNS(NS, 'g')
    wrapper.setAttribute('data-trace-id', group.id)
    const child = document.createElementNS(NS, 'g')
    child.setAttribute('data-trace-id', 'child')
    wrapper.appendChild(child)
    document.body.appendChild(wrapper)

    expect(() => applyElementAnimationAtTime(wrapper, group, 500)).not.toThrow()
    expect(wrapper.querySelector('[data-trace-id="child"]')).toBe(child)
  })
})