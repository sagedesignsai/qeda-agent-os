/**
 * __tests__/timeline-selection.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Locks down range/toggle selection semantics independently of canvas geometry.
 */

import { resolveTimelineKeySelection } from '@/lib/timeline/selection';

const ordered = ['a', 'b', 'c', 'd'];

describe('resolveTimelineKeySelection', () => {
  it('selects an inclusive range from the original anchor', () => {
    const first = resolveTimelineKeySelection({ clickedKeyId: 'a', orderedKeyIds: ordered });
    const range = resolveTimelineKeySelection({
      clickedKeyId: 'd',
      orderedKeyIds: ordered,
      currentKeyId: first.primaryKeyId ?? undefined,
      currentKeyIds: first.keyIds,
      anchorKeyId: first.anchorKeyId,
      shiftKey: true,
    });
    expect(range).toEqual({ primaryKeyId: 'd', keyIds: ['a', 'b', 'c', 'd'], anchorKeyId: 'a' });
  });

  it('toggles one key off while keeping a remaining primary selection', () => {
    expect(resolveTimelineKeySelection({
      clickedKeyId: 'b',
      orderedKeyIds: ordered,
      currentKeyId: 'c',
      currentKeyIds: ['b', 'c'],
      toggleKey: true,
    })).toEqual({ primaryKeyId: 'c', keyIds: ['c'], anchorKeyId: 'b' });
  });

  it('clears selection when the only selected key is toggled off', () => {
    expect(resolveTimelineKeySelection({
      clickedKeyId: 'b',
      orderedKeyIds: ordered,
      currentKeyId: 'b',
      toggleKey: true,
    })).toEqual({ primaryKeyId: null, keyIds: [], anchorKeyId: 'b' });
  });

  it('preserves a multi-selection when dragging one of its selected keys', () => {
    expect(resolveTimelineKeySelection({
      clickedKeyId: 'c',
      orderedKeyIds: ordered,
      currentKeyId: 'c',
      currentKeyIds: ['a', 'c'],
    })).toEqual({ primaryKeyId: 'c', keyIds: ['a', 'c'], anchorKeyId: 'c' });
  });
});
