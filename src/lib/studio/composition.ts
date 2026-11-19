import { nanoid } from 'nanoid';
import { z } from 'zod';
import { STUDIO_EFFECTS } from './effects/catalog';
import type {
  StudioAspectRatio,
  StudioComposition,
  StudioCompositionDocument,
  StudioCompositionLayer,
  StudioCompositionSceneId,
  StudioCompositionImageLayer,
  StudioCompositionTransition,
  StudioCompositionTemplate,
  StudioCompositionTemplateLayer,
  StudioEffect,
  StudioEffectType,
  StudioLayerLayout,
  StudioTakeSummary,
} from './types';

const aspectRatios = ['16:9', '9:16', '1:1', '4:3'] as const;
const layerLayoutSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
  fit: z.enum(['cover', 'contain']),
  cornerRadius: z.number().min(0).max(128),
}).superRefine((layout, context) => {
  if (layout.x + layout.width > 1) {
    context.addIssue({
      code: 'custom',
      path: ['width'],
      message: 'Layer width must stay inside the canvas.',
    });
  }
  if (layout.y + layout.height > 1) {
    context.addIssue({
      code: 'custom',
      path: ['height'],
      message: 'Layer height must stay inside the canvas.',
    });
  }
});

const layoutsSchema = z.object({
  '16:9': layerLayoutSchema,
  '9:16': layerLayoutSchema,
  '1:1': layerLayoutSchema,
  '4:3': layerLayoutSchema,
});

const compositionTransitionSchema = z.object({
  type: z.enum([
    'none',
    'fade',
    'slide-left',
    'slide-right',
    'slide-up',
    'slide-down',
    'scale',
  ]),
  durationMs: z.number().finite().min(0).max(5000),
}).default({ type: 'none', durationMs: 0 });

const layerBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  startMs: z.number().finite().min(0),
  endMs: z.number().finite().gt(0),
  zIndex: z.number().int().min(0).max(100),
  opacity: z.number().min(0).max(1),
  transitionIn: compositionTransitionSchema,
  transitionOut: compositionTransitionSchema,
  layouts: layoutsSchema,
});

const compositionLayerSchema = z.discriminatedUnion('kind', [
  layerBaseSchema.extend({
    kind: z.literal('video'),
    sourceId: z.string().min(1),
    sourceDurationMs: z.number().finite().gt(0),
    sourceInMs: z.number().finite().min(0),
  }),
  layerBaseSchema.extend({
    kind: z.literal('image'),
    sourceId: z.string().min(1),
  }),
]);

const compositionEffectSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'spotlight',
    'neon-glow',
    'vignette',
    'film-grain',
    'scanlines',
  ]),
  startMs: z.number().finite().min(0),
  endMs: z.number().finite().gt(0),
  intensity: z.number().finite().min(0).max(1),
});

const compositionTemplateLayerSchema = z.discriminatedUnion('kind', [
  layerBaseSchema.extend({
    kind: z.literal('video'),
    sourceInMs: z.number().finite().min(0),
  }),
  layerBaseSchema.extend({
    kind: z.literal('image'),
    assetPath: z.string().min(1),
  }),
]);

