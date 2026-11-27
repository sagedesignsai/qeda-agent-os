import { contrastRatio, framesForProject, qaTraceProject } from '@/lib/trace/qa'
import type { TraceElement, TraceProject } from '@/lib/trace/types'

function text(fill: string, fontSize: number, sceneId: string): TraceElement {
  return {
    id: 'headline',
    name: 'Headline',
    type: 'text',
    visible: true,
    locked: false,
    sceneId,
    attributes: {
      x: 0,
      y: 0,
      text: 'Headline',
      fontSize,
      fontWeight: 800,
      fill,
    },
    origin: { x: 0, y: 0 },
    tracks: [],
    parentId: null,
    childrenIds: [],
  }
}

function project(): TraceProject {
  return {
    id: 'qa-test',
    name: 'QA test',
    width: 1000,
    height: 600,
    durationMs: 5000,
    fps: 60,
    style: { palette: { background: '#0b1120' } },
    elements: {
      headline: text('#0b1120', 48, 'scene-1'),
    },
    rootElementIds: ['headline'],
    storyboard: {
      scenes: [
        {
          id: 'scene-1',
          name: 'Signal',
          startMs: 0,
          durationMs: 2000,
          transitionIn: 'cut',
          background: '#0b1120',
        },
        {
          id: 'scene-2',
          name: 'Trace',
          startMs: 2000,
          durationMs: 1000,
          transitionIn: 'fade',
          background: '#0b1120',
        },
      ],
    },
    narration: {
      lines: [{ id: 'line-1', text: 'One unmeasured line' }],
    },
    reviewNotes: [
      {
        id: 'note-1',
        text: 'Tighten this cut',
        timeMs: 1500,
        sceneId: 'scene-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }
}

describe('Trace composition QA', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#0b1120', '#0b1120')).toBeCloseTo(1, 5)
    expect(contrastRatio('not-a-colour', '#ffffff')).toBeNull()
  })

  it('builds a deduped frame list from scenes and notes', () => {
    const frames = framesForProject(project())
    const times = frames.map((frame) => frame.timeMs)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(new Set(times).size).toBe(times.length)
    expect(times).toContain(1500)
    expect(frames.some((frame) => frame.label.includes('Signal'))).toBe(true)
    expect(frames.some((frame) => frame.label.startsWith('Note'))).toBe(true)
  })

  it('reports readiness issues, metrics and frames', () => {
    const report = qaTraceProject(project())
    const codes = report.issues.map((issue) => issue.code)

    expect(codes).toContain('QA_SCENE_GAP')
    expect(codes).toContain('QA_NARRATION_UNMEASURED')
    expect(codes).toContain('QA_REVIEW_NOTE_OPEN')
    expect(codes).toContain('QA_TEXT_CONTRAST')

    expect(report.metrics.unresolvedNotes).toBe(1)
    expect(report.metrics.lowContrastTexts).toBe(1)
    expect(report.metrics.measuredNarrationLines).toBe(0)
    expect(report.metrics.totalNarrationLines).toBe(1)
    expect(report.metrics.sceneCount).toBe(2)
    expect(report.frames.length).toBeGreaterThan(2)
    expect(report.ok).toBe(true) // warnings and info, no errors
  })
})