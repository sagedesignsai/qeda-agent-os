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
import { dataNodes } from './data';
import { graphicNodes } from './graphics';
import { lightAmbient, lightDirectional, lightPoint, lightSpot } from './lighting';
import { modelGltf } from './model';
import { proceduralNodes } from './procedural';
import { geometryPrimitives } from './primitives';
import { productNodes } from './product';
import { sceneGroup } from './scene';
import { shapeEllipse, shapeRect } from './shapes';
import { stageBackdrop, stageGrid, stageGround, stageParticles, stagePedestal } from './stage';
import { screenImage, screenVideo } from './surfaces';
import { textBody, textCaption, textQuote, textTitle } from './text';
import { uiNodes } from './ui';

export const MOTION_NODE_TYPES: readonly MotionNodeTypeDefinition[] = [
  sceneGroup,
  cameraPerspective,
  ...deviceNodes,
  ...geometryPrimitives,
  ...productNodes,
  ...graphicNodes,
  ...dataNodes,
  ...uiNodes,
  screenImage,
  screenVideo,
  textTitle,
  textBody,
  textCaption,
  textQuote,
  shapeRect,
  shapeEllipse,
  stageGround,
  stagePedestal,
  stageBackdrop,
  stageGrid,
  stageParticles,
  modelGltf,
  ...proceduralNodes,
  lightAmbient,
  lightDirectional,
  lightPoint,
  lightSpot,
];

export type { MotionNodeTypeDefinition } from './definition';