export const studioCompositionTemplateSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  sceneId: z.enum(['app-spotlight', 'desktop-mobile-comparison']),
  aspectRatio: z.enum(aspectRatios),
  durationMs: z.number().finite().gt(0),
  background: z.string().min(1).max(256),
  audioSourceLayerId: z.string().nullable(),
  layers: z.array(compositionTemplateLayerSchema).max(12),
  effects: z.array(compositionEffectSchema).max(24).default([]),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).superRefine((template, context) => {
  const layerIds = new Set<string>();
  for (const [index, layer] of template.layers.entries()) {
    if (layerIds.has(layer.id)) {
      context.addIssue({
        code: 'custom',
        path: ['layers', index, 'id'],
        message: 'Template layer IDs must be unique.',
      });
    }
    layerIds.add(layer.id);
    if (layer.endMs <= layer.startMs || layer.endMs > template.durationMs) {
      context.addIssue({
        code: 'custom',
        path: ['layers', index, 'endMs'],
        message: 'Template layer timing must fit inside the duration.',
      });
    }
  }
  const effectIds = new Set<string>();
  for (const [index, effect] of template.effects.entries()) {
    if (effectIds.has(effect.id)) {
      context.addIssue({
        code: 'custom',
        path: ['effects', index, 'id'],
        message: 'Template effect IDs must be unique.',
      });
    }
    effectIds.add(effect.id);
    if (effect.endMs <= effect.startMs || effect.endMs > template.durationMs) {
      context.addIssue({
        code: 'custom',
        path: ['effects', index, 'endMs'],
        message: 'Template effect timing must fit inside the duration.',
      });
    }
  }
  if (
    template.audioSourceLayerId &&
    !template.layers.some(
      (layer) =>
        layer.kind === 'video' && layer.id === template.audioSourceLayerId,
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: ['audioSourceLayerId'],
      message: 'Template audio must reference a video layer.',
    });
  }
});

type CompositionTake = Pick<StudioTakeSummary, 'id' | 'title' | 'durationMs'>;

export const studioCompositionDocumentSchema = z.object({
  version: z.literal(1),
  sceneId: z.enum(['app-spotlight', 'desktop-mobile-comparison']),
  aspectRatio: z.enum(aspectRatios),
  durationMs: z.number().finite().gt(0),
  background: z.string().min(1).max(256),
  audioSourceLayerId: z.string().nullable(),
  layers: z.array(compositionLayerSchema).max(12),
  effects: z.array(compositionEffectSchema).max(24).default([]),
}).superRefine((document, context) => {
  const layerIds = new Set<string>();
  for (const [index, layer] of document.layers.entries()) {
    if (layerIds.has(layer.id)) {
      context.addIssue({
        code: 'custom',
        path: ['layers', index, 'id'],
        message: 'Layer IDs must be unique within a composition.',
      });
    }
    layerIds.add(layer.id);

    if (layer.endMs <= layer.startMs || layer.endMs > document.durationMs) {
      context.addIssue({
        code: 'custom',
        path: ['layers', index, 'endMs'],
        message: 'Layer timing must fit inside the composition duration.',
      });
    }
    if (
      layer.kind === 'video' &&
      layer.sourceInMs >= layer.sourceDurationMs
    ) {
      context.addIssue({
        code: 'custom',
        path: ['layers', index, 'sourceInMs'],
        message: 'Video source in-point must be before the source duration.',
      });
    }
  }

  const effectIds = new Set<string>();
  for (const [index, effect] of document.effects.entries()) {
    if (effectIds.has(effect.id)) {
      context.addIssue({
        code: 'custom',
        path: ['effects', index, 'id'],
        message: 'Effect IDs must be unique within a composition.',
      });
    }
    effectIds.add(effect.id);
    if (effect.endMs <= effect.startMs || effect.endMs > document.durationMs) {
      context.addIssue({
        code: 'custom',
        path: ['effects', index, 'endMs'],
        message: 'Effect timing must fit inside the composition duration.',
      });
    }
  }

  if (
    document.audioSourceLayerId &&
    !document.layers.some(
      (layer) =>
        layer.kind === 'video' && layer.id === document.audioSourceLayerId,
    )
  ) {
    context.addIssue({
      code: 'custom',
      path: ['audioSourceLayerId'],
      message: 'Audio source must reference a video layer in this composition.',
    });
  }
});

export function parseStudioCompositionDocument(
  value: unknown,
): StudioCompositionDocument {
  return studioCompositionDocumentSchema.parse(
    value,
  ) as StudioCompositionDocument;
}

