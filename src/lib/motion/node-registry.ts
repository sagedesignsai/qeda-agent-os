/**
 * lib/motion/node-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-independent registry for scene node kinds, defaults, validation,
 * and animatable property paths. Renderers bind these definitions separately.
 */

import { z } from 'zod';

import type {
  MotionAssetKind,
  MotionNode,
  MotionNodeTransform,
} from './types';

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type MotionNodeCategory = 'scene' | 'camera' | 'geometry' | 'surface' | 'lighting' | 'model' | 'stage';

export type MotionPropertyHint = {
  label?: string;
  control?: 'text' | 'number' | 'slider' | 'color' | 'vector3' | 'asset' | 'select' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  group?: string;
  assetKind?: MotionAssetKind;
  options?: Array<{ value: string; label: string }>;
};

export type MotionNodeTypeDefinition = {
  id: string;
  label: string;
  category: MotionNodeCategory;
  description: string;
  propsSchema: z.ZodType<Record<string, unknown>>;
  defaultProps: Record<string, unknown>;
  animatableProperties: Readonly<Record<string, { description: string }>>;
  defaultTransform?: Partial<MotionNodeTransform>;
  defaultName: string;
  allowedParents?: readonly string[];
  propertyHints?: Readonly<Record<string, MotionPropertyHint>>;
};

export type MotionNodeTypeDescription = Pick<
  MotionNodeTypeDefinition,
  'id' | 'label' | 'category' | 'description' | 'animatableProperties'
> & {
  defaultProps: Record<string, unknown>;
  defaultTransform?: Partial<MotionNodeTransform>;
  properties: Record<string, unknown>;
  allowedParents?: readonly string[];
  propertyHints?: Readonly<Record<string, MotionPropertyHint>>;
};

const identityTransform: MotionNodeTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

const nodeTypes = new Map<string, MotionNodeTypeDefinition>();

export class MotionNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionNodeError';
  }
}

export function registerMotionNodeType(definition: MotionNodeTypeDefinition): void {
  if (nodeTypes.has(definition.id)) {
    throw new MotionNodeError(`Node type already registered: ${definition.id}`);
  }
  nodeTypes.set(definition.id, definition);
}

export function getMotionNodeType(type: string): MotionNodeTypeDefinition | undefined {
  return nodeTypes.get(type);
}

export function listMotionNodeTypes(): MotionNodeTypeDescription[] {
  return [...nodeTypes.values()].map(
    ({
      id,
      label,
      category,
      description,
      animatableProperties,
      defaultProps,
      defaultTransform,
      propsSchema,
      allowedParents,
      propertyHints,
    }) => ({
      id,
      label,
      category,
      description,
      animatableProperties,
      defaultProps,
      ...(defaultTransform ? { defaultTransform } : {}),
      properties: z.toJSONSchema(propsSchema) as Record<string, unknown>,
      ...(allowedParents ? { allowedParents } : {}),
      ...(propertyHints ? { propertyHints } : {}),
    }),
  );
}

export function createMotionNode(
  type: string,
  id: string,
  options: { name?: string; parentId?: string | null } = {},
): MotionNode {
  const definition = getMotionNodeType(type);
  if (!definition) throw new MotionNodeError(`Unknown Motion node type "${type}".`);
  const parsedProps = definition.propsSchema.safeParse(definition.defaultProps);
  if (!parsedProps.success) {
    throw new MotionNodeError(`Invalid default properties for node type "${type}".`);
  }

  return {
    id,
    type,
    name: options.name ?? definition.defaultName,
    parentId: options.parentId ?? null,
    visible: true,
    locked: false,
    transform: {
      ...identityTransform,
      ...definition.defaultTransform,
    },
    props: parsedProps.data,
  };
}

export function validateMotionNode(node: MotionNode): MotionNode {
  const definition = getMotionNodeType(node.type);
  if (!definition) throw new MotionNodeError(`Unknown Motion node type "${node.type}".`);
  const result = definition.propsSchema.safeParse(node.props);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new MotionNodeError(
      `Node "${node.id}" has invalid properties at ${first?.path.join('.') || 'props'}: ${first?.message ?? 'invalid value'}`,
    );
  }
  return { ...node, props: result.data };
}

