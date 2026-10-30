/**
 * lib/motion/ops.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Motion operation registry — the only way a document changes.
 *
 * Every edit is a serializable, validated op with a declared risk class. That is
 * what makes the core agent-callable: an agent, a test, an undo entry and the
 * inspector all produce the same thing. UI mutation paths that bypass ops are a
 * bug, not a shortcut.
 *
 * There is deliberately no generic "set document" op. A setter would let any
 * destructive change launder itself into the `safe` tier, making the approval
 * gate decorative.
 *
 * Reducers are pure and take every id as a parameter, so replaying a batch
 * always produces the same document. Ids come from `ids.ts`, at the call site.
 */

import { z } from 'zod';

import { quantizeDocumentToFps } from './quantize';
import { insertKeyframeSorted } from './sample';
import { motionEasingSchema } from './schema';
import { validateMotionDocument } from './schema';
import {
  createMotionNode,
  hasAnimatableProperty,
  getMotionNodeType,
  validateMotionNode,
} from './node-registry';
import type {
  MotionChannel,
  MotionClip,
  MotionDocument,
  MotionEasing,
  MotionAsset,
  MotionNode,
  MotionTimeline,
  MotionTrack,
} from './types';

// ── Risk ─────────────────────────────────────────────────────────────────────

export type MotionOpRisk = 'safe' | 'mutating' | 'destructive';

export const RISK_ORDER: Record<MotionOpRisk, number> = {
  safe: 0,
  mutating: 1,
  destructive: 2,
};

// ── Op parameters ────────────────────────────────────────────────────────────

export type MotionOpParams = {
  'document.rename': { name: string };
  'document.setOutput': { fps?: number; width?: number; height?: number };
  'asset.add': MotionAsset;
  'asset.relink': { assetId: string; path: string; hash: string; byteSize: number; mimeType?: string };
  'asset.remove': { assetId: string };
  'scene.node.add': {
    nodeId: string;
    type: string;
    name?: string;
    parentId?: string | null;
    transform?: Partial<MotionNode['transform']>;
    props?: Record<string, unknown>;
  };
  'scene.node.update': {
    nodeId: string;
    name?: string;
    visible?: boolean;
    locked?: boolean;
    transform?: Partial<MotionNode['transform']>;
    props?: Record<string, unknown>;
  };
  'scene.node.remove': { nodeId: string };
  'scene.remove': { sceneId: string };
  'timeline.setDuration': { duration: number };
  'timeline.setLoop': { enabled?: boolean; start?: number; end?: number };
  /** Snap every key to the output frame grid. Explicit, never automatic. */
  'timeline.quantizeToFps': { fps?: number };
  'track.add': { trackId: string; name: string; targetId?: string | null };
  'track.remove': { trackId: string };
  'track.update': { trackId: string; name?: string; muted?: boolean; locked?: boolean };
  'clip.create': { clipId: string; name: string; duration: number };
  'clip.remove': { clipId: string };
  'clip.rename': { clipId: string; name: string };
  'clip.setDuration': { clipId: string; duration: number };
  'placement.add': { trackId: string; placementId: string; clipId: string; start: number };
  'placement.move': { trackId: string; placementId: string; start: number; toTrackId?: string };
  'placement.remove': { trackId: string; placementId: string };
  'channel.add': { clipId: string; channelId: string; targetId: string; property: string };
  'keyframe.add': {
    clipId: string;
    channelId: string;
    keyframeId: string;
    time: number;
    value: number;
    easing?: MotionEasing;
  };
  'keyframe.move': { clipId: string; channelId: string; keyframeId: string; time: number };
  'keyframe.setValue': { clipId: string; channelId: string; keyframeId: string; value: number };
  'keyframe.setEasing': {
    clipId: string;
    channelId: string;
    keyframeId: string;
    easing: MotionEasing;
  };
  'keyframe.remove': { clipId: string; channelId: string; keyframeId: string };
};

export type MotionOpId = keyof MotionOpParams;

export type MotionOpRequest<K extends MotionOpId = MotionOpId> = {
  [P in K]: { op: P } & MotionOpParams[P];
}[K];

export class MotionOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionOpError';
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

type AnyParams = Record<string, unknown>;

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
const transformPatchSchema = z
  .object({
    position: vector3Schema.optional(),
    rotation: vector3Schema.optional(),
    scale: vector3Schema.optional(),
  })
  .strict();

type RegisteredOp = {
  id: MotionOpId;
  summary: string;
  risk: MotionOpRisk;
  params: z.ZodType;
  run: (doc: MotionDocument, params: AnyParams) => MotionDocument;
};

const registry = new Map<string, RegisteredOp>();

