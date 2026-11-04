/**
 * lib/motion/node-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The registry engine: registration, lookup, defaults, validation, animatable
 * paths, and the JSON-Schema description shared by the editor and the engine
 * manifest.
 *
 * Primitive definitions live in `./nodes` (one module per category) so a new node
 * type is a definition file plus one entry in `./nodes/index.ts`. Keeping the
 * engine here means definitions never import the registry that loads them.
 */

import { z } from 'zod';

import { MOTION_NODE_TYPES } from './nodes';
import { motionVector3Schema } from './nodes/definition';
import type {
  MotionNodeTypeDefinition,
  MotionNodeTypeDescription,
} from './nodes/definition';
import type { MotionNode, MotionNodeTransform } from './types';

export type {
  MotionNodeCategory,
  MotionNodeTypeDefinition,
  MotionNodeTypeDescription,
  MotionPropertyHint,
} from './nodes/definition';
export { MOTION_NODE_TYPES } from './nodes';
export { motionVector3Schema } from './nodes/definition';

const identityTransform: MotionNodeTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

const nodeTypes = new Map<string, MotionNodeTypeDefinition>();
const descriptions = new Map<string, MotionNodeTypeDescription>();

const transformSchema = z.object({
  position: motionVector3Schema.optional(),
  rotation: motionVector3Schema.optional(),
  scale: motionVector3Schema.optional(),
});

/**
 * Transform axes animate for every registered type (see `hasAnimatableProperty`),
 * so the description must publish them; otherwise the engine manifest would tell
 * agents that only the type's own props are keyable.
 */
const transformAnimatableProperties = {
  'position.x': { description: 'Local X position in scene units.' },
  'position.y': { description: 'Local Y position in scene units.' },
  'position.z': { description: 'Local Z position in scene units.' },
  'rotation.x': { description: 'Local X rotation in radians.' },
  'rotation.y': { description: 'Local Y rotation in radians.' },
  'rotation.z': { description: 'Local Z rotation in radians.' },
  'scale.x': { description: 'Local X scale multiplier.' },
  'scale.y': { description: 'Local Y scale multiplier.' },
  'scale.z': { description: 'Local Z scale multiplier.' },
};

function describeMotionNodeType(definition: MotionNodeTypeDefinition): MotionNodeTypeDescription {
  const {
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
  } = definition;
  return {
    id,
    label,
    category,
    description,
    animatableProperties: { ...transformAnimatableProperties, ...animatableProperties },
    defaultProps,
    ...(defaultTransform ? { defaultTransform } : {}),
    properties: z.toJSONSchema(propsSchema) as Record<string, unknown>,
    ...(allowedParents ? { allowedParents } : {}),
    ...(propertyHints ? { propertyHints } : {}),
  };
}

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
  // Descriptions convert the Zod schema to JSON Schema. Both the add menus and
  // the engine manifest read them, so pay that cost once per registration.
  descriptions.set(definition.id, describeMotionNodeType(definition));
}

export function getMotionNodeType(type: string): MotionNodeTypeDefinition | undefined {
  return nodeTypes.get(type);
}

export function listMotionNodeTypes(): MotionNodeTypeDescription[] {
  return [...descriptions.values()];
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
  const parsedTransform = transformSchema.safeParse(definition.defaultTransform ?? {});
  if (!parsedTransform.success) {
    throw new MotionNodeError(`Invalid default transform for node type "${type}".`);
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
      ...parsedTransform.data,
    },
    props: parsedProps.data,
  };
}

export function validateMotionNode(node: MotionNode): MotionNode {
  const definition = getMotionNodeType(node.type);
  if (!definition) throw new MotionNodeError(`Unknown Motion node type "${node.type}".`);
  // Merge with defaultProps so missing props get their default values.
  // Only defined, non-null values from node.props override defaults — this
  // prevents `undefined` from a saved node from erasing the default.
  const filteredProps = Object.fromEntries(
    Object.entries(node.props).filter(([, v]) => v !== undefined && v !== null),
  );
  const merged = { ...definition.defaultProps, ...filteredProps };
  const result = definition.propsSchema.safeParse(merged);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new MotionNodeError(
      `Node "${node.id}" has invalid properties at ${first?.path.join('.') || 'props'}: ${first?.message ?? 'invalid value'}`,
    );
  }
  // Preserve any extra props not in the schema (result.data only contains
  // schema-known keys).  Unknown props are valid — they may be custom data,
  // future schema additions, or agent-authored metadata.
  const validatedProps = { ...result.data, ...filteredProps };
  return { ...node, props: validatedProps };
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

for (const definition of MOTION_NODE_TYPES) registerMotionNodeType(definition);
