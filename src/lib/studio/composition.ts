import { nanoid } from 'nanoid';
import { z } from 'zod';
import { STUDIO_EFFECTS } from './effects/catalog';
import { DEFAULT_STUDIO_STYLING } from './styling';
import { compositionDurationMs, normalizeCuts } from './timeline/ripple';
import type {
  StudioAspectRatio,
  StudioComposition,
  StudioCompositionDocument,
  StudioCompositionLayer,
  StudioCompositionSceneId,
  StudioCompositionImageLayer,
  StudioCompositionTextLayer,
  StudioCompositionTransition,
  StudioCompositionTemplate,
  StudioCompositionTemplateLayer,
  StudioCompositionTemplateTextLayer,
  StudioEffect,
  StudioEffectType,
  StudioLayerLayout,
  StudioTake,
  StudioTakePresentation,
  StudioTakeSummary,
} from './types';

const aspectRatios = ['16:9', '9:16', '1:1', '4:3'] as const;
const layerLayoutSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
    fit: z.enum(['cover', 'contain']),
    cornerRadius: z.number().min(0).max(128),
  })
  .superRefine((candidateLayout, context) => {
    if (candidateLayout.x + candidateLayout.width > 1) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'Layer width must stay inside the canvas.',
      });
    }
    if (candidateLayout.y + candidateLayout.height > 1) {
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

const compositionTransitionSchema = z
  .object({
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
  })
  .default({ type: 'none', durationMs: 0 });

const layerBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  startMs: z.number().finite().min(0),
  endMs: z.number().finite().gt(0),
  zIndex: z.number().int().min(0).max(100),
  opacity: z.number().min(0).max(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  transitionIn: compositionTransitionSchema,
  transitionOut: compositionTransitionSchema,
  layouts: layoutsSchema,
});

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

const takePresentationSchema = z.object({
  styling: z.object({
    background: z.string().min(1).max(256),
    borderRadius: z.number().finite().min(0).max(128),
    padding: z.number().finite().min(0).max(512),
    shadow: z.string().max(256),
    aspectRatio: z.enum(aspectRatios),
    zoomIntensity: z.number().finite().min(0).max(10),
    cameraEasing: z.enum(['smooth', 'snappy', 'cinematic']),
    showCaptions: z.boolean(),
    captionStyle: z.enum(['karaoke', 'minimal', 'badge']),
    deviceFrame: z
      .object({
        type: z.enum([
          'none',
          'browser',
          'macbook',
          'iphone',
          'minimal-svg',
          'glass',
        ]),
        title: z.string().max(256).optional(),
        url: z.string().max(2048).optional(),
        theme: z.enum(['dark', 'light', 'accent']).optional(),
        showControls: z.boolean().optional(),
      })
      .optional(),
    introCard: z
      .object({
        enabled: z.boolean(),
        title: z.string().max(256),
        subtitle: z.string().max(512).optional(),
        badge: z.string().max(128).optional(),
        durationMs: z.number().finite().min(0).max(30000),
        preset: z.enum(['minimal', 'kinetic', 'gradient', 'cyber']).optional(),
        logoUrl: z.string().max(2048).optional(),
      })
      .optional(),
    outroCard: z
      .object({
        enabled: z.boolean(),
        title: z.string().max(256),
        subtitle: z.string().max(512).optional(),
        badge: z.string().max(128).optional(),
        durationMs: z.number().finite().min(0).max(30000),
        preset: z.enum(['minimal', 'kinetic', 'gradient', 'cyber']).optional(),
        logoUrl: z.string().max(2048).optional(),
      })
      .optional(),
  }),
  cuts: z
    .array(
      z.object({
        id: z.string().min(1),
        startMs: z.number().finite().min(0),
        endMs: z.number().finite().gt(0),
        reason: z.enum(['silence', 'idle', 'manual']).optional(),
      }),
    )
    .max(1000)
    .default([]),
  zooms: z
    .array(
      z.object({
        id: z.string().min(1),
        startMs: z.number().finite().min(0),
        endMs: z.number().finite().gt(0),
        targetX: z.number().finite().min(0).max(1),
        targetY: z.number().finite().min(0).max(1),
        scale: z.number().finite().min(1).max(8),
      }),
    )
    .max(2000)
    .default([]),
  captions: z
    .array(
      z.object({
        id: z.string().min(1),
        startMs: z.number().finite().min(0),
        endMs: z.number().finite().gt(0),
        text: z.string().max(4000),
        words: z
          .array(
            z.object({
              word: z.string().max(256),
              startMs: z.number().finite().min(0),
              endMs: z.number().finite().gt(0),
            }),
          )
          .max(10000)
          .optional(),
      }),
    )
    .max(10000)
    .default([]),
  effects: z.array(compositionEffectSchema).max(1000).default([]),
  overlays: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(['image', 'video']),
        srcPath: z.string().min(1).max(4096),
        startMs: z.number().finite().min(0),
        endMs: z.number().finite().gt(0),
        x: z.number().finite().min(0).max(1),
        y: z.number().finite().min(0).max(1),
        widthPct: z.number().finite().gt(0).max(1),
        opacity: z.number().finite().min(0).max(1),
        rotation: z.number().finite().min(-360).max(360),
        cornerRadius: z.number().finite().min(0).max(128),
      }),
    )
    .max(1000)
    .default([]),
  videoCrop: z
    .object({
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1),
      width: z.number().finite().gt(0).max(1),
      height: z.number().finite().gt(0).max(1),
    })
    .optional(),
});