export type MotionOpDefinition<P extends MotionOpId> = {
  id: P;
  summary: string;
  risk: MotionOpRisk;
  params: z.ZodType<MotionOpParams[P]>;
  reduce: (doc: MotionDocument, params: MotionOpParams[P]) => MotionDocument;
};

export function registerMotionOp<P extends MotionOpId>(definition: MotionOpDefinition<P>): void {
  if (registry.has(definition.id)) {
    throw new MotionOpError(`Op already registered: ${definition.id}`);
  }
  registry.set(definition.id, {
    id: definition.id,
    summary: definition.summary,
    risk: definition.risk,
    params: definition.params,
    run: (doc, params) => {
      const parsed = definition.params.safeParse(params);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new MotionOpError(
          `${definition.id}: ${first?.path.join('.') || 'params'} — ${first?.message ?? 'invalid'}`,
        );
      }
      const unknownKey = Object.keys(params).find(
        (key) => !Object.prototype.hasOwnProperty.call(parsed.data, key),
      );
      if (unknownKey) {
        throw new MotionOpError(`${definition.id}: unknown parameter "${unknownKey}".`);
      }
      return definition.reduce(doc, parsed.data);
    },
  });
}

export type MotionOpInfo = {
  id: MotionOpId;
  summary: string;
  risk: MotionOpRisk;
  params: z.ZodType;
};

/** The public contract — what an agent or MCP server is allowed to call. */
export function listMotionOps(): MotionOpInfo[] {
  return [...registry.values()].map(({ id, summary, risk, params }) => ({
    id,
    summary,
    risk,
    params,
  }));
}

export function motionOpRisk(opId: string): MotionOpRisk | undefined {
  return registry.get(opId)?.risk;
}

export function batchRisk(ops: readonly MotionOpRequest[]): MotionOpRisk {
  let highest: MotionOpRisk = 'safe';
  for (const op of ops) {
    const risk = motionOpRisk(op.op);
    if (!risk) throw new MotionOpError(`Unknown op "${op.op}".`);
    if (RISK_ORDER[risk] > RISK_ORDER[highest]) highest = risk;
  }
  return highest;
}

export function requiresApproval(ops: readonly MotionOpRequest[]): boolean {
  return batchRisk(ops) === 'destructive';
}

// ── Apply ────────────────────────────────────────────────────────────────────

export type ApplyMotionOpsOptions = { now?: string };

export function applyMotionOp(
  doc: MotionDocument,
  request: MotionOpRequest,
  options: ApplyMotionOpsOptions = {},
): MotionDocument {
  const entry = registry.get(request.op);
  if (!entry) throw new MotionOpError(`Unknown op "${request.op}".`);

  const { op: _op, ...params } = request as { op: string } & AnyParams;
  const reduced = entry.run(doc, params);
  if (reduced === doc) return doc;
  const activeScene = reduced.scenes.find((scene) => scene.id === reduced.activeSceneId);
  const next = activeScene ? {
    ...reduced,
    scenes: reduced.scenes.map((scene) => scene.id === activeScene.id ? {
      ...scene,
      nodes: reduced.scene.nodes,
      timeline: {
        ...reduced.timeline,
        loop: undefined,
        workArea: {
          enabled: reduced.timeline.loop.enabled,
          start: reduced.timeline.loop.start,
          end: reduced.timeline.loop.end,
        },
        playMode: reduced.timeline.loop.enabled ? 'loop' as const : 'once' as const,
      },
    } : scene),
  } : reduced;

  if (process.env.NODE_ENV !== 'production') {
    const errors = validateMotionDocument(next);
    if (errors.length > 0) {
      throw new MotionOpError(`Invalid result from ${request.op}: ${errors[0].path} (${errors[0].code}).`);
    }
  }

  return {
    ...next,
    revision: doc.revision + 1,
    meta: { ...next.meta, updatedAt: options.now ?? doc.meta.updatedAt },
  };
}

export function applyMotionOps(
  doc: MotionDocument,
  requests: readonly MotionOpRequest[],
  options: ApplyMotionOpsOptions = {},
): MotionDocument {
  const next = requests.reduce((current, request) => applyMotionOp(current, request, options), doc);
  return next === doc ? doc : { ...next, revision: doc.revision + 1 };
}

// ── Immutable helpers ────────────────────────────────────────────────────────

const withTimeline = (doc: MotionDocument, patch: Partial<MotionTimeline>): MotionDocument => ({
  ...doc,
  timeline: { ...doc.timeline, ...patch },
});

function requireTrack(doc: MotionDocument, trackId: string): MotionTrack {
  const track = doc.timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new MotionOpError(`Track "${trackId}" does not exist.`);
  return track;
}

