import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { MotionStore } from '@/hooks/use-motion-store';

describe('MotionStore commit lifecycle', () => {
  it('does not create history for a no-op and preserves the document reference', () => {
    const store = new MotionStore(createStarterMotionDocument());
    const initial = store.getDocument();
    const result = store.commit('No-op', [
      { op: 'track.update', trackId: 'trk_title', name: 'Title' },
    ]);
    expect(result.status).toBe('unchanged');
    expect(store.getDocument()).toBe(initial);
    expect(store.getSnapshot().canUndo).toBe(false);
    store.dispose();
  });

  it('increments the document revision once per changed batch and on undo/redo', () => {
    const store = new MotionStore(createStarterMotionDocument());
    expect(store.commit('Batch', [
      { op: 'track.update', trackId: 'trk_title', name: 'Heading' },
      { op: 'document.rename', name: 'Launch' },
    ]).status).toBe('applied');
    expect(store.getDocument().revision).toBe(1);
    store.undo();
    expect(store.getDocument().revision).toBe(2);
    store.redo();
    expect(store.getDocument().revision).toBe(3);
    store.dispose();
  });

  it('returns rejected for an invalid operation without mutating the document', () => {
    const store = new MotionStore(createStarterMotionDocument());
    const before = store.getDocument();
    const result = store.commit('Invalid', [{ op: 'missing.op' } as never]);
    expect(result.status).toBe('rejected');
    expect(store.getDocument()).toBe(before);
    store.dispose();
  });

  it('restores failed pending approvals and allows cancellation', () => {
    const store = new MotionStore(createStarterMotionDocument());
    const pending = store.commit('Remove missing track', [
      { op: 'track.remove', trackId: 'missing' },
    ]);
    expect(pending.status).toBe('pending');
    expect(store.confirmPending()?.status).toBe('rejected');
    expect(store.getSnapshot().pendingApproval?.label).toBe('Remove missing track');
    store.cancelPending();
    expect(store.getSnapshot().pendingApproval).toBeNull();
    store.dispose();
  });
});
