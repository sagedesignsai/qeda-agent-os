import {
  applyMotionCommand,
  describeMotionEngine,
  MotionCommandError,
  planMotionCommand,
} from '@/lib/motion/engine-contract';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { evaluateMotionFrame, MotionEvaluationError } from '@/lib/motion/evaluate';
import { MotionOpError, applyMotionOp } from '@/lib/motion/ops';
import { parseMotionDocument } from '@/lib/motion/schema';
import { MOTION_SCHEMA_VERSION } from '@/lib/motion/types';

const NOW = '2026-01-01T00:00:00.000Z';

describe('3D Motion engine', () => {
  it('creates a registered scene graph in the starter document', () => {
    const doc = createStarterMotionDocument(NOW);

    expect(doc.schemaVersion).toBe(MOTION_SCHEMA_VERSION);
    expect(doc.scene.nodes.map((node) => node.id)).toEqual([
      'camera',
      'product',
      'screen_dashboard',
      'title',
      'light_ambient',
      'light_key',
      'light_accent',
    ]);
    expect(doc.scene.nodes.find((node) => node.id === 'screen_dashboard')?.parentId).toBe(
      'product',
    );
  });

  it('migrates schema v1 animation targets into a v2 scene graph', () => {
    const legacy = { ...createStarterMotionDocument(NOW), schemaVersion: 1 } as Record<
      string,
      unknown
    >;
    delete legacy.scene;

    const migrated = parseMotionDocument(legacy);

    expect(migrated.schemaVersion).toBe(MOTION_SCHEMA_VERSION);
    expect(migrated.scene.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'camera',
        'product',
        'title',
        'screen_dashboard',
        'light_ambient',
        'light_key',
        'light_accent',
      ]),
    );
    expect(migrated.timeline.clips).toHaveLength(3);
  });

  it('rejects invalid scene hierarchy when parsing a document', () => {
    const doc = createStarterMotionDocument(NOW);
    const invalid = {
      ...doc,
      scene: {
        nodes: doc.scene.nodes.map((node) =>
          node.id === 'screen_dashboard' ? { ...node, parentId: 'missing' } : node,
        ),
      },
    };

    expect(() => parseMotionDocument(invalid)).toThrow('references missing parent');
  });

  it('rejects animation channels unsupported by their registered node type', () => {
    const doc = createStarterMotionDocument(NOW);
    const clip = doc.timeline.clips.find((candidate) => candidate.id === 'clip_product_spin');
    const channel = clip?.channels.find((candidate) => candidate.id === 'chn_product_spin');
    if (!channel) throw new Error('Starter document is missing the product rotation channel.');
    channel.property = 'position.w';

    expect(() => parseMotionDocument(doc)).toThrow('targets unsupported property');
  });

  it('evaluates active animation onto copied nodes without mutating the document', () => {
    const doc = createStarterMotionDocument(NOW);
    const frame = evaluateMotionFrame(doc, 4.5);

    expect(frame.nodes.find((node) => node.id === 'product')?.transform.rotation[1]).toBeCloseTo(
      Math.PI * 2,
    );
    expect(doc.scene.nodes.find((node) => node.id === 'product')?.transform.rotation[1]).toBe(0);
    expect(evaluateMotionFrame(doc, 4.5)).toEqual(frame);
  });

  it('rejects evaluated node properties outside their registered schema', () => {
    const doc = createStarterMotionDocument(NOW);
    const titleClip = doc.timeline.clips.find((clip) => clip.id === 'clip_title_in');
    const opacity = titleClip?.channels.find((channel) => channel.id === 'chn_title_opacity');
    if (!opacity) throw new Error('Starter document is missing the title opacity channel.');
    opacity.keyframes[1].value = 1.2;

    expect(() => evaluateMotionFrame(doc, 1.3)).toThrow(MotionEvaluationError);
  });

  it('adds and updates nodes only through validated operations', () => {
    const doc = createStarterMotionDocument(NOW);
    const withGroup = applyMotionOp(doc, {
      op: 'scene.node.add',
      nodeId: 'group_props',
      type: 'scene.group',
      name: 'Set',
    });

    expect(withGroup.scene.nodes.find((node) => node.id === 'group_props')?.name).toBe('Set');
    expect(() =>
      applyMotionOp(withGroup, {
        op: 'scene.node.add',
        nodeId: 'bad_screen',
        type: 'screen.image',
        parentId: 'camera',
      }),
    ).toThrow(MotionOpError);
    expect(() =>
      applyMotionOp(withGroup, {
        op: 'scene.node.update',
        nodeId: 'product',
        props: { unsupported: true },
      }),
    ).toThrow();
    expect(() =>
      applyMotionOp(withGroup, {
        op: 'document.rename',
        name: 'Renamed',
        unrecognized: true,
      } as never),
    ).toThrow(MotionOpError);
  });

  it('previews destructive commands but requires approval to apply them', () => {
    const doc = createStarterMotionDocument(NOW);
    const command = [{ op: 'scene.node.remove', nodeId: 'product' }] as const;
    const plan = planMotionCommand(doc, command, { now: NOW });

    expect(plan.risk).toBe('destructive');
    expect(plan.requiresApproval).toBe(true);
    expect(plan.preview.scene.nodes.some((node) => node.id === 'product')).toBe(false);
    expect(() => applyMotionCommand(doc, command, { now: NOW })).toThrow(MotionCommandError);

    const applied = applyMotionCommand(doc, command, { now: NOW, approved: true });
    expect(applied.document.scene.nodes.some((node) => node.id === 'screen_dashboard')).toBe(false);
    expect(
      applied.document.timeline.clips.every((clip) =>
        clip.channels.every((channel) => channel.targetId !== 'product'),
      ),
    ).toBe(true);
  });

  it('publishes a complete JSON-serializable engine manifest', () => {
    const manifest = describeMotionEngine();
    const serialized = JSON.stringify(manifest);

    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(manifest.documentSchemaVersion).toBe(MOTION_SCHEMA_VERSION);
    expect(manifest.nodes.find((node) => node.id === 'device.tablet')?.properties).toHaveProperty(
      'properties.width',
    );
    expect(manifest.operations.find((op) => op.id === 'scene.node.remove')?.risk).toBe(
      'destructive',
    );
    expect(
      manifest.operations.find((op) => op.id === 'scene.node.add')?.parameters,
    ).toHaveProperty('additionalProperties', false);
  });
});