const compositionLayerSchema = z.discriminatedUnion('kind', [
  layerBaseSchema.extend({
    kind: z.literal('video'),
    sourceId: z.string().min(1),
    sourceDurationMs: z.number().finite().gt(0),
    sourceInMs: z.number().finite().min(0),
    takePresentation: takePresentationSchema.optional(),
  }),
  layerBaseSchema.extend({
    kind: z.literal('image'),
    sourceId: z.string().min(1),
  }),
  layerBaseSchema.extend({
    kind: z.literal('text'),
    text: z.string().max(4000),
    fontSize: z.number().finite().min(8).max(240),
    fontFamily: z.string().min(1).max(120),
    fontWeight: z.enum(['normal', 'bold']),
    textAlign: z.enum(['left', 'center', 'right']),
    color: z.string().min(1).max(64),
    backgroundColor: z.string().max(64).nullable(),
  }),
]);

const compositionTemplateLayerSchema = z.discriminatedUnion('kind', [
  layerBaseSchema.extend({
    kind: z.literal('video'),
    sourceInMs: z.number().finite().min(0),
    takePresentation: takePresentationSchema.optional(),
  }),
  layerBaseSchema.extend({
    kind: z.literal('image'),
    assetPath: z.string().min(1),
  }),
  layerBaseSchema.extend({
    kind: z.literal('text'),
    text: z.string().max(4000),
    fontSize: z.number().finite().min(8).max(240),
    fontFamily: z.string().min(1).max(120),
    fontWeight: z.enum(['normal', 'bold']),
    textAlign: z.enum(['left', 'center', 'right']),
    color: z.string().min(1).max(64),
    backgroundColor: z.string().max(64).nullable(),
  }),
]);

export const studioCompositionTemplateSchema = z
  .object({
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
  })
  .superRefine((template, context) => {
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
      if (
        effect.endMs <= effect.startMs ||
        effect.endMs > template.durationMs
      ) {
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

export type StudioCompositionTakeSource = Pick<
  StudioTakeSummary,
  'id' | 'title' | 'durationMs'
>;

type CompositionTake = StudioCompositionTakeSource;

export const studioCompositionDocumentSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    sceneId: z.enum(['app-spotlight', 'desktop-mobile-comparison']),
    aspectRatio: z.enum(aspectRatios),
    durationMs: z.number().finite().gt(0),
    background: z.string().min(1).max(256),
    audioSourceLayerId: z.string().nullable(),
    layers: z.array(compositionLayerSchema).max(12),
    effects: z.array(compositionEffectSchema).max(24).default([]),
  })
  .superRefine((document, context) => {
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
      if (
        effect.endMs <= effect.startMs ||
        effect.endMs > document.durationMs
      ) {
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
        message:
          'Audio source must reference a video layer in this composition.',
      });
    }
  });

