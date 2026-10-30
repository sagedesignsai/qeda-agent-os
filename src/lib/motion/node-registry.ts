/**
 * lib/motion/node-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-independent registry for scene node kinds, defaults, validation,
 * and animatable property paths. Renderers bind these definitions separately.
 */

import { z } from 'zod';

import type { MotionNode, MotionNodeTransform } from './types';

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type MotionNodeCategory = 'scene' | 'camera' | 'geometry' | 'surface' | 'lighting';

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
};

export type MotionNodeTypeDescription = Pick<
  MotionNodeTypeDefinition,
  'id' | 'label' | 'category' | 'description' | 'animatableProperties'
> & {
  defaultProps: Record<string, unknown>;
  defaultTransform?: Partial<MotionNodeTransform>;
  properties: Record<string, unknown>;
  allowedParents?: readonly string[];
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
  });
  registerMotionNodeType({
    id: 'screen.image',
    label: 'Image screen',
    category: 'surface',
    description: 'A flat image surface mounted on a device or placed in the scene.',
    propsSchema: z
      .object({
        source: z.string().min(1),
        width: z.number().positive(),
        height: z.number().positive(),
        fit: z.enum(['contain', 'cover', 'stretch']),
        opacity: z.number().min(0).max(1),
      })
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
  });
}

registerBuiltins();

export const motionVector3Schema = vector3Schema;
