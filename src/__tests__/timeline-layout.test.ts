import {
  hitTestTimeline,
  layoutTimeline,
  normalizeLoopRange,
  snapCandidatesFor,
} from '@/lib/timeline/layout';
import type { TimelineKey, TimelineModel } from '@/lib/timeline/types';

function denseModel(): TimelineModel {
  const keys: TimelineKey[] = Array.from({ length: 5000 }, (_, index) => ({
    id: `key-${index}`,
    time: index,
  }));
  return {
    duration: 5000,
    fps: 30,
    rows: Array.from({ length: 100 }, (_, index) => ({ id: `row-${index}`, name: `Row ${index}` })),
    items: [
      {
        id: 'item-dense',
        rowId: 'row-0',
        label: 'Dense clip',
        start: 0,
        duration: 5000,
        channels: [{ id: 'channel-0', label: 'position.x', keys }],
      },
    ],
    loop: { start: 0, end: 5 },
  };
}

const view = { pxPerSecond: 100, scrollSeconds: 0 };

describe('timeline layout', () => {
  it('emits only what intersects the viewport, horizontally and vertically', () => {
    const layout = layoutTimeline({ model: denseModel(), view, width: 800, height: 400 });

    // 8s visible + ~3.2s overscan each side, so a few dozen keys, not 5000.
    expect(layout.keys.length).toBeGreaterThan(0);
    expect(layout.keys.length).toBeLessThan(40);

    // 100 rows tall, ~400px of pane.
    expect(layout.rows.length).toBeLessThan(12);
    expect(layout.items).toHaveLength(1);
  });

  it('keeps layout cost independent of document size', () => {
    const model = denseModel();
    const started = performance.now();
    for (let i = 0; i < 200; i += 1) {
      layoutTimeline({ model, view, width: 800, height: 400 });
    }
    const elapsed = performance.now() - started;
    // 200 layouts of a 5000-key model. Generous bound: this is a regression
    // guard against reintroducing a full-document walk, not a benchmark.
    expect(elapsed).toBeLessThan(3000);
  });

  it('culls items outside the time range', () => {
    const model: TimelineModel = {
      duration: 100,
      rows: [{ id: 'row-0', name: 'Row 0' }],
      items: [
        { id: 'near', rowId: 'row-0', label: 'Near', start: 0, duration: 2 },
        { id: 'far', rowId: 'row-0', label: 'Far', start: 80, duration: 5 },
      ],
    };
    const layout = layoutTimeline({ model, view, width: 800, height: 400 });
    expect(layout.items.map((item) => item.itemId)).toEqual(['near']);
  });

  it('hit tests keys before the item body they sit on', () => {
    const model: TimelineModel = {
      duration: 10,
      rows: [{ id: 'row-0', name: 'Row 0' }],
      items: [
        {
          id: 'item-1',
          rowId: 'row-0',
          label: 'Clip',
          start: 1,
          duration: 4,
          channels: [
            { id: 'channel-1', label: 'opacity', keys: [{ id: 'key-1', time: 2 }] },
          ],
        },
      ],
    };
    const layout = layoutTimeline({ model, view, width: 800, height: 400 });
    const key = layout.keys[0];

    expect(hitTestTimeline(layout, key.x, key.y).type).toBe('key');
    expect(hitTestTimeline(layout, 5, 5).type).toBe('ruler');

    const item = layout.items[0];
    const bodyHit = hitTestTimeline(layout, item.x + item.width - 40, item.y + item.height - 4);
    expect(bodyHit.type).toBe('item');
  });

  it('excludes the dragged entity from its own snap candidates', () => {
    const model: TimelineModel = {
      duration: 10,
      rows: [{ id: 'row-0', name: 'Row 0' }],
      items: [
        { id: 'a', rowId: 'row-0', label: 'A', start: 2, duration: 1 },
        { id: 'b', rowId: 'row-0', label: 'B', start: 6, duration: 1 },
      ],
      loop: { start: 0, end: 4 },
    };
    const layout = layoutTimeline({ model, view, width: 800, height: 400 });
    const candidates = snapCandidatesFor(layout, { excludeItemId: 'a' });
    expect(candidates).toContain(7); // b.end
    expect(candidates).not.toContain(2); // a.start is excluded
    expect(candidates).toContain(0);
  });

  it('normalizes loop ranges into a valid span', () => {
    expect(normalizeLoopRange({ start: 4, end: 2 }, 6)).toEqual({ start: 2, end: 4 });
    expect(normalizeLoopRange({ start: 5, end: 9 }, 6)).toEqual({ start: 5, end: 6 });
    expect(normalizeLoopRange({ start: 6, end: 6 }, 6)).toEqual({ start: 5.95, end: 6 });
  });
});