export function parseStudioCompositionDocument(
  value: unknown,
): StudioCompositionDocument {
  const parsed = studioCompositionDocumentSchema.parse(value);
  return { ...parsed, version: 2 } as StudioCompositionDocument;
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
        visible,
        locked,
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
        visible,
        locked,
        transitionIn,
        transitionOut,
        layouts,
      };
      if (kind === 'video') {
        return {
          ...base,
          kind: 'video',
          sourceInMs: layer.sourceInMs,
          takePresentation: layer.takePresentation,
        };
      }
      if (kind === 'image') {
        const assetPath = imageAssetPaths[layer.sourceId];
        if (!assetPath) {
          throw new Error(`Image layer "${layer.name}" has no stored source.`);
        }
        return { ...base, kind: 'image', assetPath };
      }
      return {
        ...base,
        kind: 'text',
        text: layer.text,
        fontSize: layer.fontSize,
        fontFamily: layer.fontFamily,
        fontWeight: layer.fontWeight,
        textAlign: layer.textAlign,
        color: layer.color,
        backgroundColor: layer.backgroundColor,
      };
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
        takePresentation: layer.takePresentation,
      };
    }
    if (kind === 'image') {
      const assetId = nanoid();
      imageAssets.push({ id: assetId, name: layer.name, path: layer.assetPath });
      return { ...base, kind: 'image', sourceId: assetId };
    }
    return {
      ...base,
      kind: 'text',
      text: layer.text,
      fontSize: layer.fontSize,
      fontFamily: layer.fontFamily,
      fontWeight: layer.fontWeight,
      textAlign: layer.textAlign,
      color: layer.color,
      backgroundColor: layer.backgroundColor,
    };
  });

  return {
    document: parseStudioCompositionDocument({
      version: 2,
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
    throw new Error(
      'Choose two different recordings for the comparison scene.',
    );
  }

  const selectedTakes = providedTakes.slice(
    0,
    sceneId === 'app-spotlight' ? 1 : 2,
  );
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
    version: 2,
    sceneId,
    aspectRatio: '16:9',
    durationMs,
    background: '#12151b',
    audioSourceLayerId: layers[0]?.id ?? null,
    layers,
    effects: [],
  });
}

export function createDefaultStudioTakePresentation(): StudioTakePresentation {
  return {
    styling: DEFAULT_STUDIO_STYLING,
    cuts: [],
    zooms: [],
    captions: [],
    effects: [],
    overlays: [],
  };
}

export function studioTakePresentationFromTake(
  take: StudioTake,
): StudioTakePresentation {
  return {
    styling: take.styling,
    cuts: normalizeCuts(take.cuts ?? [], take.durationMs),
    zooms: take.zooms ?? [],
    captions: take.captions ?? [],
    effects: take.effects ?? [],
    overlays: take.overlays ?? [],
    videoCrop: take.videoCrop,
  };
}

