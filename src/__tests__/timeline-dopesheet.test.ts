import { layoutDopeSheet } from '@/lib/timeline/dopesheet';
import type { TimelineModel, TimelineView } from '@/lib/timeline/types';

const view: TimelineView = { pxPerSecond: 100, scrollSeconds: 0 };

function modelWith(rows: TimelineModel['rows'], items: TimelineModel['items']): TimelineModel {
  return { duration: 20, fps: 30, rows, items };
}

const model = modelWith(
  [
    { id: 'track-a', name: 'Track A', groupId: 'node-a', groupName: 'Node A' },
    { id: 'track-b', name: 'Track B', groupId: 'node-b', groupName: 'Node B' },
  ],
  [
    {
      id: 'item-1',
      rowId: 'track-a',
      label: 'Clip',
      start: 0,
      duration: 5,
      channels: [
        {
          id: 'ch-1',
          label: 'opacity',
          keys: [
            { id: 'k1', time: 0, channelId: 'ch-1' },
            { id: 'k2', time: 2, channelId: 'ch-1' },
          ],
        },
      ],
    },
    {
      id: 'item-2',
      rowId: 'track-a',
      label: 'Clip 2',
      start: 10,
      duration: 5,
      channels: [
        {
          id: 'ch-2',
          label: 'opacity',
          keys: [{ id: 'k3', time: 10, channelId: 'ch-2' }],
        },
      ],
    },
    {
      id: 'item-3',
      rowId: 'track-b',
      label: 'Clip 3',
      start: 0,
      duration: 5,
      channels: [
        {
          id: 'ch-3',
          label: 'position.x',
          keys: [{ id: 'k4', time: 1, channelId: 'ch-3' }],
        },
      ],
    },
  ],
);

function layout(input?: { view?: TimelineView; collapsedGroups?: Set<string> }) {
  return layoutDopeSheet({
    model,
    view: input?.view ?? view,
    width: 800,
    height: 400,
    collapsedGroups: input?.collapsedGroups,
  });
}

describe('dope sheet layout', () => {
  it('builds one property row per group and property', () => {
    const result = layout();

    expect(result.rows.map((row) => row.id)).toEqual([
      'node-a:group',
      'node-a::opacity',
      'node-b:group',
      'node-b::position.x',
    ]);
    expect(result.rows.find((row) => row.id === 'node-a:group')?.name).toBe('Node A');
    expect(result.rows.filter((row) => !row.isGroupHeader)).toHaveLength(2);
  });

  it('keeps one row for two placements of the same clip on one track', () => {
    const result = layout();
    const opacityRows = result.rows.filter((row) => row.property === 'opacity');

    expect(opacityRows).toHaveLength(1);
    // Both bars live on that one row, each with its own keys.
    expect(result.items.filter((item) => item.rowId === 'node-a::opacity')).toHaveLength(2);
    expect(result.keys.filter((key) => key.rowId === 'node-a::opacity')).toHaveLength(3);
  });

  it('keeps each group contiguous when items arrive interleaved', () => {
    const interleaved = modelWith(
      [
        { id: 'track-a', name: 'Track A', groupId: 'node-a', groupName: 'Node A' },
        { id: 'track-b', name: 'Track B', groupId: 'node-b', groupName: 'Node B' },
      ],
      [
        {
          id: 'item-1',
          rowId: 'track-a',
          label: 'Clip',
          start: 0,
          duration: 5,
          channels: [{ id: 'ch-1', label: 'opacity', keys: [{ id: 'k1', time: 0 }] }],
        },
        {
          id: 'item-2',
          rowId: 'track-b',
          label: 'Clip 2',
          start: 0,
          duration: 5,
          channels: [{ id: 'ch-2', label: 'position.x', keys: [{ id: 'k2', time: 0 }] }],
        },
        {
          id: 'item-3',
          rowId: 'track-a',
          label: 'Clip 3',
          start: 10,
          duration: 5,
          channels: [{ id: 'ch-3', label: 'position.y', keys: [{ id: 'k3', time: 10 }] }],
        },
      ],
    );

    const result = layoutDopeSheet({ model: interleaved, view, width: 800, height: 400 });
    expect(result.rows.map((row) => row.id)).toEqual([
      'node-a:group',
      'node-a::opacity',
      'node-a::position.y',
      'node-b:group',
      'node-b::position.x',
    ]);
  });

  it('does not change row structure when the viewport scrolls or zooms', () => {
    const scrolled = layout({ view: { pxPerSecond: 20, scrollSeconds: 12 } });

    expect(scrolled.rows.map((row) => row.id)).toEqual(layout().rows.map((row) => row.id));
    expect(scrolled.items).toHaveLength(model.items.length);
  });

  it('emits only the group header when a group is collapsed', () => {
    const result = layout({ collapsedGroups: new Set(['node-a']) });

    expect(result.rows.map((row) => row.id)).toEqual([
      'node-a:group',
      'node-b:group',
      'node-b::position.x',
    ]);
    expect(result.contentHeight).toBe(28 + 28 + 24);
  });

  it('omits channels with no keys', () => {
    const empty = modelWith(
      [{ id: 'track', name: 'Track', groupId: 'node', groupName: 'Node' }],
      [
        {
          id: 'item',
          rowId: 'track',
          label: 'Clip',
          start: 0,
          duration: 5,
          channels: [{ id: 'channel', label: 'opacity', keys: [] }],
        },
      ],
    );
    const result = layoutDopeSheet({ model: empty, view, width: 800, height: 400 });

    expect(result.rows).toHaveLength(0);
    expect(result.contentHeight).toBe(0);
  });
});
