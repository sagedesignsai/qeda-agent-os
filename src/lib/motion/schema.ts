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

import { DEFAULT_BRAND } from './defaults';
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

const cloneData = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
  trimIn: z.number().nonnegative().optional(),
  duration: z.number().positive().optional(),
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
  kind: z.enum(['image', 'image-sequence', 'video', 'audio', 'font', 'model', 'environment']),
  mimeType: z.string().min(1),
  path: z.string().min(1).refine((path) => !path.startsWith('/') && !/^[a-z]+:/i.test(path) && !path.split('/').includes('..'), 'Asset path must be bundle-relative.'),
  hash: z.string().refine((hash) => hash === '' || hash === 'builtin' || /^[a-f0-9]{64}$/.test(hash)),
  byteSize: z.number().nonnegative(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  frameCount: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  duration: z.number().positive().optional(),
  sourceName: z.string().optional(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

const sceneV4Schema = z.object({
  id: z.string().min(1), name: z.string(), nodes: z.array(nodeSchema),
  timeline: z.object({
    duration: z.number().nonnegative(),
    loop: z.object({ enabled: z.boolean(), start: z.number().nonnegative(), end: z.number().nonnegative() }).optional(),
    workArea: z.object({ enabled: z.boolean(), start: z.number().nonnegative(), end: z.number().nonnegative() }).optional(),
    playMode: z.enum(['once', 'loop', 'ping-pong']).optional(),
    tracks: z.array(trackSchema), clips: z.array(clipSchema),
    audio: z.array(z.object({ id: z.string(), assetId: z.string(), start: z.number(), trimIn: z.number(), duration: z.number(), gain: z.number(), muted: z.boolean(), fadeIn: z.number(), fadeOut: z.number() })).optional(),
  }),
  cameraId: z.string().nullable(),
  background: z.discriminatedUnion('type', [
    z.object({ type: z.literal('color'), color: z.string() }),
    z.object({ type: z.literal('transparent') }),
    z.object({ type: z.literal('environment'), assetId: z.string(), intensity: z.number().optional(), blur: z.number().optional() }),
  ]).optional(),
  stateMachines: z.array(z.unknown()).optional(),
});

export type MotionValidationError = { code: string; path: string };

/** Ordered cross-reference and domain validation shared by parsing and op reducers. */
export function validateMotionDocument(doc: MotionDocument): MotionValidationError[] {
  const errors: MotionValidationError[] = [];
  if (doc.schemaVersion !== MOTION_SCHEMA_VERSION) errors.push({ code: 'SCHEMA_VERSION', path: 'schemaVersion' });
  const assetIds = new Set<string>();
  for (let i = 0; i < doc.assets.length; i += 1) {
    const asset = doc.assets[i];
    if (assetIds.has(asset.id)) errors.push({ code: 'ASSET_ID_DUPLICATE', path: `assets.${i}.id` });
    assetIds.add(asset.id);
    if (asset.kind === 'image' && asset.frameCount !== 1) errors.push({ code: 'IMAGE_FRAME_COUNT', path: `assets.${i}.frameCount` });
    if (asset.kind === 'image-sequence' && (asset.frameCount ?? 0) < 2) errors.push({ code: 'SEQUENCE_FRAME_COUNT', path: `assets.${i}.frameCount` });
    if (asset.kind === 'video' && (!asset.duration || !asset.width || !asset.height)) errors.push({ code: 'VIDEO_METADATA_REQUIRED', path: `assets.${i}` });
    if (asset.kind === 'audio' && !asset.duration) errors.push({ code: 'AUDIO_DURATION_REQUIRED', path: `assets.${i}.duration` });
    if (asset.kind === 'font' && !/\.(woff2?|ttf|otf)$/i.test(asset.path ?? '')) errors.push({ code: 'FONT_FORMAT', path: `assets.${i}.path` });
    if (asset.kind === 'model' && !/\.(glb|gltf)$/i.test(asset.path ?? '')) errors.push({ code: 'MODEL_FORMAT', path: `assets.${i}.path` });
    if (asset.kind === 'environment' && !/\.(hdr|exr)$/i.test(asset.path ?? '')) errors.push({ code: 'ENVIRONMENT_FORMAT', path: `assets.${i}.path` });
    if (asset.hash !== undefined && asset.hash !== '' && asset.hash !== 'builtin' && !/^[a-f0-9]{64}$/.test(asset.hash)) errors.push({ code: 'ASSET_HASH', path: `assets.${i}.hash` });
    if (asset.path?.startsWith('builtin/') && asset.hash !== 'builtin') errors.push({ code: 'BUILTIN_HASH', path: `assets.${i}.hash` });
    if (asset.path && (asset.path.startsWith('/') || /^[a-z]+:/i.test(asset.path) || asset.path.split('/').includes('..'))) errors.push({ code: 'ASSET_PATH_NOT_RELATIVE', path: `assets.${i}.path` });
    if (asset.path?.includes('\\')) errors.push({ code: 'ASSET_PATH_NOT_POSIX', path: `assets.${i}.path` });
    if (asset.hash === 'builtin' && !asset.path?.startsWith('builtin/')) errors.push({ code: 'BUILTIN_PATH', path: `assets.${i}.path` });
    if (asset.kind === 'image-sequence' && (!asset.fps || asset.fps <= 0)) errors.push({ code: 'SEQUENCE_FPS_REQUIRED', path: `assets.${i}.fps` });
  }
  if (!Number.isInteger(doc.revision) || doc.revision < 0) errors.push({ code: 'REVISION_INVALID', path: 'revision' });
  if (!doc.meta.name.trim()) errors.push({ code: 'DOCUMENT_NAME_EMPTY', path: 'meta.name' });
  if (doc.meta.output.fps < 1 || doc.meta.output.fps > 240) errors.push({ code: 'OUTPUT_FPS_RANGE', path: 'meta.output.fps' });
  for (const dimension of ['width', 'height'] as const) {
    if (!Number.isInteger(doc.meta.output[dimension]) || doc.meta.output[dimension] < 16 || doc.meta.output[dimension] > 16384) errors.push({ code: 'OUTPUT_DIMENSION_RANGE', path: `meta.output.${dimension}` });
  }
  if (!doc.scenes.some((scene) => scene.id === doc.activeSceneId)) errors.push({ code: 'ACTIVE_SCENE_MISSING', path: 'activeSceneId' });
  const sceneIds = new Set<string>();
  for (let i = 0; i < doc.scenes.length; i += 1) {
    if (sceneIds.has(doc.scenes[i].id)) errors.push({ code: 'SCENE_ID_DUPLICATE', path: `scenes.${i}.id` });
    sceneIds.add(doc.scenes[i].id);
  }
  const nodeIds = new Set<string>();
  for (let i = 0; i < doc.scene.nodes.length; i += 1) {
    const node = doc.scene.nodes[i];
    if (nodeIds.has(node.id)) errors.push({ code: 'NODE_ID_DUPLICATE', path: `scene.nodes.${i}.id` });
    nodeIds.add(node.id);
    try { validateMotionNode(node); } catch { errors.push({ code: 'NODE_PROPS_INVALID', path: `scene.nodes.${i}.props` }); }
    if (node.type === 'screen.image' && typeof node.props.source === 'string' && /^(blob:|data:)/i.test(node.props.source)) {
      errors.push({ code: 'TRANSIENT_ASSET_URL', path: `scene.nodes.${i}.props.source` });
    }
    if (node.type === 'screen.image' && typeof node.props.assetId === 'string' && /^(blob:|data:|https?:|file:|qeda-media:|\/)/i.test(node.props.assetId)) {
      errors.push({ code: 'TRANSIENT_ASSET_URL', path: `scene.nodes.${i}.props.assetId` });
    }
    if (node.type === 'screen.image' && !node.props.missingAsset) {
      const assetId = node.props.assetId ?? node.props.source;
      if (typeof assetId === 'string' && assetId !== 'starter-dashboard' && assetId !== 'builtin:starter-dashboard' && !assetIds.has(assetId)) {
        errors.push({ code: 'ASSET_REFERENCE_MISSING', path: `scene.nodes.${i}.props.assetId` });
      }
    }
  }
  for (let i = 0; i < doc.scene.nodes.length; i += 1) {
    const node = doc.scene.nodes[i];
    if (node.parentId && !nodeIds.has(node.parentId)) errors.push({ code: 'PARENT_MISSING', path: `scene.nodes.${i}.parentId` });
    const seen = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId && nodeIds.has(parentId)) {
      if (seen.has(parentId)) { errors.push({ code: 'PARENT_CYCLE', path: `scene.nodes.${i}.parentId` }); break; }
      seen.add(parentId);
      parentId = doc.scene.nodes.find((candidate) => candidate.id === parentId)?.parentId ?? null;
    }
  }
  if (doc.timeline.duration <= 0) errors.push({ code: 'TIMELINE_DURATION', path: 'timeline.duration' });
  const loop = doc.timeline.loop;
  if (loop.enabled && !(loop.start >= 0 && loop.start < loop.end && loop.end <= doc.timeline.duration)) errors.push({ code: 'LOOP_RANGE', path: 'timeline.loop' });
  const clipIds = new Set<string>();
  for (let i = 0; i < doc.timeline.clips.length; i += 1) {
    if (clipIds.has(doc.timeline.clips[i].id)) errors.push({ code: 'CLIP_ID_DUPLICATE', path: `timeline.clips.${i}.id` });
    clipIds.add(doc.timeline.clips[i].id);
  }
  const trackIds = new Set<string>();
  const placementIds = new Set<string>();
  for (let i = 0; i < doc.timeline.tracks.length; i += 1) {
    const track = doc.timeline.tracks[i];
    if (trackIds.has(track.id)) errors.push({ code: 'TRACK_ID_DUPLICATE', path: `timeline.tracks.${i}.id` });
    trackIds.add(track.id);
    if (track.targetId && !nodeIds.has(track.targetId)) errors.push({ code: 'TRACK_TARGET_MISSING', path: `timeline.tracks.${i}.targetId` });
    for (let j = 0; j < track.placements.length; j += 1) {
      const placement = track.placements[j];
      if (placementIds.has(placement.id)) errors.push({ code: 'PLACEMENT_ID_DUPLICATE', path: `timeline.tracks.${i}.placements.${j}.id` });
      placementIds.add(placement.id);
      if (!clipIds.has(placement.clipId)) errors.push({ code: 'PLACEMENT_CLIP_MISSING', path: `timeline.tracks.${i}.placements.${j}.clipId` });
      if (placement.start < 0) errors.push({ code: 'PLACEMENT_START', path: `timeline.tracks.${i}.placements.${j}.start` });
      if (placement.duration !== undefined && placement.duration <= 0) errors.push({ code: 'PLACEMENT_DURATION', path: `timeline.tracks.${i}.placements.${j}.duration` });
      if (placement.trimIn !== undefined && placement.trimIn < 0) errors.push({ code: 'PLACEMENT_TRIM_IN', path: `timeline.tracks.${i}.placements.${j}.trimIn` });
      const clip = doc.timeline.clips.find((candidate) => candidate.id === placement.clipId);
      if (clip && placement.duration !== undefined && placement.trimIn !== undefined && placement.trimIn + placement.duration > clip.duration + 1e-9) errors.push({ code: 'PLACEMENT_TRIM_RANGE', path: `timeline.tracks.${i}.placements.${j}` });
    }
  }
  for (let i = 0; i < doc.timeline.clips.length; i += 1) {
    const clip = doc.timeline.clips[i];
    const channelProperties = new Set<string>();
    const channelIds = new Set<string>();
    for (let j = 0; j < clip.channels.length; j += 1) {
      const channel = clip.channels[j];
      if (channelIds.has(channel.id)) errors.push({ code: 'CHANNEL_ID_DUPLICATE', path: `timeline.clips.${i}.channels.${j}.id` });
      channelIds.add(channel.id);
      const targetNode = doc.scene.nodes.find((node) => node.id === channel.targetId);
      if (targetNode && !hasAnimatableProperty(targetNode.type, channel.property)) errors.push({ code: 'CHANNEL_PROPERTY_UNSUPPORTED', path: `timeline.clips.${i}.channels.${j}.property` });
      const propertyKey = `${channel.targetId}\0${channel.property}`;
      if (channelProperties.has(propertyKey)) errors.push({ code: 'CHANNEL_DUPLICATE_PROPERTY', path: `timeline.clips.${i}.channels.${j}` });
      channelProperties.add(propertyKey);
      if (!nodeIds.has(channel.targetId)) errors.push({ code: 'CHANNEL_TARGET_MISSING', path: `timeline.clips.${i}.channels.${j}.targetId` });
      for (let k = 0; k < channel.keyframes.length; k += 1) {
        const key = channel.keyframes[k];
        if (channel.keyframes.some((candidate, prior) => prior < k && candidate.id === key.id)) errors.push({ code: 'KEYFRAME_ID_DUPLICATE', path: `timeline.clips.${i}.channels.${j}.keyframes.${k}.id` });
        if (key.time < 0 || key.time > clip.duration) errors.push({ code: 'KEYFRAME_OUT_OF_BOUNDS', path: `timeline.clips.${i}.channels.${j}.keyframes.${k}.time` });
        if (k > 0 && key.time <= channel.keyframes[k - 1].time) errors.push({ code: 'KEYFRAME_ORDER', path: `timeline.clips.${i}.channels.${j}.keyframes.${k}.time` });
        if (key.easing.type === 'cubic' && [key.easing.x1, key.easing.y1, key.easing.x2, key.easing.y2].some((point) => point < 0 || point > 1)) errors.push({ code: 'EASING_CONTROL_RANGE', path: `timeline.clips.${i}.channels.${j}.keyframes.${k}.easing` });
      }
    }
  }
  const workArea = doc.timeline.workArea;
  if (workArea?.enabled && !(workArea.start >= 0 && workArea.start < workArea.end && workArea.end <= doc.timeline.duration)) errors.push({ code: 'WORK_AREA_RANGE', path: 'timeline.workArea' });
  for (let i = 0; i < doc.scenes.length; i += 1) {
    const scene = doc.scenes[i];
    if (scene.cameraId && !scene.nodes.some((node) => node.id === scene.cameraId && node.type.startsWith('camera.'))) {
      errors.push({ code: 'CAMERA_REFERENCE', path: `scenes.${i}.cameraId` });
    }
    if (scene.id === doc.activeSceneId) continue;
    const ids = new Set(scene.nodes.map((node) => node.id));
    for (let j = 0; j < scene.nodes.length; j += 1) {
      const node = scene.nodes[j];
      if (node.parentId && !ids.has(node.parentId)) errors.push({ code: 'PARENT_MISSING', path: `scenes.${i}.nodes.${j}.parentId` });
      try { validateMotionNode(node); } catch { errors.push({ code: 'NODE_PROPS_INVALID', path: `scenes.${i}.nodes.${j}.props` }); }
    }
  }
  const scanForEphemeralUrls = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (/^(blob:|data:|https?:|file:|qeda-media:|\/|[a-z]:\\)/i.test(value)) {
        errors.push({ code: 'NON_PORTABLE_URL', path });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => scanForEphemeralUrls(entry, `${path}.${index}`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) scanForEphemeralUrls(entry, `${path}.${key}`);
    }
  };
  scanForEphemeralUrls({ meta: doc.meta, brand: doc.brand, assets: doc.assets, scenes: doc.scenes, sequence: doc.sequence }, 'document');
  return errors;
}