export function createStudioCompositionDocumentFromTakes(
  sceneId: StudioCompositionSceneId,
  takes: StudioTake[],
): StudioCompositionDocument {
  const document = createStudioCompositionDocument({
    sceneId,
    takes: takes.map(({ id, title, durationMs }) => ({
      id,
      title,
      durationMs,
    })),
  });
  const takesById = new Map(takes.map((take) => [take.id, take]));
  const layers = document.layers.map((layer) => {
    if (layer.kind !== 'video') return layer;
    const take = takesById.get(layer.sourceId);
    if (!take) return layer;
    const takePresentation = studioTakePresentationFromTake(take);
    const takeDuration = compositionDurationMs(take.durationMs, takePresentation.cuts);
    return {
      ...layer,
      endMs: Math.min(layer.endMs, takeDuration),
      takePresentation,
    };
  });
  const durationMs = layers.length
    ? Math.max(...layers.map((layer) => layer.endMs))
    : document.durationMs;
  return parseStudioCompositionDocument({
    ...document,
    durationMs: Math.max(1, durationMs),
    layers,
  });
}

export function createStudioCompositionDocumentFromTake(
  take: StudioTake,
): StudioCompositionDocument {
  const takePresentation = studioTakePresentationFromTake(take);
  const durationMs = compositionDurationMs(take.durationMs, takePresentation.cuts);
  if (durationMs <= 0) {
    throw new Error(
      'A recording needs visible content before it can be edited.',
    );
  }

  const initial = createStudioCompositionDocumentFromTakes('app-spotlight', [take]);
  const layer = initial.layers[0];
  if (!layer || layer.kind !== 'video') {
    throw new Error('Could not create the primary recording layer.');
  }
  const fullFrameLayouts = Object.fromEntries(
    aspectRatios.map((aspectRatio) => [
      aspectRatio,
      {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fit: 'contain' as const,
        cornerRadius: 0,
      },
    ]),
  ) as Record<StudioAspectRatio, StudioLayerLayout>;

  return parseStudioCompositionDocument({
    ...initial,
    aspectRatio: take.styling.aspectRatio,
    durationMs,
    background: take.styling.background,
    layers: [
      {
        ...layer,
        endMs: durationMs,
        layouts: fullFrameLayouts,
        takePresentation,
      },
    ],
  });
}

export function setCompositionAspectRatio(
  document: StudioCompositionDocument,
  aspectRatio: StudioAspectRatio,
): StudioCompositionDocument {
  return parseStudioCompositionDocument({
    ...document,
    aspectRatio,
    layers: document.layers.map((layer) =>
      layer.kind === 'video' && layer.takePresentation
        ? {
            ...layer,
            takePresentation: {
              ...layer.takePresentation,
              styling: { ...layer.takePresentation.styling, aspectRatio },
            },
          }
        : layer,
    ),
  });
}

export type StudioCompositionOperation =
  | {
      type: 'layer.patch';
      layerId: string;
      patch: StudioCompositionLayerPatch;
    }
  | { type: 'layer.remove'; layerId: string }
  | {
      type: 'layer.reorder';
      layerId: string;
      direction: 'forward' | 'backward';
    }
  | {
      type: 'layer.addVideo';
      take: StudioCompositionTakeSource;
      takePresentation?: StudioTakePresentation;
    }
  | { type: 'layer.addImage'; asset: { id: string; name: string } }
  | { type: 'layer.addText'; text: string }
  | { type: 'effect.add'; effectType: StudioEffectType; startMs: number }
  | {
      type: 'effect.patch';
      effectId: string;
      patch: Partial<Pick<StudioEffect, 'startMs' | 'endMs' | 'intensity'>>;
    }
  | { type: 'effect.remove'; effectId: string };

export interface StudioCompositionLayerPatch {
  layout?: Partial<StudioLayerLayout>;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  startMs?: number;
  endMs?: number;
  sourceInMs?: number;
  transitionIn?: StudioCompositionTransition;
  transitionOut?: StudioCompositionTransition;
  takePresentation?: Partial<StudioTakePresentation>;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: StudioCompositionTextLayer['fontWeight'];
  textAlign?: StudioCompositionTextLayer['textAlign'];
  color?: string;
  backgroundColor?: string | null;
}