function requireClip(doc: MotionDocument, clipId: string): MotionClip {
  const clip = doc.timeline.clips.find((candidate) => candidate.id === clipId);
  if (!clip) throw new MotionOpError(`Clip "${clipId}" does not exist.`);
  return clip;
}

function requireChannel(clip: MotionClip, channelId: string): MotionChannel {
  const channel = clip.channels.find((candidate) => candidate.id === channelId);
  if (!channel) throw new MotionOpError(`Channel "${channelId}" does not exist in "${clip.name}".`);
  return channel;
}

function validateNodeAssetReference(doc: MotionDocument, node: MotionNode): void {
  if (node.type !== 'screen.image') return;
  const source = node.props.assetId ?? node.props.source;
  if (typeof source !== 'string') {
    throw new MotionOpError(`Screen node "${node.id}" references an unavailable image asset.`);
  }

  const isBuiltIn = source === 'starter-dashboard' || source === 'builtin:starter-dashboard';
  const isAssetReference = doc.assets.some((asset) => asset.id === source);
  const isTransientReference = /^(blob:|data:|https?:|file:|qeda-media:|\/)/i.test(source);
  if (isTransientReference) {
    throw new MotionOpError(`Screen node "${node.id}" must reference an asset id, not a URL or filesystem path.`);
  }

  if (!isBuiltIn && !isAssetReference) {
    throw new MotionOpError(`Screen node "${node.id}" references an unavailable image asset.`);
  }
}

function mapTrack(
  doc: MotionDocument,
  trackId: string,
  update: (track: MotionTrack) => MotionTrack,
): MotionDocument {
  let changed = false;
  const tracks = doc.timeline.tracks.map((track) => {
    if (track.id !== trackId) return track;
    const next = update(track);
    if (next !== track) changed = true;
    return next;
  });
  return changed ? withTimeline(doc, { tracks }) : doc;
}

function mapClip(
  doc: MotionDocument,
  clipId: string,
  update: (clip: MotionClip) => MotionClip,
): MotionDocument {
  let changed = false;
  const clips = doc.timeline.clips.map((clip) => {
    if (clip.id !== clipId) return clip;
    const next = update(clip);
    if (next !== clip) changed = true;
    return next;
  });
  return changed ? withTimeline(doc, { clips }) : doc;
}

function mapChannel(
  doc: MotionDocument,
  clipId: string,
  channelId: string,
  update: (channel: MotionChannel) => MotionChannel,
): MotionDocument {
  return mapClip(doc, clipId, (clip) => ({
    ...clip,
    channels: clip.channels.map((channel) =>
      channel.id === channelId ? update(channel) : channel,
    ),
  }));
}

const sortPlacements = (placements: MotionTrack['placements']) =>
  [...placements].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

// ── Registration ─────────────────────────────────────────────────────────────

registerMotionOp<'document.rename'>({
  id: 'document.rename',
  summary: 'Rename the project.',
  risk: 'mutating',
  params: z.object({ name: z.string().min(1) }),
  reduce: (doc, { name }) => ({ ...doc, meta: { ...doc.meta, name } }),
});