export function parseStudioCompositionTemplate(
  value: unknown,
): StudioCompositionTemplate {
  return studioCompositionTemplateSchema.parse(
    value,
  ) as StudioCompositionTemplate;
}

export function createStudioCompositionTemplate({
  id,
  title,
  composition,
  imageAssetPaths,
  createdAt = Math.floor(Date.now() / 1000),
}: {
  id: string;
  title: string;
  composition: StudioComposition;
  imageAssetPaths: Record<string, string>;
  createdAt?: number;
}): StudioCompositionTemplate {
  const templateTitle = title.trim();
  if (!templateTitle) throw new Error('A template name is required.');

  const layers: StudioCompositionTemplateLayer[] =
    composition.document.layers.map((layer) => {
      const {
        kind,
        id: layerId,
        name,
        startMs,
        endMs,
        zIndex,
        opacity,
        transitionIn,
        transitionOut,
        layouts,
      } = layer;
      const base = {
        id: layerId,
        name,
        startMs,
        endMs,
        zIndex,
        opacity,
        transitionIn,
        transitionOut,
        layouts,
      };
      if (kind === 'video') {
        return { ...base, kind: 'video', sourceInMs: layer.sourceInMs };
      }
      const assetPath = imageAssetPaths[layer.sourceId];
      if (!assetPath) {
        throw new Error(`Image layer "${layer.name}" has no stored source.`);
      }
      return { ...base, kind: 'image', assetPath };
    });

  return parseStudioCompositionTemplate({
    version: 1,
    id,
    title: templateTitle,
    sceneId: composition.document.sceneId,
    aspectRatio: composition.document.aspectRatio,
    durationMs: composition.document.durationMs,
    background: composition.document.background,
    audioSourceLayerId: composition.document.audioSourceLayerId,
    layers,
    effects: composition.document.effects ?? [],
    createdAt,
    updatedAt: createdAt,
  });
}

export function instantiateStudioCompositionTemplate(
  template: StudioCompositionTemplate,
  takes: CompositionTake[],
): {
  document: StudioCompositionDocument;
  imageAssets: Array<{ id: string; name: string; path: string }>;
} {
  const videoLayers = template.layers.filter((layer) => layer.kind === 'video');
  if (takes.length !== videoLayers.length) {
    throw new Error(
      `This template needs ${videoLayers.length} recording${videoLayers.length === 1 ? '' : 's'}.`,
    );
  }

  let takeIndex = 0;
  const imageAssets: Array<{ id: string; name: string; path: string }> = [];
  const layers: StudioCompositionLayer[] = template.layers.map((layer) => {
    const {
      kind,
      id,
      name,
      startMs,
      endMs,
      zIndex,
      opacity,
      transitionIn,
      transitionOut,
      layouts,
    } = layer;
    const base = {
      id,
      name,
      startMs,
      endMs,
      zIndex,
      opacity,
      transitionIn,
      transitionOut,
      layouts,
    };
    if (kind === 'video') {
      const take = takes[takeIndex++];
      return {
        ...base,
        kind: 'video',
        sourceId: take.id,
        sourceDurationMs: take.durationMs,
        sourceInMs: Math.min(layer.sourceInMs, take.durationMs - 1),
      };
    }
    const assetId = nanoid();
    imageAssets.push({ id: assetId, name: layer.name, path: layer.assetPath });
    return { ...base, kind: 'image', sourceId: assetId };
  });

  return {
    document: parseStudioCompositionDocument({
      version: 1,
      sceneId: template.sceneId,
      aspectRatio: template.aspectRatio,
      durationMs: template.durationMs,
      background: template.background,
      audioSourceLayerId: template.audioSourceLayerId,
      layers,
      effects: template.effects,
    }),
    imageAssets,
  };
}