export const studioCompositionOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('layer.patch'),
    layerId: z.string().min(1),
    patch: z.object({
      layout: z.object({
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        width: z.number().gt(0).max(1).optional(),
        height: z.number().gt(0).max(1).optional(),
        fit: z.enum(['cover', 'contain']).optional(),
        cornerRadius: z.number().min(0).max(128).optional(),
      }).optional(),
      opacity: z.number().min(0).max(1).optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      startMs: z.number().finite().min(0).optional(),
      endMs: z.number().finite().gt(0).optional(),
      sourceInMs: z.number().finite().min(0).optional(),
      transitionIn: compositionTransitionSchema.optional(),
      transitionOut: compositionTransitionSchema.optional(),
      takePresentation: takePresentationSchema.partial().optional(),
      text: z.string().max(4000).optional(),
      fontSize: z.number().finite().min(8).max(240).optional(),
      fontFamily: z.string().min(1).max(120).optional(),
      fontWeight: z.enum(['normal', 'bold']).optional(),
      textAlign: z.enum(['left', 'center', 'right']).optional(),
      color: z.string().min(1).max(64).optional(),
      backgroundColor: z.string().max(64).nullable().optional(),
    }),
  }),
  z.object({ type: z.literal('layer.remove'), layerId: z.string().min(1) }),
  z.object({
    type: z.literal('layer.reorder'),
    layerId: z.string().min(1),
    direction: z.enum(['forward', 'backward']),
  }),
  z.object({
    type: z.literal('layer.addVideo'),
    take: z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(120),
      durationMs: z.number().finite().gt(0),
    }),
    takePresentation: takePresentationSchema.optional(),
  }),
  z.object({
    type: z.literal('layer.addImage'),
    asset: z.object({ id: z.string().min(1), name: z.string().min(1).max(120) }),
  }),
  z.object({
    type: z.literal('layer.addText'),
    text: z.string().max(4000),
  }),
  z.object({
    type: z.literal('effect.add'),
    effectType: z.enum(['spotlight', 'neon-glow', 'vignette', 'film-grain', 'scanlines']),
    startMs: z.number().finite().min(0),
  }),
  z.object({
    type: z.literal('effect.patch'),
    effectId: z.string().min(1),
    patch: z.object({
      startMs: z.number().finite().min(0).optional(),
      endMs: z.number().finite().gt(0).optional(),
      intensity: z.number().finite().min(0).max(1).optional(),
    }),
  }),
  z.object({ type: z.literal('effect.remove'), effectId: z.string().min(1) }),
]);

export function parseStudioCompositionOperation(
  value: unknown,
): StudioCompositionOperation {
  return studioCompositionOperationSchema.parse(value) as StudioCompositionOperation;
}

export function updateStudioCompositionLayer(
  document: StudioCompositionDocument,
  layerId: string,
  patch: StudioCompositionLayerPatch,
): StudioCompositionDocument {
  const layerBefore = document.layers.find((layer) => layer.id === layerId);
  if (!layerBefore) {
    throw new Error(`Studio composition layer ${layerId} was not found.`);
  }
  const cutsChanged =
    layerBefore.kind === 'video' && patch.takePresentation?.cuts !== undefined;
  const layers = document.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    const {
      layout: layoutPatch,
      takePresentation: presentationPatch,
      ...layerPatch
    } = patch;
    const updatedLayout: StudioLayerLayout = layoutPatch
      ? {
          ...layer.layouts[document.aspectRatio],
          ...layoutPatch,
        }
      : layer.layouts[document.aspectRatio];
    const updatedPresentation =
      layer.kind === 'video' && presentationPatch
        ? {
            ...(layer.takePresentation ?? createDefaultStudioTakePresentation()),
            ...presentationPatch,
          }
        : layer.kind === 'video'
          ? layer.takePresentation
          : undefined;
    return {
      ...layer,
      ...layerPatch,
      ...(layer.kind === 'video' &&
      updatedPresentation &&
      presentationPatch?.cuts !== undefined
        ? {
            endMs:
              layer.startMs +
              compositionDurationMs(
                layer.sourceDurationMs,
                normalizeCuts(presentationPatch.cuts, layer.sourceDurationMs),
              ),
          }
        : {}),
      ...(layer.kind === 'video' && updatedPresentation
        ? { takePresentation: updatedPresentation }
        : {}),
      layouts: {
        ...layer.layouts,
        [document.aspectRatio]: updatedLayout,
      },
    };
  });
  const durationMs = cutsChanged
    ? Math.max(
        1,
        ...layers.map((layer) => layer.endMs),
        ...(document.effects ?? []).map((effect) => effect.endMs),
      )
    : document.durationMs;
  return parseStudioCompositionDocument({ ...document, durationMs, layers });
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

