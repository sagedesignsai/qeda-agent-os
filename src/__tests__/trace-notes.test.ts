import {
  addReviewNote,
  removeReviewNote,
  reviewNoteSummary,
  sortReviewNotes,
  updateReviewNote,
} from '@/lib/trace/review'
import { applyOps } from '@/lib/trace/ops'
import type { TraceProject } from '@/lib/trace/types'

function project(): TraceProject {
  return {
    id: 'notes-test',
    name: 'Notes test',
    width: 1000,
    height: 600,
    durationMs: 4000,
    fps: 60,
    elements: {},
    rootElementIds: [],
  }
}

describe('Trace review notes', () => {
  it('adds, sorts and resolves notes without deleting history', () => {
    let notes = addReviewNote(undefined, {
      text: '  Tighten the headline  ',
      timeMs: 1200,
    })
    expect(notes).toHaveLength(1)
    expect(notes[0].text).toBe('Tighten the headline')

    notes = addReviewNote(notes, { text: 'Cut earlier', timeMs: 200 })
    expect(sortReviewNotes(notes).map((note) => note.timeMs)).toEqual([
      200, 1200,
    ])

    const late = notes.find((note) => note.timeMs === 1200)!
    notes = updateReviewNote(notes, late.id, { resolved: true })
    expect(notes.find((note) => note.id === late.id)?.resolved).toBe(true)
    expect(notes).toHaveLength(2)
    expect(reviewNoteSummary(notes)).toEqual({ total: 2, unresolved: 1 })

    notes = removeReviewNote(notes, late.id)
    expect(notes).toHaveLength(1)
  })

  it('stores notes through the op contract and restores them', () => {
    const base = project()
    const notes = addReviewNote(undefined, { text: 'Fix the CTA', timeMs: 900 })

    const set = applyOps(base, [{ type: 'setReviewNotes', notes }])
    expect(set.ok).toBe(true)
    expect(set.diff.notesChanged).toBe(true)
    expect(set.project.reviewNotes).toHaveLength(1)

    const cleared = applyOps(set.project, [
      { type: 'setReviewNotes', notes: null },
    ])
    expect(cleared.project.reviewNotes).toBeUndefined()
    expect(cleared.diff.notesChanged).toBe(true)

    const withInverse = applyOps(
      base,
      [{ type: 'setReviewNotes', notes }],
      { includeInverse: true },
    )
    const restored = applyOps(withInverse.project, withInverse.inverse)
    expect(restored.project.reviewNotes).toBeUndefined()
  })
})