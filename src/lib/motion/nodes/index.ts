/**
 * lib/motion/nodes/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The node library. Adding a primitive is one definition module plus one entry
 * here; the registry, add menu, inspector, engine manifest and renderer lookup
 * all follow from that.
 */

import { cameraPerspective } from './camera';
import type { MotionNodeTypeDefinition } from './definition';
import { deviceNodes } from './geometry';
import { lightAmbient, lightDirectional, lightPoint } from './lighting';
import { modelGltf } from './model';
import { sceneGroup } from './scene';
import { shapeEllipse, shapeRect } from './shapes';
import { stageGround } from './stage';
import { screenImage, screenVideo } from './surfaces';
import { textBody, textTitle } from './text';

export const MOTION_NODE_TYPES: readonly MotionNodeTypeDefinition[] = [
  sceneGroup,
  cameraPerspective,
  ...deviceNodes,
  screenImage,
  screenVideo,
  textTitle,
  textBody,
  shapeRect,
  shapeEllipse,
  stageGround,
  modelGltf,
  lightAmbient,
  lightDirectional,
  lightPoint,
];

export type { MotionNodeTypeDefinition } from './definition';
