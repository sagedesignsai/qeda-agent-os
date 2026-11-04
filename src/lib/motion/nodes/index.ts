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
import { geometryPrimitives } from './primitives';
import { productNodes } from './product';
import { sceneGroup } from './scene';
import { shapeEllipse, shapeRect } from './shapes';
import { stageBackdrop, stageGround, stagePedestal } from './stage';
import { screenImage, screenVideo } from './surfaces';
import { textBody, textTitle } from './text';
import { uiNodes } from './ui';

export const MOTION_NODE_TYPES: readonly MotionNodeTypeDefinition[] = [
  sceneGroup,
  cameraPerspective,
  ...deviceNodes,
  ...geometryPrimitives,
  ...productNodes,
  ...uiNodes,
  screenImage,
  screenVideo,
  textTitle,
  textBody,
  shapeRect,
  shapeEllipse,
  stageGround,
  stagePedestal,
  stageBackdrop,
  modelGltf,
  lightAmbient,
  lightDirectional,
  lightPoint,
];

export type { MotionNodeTypeDefinition } from './definition';