export const motionDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
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
  brand: z.object({
    name: z.string(), colors: z.record(z.string(), z.string()),
    fonts: z.object({ heading: z.object({ family: z.string(), assetId: z.string().optional(), weight: z.number().optional(), style: z.enum(['normal', 'italic']).optional() }), body: z.object({ family: z.string(), assetId: z.string().optional(), weight: z.number().optional(), style: z.enum(['normal', 'italic']).optional() }), mono: z.object({ family: z.string(), assetId: z.string().optional(), weight: z.number().optional(), style: z.enum(['normal', 'italic']).optional() }).optional() }),
    logoAssetId: z.string().optional(), safeArea: z.object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() }), cornerRadius: z.number().nonnegative(), defaults: z.object({ easing: motionEasingSchema, duration: z.number().positive() }),
  }),
  scenes: z.array(sceneV4Schema).min(1),
  activeSceneId: z.string().min(1),
  sequence: z.unknown().optional(),
  // Compatibility view is populated during parsing; excluded from v4 serialization.
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
    workArea: z.object({
      enabled: z.boolean(),
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
    }).optional(),
    playMode: z.enum(['once', 'loop', 'ping-pong']).optional(),
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

function migrateV3ToV4(input: Record<string, unknown>): Record<string, unknown> {
  const oldScene = (input.scene ?? { nodes: [] }) as { nodes?: Array<Record<string, unknown>> };
  const oldTimeline = (input.timeline ?? {}) as Record<string, unknown> & {
    duration?: number;
    loop?: { enabled?: boolean; start?: number; end?: number };
    tracks?: Array<{ placements?: Array<Record<string, unknown>> }>;
    clips?: Array<{ id: string; duration: number }>;
  };
  const rawAssets = Array.isArray(input.assets) ? input.assets as Array<Record<string, unknown>> : [];
  const migratedAssets: Array<Record<string, unknown>> = rawAssets.flatMap((asset) => {
    const uri = typeof asset.uri === 'string' ? asset.uri : '';
    if (/^(blob:|data:|https?:|file:)/i.test(uri)) return [];
    const id = String(asset.id);
    const builtin = id === 'builtin:starter-dashboard';
    return [{
      id, name: String(asset.name), kind: asset.kind ?? 'image', mimeType: asset.mimeType ?? 'application/octet-stream',
      path: builtin ? 'builtin/starter-dashboard' : uri.startsWith('qeda-media://') ? uri.replace(/^qeda-media:\/\/motion\/[^/]+\//, '') : `assets/${id}`,
      hash: builtin ? 'builtin' : '', byteSize: typeof asset.byteSize === 'number' ? asset.byteSize : 0,
      ...(typeof asset.frameCount === 'number' ? { frameCount: asset.frameCount } : {}),
      ...(typeof asset.fps === 'number' ? { fps: asset.fps } : {}),
      createdAt: String(asset.createdAt ?? (input.meta as { createdAt?: string } | undefined)?.createdAt ?? new Date(0).toISOString()),
      metadata: { legacy: !builtin },
    }];
  });
  const oldAssetsByUri = new Map(rawAssets.filter((asset) => typeof asset.uri === 'string').map((asset) => [String(asset.uri), String(asset.id)]));
  const nodes = (oldScene.nodes ?? []).map((rawNode) => {
    const node = cloneData(rawNode);
    if (node.type !== 'screen.image' || !node.props || typeof node.props !== 'object') return node;
    const props = node.props as Record<string, unknown>;
    const source = typeof props.source === 'string' ? props.source : '';
    if (source === 'starter-dashboard') {
      if (!migratedAssets.some((asset) => asset.id === 'builtin:starter-dashboard')) {
        migratedAssets.push({ id: 'builtin:starter-dashboard', name: 'Starter dashboard', kind: 'image', mimeType: 'image/svg+xml', path: 'builtin/starter-dashboard', hash: 'builtin', byteSize: 0, frameCount: 1, fps: 30, createdAt: new Date(0).toISOString(), metadata: { builtin: true } });
      }
      props.assetId = 'builtin:starter-dashboard';
    } else if (migratedAssets.some((asset) => asset.id === source)) {
      props.assetId = source;
    } else if (oldAssetsByUri.has(source)) {
      const assetId = oldAssetsByUri.get(source)!;
      if (migratedAssets.some((asset) => asset.id === assetId)) props.assetId = assetId;
      else { delete props.assetId; props.missingAsset = true; }
    } else if (/^qeda-media:/i.test(source)) {
      const asset = migratedAssets.find((candidate) => source.endsWith(`/${candidate.id}`));
      if (asset) props.assetId = asset.id;
      else delete props.assetId;
    } else if (/^(blob:|data:|https?:|file:)/i.test(source)) {
      delete props.assetId;
      props.missingAsset = true;
    } else if (source) {
      delete props.assetId;
      props.missingAsset = true;
    }
    delete props.source;
    return node;
  });
  const duration = Number(oldTimeline.duration ?? 6);
  const oldLoop = oldTimeline.loop ?? {};
  const loopStart = Number(oldLoop.start ?? 0);
  const loopEnd = Number(oldLoop.end ?? duration);
  const loopValid = loopStart >= 0 && loopEnd > loopStart && loopEnd <= duration;
  const clips = (oldTimeline.clips ?? []).map((clip) => ({ ...clip }));
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));
  const tracks = (oldTimeline.tracks ?? []).map((track) => ({
    ...track,
    placements: (track.placements ?? []).map((placement) => ({
      ...placement, trimIn: 0, duration: clipMap.get(String(placement.clipId))?.duration ?? 0,
    })),
  }));
  const timeline = {
    ...oldTimeline, duration, loop: { enabled: Boolean(oldLoop.enabled) && loopValid, start: loopValid ? loopStart : 0, end: loopValid ? loopEnd : duration },
    workArea: { enabled: Boolean(oldLoop.enabled) && loopValid, start: loopValid ? loopStart : 0, end: loopValid ? loopEnd : duration },
    playMode: oldLoop.enabled ? 'loop' : 'once', tracks, clips, audio: [],
  };
  const firstCamera = nodes.find((node) => typeof node.type === 'string' && node.type.startsWith('camera.'));
  const { loop: _loop, ...timelineV4 } = timeline;
  const scene = { id: 'scene_main', name: 'Scene 1', nodes, timeline: timelineV4, cameraId: firstCamera ? String(firstCamera.id) : null };
  const { scene: _legacyScene, timeline: _legacyTimeline, ...root } = input;
  return {
    ...root, schemaVersion: 4, revision: 0, brand: cloneData(DEFAULT_BRAND), assets: migratedAssets,
    scenes: [scene], activeSceneId: 'scene_main',
  };
}