export const STUDIO_COMPOSITION_SCENES: Array<{
  id: StudioCompositionSceneId;
  title: string;
  description: string;
  requiredTakes: number;
}> = [
  {
    id: 'app-spotlight',
    title: 'App spotlight',
    description: 'Give one recording the full canvas.',
    requiredTakes: 1,
  },
  {
    id: 'desktop-mobile-comparison',
    title: 'Desktop + mobile',
    description: 'Show two recordings together, arranged for each format.',
    requiredTakes: 2,
  },
];

function layout(
  x: number,
  y: number,
  width: number,
  height: number,
  fit: StudioLayerLayout['fit'] = 'cover',
  cornerRadius = 16,
): StudioLayerLayout {
  return { x, y, width, height, fit, cornerRadius };
}

function sceneLayouts(
  sceneId: StudioCompositionSceneId,
  layerIndex: number,
): Record<StudioAspectRatio, StudioLayerLayout> {
  if (sceneId === 'app-spotlight') {
    return {
      '16:9': layout(0.035, 0.055, 0.93, 0.89),
      '9:16': layout(0.045, 0.09, 0.91, 0.82),
      '1:1': layout(0.045, 0.055, 0.91, 0.89),
      '4:3': layout(0.04, 0.055, 0.92, 0.89),
    };
  }

  if (layerIndex === 0) {
    return {
      '16:9': layout(0.035, 0.12, 0.65, 0.76, 'cover', 12),
      '9:16': layout(0.055, 0.035, 0.89, 0.43, 'cover', 12),
      '1:1': layout(0.025, 0.16, 0.57, 0.68, 'cover', 12),
      '4:3': layout(0.025, 0.14, 0.62, 0.72, 'cover', 12),
    };
  }

  return {
    '16:9': layout(0.72, 0.12, 0.245, 0.76, 'contain', 18),
    '9:16': layout(0.29, 0.49, 0.42, 0.48, 'contain', 18),
    '1:1': layout(0.63, 0.16, 0.34, 0.68, 'contain', 18),
    '4:3': layout(0.67, 0.14, 0.3, 0.72, 'contain', 18),
  };
}

export function createStudioCompositionDocument({
  sceneId,
  takes,
}: {
  sceneId: StudioCompositionSceneId;
  takes?: CompositionTake[];
}): StudioCompositionDocument {
  const scene = STUDIO_COMPOSITION_SCENES.find((item) => item.id === sceneId);
  if (!scene) throw new Error(`Unknown Studio scene: ${sceneId}`);

  const providedTakes = takes ?? [];
  if (providedTakes.length < scene.requiredTakes) {
    // Allow creating a blank composition without takes.
  }
  if (
    sceneId === 'desktop-mobile-comparison' &&
    providedTakes[0]?.id === providedTakes[1]?.id
  ) {
    throw new Error('Choose two different recordings for the comparison scene.');
  }

  const selectedTakes = providedTakes.slice(0, sceneId === 'app-spotlight' ? 1 : 2);
  for (const take of selectedTakes) {
    if (!Number.isFinite(take.durationMs) || take.durationMs <= 0) {
      throw new Error(`Recording "${take.title}" has no usable duration.`);
    }
  }
  const durationMs =
    selectedTakes.length > 0
      ? Math.max(...selectedTakes.map((take) => take.durationMs))
      : 10000;

  const layers: StudioCompositionLayer[] = selectedTakes.map((take, index) => ({
    id: nanoid(),
    kind: 'video',
    sourceId: take.id,
    sourceDurationMs: take.durationMs,
    sourceInMs: 0,
    name: take.title,
    startMs: 0,
    endMs: durationMs,
    zIndex: index,
    opacity: 1,
    transitionIn: { type: 'none', durationMs: 0 },
    transitionOut: { type: 'none', durationMs: 0 },
    layouts: {
      '16:9': sceneLayouts(sceneId, index)['16:9'],
      '9:16': sceneLayouts(sceneId, index)['9:16'],
      '1:1': sceneLayouts(sceneId, index)['1:1'],
      '4:3': sceneLayouts(sceneId, index)['4:3'],
    },
  }));

  return parseStudioCompositionDocument({
    version: 1,
    sceneId,
    aspectRatio: '16:9',
    durationMs,
    background: '#12151b',
    audioSourceLayerId: layers[0]?.id ?? null,
    layers,
    effects: [],
  });
}