export function hasAnimatableProperty(type: string, property: string): boolean {
  if (/^(position|rotation|scale)\.[xyz]$/.test(property)) {
    return nodeTypes.has(type);
  }
  return Boolean(nodeTypes.get(type)?.animatableProperties[property]);
}

export function applyNodeProperty(
  node: MotionNode,
  property: string,
  value: number,
): MotionNode {
  if (!Number.isFinite(value)) {
    throw new MotionNodeError(`Animated value for "${property}" must be finite.`);
  }
  if (!hasAnimatableProperty(node.type, property)) {
    throw new MotionNodeError(`Node type "${node.type}" does not animate "${property}".`);
  }

  const [root, axis] = property.split('.');
  if (root === 'position' || root === 'rotation' || root === 'scale') {
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const vector = [...node.transform[root]] as [number, number, number];
    vector[index] = value;
    return { ...node, transform: { ...node.transform, [root]: vector } };
  }

  return validateMotionNode({ ...node, props: { ...node.props, [property]: value } });
}

function registerBuiltins(): void {
  registerMotionNodeType({
    id: 'scene.group',
    label: 'Group',
    category: 'scene',
    description: 'A transformable parent for organizing scene objects.',
    propsSchema: z
      .object({
        opacity: z.number().min(0).max(1),
      })
      .strict(),
    defaultProps: { opacity: 1 },
    animatableProperties: {
      opacity: { description: 'Group opacity inherited by its child nodes.' },
    },
    defaultName: 'Group',
    propertyHints: {
      opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
    },
  });
  registerMotionNodeType({
    id: 'camera.perspective',
    label: 'Perspective camera',
    category: 'camera',
    description: 'A perspective camera that frames the scene.',
    propsSchema: z
      .object({
        fov: z.number().min(1).max(179),
        near: z.number().positive(),
        far: z.number().positive(),
      })
      .strict(),
    defaultProps: { fov: 34, near: 0.1, far: 60 },
    defaultTransform: { position: [3.7, 2.7, 5.1] },
    animatableProperties: { fov: { description: 'Vertical field of view in degrees.' } },
    defaultName: 'Camera',
    propertyHints: {
      fov: { label: 'Field of view', control: 'slider', min: 1, max: 179, step: 1, group: 'Lens' },
      near: { label: 'Near clip', control: 'number', min: 0.001, step: 0.01, group: 'Lens' },
      far: { label: 'Far clip', control: 'number', min: 0.01, step: 1, group: 'Lens' },
    },
  });
  registerMotionNodeType({
    id: 'device.tablet',
    label: 'Tablet',
    category: 'geometry',
    description: 'A beveled tablet device frame with a child screen surface.',
    propsSchema: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
        depth: z.number().positive(),
        bezel: z.number().positive(),
        opacity: z.number().min(0).max(1),
      })
      .strict(),
    defaultProps: { width: 3.82, height: 2.42, depth: 0.15, bezel: 0.18, opacity: 1 },
    animatableProperties: {
      opacity: { description: 'Device opacity from 0 to 1.' },
    },
    defaultName: 'Tablet',
    propertyHints: {
      width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
      height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
      depth: { label: 'Depth', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' },
      bezel: { label: 'Bezel', control: 'number', min: 0, step: 0.01, group: 'Dimensions' },
      opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
    },
  });
  registerMotionNodeType({
    id: 'screen.image',
    label: 'Image screen',
    category: 'surface',
    description: 'A flat image surface mounted on a device or placed in the scene.',
    propsSchema: z
      .object({
        source: z.string().min(1).optional(),
        assetId: z.string().min(1).optional(),
        missingAsset: z.boolean().optional(),
        width: z.number().positive(),
        height: z.number().positive(),
        fit: z.enum(['contain', 'cover', 'stretch']),
        opacity: z.number().min(0).max(1),
      })
      .refine((props) => Boolean(props.source || props.assetId || props.missingAsset), 'An image asset reference is required.')
      .strict(),
    defaultProps: {
      source: 'starter-dashboard',
      width: 3.46,
      height: 1.947,
      fit: 'contain',
      opacity: 1,
    },
    defaultTransform: { position: [0, 0, 0.118] },
    animatableProperties: {
      opacity: { description: 'Surface opacity from 0 to 1.' },
    },
    defaultName: 'Screen',
    allowedParents: ['device.tablet', 'scene.group'],
    propertyHints: {
      assetId: { label: 'Image', control: 'asset', assetKind: 'image', group: 'Content' },
      width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
      height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' },
      fit: {
        label: 'Fit',
        control: 'select',
        group: 'Content',
        options: [
          { value: 'contain', label: 'Fit inside' },
          { value: 'cover', label: 'Fill frame' },
          { value: 'stretch', label: 'Stretch' },
        ],
      },
      opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
    },
  });
  registerMotionNodeType({
    id: 'text.title',
    label: 'Title',
    category: 'surface',
    description: 'A brand title rendered as a camera-facing scene element.',
    propsSchema: z
      .object({
        text: z.string(),
        color: z.string().min(1),
        fontSize: z.number().positive(),
        opacity: z.number().min(0).max(1),
      })
      .strict(),
    defaultProps: {
      text: 'Product title',
      color: '#ffffff',
      fontSize: 0.3,
      opacity: 1,
    },
    animatableProperties: {
      opacity: { description: 'Title opacity from 0 to 1.' },
      fontSize: { description: 'Title size in scene units.' },
    },
    defaultTransform: { position: [0, -1.7, 0] },
    defaultName: 'Title',
    propertyHints: {
      text: { label: 'Text', control: 'text', group: 'Content' },
      color: { label: 'Color', control: 'color', group: 'Appearance' },
      fontSize: { label: 'Font size', control: 'number', min: 0.01, step: 0.01, group: 'Typography' },
      opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' },
    },
  });
  registerMotionNodeType({
    id: 'light.ambient',
    label: 'Ambient light',
    category: 'lighting',
    description: 'Uniform non-directional scene illumination.',
    propsSchema: z
      .object({
        intensity: z.number().min(0),
        color: z.string().min(1),
      })
      .strict(),
    defaultProps: { intensity: 1.2, color: '#ffffff' },
    animatableProperties: {
      intensity: { description: 'Light intensity.' },
    },
    defaultName: 'Ambient light',
    propertyHints: {
      intensity: { label: 'Intensity', control: 'slider', min: 0, max: 10, step: 0.1, group: 'Light' },
      color: { label: 'Color', control: 'color', group: 'Light' },
    },
  });
  registerMotionNodeType({
    id: 'light.directional',
    label: 'Directional light',
    category: 'lighting',
    description: 'A directional key light for device shading and shadows.',
    propsSchema: z
      .object({
        intensity: z.number().min(0),
        color: z.string().min(1),
        castShadow: z.boolean(),
      })
      .strict(),
    defaultProps: { intensity: 2.2, color: '#ffffff', castShadow: true },
    defaultTransform: { position: [-3.5, 5, 5] },
    animatableProperties: {
      intensity: { description: 'Light intensity.' },
    },
    defaultName: 'Key light',
    propertyHints: {
      intensity: { label: 'Intensity', control: 'slider', min: 0, max: 10, step: 0.1, group: 'Light' },
      color: { label: 'Color', control: 'color', group: 'Light' },
      castShadow: { label: 'Cast shadows', control: 'toggle', group: 'Light' },
    },
  });
  registerMotionNodeType({
    id: 'light.point',
    label: 'Point light',
    category: 'lighting',
    description: 'An omnidirectional accent light placed in the scene.',
    propsSchema: z
      .object({
        intensity: z.number().min(0),
        color: z.string().min(1),
      })
      .strict(),
    defaultProps: { intensity: 2, color: '#6b8fff' },
    defaultTransform: { position: [4, 1.5, -2] },
    animatableProperties: {
      intensity: { description: 'Light intensity.' },
    },
    defaultName: 'Accent light',
    propertyHints: {
      intensity: { label: 'Intensity', control: 'slider', min: 0, max: 10, step: 0.1, group: 'Light' },
      color: { label: 'Color', control: 'color', group: 'Light' },
    },
  });

  const deviceSchema = z.object({ width: z.number().positive(), height: z.number().positive(), depth: z.number().positive(), bezel: z.number().nonnegative(), opacity: z.number().min(0).max(1) }).strict();
  const deviceHints = {
    width: { label: 'Width', control: 'number' as const, min: 0.1, step: 0.01, group: 'Dimensions' },
    height: { label: 'Height', control: 'number' as const, min: 0.1, step: 0.01, group: 'Dimensions' },
    depth: { label: 'Depth', control: 'number' as const, min: 0.01, step: 0.01, group: 'Dimensions' },
    bezel: { label: 'Bezel', control: 'number' as const, min: 0, step: 0.01, group: 'Dimensions' },
    opacity: { label: 'Opacity', control: 'slider' as const, min: 0, max: 1, step: 0.01, group: 'Appearance' },
  };
  for (const device of [
    { id: 'device.phone', label: 'Phone', size: { width: 1.25, height: 2.55, depth: 0.11, bezel: 0.09 } },
    { id: 'device.laptop', label: 'Laptop', size: { width: 3.3, height: 2.1, depth: 0.16, bezel: 0.12 } },
    { id: 'device.monitor', label: 'Monitor', size: { width: 3.7, height: 2.3, depth: 0.13, bezel: 0.1 } },
  ]) {
    registerMotionNodeType({
      id: device.id, label: device.label, category: 'geometry', description: `A ${device.label.toLowerCase()} frame for a product scene.`,
      propsSchema: deviceSchema, defaultProps: { ...device.size, opacity: 1 }, animatableProperties: { opacity: { description: 'Device opacity.' } }, defaultName: device.label, propertyHints: deviceHints,
    });
  }

  registerMotionNodeType({
    id: 'text.body', label: 'Body text', category: 'surface', description: 'Supporting copy rendered as a camera-facing text surface.',
    propsSchema: z.object({ text: z.string(), color: z.string().min(1), fontSize: z.number().positive(), opacity: z.number().min(0).max(1), maxWidth: z.number().positive(), align: z.enum(['left', 'center', 'right']) }).strict(),
    defaultProps: { text: 'Supporting copy', color: '#ffffff', fontSize: 0.16, opacity: 1, maxWidth: 4, align: 'left' },
    animatableProperties: { opacity: { description: 'Text opacity.' }, fontSize: { description: 'Text size.' } }, defaultName: 'Body text',
    propertyHints: { text: { label: 'Text', control: 'text', group: 'Content' }, color: { label: 'Color', control: 'color', group: 'Appearance' }, fontSize: { label: 'Font size', control: 'number', min: 0.01, step: 0.01, group: 'Typography' }, maxWidth: { label: 'Max width', control: 'number', min: 0.1, step: 0.1, group: 'Layout' }, align: { label: 'Alignment', control: 'select', group: 'Typography', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] }, opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' } },
  });

  for (const shape of [
    { id: 'shape.rect', label: 'Rectangle', radius: 0.06 },
    { id: 'shape.ellipse', label: 'Ellipse', radius: 1 },
  ]) {
    registerMotionNodeType({
      id: shape.id, label: shape.label, category: 'surface', description: `A solid ${shape.label.toLowerCase()} surface.`,
      propsSchema: z.object({ width: z.number().positive(), height: z.number().positive(), color: z.string().min(1), cornerRadius: z.number().nonnegative(), opacity: z.number().min(0).max(1) }).strict(),
      defaultProps: { width: 1, height: 1, color: '#5885f7', cornerRadius: shape.radius, opacity: 1 },
      animatableProperties: { opacity: { description: 'Shape opacity.' } }, defaultName: shape.label,
      propertyHints: { width: { label: 'Width', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' }, height: { label: 'Height', control: 'number', min: 0.01, step: 0.01, group: 'Dimensions' }, color: { label: 'Color', control: 'color', group: 'Appearance' }, cornerRadius: { label: 'Corner radius', control: 'number', min: 0, step: 0.01, group: 'Appearance' }, opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' } },
    });
  }

  registerMotionNodeType({
    id: 'stage.ground', label: 'Ground', category: 'stage', description: 'A renderable ground plane beneath scene content.',
    propsSchema: z.object({ size: z.number().positive(), color: z.string().min(1), roughness: z.number().min(0).max(1), metalness: z.number().min(0).max(1), opacity: z.number().min(0).max(1), shadow: z.boolean() }).strict(),
    defaultProps: { size: 20, color: '#171b24', roughness: 0.72, metalness: 0.08, opacity: 1, shadow: true }, animatableProperties: {}, defaultName: 'Ground', defaultTransform: { position: [0, -1.5, 0] },
    propertyHints: { size: { label: 'Size', control: 'number', min: 1, step: 1, group: 'Surface' }, color: { label: 'Color', control: 'color', group: 'Surface' }, roughness: { label: 'Roughness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' }, metalness: { label: 'Metalness', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' }, opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Material' }, shadow: { label: 'Receive shadow', control: 'toggle', group: 'Material' } },
  });

  registerMotionNodeType({
    id: 'model.gltf', label: '3D model', category: 'model', description: 'A bundled glTF or GLB model.',
    propsSchema: z.object({ assetId: z.string().min(1), missingAsset: z.boolean().optional(), opacity: z.number().min(0).max(1), castShadow: z.boolean(), receiveShadow: z.boolean() }).strict(),
    defaultProps: { assetId: 'missing:model', missingAsset: true, opacity: 1, castShadow: true, receiveShadow: true }, animatableProperties: { opacity: { description: 'Model opacity.' } }, defaultName: '3D model',
    propertyHints: { assetId: { label: 'Model', control: 'asset', assetKind: 'model', group: 'Content' }, opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' }, castShadow: { label: 'Cast shadows', control: 'toggle', group: 'Appearance' }, receiveShadow: { label: 'Receive shadows', control: 'toggle', group: 'Appearance' } },
  });

  registerMotionNodeType({
    id: 'screen.video', label: 'Video screen', category: 'surface', description: 'A video surface mounted in the scene.',
    propsSchema: z.object({ assetId: z.string().min(1), missingAsset: z.boolean().optional(), width: z.number().positive(), height: z.number().positive(), fit: z.enum(['contain', 'cover', 'stretch']), opacity: z.number().min(0).max(1), muted: z.boolean(), loop: z.boolean(), playbackRate: z.number().positive() }).strict(),
    defaultProps: { assetId: 'missing:video', missingAsset: true, width: 3.46, height: 1.947, fit: 'contain', opacity: 1, muted: true, loop: true, playbackRate: 1 }, animatableProperties: { opacity: { description: 'Video surface opacity.' } }, defaultTransform: { position: [0, 0, 0.118] }, defaultName: 'Video screen',
    propertyHints: { assetId: { label: 'Video', control: 'asset', assetKind: 'video', group: 'Content' }, width: { label: 'Width', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' }, height: { label: 'Height', control: 'number', min: 0.1, step: 0.01, group: 'Dimensions' }, fit: { label: 'Fit', control: 'select', group: 'Content', options: [{ value: 'contain', label: 'Fit inside' }, { value: 'cover', label: 'Fill frame' }, { value: 'stretch', label: 'Stretch' }] }, opacity: { label: 'Opacity', control: 'slider', min: 0, max: 1, step: 0.01, group: 'Appearance' }, muted: { label: 'Muted', control: 'toggle', group: 'Playback' }, loop: { label: 'Loop', control: 'toggle', group: 'Playback' }, playbackRate: { label: 'Playback rate', control: 'number', min: 0.1, max: 4, step: 0.1, group: 'Playback' } },
  });
}

registerBuiltins();

export const motionVector3Schema = vector3Schema;