registerMotionOp<'document.setOutput'>({
  id: 'document.setOutput',
  summary: 'Change output resolution or frame rate.',
  risk: 'mutating',
  params: z.object({
    fps: z.number().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),
  reduce: (doc, patch) => ({
    ...doc,
    meta: { ...doc.meta, output: { ...doc.meta.output, ...patch } },
  }),
});

registerMotionOp<'asset.add'>({
  id: 'asset.add',
  summary: 'Register an imported image or image sequence in the document.',
  risk: 'safe',
  params: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      kind: z.enum(['image', 'image-sequence', 'video', 'audio', 'font', 'model', 'environment']),
      mimeType: z.string().min(1),
      path: z.string().min(1), hash: z.string(), byteSize: z.number().nonnegative(),
      width: z.number().positive().optional(), height: z.number().positive().optional(),
      frameCount: z.number().int().positive().optional(), fps: z.number().positive().optional(),
      duration: z.number().positive().optional(), sourceName: z.string().optional(),
      createdAt: z.string(), metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  reduce: (doc, asset) => {
    if (doc.assets.some((candidate) => candidate.id === asset.id)) {
      throw new MotionOpError(`Asset "${asset.id}" already exists.`);
    }
    return { ...doc, assets: [...doc.assets, asset] };
  },
});

registerMotionOp<'asset.relink'>({
  id: 'asset.relink',
  summary: 'Relink an asset while preserving its id and references.',
  risk: 'mutating',
  params: z.object({
    assetId: z.string().min(1), path: z.string().min(1), hash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().nonnegative(), mimeType: z.string().min(1).optional(),
  }).strict(),
  reduce: (doc, params) => {
    const asset = doc.assets.find((candidate) => candidate.id === params.assetId);
    if (!asset) throw new MotionOpError(`Asset "${params.assetId}" does not exist.`);
    return {
      ...doc,
      assets: doc.assets.map((candidate) => candidate.id === params.assetId
        ? { ...candidate, path: params.path, hash: params.hash, byteSize: params.byteSize, ...(params.mimeType ? { mimeType: params.mimeType } : {}) }
        : candidate),
    };
  },
});

registerMotionOp<'asset.remove'>({
  id: 'asset.remove',
  summary: 'Remove an unused asset descriptor from the document.',
  risk: 'destructive',
  params: z.object({ assetId: z.string().min(1) }).strict(),
  reduce: (doc, { assetId }) => {
    if (!doc.assets.some((candidate) => candidate.id === assetId)) throw new MotionOpError(`Asset "${assetId}" does not exist.`);
    const references = findAssetReferences(doc, assetId);
    if (references.length) throw new MotionOpError(`Asset "${assetId}" is still referenced by ${references.join(', ')}.`);
    return { ...doc, assets: doc.assets.filter((candidate) => candidate.id !== assetId) };
  },
});

function findAssetReferences(value: unknown, assetId: string, path = '', found: string[] = []): string[] {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findAssetReferences(item, assetId, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'assets') continue;
    const childPath = path ? `${path}.${key}` : key;
    if ((key === 'assetId' || key === 'logoAssetId') && child === assetId) found.push(childPath);
    else findAssetReferences(child, assetId, childPath, found);
  }
  return found;
}