export function setCompositionAspectRatio(
  document: StudioCompositionDocument,
  aspectRatio: StudioAspectRatio,
): StudioCompositionDocument {
  return parseStudioCompositionDocument({ ...document, aspectRatio });
}

export interface StudioCompositionLayerPatch {
  layout?: Partial<StudioLayerLayout>;
  opacity?: number;
  startMs?: number;
  endMs?: number;
  sourceInMs?: number;
  transitionIn?: StudioCompositionTransition;
  transitionOut?: StudioCompositionTransition;
}

export function updateStudioCompositionLayer(
  document: StudioCompositionDocument,
  layerId: string,
  patch: StudioCompositionLayerPatch,
): StudioCompositionDocument {
  const layerExists = document.layers.some((layer) => layer.id === layerId);
  if (!layerExists) {
    throw new Error(`Studio composition layer ${layerId} was not found.`);
  }
  const layers = document.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    const { layout: layoutPatch, ...layerPatch } = patch;
    const updatedLayout: StudioLayerLayout = layoutPatch
      ? {
          ...layer.layouts[document.aspectRatio],
          ...layoutPatch,
        }
      : layer.layouts[document.aspectRatio];
    return {
      ...layer,
      ...layerPatch,
      layouts: {
        ...layer.layouts,
        [document.aspectRatio]: updatedLayout,
      },
    };
  });
  return parseStudioCompositionDocument({ ...document, layers });
}

export function reorderStudioCompositionLayer(
  document: StudioCompositionDocument,
  layerId: string,
  direction: 'forward' | 'backward',
): StudioCompositionDocument {
  const orderedLayers = [...document.layers].sort(
    (a, b) => a.zIndex - b.zIndex,
  );
  const index = orderedLayers.findIndex((layer) => layer.id === layerId);
  if (index < 0) {
    throw new Error(`Studio composition layer ${layerId} was not found.`);
  }
  const nextIndex = direction === 'forward' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= orderedLayers.length) return document;

  const currentLayer = orderedLayers[index];
  const adjacentLayer = orderedLayers[nextIndex];
  if (!currentLayer || !adjacentLayer) return document;
  orderedLayers[index] = adjacentLayer;
  orderedLayers[nextIndex] = currentLayer;
  return parseStudioCompositionDocument({
    ...document,
    layers: orderedLayers.map((layer, zIndex) => ({ ...layer, zIndex })),
  });
}

export function addStudioCompositionEffect(
  document: StudioCompositionDocument,
  type: StudioEffectType,
  startMs = 0,
): StudioCompositionDocument {
  const definition = STUDIO_EFFECTS.find((effect) => effect.type === type);
  if (!definition) throw new Error(`Unknown Studio effect: ${type}`);
  if ((document.effects?.length ?? 0) >= 24) {
    throw new Error('A composition can contain up to 24 canvas effects.');
  }
  const clampedStartMs = Math.max(
    0,
    Math.min(document.durationMs - 1, startMs),
  );
  const effect: StudioEffect = {
    id: nanoid(),
    type,
    startMs: clampedStartMs,
    endMs: Math.min(
      document.durationMs,
      clampedStartMs + definition.defaultDurationMs,
    ),
    intensity: definition.defaultIntensity,
  };
  return parseStudioCompositionDocument({
    ...document,
    effects: [...(document.effects ?? []), effect],
  });
}

export function updateStudioCompositionEffect(
  document: StudioCompositionDocument,
  effectId: string,
  patch: Partial<Pick<StudioEffect, 'startMs' | 'endMs' | 'intensity'>>,
): StudioCompositionDocument {
  if (!document.effects?.some((effect) => effect.id === effectId)) {
    throw new Error(`Studio composition effect ${effectId} was not found.`);
  }
  return parseStudioCompositionDocument({
    ...document,
    effects: document.effects.map((effect) =>
      effect.id === effectId ? { ...effect, ...patch } : effect,
    ),
  });
}

