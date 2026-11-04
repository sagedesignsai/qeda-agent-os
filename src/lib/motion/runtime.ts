import type { MotionDocument, MotionNode } from './types';

/** Explicit runtime input values. Runtime state is separate from editor state. */
export type MotionRuntimeValue = boolean | number | string;
export type MotionRuntimeInputs = Readonly<Record<string, MotionRuntimeValue>>;
export type MotionRuntimeState = Readonly<Record<string, MotionRuntimeValue>>;

export type MotionRuntimeEvent = {
  type: string;
  payload?: Readonly<Record<string, MotionRuntimeValue>>;
};

export type MotionRuntimeTransition = {
  id: string;
  from: string;
  to: string;
  on: string;
  priority: number;
};

export type MotionRuntimeDefinition = {
  id: string;
  initialState: string;
  states: readonly string[];
  transitions: readonly MotionRuntimeTransition[];
};

export type MotionRuntimeSnapshot = {
  sceneId: string;
  time: number;
  inputs: MotionRuntimeInputs;
  state: MotionRuntimeState;
  nodes: MotionNode[];
};

export type MotionRuntimeContext = {
  inputs?: MotionRuntimeInputs;
  state?: MotionRuntimeState;
  events?: readonly MotionRuntimeEvent[];
};

/**
 * Validates the runtime boundary without interpreting editor-only properties.
 * This is intentionally conservative until state-machine schema semantics land.
 */
export function validateRuntimeContext(context: MotionRuntimeContext): void {
  if (context.events?.some((event) => !event.type.trim())) {
    throw new Error('Runtime events must have a non-empty type.');
  }
  for (const [name, value] of Object.entries(context.inputs ?? {})) {
    if (!name.trim() || (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string')) {
      throw new Error(`Runtime input "${name}" is invalid.`);
    }
  }
}

/**
 * Creates a runtime snapshot from an already evaluated scene. No mutation is
 * performed and no renderer/editor state is consulted, keeping playback and
 * future interactive delivery deterministic.
 */
export function createRuntimeSnapshot(
  document: Pick<MotionDocument, 'activeSceneId'> | { id: string },
  time: number,
  nodes: MotionNode[],
  context: MotionRuntimeContext = {},
): MotionRuntimeSnapshot {
  if (!Number.isFinite(time)) throw new Error('Runtime time must be finite.');
  validateRuntimeContext(context);
  return {
    sceneId: 'id' in document ? document.id : document.activeSceneId,
    time,
    inputs: { ...(context.inputs ?? {}) },
    state: { ...(context.state ?? {}) },
    nodes: nodes.map((node) => ({ ...node, transform: { ...node.transform }, props: { ...node.props } })),
  };
}