export function addStudioCompositionTextLayer(
  document: StudioCompositionDocument,
  text = 'Your headline',
): StudioCompositionDocument {
  const layer: StudioCompositionTextLayer = {
    id: nanoid(),
    kind: 'text',
    name: text.trim().slice(0, 120) || 'Text layer',
    text,
    startMs: 0,
    endMs: document.durationMs,
    zIndex: document.layers.length,
    opacity: 1,
    transitionIn: { type: 'none', durationMs: 0 },
    transitionOut: { type: 'none', durationMs: 0 },
    layouts: {
      '16:9': layout(0.1, 0.06, 0.8, 0.18, 'contain', 8),
      '9:16': layout(0.08, 0.04, 0.84, 0.12, 'contain', 8),
      '1:1': layout(0.08, 0.06, 0.84, 0.16, 'contain', 8),
      '4:3': layout(0.08, 0.05, 0.84, 0.16, 'contain', 8),
    },
    fontSize: 56,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#ffffff',
    backgroundColor: null,
  };
  return parseStudioCompositionDocument({
    ...document,
    layers: [...document.layers, layer],
  });
}

export function addCompositionVideoLayer(
  document: StudioCompositionDocument,
  take: CompositionTake,
  takePresentation?: StudioTakePresentation,
): StudioCompositionDocument {
  if (!Number.isFinite(take.durationMs) || take.durationMs <= 0) {
    throw new Error(`Recording "${take.title}" has no usable duration.`);
  }
  const index = document.layers.length;
  const takeDurationMs = takePresentation
    ? compositionDurationMs(take.durationMs, normalizeCuts(takePresentation.cuts, take.durationMs))
    : take.durationMs;
  const durationMs = Math.max(document.durationMs, takeDurationMs);
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
    takePresentation,
    name: take.title,
    startMs: 0,
    endMs: takeDurationMs,
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

export function applyStudioCompositionOperation(
  document: StudioCompositionDocument,
  operation: StudioCompositionOperation,
): StudioCompositionDocument {
  const parsed = parseStudioCompositionOperation(operation);
  switch (parsed.type) {
    case 'layer.patch':
      return updateStudioCompositionLayer(
        document,
        parsed.layerId,
        parsed.patch,
      );
    case 'layer.remove':
      return removeCompositionLayer(document, parsed.layerId);
    case 'layer.reorder':
      return reorderStudioCompositionLayer(
        document,
        parsed.layerId,
        parsed.direction,
      );
    case 'layer.addVideo':
      return addCompositionVideoLayer(
        document,
        parsed.take,
        parsed.takePresentation,
      );
    case 'layer.addImage':
      return addCompositionImageLayer(document, parsed.asset);
    case 'layer.addText':
      return addStudioCompositionTextLayer(document, parsed.text);
    case 'effect.add':
      return addStudioCompositionEffect(
        document,
        parsed.effectType,
        parsed.startMs,
      );
    case 'effect.patch':
      return updateStudioCompositionEffect(
        document,
        parsed.effectId,
        parsed.patch,
      );
    case 'effect.remove':
      return removeStudioCompositionEffect(document, parsed.effectId);
    default: {
      const exhaustive: never = parsed;
      return exhaustive;
    }
  }
}