/** Ordered `from → migration` map. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
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

function hydrateV4CompatibilityView(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.schemaVersion !== 4 || raw.scene || raw.timeline) return raw;
  const scenes = raw.scenes as Array<Record<string, unknown>> | undefined;
  const activeSceneId = typeof raw.activeSceneId === 'string' ? raw.activeSceneId : '';
  const active = scenes?.find((scene) => scene.id === activeSceneId) ?? scenes?.[0];
  if (!active) return raw;
  const timeline = cloneData(active.timeline as Record<string, unknown>);
  const workArea = timeline.workArea as { enabled?: boolean; start?: number; end?: number } | undefined;
  timeline.loop = {
    enabled: Boolean(workArea?.enabled), start: Number(workArea?.start ?? 0),
    end: Number(workArea?.end ?? timeline.duration ?? 0),
  };
  return { ...raw, scene: { nodes: active.nodes }, timeline };
}

export function parseMotionDocument(raw: unknown): MotionDocument {
  if (!raw || typeof raw !== 'object') {
    throw new MotionSchemaError('Project file is not a Motion document.');
  }
  const migrated = hydrateV4CompatibilityView(migrateMotionDocument(raw as Record<string, unknown>));
  const result = motionDocumentSchema.safeParse(migrated);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new MotionSchemaError(
      `Project file is invalid at ${first?.path.join('.') || 'root'}: ${first?.message || 'unknown problem'}`,
    );
  }
  const doc = result.data as unknown as MotionDocument;
  const invariantErrors = validateMotionDocument(doc);
  if (invariantErrors.length > 0) {
    const first = invariantErrors[0];
    if (first.code === 'PARENT_MISSING') {
      throw new MotionSchemaError(`Scene node references missing parent at ${first.path}.`);
    }
    if (first.code === 'CHANNEL_PROPERTY_UNSUPPORTED') {
      throw new MotionSchemaError(`Animation channel targets unsupported property at ${first.path}.`);
    }
    throw new MotionSchemaError(`Project file is invalid at ${first.path}: ${first.code}.`);
  }
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
    if (node.type !== 'screen.image' || node.props.missingAsset) continue;
    const source = node.props.assetId ?? node.props.source;
    if (typeof source !== 'string' || source === 'starter-dashboard' || source === 'builtin:starter-dashboard') continue;
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
  const timeline = cloneData(doc.timeline) as Record<string, unknown>;
  delete timeline.loop;
  timeline.workArea ??= { enabled: false, start: 0, end: timeline.duration };
  timeline.playMode ??= 'once';
  const toV4Node = (node: MotionNode): MotionNode => {
    if (node.type !== 'screen.image') return node;
    const props = { ...node.props };
    const source = typeof props.assetId === 'string' ? props.assetId : props.source;
    if (source === 'starter-dashboard') props.assetId = 'builtin:starter-dashboard';
    else if (typeof source === 'string' && !/^(blob:|data:|https?:|file:)/i.test(source)) props.assetId = source;
    else { delete props.assetId; props.missingAsset = true; }
    delete props.source;
    return { ...node, props };
  };
  const nodes = doc.scene.nodes.map(toV4Node);
  const persisted = {
    schemaVersion: 4,
    revision: doc.revision,
    meta: doc.meta,
    brand: doc.brand,
    assets: doc.assets.map(({ uri: _uri, ...asset }) => asset),
    scenes: doc.scenes.map((item) => {
      const itemTimeline = item.id === doc.activeSceneId ? timeline : cloneData(item.timeline) as Record<string, unknown>;
      delete itemTimeline.loop;
      itemTimeline.workArea ??= { enabled: false, start: 0, end: Number(itemTimeline.duration ?? 0) };
      itemTimeline.playMode ??= 'once';
      return {
        ...item,
        nodes: item.id === doc.activeSceneId ? nodes : item.nodes.map(toV4Node),
        timeline: itemTimeline,
      };
    }),
    activeSceneId: doc.activeSceneId,
    ...(doc.sequence ? { sequence: doc.sequence } : {}),
  };
  return `${JSON.stringify(persisted, null, 2)}\n`;
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