registerMotionOp<'scene.node.add'>({
  id: 'scene.node.add',
  summary: 'Add a registered scene node using its type defaults.',
  risk: 'safe',
  params: z
    .object({
      nodeId: z.string().min(1),
      type: z.string().min(1),
      name: z.string().min(1).optional(),
      parentId: z.string().min(1).nullable().optional(),
      transform: transformPatchSchema.optional(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  reduce: (doc, params) => {
    if (doc.scene.nodes.some((node) => node.id === params.nodeId)) {
      throw new MotionOpError(`Scene node "${params.nodeId}" already exists.`);
    }
    const node = createMotionNode(params.type, params.nodeId, {
      name: params.name,
      parentId: params.parentId,
    });
    const parent = params.parentId
      ? doc.scene.nodes.find((candidate) => candidate.id === params.parentId)
      : undefined;
    if (params.parentId && !parent) {
      throw new MotionOpError(`Parent node "${params.parentId}" does not exist.`);
    }
    const allowedParents = getMotionNodeType(params.type)?.allowedParents;
    if (parent && allowedParents && !allowedParents.includes(parent.type)) {
      throw new MotionOpError(`Node type "${params.type}" cannot be parented to "${parent.type}".`);
    }
    const next = validateMotionNode({
      ...node,
      transform: { ...node.transform, ...params.transform },
      props: { ...node.props, ...params.props },
    });
    validateNodeAssetReference(doc, next);
    return { ...doc, scene: { nodes: [...doc.scene.nodes, next] } };
  },
});

registerMotionOp<'scene.node.update'>({
  id: 'scene.node.update',
  summary: 'Update a scene node name, visibility, lock state, transform, or properties.',
  risk: 'mutating',
  params: z
    .object({
      nodeId: z.string().min(1),
      name: z.string().min(1).optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      transform: transformPatchSchema.optional(),
      props: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  reduce: (doc, { nodeId, ...patch }) => {
    const current = doc.scene.nodes.find((node) => node.id === nodeId);
    if (!current) throw new MotionOpError(`Scene node "${nodeId}" does not exist.`);
    const next = validateMotionNode({
      ...current,
      ...patch,
      transform: { ...current.transform, ...patch.transform },
      props: { ...current.props, ...patch.props },
    });
    validateNodeAssetReference(doc, next);
    if (JSON.stringify(current) === JSON.stringify(next)) return doc;
    return {
      ...doc,
      scene: {
        nodes: doc.scene.nodes.map((node) => (node.id === nodeId ? next : node)),
      },
    };
  },
});

registerMotionOp<'scene.node.remove'>({
  id: 'scene.node.remove',
  summary: 'Delete a scene node, its descendants, and animation channels targeting them.',
  risk: 'destructive',
  params: z.object({ nodeId: z.string().min(1) }).strict(),
  reduce: (doc, { nodeId }) => {
    if (!doc.scene.nodes.some((node) => node.id === nodeId)) {
      throw new MotionOpError(`Scene node "${nodeId}" does not exist.`);
    }
    const cascade = collectNodeCascade(doc, nodeId);
    const removed = new Set(cascade.nodeIds);
    const nodes = doc.scene.nodes.filter((node) => !removed.has(node.id));
    const timeline: MotionTimeline = {
      ...doc.timeline,
      tracks: doc.timeline.tracks.filter((track) => !cascade.trackIds.includes(track.id)),
      clips: doc.timeline.clips.map((clip) => ({
        ...clip,
        channels: clip.channels.filter((channel) => !removed.has(channel.targetId)),
      })),
    };
    const active = doc.scenes.find((scene) => scene.id === doc.activeSceneId);
    const cameraId = active?.cameraId && removed.has(active.cameraId) ? null : active?.cameraId;
    return {
      ...doc,
      scene: { nodes },
      timeline,
      scenes: active ? doc.scenes.map((scene) => scene.id === active.id
        ? { ...scene, nodes, timeline, cameraId: cameraId ?? null }
        : scene) : doc.scenes,
    };
  },
});

registerMotionOp<'scene.remove'>({
  id: 'scene.remove',
  summary: 'Delete a scene and all of its nodes, tracks, clips, and camera references.',
  risk: 'destructive',
  params: z.object({ sceneId: z.string().min(1) }).strict(),
  reduce: (doc, { sceneId }) => {
    const target = doc.scenes.find((candidate) => candidate.id === sceneId);
    if (!target) throw new MotionOpError(`Scene "${sceneId}" does not exist.`);
    if (doc.scenes.length < 2) throw new MotionOpError('A Motion project must keep at least one scene.');
    // Collecting each root makes the cascade semantics explicit and shared with node removal.
    const targetView = { ...doc, scene: { nodes: target.nodes }, timeline: target.timeline as MotionTimeline };
    const cascadedNodeIds = new Set<string>();
    for (const node of target.nodes) {
      for (const id of collectNodeCascade(targetView, node.id).nodeIds) cascadedNodeIds.add(id);
    }
    if (target.nodes.some((node) => !cascadedNodeIds.has(node.id))) {
      throw new MotionOpError(`Scene "${sceneId}" has an incomplete node-removal cascade.`);
    }
    const scenes = doc.scenes.filter((candidate) => candidate.id !== sceneId);
    const activeSceneId = doc.activeSceneId === sceneId ? scenes[0].id : doc.activeSceneId;
    const active = scenes.find((candidate) => candidate.id === activeSceneId) ?? scenes[0];
    const activeTimeline = active.timeline as MotionTimeline;
    const legacyTimeline: MotionTimeline = activeTimeline.loop ? activeTimeline : {
      ...activeTimeline,
      loop: {
        enabled: activeTimeline.workArea?.enabled ?? false,
        start: activeTimeline.workArea?.start ?? 0,
        end: activeTimeline.workArea?.end ?? activeTimeline.duration,
      },
    };
    return {
      ...doc,
      scenes,
      activeSceneId,
      scene: { nodes: active.nodes },
      timeline: legacyTimeline,
      ...(doc.sequence ? { sequence: { ...doc.sequence, items: doc.sequence.items.filter((item) => item.sceneId !== sceneId) } } : {}),
    };
  },
});

/** Collect every entity that must be removed to keep a scene graph referentially sound. */
export function collectNodeCascade(doc: MotionDocument, nodeId: string): {
  nodeIds: string[];
  trackIds: string[];
  clipIds: string[];
  cameraIds: string[];
} {
  const removed = new Set([nodeId]);
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    for (const node of doc.scene.nodes) {
      if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) {
        removed.add(node.id);
        foundChild = true;
      }
    }
  }
  const clips = doc.timeline.clips.filter((clip) => clip.channels.some((channel) => removed.has(channel.targetId)));
  return {
    nodeIds: [...removed],
    // Unscoped tracks are deliberately preserved.
    trackIds: doc.timeline.tracks.filter((track) => track.targetId !== null && removed.has(track.targetId)).map((track) => track.id),
    clipIds: clips.map((clip) => clip.id),
    cameraIds: doc.scene.nodes.filter((node) => removed.has(node.id) && node.type.startsWith('camera.')).map((node) => node.id),
  };
}

registerMotionOp<'timeline.setDuration'>({
  id: 'timeline.setDuration',
  summary: 'Set the composition length in seconds.',
  risk: 'mutating',
  params: z.object({ duration: z.number().positive() }),
  reduce: (doc, { duration }) => {
    const loop = doc.timeline.loop;
    const end = Math.min(loop.end, duration);
    return withTimeline(doc, {
      duration,
      loop: end > loop.start ? { ...loop, end } : { ...loop, end: duration },
    });
  },
});

registerMotionOp<'timeline.setLoop'>({
  id: 'timeline.setLoop',
  summary: 'Set or toggle the loop/playback range.',
  risk: 'mutating',
  params: z.object({
    enabled: z.boolean().optional(),
    start: z.number().min(0).optional(),
    end: z.number().min(0).optional(),
  }),
  reduce: (doc, patch) => {
    const current = doc.timeline.loop;
    const start = patch.start ?? current.start;
    const end = Math.min(patch.end ?? current.end, doc.timeline.duration);
    if (end <= start) {
      throw new MotionOpError('Loop end must be after loop start.');
    }
    return withTimeline(doc, {
      loop: { enabled: patch.enabled ?? current.enabled, start, end },
    });
  },
});

registerMotionOp<'track.add'>({
  id: 'track.add',
  summary: 'Append a track.',
  risk: 'safe',
  params: z.object({
    trackId: z.string().min(1),
    name: z.string().min(1),
    targetId: z.string().nullable().optional(),
  }),
  reduce: (doc, { trackId, name, targetId }) => {
    if (doc.timeline.tracks.some((track) => track.id === trackId)) {
      throw new MotionOpError(`Track "${trackId}" already exists.`);
    }
    const track: MotionTrack = {
      id: trackId,
      name,
      targetId: targetId ?? null,
      muted: false,
      locked: false,
      placements: [],
    };
    return withTimeline(doc, { tracks: [...doc.timeline.tracks, track] });
  },
});

registerMotionOp<'track.remove'>({
  id: 'track.remove',
  summary: 'Delete a track. Clips stay in the library; this cannot be undone by an op.',
  risk: 'destructive',
  params: z.object({ trackId: z.string().min(1) }),
  reduce: (doc, { trackId }) => {
    requireTrack(doc, trackId);
    return withTimeline(doc, {
      tracks: doc.timeline.tracks.filter((track) => track.id !== trackId),
    });
  },
});

registerMotionOp<'track.update'>({
  id: 'track.update',
  summary: 'Rename, mute or lock a track.',
  risk: 'mutating',
  params: z.object({
    trackId: z.string().min(1),
    name: z.string().min(1).optional(),
    muted: z.boolean().optional(),
    locked: z.boolean().optional(),
  }),
  reduce: (doc, { trackId, ...patch }) =>
    mapTrack(doc, trackId, (track) => {
      const next = { ...track, ...patch };
      const unchanged =
        next.name === track.name && next.muted === track.muted && next.locked === track.locked;
      return unchanged ? track : next;
    }),
});

registerMotionOp<'clip.create'>({
  id: 'clip.create',
  summary: 'Create an empty reusable clip.',
  risk: 'safe',
  params: z.object({
    clipId: z.string().min(1),
    name: z.string().min(1),
    duration: z.number().positive(),
  }),
  reduce: (doc, { clipId, name, duration }) => {
    if (doc.timeline.clips.some((clip) => clip.id === clipId)) {
      throw new MotionOpError(`Clip "${clipId}" already exists.`);
    }
    const clip: MotionClip = { id: clipId, name, duration, channels: [] };
    return withTimeline(doc, { clips: [...doc.timeline.clips, clip] });
  },
});

registerMotionOp<'clip.remove'>({
  id: 'clip.remove',
  summary: 'Delete a clip and every placement that references it.',
  risk: 'destructive',
  params: z.object({ clipId: z.string().min(1) }),
  reduce: (doc, { clipId }) => {
    requireClip(doc, clipId);
    return withTimeline(doc, {
      clips: doc.timeline.clips.filter((clip) => clip.id !== clipId),
      tracks: doc.timeline.tracks.map((track) =>
        track.placements.some((placement) => placement.clipId === clipId)
          ? {
              ...track,
              placements: track.placements.filter((placement) => placement.clipId !== clipId),
            }
          : track,
      ),
    });
  },
});

registerMotionOp<'clip.rename'>({
  id: 'clip.rename',
  summary: 'Rename a clip.',
  risk: 'mutating',
  params: z.object({ clipId: z.string().min(1), name: z.string().min(1) }),
  reduce: (doc, { clipId, name }) =>
    mapClip(doc, clipId, (clip) => (clip.name === name ? clip : { ...clip, name })),
});

registerMotionOp<'clip.setDuration'>({
  id: 'clip.setDuration',
  summary: 'Set a clip length. Keyframes past the new end are kept, not deleted.',
  risk: 'mutating',
  params: z.object({ clipId: z.string().min(1), duration: z.number().positive() }),
  reduce: (doc, { clipId, duration }) =>
    mapClip(doc, clipId, (clip) => (clip.duration === duration ? clip : { ...clip, duration })),
});

registerMotionOp<'placement.add'>({
  id: 'placement.add',
  summary: 'Place a clip on a track at a start time.',
  risk: 'safe',
  params: z.object({
    trackId: z.string().min(1),
    placementId: z.string().min(1),
    clipId: z.string().min(1),
    start: z.number().min(0),
  }),
  reduce: (doc, { trackId, placementId, clipId, start }) => {
    requireTrack(doc, trackId);
    requireClip(doc, clipId);
    return mapTrack(doc, trackId, (track) => {
      if (track.placements.some((placement) => placement.id === placementId)) {
        throw new MotionOpError(`Placement "${placementId}" already exists on "${track.name}".`);
      }
      return {
        ...track,
        placements: sortPlacements([...track.placements, { id: placementId, clipId, start }]),
      };
    });
  },
});

registerMotionOp<'placement.move'>({
  id: 'placement.move',
  summary: 'Move a placement in time, optionally onto another track.',
  risk: 'mutating',
  params: z.object({
    trackId: z.string().min(1),
    placementId: z.string().min(1),
    start: z.number().min(0),
    toTrackId: z.string().min(1).optional(),
  }),
  reduce: (doc, { trackId, placementId, start, toTrackId }) => {
    const track = requireTrack(doc, trackId);
    const placement = track.placements.find((candidate) => candidate.id === placementId);
    if (!placement) throw new MotionOpError(`Placement "${placementId}" is not on "${track.name}".`);

    if (!toTrackId || toTrackId === trackId) {
      if (placement.start === start) return doc;
      return mapTrack(doc, trackId, (current) => ({
        ...current,
        placements: sortPlacements(
          current.placements.map((candidate) =>
            candidate.id === placementId ? { ...candidate, start } : candidate,
          ),
        ),
      }));
    }

    const dest = requireTrack(doc, toTrackId);
    if (dest.locked) throw new MotionOpError(`Track "${dest.name}" is locked.`);

    return withTimeline(doc, {
      tracks: doc.timeline.tracks.map((current) => {
        if (current.id === trackId) {
          return {
            ...current,
            placements: current.placements.filter((candidate) => candidate.id !== placementId),
          };
        }
        if (current.id === toTrackId) {
          return {
            ...current,
            placements: sortPlacements([
              ...current.placements,
              { ...placement, start },
            ]),
          };
        }
        return current;
      }),
    });
  },
});

registerMotionOp<'placement.remove'>({
  id: 'placement.remove',
  summary: 'Remove a placement from a track. The clip stays in the library.',
  risk: 'destructive',
  params: z.object({ trackId: z.string().min(1), placementId: z.string().min(1) }),
  reduce: (doc, { trackId, placementId }) => {
    const track = requireTrack(doc, trackId);
    if (!track.placements.some((placement) => placement.id === placementId)) {
      throw new MotionOpError(`Placement "${placementId}" is not on "${track.name}".`);
    }
    return mapTrack(doc, trackId, (current) => ({
      ...current,
      placements: current.placements.filter((placement) => placement.id !== placementId),
    }));
  },
});

registerMotionOp<'channel.add'>({
  id: 'channel.add',
  summary: 'Animate one more property on a clip.',
  risk: 'safe',
  params: z.object({
    clipId: z.string().min(1),
    channelId: z.string().min(1),
    targetId: z.string().min(1),
    property: z.string().min(1),
  }),
  reduce: (doc, { clipId, channelId, targetId, property }) => {
    const clip = requireClip(doc, clipId);
    const node = doc.scene.nodes.find((candidate) => candidate.id === targetId);
    if (!node) throw new MotionOpError(`Scene node "${targetId}" does not exist.`);
    if (!hasAnimatableProperty(node.type, property)) {
      throw new MotionOpError(`Node type "${node.type}" does not animate "${property}".`);
    }
    const duplicate = clip.channels.some(
      (channel) => channel.targetId === targetId && channel.property === property,
    );
    if (duplicate) {
      throw new MotionOpError(`"${property}" is already animated on "${clip.name}".`);
    }
    return mapClip(doc, clipId, (current) => ({
      ...current,
      channels: [...current.channels, { id: channelId, targetId, property, keyframes: [] }],
    }));
  },
});

registerMotionOp<'keyframe.add'>({
  id: 'keyframe.add',
  summary: 'Add a keyframe to a channel at a local clip time.',
  risk: 'safe',
  params: z.object({
    clipId: z.string().min(1),
    channelId: z.string().min(1),
    keyframeId: z.string().min(1),
    time: z.number().min(0),
    value: z.number(),
    easing: motionEasingSchema.optional(),
  }),
  reduce: (doc, { clipId, channelId, keyframeId, time, value, easing }) => {
    const clip = requireClip(doc, clipId);
    if (time > clip.duration) {
      throw new MotionOpError(`Keyframe time ${time} exceeds clip duration ${clip.duration}.`);
    }
    requireChannel(clip, channelId);
    return mapChannel(doc, clipId, channelId, (channel) => ({
      ...channel,
      keyframes: insertKeyframeSorted(channel.keyframes, {
        id: keyframeId,
        time,
        value,
        easing: easing ?? { type: 'linear' },
      }),
    }));
  },
});

registerMotionOp<'keyframe.move'>({
  id: 'keyframe.move',
  summary: 'Move a keyframe in time, clamped inside its clip.',
  risk: 'mutating',
  params: z.object({
    clipId: z.string().min(1),
    channelId: z.string().min(1),
    keyframeId: z.string().min(1),
    time: z.number().min(0),
  }),
  reduce: (doc, { clipId, channelId, keyframeId, time }) => {
    const clip = requireClip(doc, clipId);
    const channel = requireChannel(clip, channelId);
    const keyframe = channel.keyframes.find((candidate) => candidate.id === keyframeId);
    if (!keyframe) throw new MotionOpError(`Keyframe "${keyframeId}" does not exist.`);
    const clamped = Math.min(time, clip.duration);
    if (clamped === keyframe.time) return doc;
    return mapChannel(doc, clipId, channelId, (current) => ({
      ...current,
      keyframes: insertKeyframeSorted(current.keyframes, { ...keyframe, time: clamped }),
    }));
  },
});

registerMotionOp<'keyframe.setValue'>({
  id: 'keyframe.setValue',
  summary: 'Set a keyframe value.',
  risk: 'mutating',
  params: z.object({
    clipId: z.string().min(1),
    channelId: z.string().min(1),
    keyframeId: z.string().min(1),
    value: z.number(),
  }),
  reduce: (doc, { clipId, channelId, keyframeId, value }) => {
    const clip = requireClip(doc, clipId);
    const keyframe = requireChannel(clip, channelId).keyframes.find(
      (candidate) => candidate.id === keyframeId,
    );
    if (!keyframe) throw new MotionOpError(`Keyframe "${keyframeId}" does not exist.`);
    // A no-op must return the same document reference: the store treats that as
    // "nothing changed" and skips the history entry.
    if (keyframe.value === value) return doc;
    return mapChannel(doc, clipId, channelId, (channel) => ({
      ...channel,
      keyframes: channel.keyframes.map((candidate) =>
        candidate.id === keyframeId ? { ...candidate, value } : candidate,
      ),
    }));
  },
});

registerMotionOp<'keyframe.setEasing'>({
  id: 'keyframe.setEasing',
  summary: 'Set the easing of the segment starting at a keyframe.',
  risk: 'mutating',
  params: z.object({
    clipId: z.string().min(1),
    channelId: z.string().min(1),
    keyframeId: z.string().min(1),
    easing: motionEasingSchema,
  }),
  reduce: (doc, { clipId, channelId, keyframeId, easing }) =>
    mapChannel(doc, clipId, channelId, (channel) => ({
      ...channel,
      keyframes: channel.keyframes.map((keyframe) =>
        keyframe.id === keyframeId ? { ...keyframe, easing } : keyframe,
      ),
    })),
});

registerMotionOp<'keyframe.remove'>({
  id: 'keyframe.remove',
  summary: 'Delete a keyframe.',
  risk: 'destructive',
  params: z.object({
    clipId: z.string().min(1),
    channelId: z.string().min(1),
    keyframeId: z.string().min(1),
  }),
  reduce: (doc, { clipId, channelId, keyframeId }) => {
    const clip = requireClip(doc, clipId);
    const channel = requireChannel(clip, channelId);
    if (!channel.keyframes.some((keyframe) => keyframe.id === keyframeId)) {
      throw new MotionOpError(`Keyframe "${keyframeId}" does not exist.`);
    }
    return mapChannel(doc, clipId, channelId, (current) => ({
      ...current,
      keyframes: current.keyframes.filter((keyframe) => keyframe.id !== keyframeId),
    }));
  },
});

registerMotionOp<'timeline.quantizeToFps'>({
  id: 'timeline.quantizeToFps',
  summary:
    'Snap every keyframe to the frame grid. Keys that collapse onto one frame merge, later value wins.',
  risk: 'mutating',
  params: z.object({ fps: z.number().positive().optional() }),
  reduce: (doc, { fps }) => quantizeDocumentToFps(doc, fps ?? doc.meta.output.fps),
});
