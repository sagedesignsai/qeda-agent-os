/**
 * lib/motion/schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The versioned document schema and its migration chain.
 *
 * Parsing is strict on purpose: a project written by a newer app version fails
 * loudly instead of silently dropping the fields this build does not know
 * about. Silent truncation would corrupt someone's project on the next save.
 *
 * `MIGRATIONS` maps `from → to`. Loading walks the chain from the file's version
 * up to `MOTION_SCHEMA_VERSION`, so a v1 project opened three releases later
 * passes through every step rather than being patched by one giant branch.
 */

import { z } from 'zod';

import {
  createMotionNode,
  hasAnimatableProperty,
  getMotionNodeType,
  MotionNodeError,
  validateMotionNode,
} from './node-registry';
import {
  MOTION_SCHEMA_VERSION,
  type MotionAsset,
  type MotionDocument,
  type MotionNode,
} from './types';

export const motionEasingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('linear') }),
  z.object({ type: z.literal('step') }),
  z.object({
    type: z.literal('cubic'),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
  }),
]);

const keyframeSchema = z.object({
  id: z.string().min(1),
  time: z.number(),
  value: z.number(),
  easing: motionEasingSchema,
});

const channelSchema = z.object({
  id: z.string().min(1),
  targetId: z.string().min(1),
  property: z.string().min(1),
  keyframes: z.array(keyframeSchema),
});

const clipSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().nonnegative(),
  channels: z.array(channelSchema),
});

const placementSchema = z.object({
  id: z.string().min(1),
  clipId: z.string().min(1),
  start: z.number(),
});

const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  targetId: z.string().nullable(),
  muted: z.boolean(),
  locked: z.boolean(),
  placements: z.array(placementSchema),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string(),
  parentId: z.string().nullable(),
  visible: z.boolean(),
  locked: z.boolean(),
  transform: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    rotation: z.tuple([z.number(), z.number(), z.number()]),
    scale: z.tuple([z.number(), z.number(), z.number()]),
  }),
  props: z.record(z.string(), z.unknown()),
});

const assetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['image', 'image-sequence']),
  mimeType: z.string().min(1),
  frameCount: z.number().int().positive(),
  fps: z.number().positive(),
  uri: z.string().min(1).optional(),
});

export const motionDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  meta: z.object({
    id: z.string().min(1),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    output: z.object({
      fps: z.number().positive(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  }),
  assets: z.array(assetSchema),
  scene: z.object({
    nodes: z.array(nodeSchema),
  }),
  timeline: z.object({
    duration: z.number().nonnegative(),
    loop: z.object({
      enabled: z.boolean(),
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
    }),
    tracks: z.array(trackSchema),
    clips: z.array(clipSchema),
  }),
});

export class MotionSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionSchemaError';
  }
}

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

function migrateV1ToV2(doc: Record<string, unknown>): Record<string, unknown> {
  const timeline = doc.timeline as { clips?: Array<{ channels?: Array<{ targetId?: string }> }> };
  const targetIds = new Set(
    (timeline?.clips ?? []).flatMap((clip) =>
      (clip.channels ?? []).map((channel) => channel.targetId).filter(Boolean),
    ),
  );
  const nodes: MotionNode[] = [];

  for (const id of targetIds) {
    if (!id || id === 'screen_dashboard') continue;
    const type =
      id === 'camera'
        ? 'camera.perspective'
        : id === 'product'
          ? 'device.tablet'
          : id === 'title'
            ? 'text.title'
            : 'scene.group';
    const node = createMotionNode(type, id, { name: id });
    if (id === 'title') {
      node.props = { ...node.props, text: 'Product title' };
    }
    nodes.push(node);
  }

  if (targetIds.has('product') || targetIds.has('screen_dashboard')) {
    nodes.push(
      createMotionNode('screen.image', 'screen_dashboard', {
        name: 'Dashboard screen',
        parentId: targetIds.has('product') ? 'product' : null,
      }),
    );
  }
  if (nodes.length > 0) {
    nodes.push(
      createMotionNode('light.ambient', 'light_ambient'),
      createMotionNode('light.directional', 'light_key'),
      createMotionNode('light.point', 'light_accent'),
    );
  }

  return { ...doc, scene: { nodes } };
}

