/**
 * components/motion/scene/nodes/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds every registered node type to its renderer. Importing this module is the
 * registration side effect; `MotionNodeRenderers` imports it so the canvas keeps
 * one import surface.
 */

import { registerMotionThreeRenderer } from '../renderer-registry';
import { DeviceRenderer } from './geometry';
import {
  AmbientLightRenderer,
  DirectionalLightRenderer,
  PointLightRenderer,
} from './lighting';
import { ModelRenderer } from './model';
import { CameraRenderer, GroupRenderer } from './scene';
import { ShapeRenderer } from './shapes';
import { GroundRenderer } from './stage';
import { ImageScreenRenderer } from './surfaces';
import { TextNodeRenderer } from './text';
import { VideoScreenRenderer } from './video';

registerMotionThreeRenderer('scene.group', GroupRenderer);
registerMotionThreeRenderer('camera.perspective', CameraRenderer);
registerMotionThreeRenderer('device.tablet', DeviceRenderer);
registerMotionThreeRenderer('device.phone', DeviceRenderer);
registerMotionThreeRenderer('device.laptop', DeviceRenderer);
registerMotionThreeRenderer('device.monitor', DeviceRenderer);
registerMotionThreeRenderer('screen.image', ImageScreenRenderer);
registerMotionThreeRenderer('screen.video', VideoScreenRenderer);
registerMotionThreeRenderer('text.title', TextNodeRenderer);
registerMotionThreeRenderer('text.body', TextNodeRenderer);
registerMotionThreeRenderer('shape.rect', ShapeRenderer);
registerMotionThreeRenderer('shape.ellipse', ShapeRenderer);
registerMotionThreeRenderer('stage.ground', GroundRenderer);
registerMotionThreeRenderer('model.gltf', ModelRenderer);
registerMotionThreeRenderer('light.ambient', AmbientLightRenderer);
registerMotionThreeRenderer('light.directional', DirectionalLightRenderer);
registerMotionThreeRenderer('light.point', PointLightRenderer);
