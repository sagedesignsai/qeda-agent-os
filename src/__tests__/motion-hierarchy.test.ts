/**
 * __tests__/motion-hierarchy.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The scene tree's order and drop rules are pure, so they are verified here
 * rather than by simulating pointer drags in jsdom.
 */

import {
  buildMotionHierarchy,
  checkMotionReparent,
  isMotionNodeDescendant,
} from '@/lib/motion/hierarchy';
import { createMotionNode } from '@/lib/motion/node-registry';

const group = createMotionNode('scene.group', 'grp');
const tablet = createMotionNode('device.tablet', 'tablet', { parentId: 'grp' });
const screen = createMotionNode('screen.image', 'screen', { parentId: 'tablet' });
const title = createMotionNode('text.title', 'title');
const nodes = [group, tablet, screen, title];

describe('motion hierarchy', () => {
  it('flattens children directly after their parent with an increasing depth', () => {
    expect(buildMotionHierarchy(nodes).map((row) => [row.node.id, row.depth])).toEqual([
      ['grp', 0],
      ['tablet', 1],
      ['screen', 2],
      ['title', 0],
    ]);
  });

  it('hides children of collapsed rows without dropping the row itself', () => {
    expect(buildMotionHierarchy(nodes, new Set(['tablet'])).map((row) => row.node.id)).toEqual([
      'grp',
      'tablet',
      'title',
    ]);
  });

  it('keeps orphans at the root instead of hiding them', () => {
    const orphan = createMotionNode('text.body', 'orphan', { parentId: 'missing' });
    expect(
      buildMotionHierarchy([orphan]).map((row) => [row.node.id, row.depth]),
    ).toEqual([['orphan', 0]]);
  });

  it('reports descendants through the parent chain', () => {
    expect(isMotionNodeDescendant(nodes, 'screen', 'grp')).toBe(true);
    expect(isMotionNodeDescendant(nodes, 'grp', 'screen')).toBe(false);
  });

  it('accepts a legal parent and the scene root', () => {
    expect(checkMotionReparent(nodes, 'screen', 'grp')).toEqual({ allowed: true });
    expect(checkMotionReparent(nodes, 'screen', null)).toEqual({ allowed: true });
  });

  it('rejects self-parenting, cycles, and disallowed parent types', () => {
    expect(checkMotionReparent(nodes, 'grp', 'grp')).toMatchObject({ allowed: false });
    expect(checkMotionReparent(nodes, 'grp', 'screen')).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/subtree/),
    });
    expect(checkMotionReparent(nodes, 'screen', 'title')).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/cannot be parented/),
    });
  });
});