function migrateV2ToV3(doc: Record<string, unknown>): Record<string, unknown> {
  return { ...doc, assets: [] };
}

/** Ordered `from → migration` map. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
};

export function migrateMotionDocument(
  raw: Record<string, unknown>,
  targetVersion: number = MOTION_SCHEMA_VERSION,
): Record<string, unknown> {
  let current = raw;
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 0;

  if (version > targetVersion) {
    throw new MotionSchemaError(
      `Project was written by a newer version of Motion (schema ${version}, this build understands ${targetVersion}). Update the app to open it.`,
    );
  }

  while (version < targetVersion) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new MotionSchemaError(
        `No migration from schema version ${version} to ${version + 1}. The project cannot be opened safely.`,
      );
    }
    current = migrate(current);
    version += 1;
    current = { ...current, schemaVersion: version };
  }

  return current;
}

export function parseMotionDocument(raw: unknown): MotionDocument {
  if (!raw || typeof raw !== 'object') {
    throw new MotionSchemaError('Project file is not a Motion document.');
  }
  const migrated = migrateMotionDocument(raw as Record<string, unknown>);
  const result = motionDocumentSchema.safeParse(migrated);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new MotionSchemaError(
      `Project file is invalid at ${first?.path.join('.') || 'root'}: ${first?.message || 'unknown problem'}`,
    );
  }
  const doc = result.data;
  const assetIds = new Set<string>();
  for (const asset of doc.assets as MotionAsset[]) {
    if (assetIds.has(asset.id)) {
      throw new MotionSchemaError(`Project file contains duplicate asset id "${asset.id}".`);
    }
    assetIds.add(asset.id);
  }
  const nodeIds = new Set<string>();

  for (const rawNode of doc.scene.nodes) {
    if (nodeIds.has(rawNode.id)) {
      throw new MotionSchemaError(`Project file contains duplicate scene node id "${rawNode.id}".`);
    }
    nodeIds.add(rawNode.id);
    try {
      validateMotionNode(rawNode);
    } catch (error) {
      if (error instanceof MotionNodeError) throw new MotionSchemaError(error.message);
      throw error;
    }
  }

  for (const node of doc.scene.nodes) {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      throw new MotionSchemaError(
        `Scene node "${node.id}" references missing parent "${node.parentId}".`,
      );
    }
    const parent = doc.scene.nodes.find((candidate) => candidate.id === node.parentId);
    if (parent) {
      const allowedParents = getMotionNodeType(node.type)?.allowedParents;
      if (allowedParents && !allowedParents.includes(parent.type)) {
        throw new MotionSchemaError(
          `Scene node "${node.id}" cannot be parented to node type "${parent.type}".`,
        );
      }
    }
    const visited = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        throw new MotionSchemaError(`Scene graph contains a parent cycle at "${parentId}".`);
      }
      visited.add(parentId);
      parentId = doc.scene.nodes.find((candidate) => candidate.id === parentId)?.parentId ?? null;
    }
  }

  for (const clip of doc.timeline.clips) {
    for (const channel of clip.channels) {
      const target = doc.scene.nodes.find((node) => node.id === channel.targetId);
      if (!target) {
        throw new MotionSchemaError(
          `Animation channel "${channel.id}" references missing scene node "${channel.targetId}".`,
        );
      }
      if (!hasAnimatableProperty(target.type, channel.property)) {
        throw new MotionSchemaError(
          `Animation channel "${channel.id}" targets unsupported property "${channel.property}" on node type "${target.type}".`,
        );
      }
    }
  }

  for (const node of doc.scene.nodes) {
    if (node.type !== 'screen.image') continue;
    const source = node.props.source;
    if (typeof source !== 'string' || source === 'starter-dashboard') continue;
    if (!assetIds.has(source)) {
      throw new MotionSchemaError(
        `Screen node "${node.id}" references missing image asset "${source}".`,
      );
    }
  }

  return doc;
}

export function loadMotionDocument(raw: unknown): MotionDocument {
  return parseMotionDocument(raw);
}

export function serializeMotionDocument(doc: MotionDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function isMotionDocument(value: unknown): value is MotionDocument {
  try {
    parseMotionDocument(value);
    return true;
  } catch (error) {
    if (error instanceof MotionSchemaError) return false;
    throw error;
  }
}