export function removeStudioCompositionEffect(
  document: StudioCompositionDocument,
  effectId: string,
): StudioCompositionDocument {
  if (!document.effects?.some((effect) => effect.id === effectId)) {
    throw new Error(`Studio composition effect ${effectId} was not found.`);
  }
  return parseStudioCompositionDocument({
    ...document,
    effects: document.effects.filter((effect) => effect.id !== effectId),
  });
}

export function addCompositionImageLayer(
  document: StudioCompositionDocument,
  asset: { id: string; name: string },
): StudioCompositionDocument {
  const index = document.layers.length;
  const endMs = document.durationMs;
  const layouts: Record<StudioAspectRatio, StudioLayerLayout> = {
    '16:9': layout(0.68, 0.62, 0.26, 0.28, 'contain', 10),
    '9:16': layout(0.62, 0.72, 0.3, 0.2, 'contain', 10),
    '1:1': layout(0.64, 0.64, 0.3, 0.28, 'contain', 10),
    '4:3': layout(0.66, 0.64, 0.28, 0.28, 'contain', 10),
  };
  const layer: StudioCompositionImageLayer = {
    id: nanoid(),
    kind: 'image',
    sourceId: asset.id,
    name: asset.name,
    startMs: 0,
    endMs,
    zIndex: index,
    opacity: 1,
    transitionIn: { type: 'none', durationMs: 0 },
    transitionOut: { type: 'none', durationMs: 0 },
    layouts,
  };
  return parseStudioCompositionDocument({
    ...document,
    layers: [...document.layers, layer],
  });
}

export function addCompositionVideoLayer(
  document: StudioCompositionDocument,
  take: CompositionTake,
): StudioCompositionDocument {
  if (!Number.isFinite(take.durationMs) || take.durationMs <= 0) {
    throw new Error(`Recording "${take.title}" has no usable duration.`);
  }
  const index = document.layers.length;
  const durationMs = Math.max(document.durationMs, take.durationMs);
  const layouts: Record<StudioAspectRatio, StudioLayerLayout> = {
    '16:9': layout(0.68, 0.62, 0.26, 0.28, 'cover', 10),
    '9:16': layout(0.62, 0.72, 0.3, 0.2, 'cover', 10),
    '1:1': layout(0.64, 0.64, 0.3, 0.28, 'cover', 10),
    '4:3': layout(0.66, 0.64, 0.28, 0.28, 'cover', 10),
  };
  const layer: StudioCompositionLayer = {
    id: nanoid(),
    kind: 'video',
    sourceId: take.id,
    sourceDurationMs: take.durationMs,
    sourceInMs: 0,
    name: take.title,
    startMs: 0,
    endMs: durationMs,
    zIndex: index,
    opacity: 1,
    transitionIn: { type: 'none', durationMs: 0 },
    transitionOut: { type: 'none', durationMs: 0 },
    layouts,
  };
  return parseStudioCompositionDocument({
    ...document,
    durationMs,
    audioSourceLayerId: document.audioSourceLayerId ?? layer.id,
    layers: [...document.layers, layer],
  });
}

export function removeCompositionLayer(
  document: StudioCompositionDocument,
  layerId: string,
): StudioCompositionDocument {
  const layers = document.layers
    .filter((layer) => layer.id !== layerId)
    .map((layer, zIndex) => ({ ...layer, zIndex }));
  return parseStudioCompositionDocument({
    ...document,
    audioSourceLayerId:
      document.audioSourceLayerId === layerId
        ? (layers.find((layer) => layer.kind === 'video')?.id ?? null)
        : document.audioSourceLayerId,
    layers,
  });
}
