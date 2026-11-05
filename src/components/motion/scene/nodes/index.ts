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
  SpotLightRenderer,
} from './lighting';
import { ModelRenderer } from './model';
import {
  BoxRenderer,
  CapsuleRenderer,
  ConeRenderer,
  CylinderRenderer,
  IcosahedronRenderer,
  PlaneRenderer,
  RingRenderer,
  SphereRenderer,
  TorusKnotRenderer,
  TorusRenderer,
} from './primitives';
import {
  ApparelRenderer,
  BottleRenderer,
  CanRenderer,
  JarRenderer,
  MugRenderer,
  PackagingBoxRenderer,
  PouchRenderer,
  TubeRenderer,
} from './product';
import { CameraRenderer, GroupRenderer } from './scene';
import { ShapeRenderer } from './shapes';
import { BackdropRenderer, GridRenderer, GroundRenderer, ParticlesRenderer, PedestalRenderer } from './stage';
import { ImageScreenRenderer } from './surfaces';
import { TextNodeRenderer } from './text';
import { AnnotationRenderer, BrowserRenderer, ChatRenderer, CodeCardRenderer, CursorRenderer, NotificationRenderer, TerminalRenderer } from './ui';
import { VideoScreenRenderer } from './video';
import { ArrowRenderer, BadgeRenderer, LineRenderer, LowerThirdRenderer, ProgressRingRenderer, TickerRenderer, WaveformRenderer } from './graphics';
import { BarChartRenderer, DonutChartRenderer, KpiRenderer, LineChartRenderer, ProgressBarRenderer, StatGridRenderer } from './data';
import { CaptionRenderer, QuoteRenderer } from './text-extras';
import { ProceduralRenderer } from './procedural';

registerMotionThreeRenderer('scene.group', GroupRenderer);
registerMotionThreeRenderer('camera.perspective', CameraRenderer);
registerMotionThreeRenderer('device.tablet', DeviceRenderer);
registerMotionThreeRenderer('device.phone', DeviceRenderer);
registerMotionThreeRenderer('device.laptop', DeviceRenderer);
registerMotionThreeRenderer('device.monitor', DeviceRenderer);
registerMotionThreeRenderer('geometry.box', BoxRenderer);
registerMotionThreeRenderer('geometry.sphere', SphereRenderer);
registerMotionThreeRenderer('geometry.cylinder', CylinderRenderer);
registerMotionThreeRenderer('geometry.torus', TorusRenderer);
registerMotionThreeRenderer('geometry.cone', ConeRenderer);
registerMotionThreeRenderer('geometry.capsule', CapsuleRenderer);
registerMotionThreeRenderer('geometry.icosahedron', IcosahedronRenderer);
registerMotionThreeRenderer('geometry.torus-knot', TorusKnotRenderer);
registerMotionThreeRenderer('geometry.ring', RingRenderer);
registerMotionThreeRenderer('geometry.plane', PlaneRenderer);
registerMotionThreeRenderer('screen.image', ImageScreenRenderer);
registerMotionThreeRenderer('screen.video', VideoScreenRenderer);
registerMotionThreeRenderer('text.title', TextNodeRenderer);
registerMotionThreeRenderer('text.body', TextNodeRenderer);
registerMotionThreeRenderer('text.caption', CaptionRenderer);
registerMotionThreeRenderer('text.quote', QuoteRenderer);
registerMotionThreeRenderer('shape.rect', ShapeRenderer);
registerMotionThreeRenderer('shape.ellipse', ShapeRenderer);
registerMotionThreeRenderer('stage.ground', GroundRenderer);
registerMotionThreeRenderer('stage.pedestal', PedestalRenderer);
registerMotionThreeRenderer('stage.backdrop', BackdropRenderer);
registerMotionThreeRenderer('stage.grid', GridRenderer);
registerMotionThreeRenderer('stage.particles', ParticlesRenderer);
registerMotionThreeRenderer('product.mug', MugRenderer);
registerMotionThreeRenderer('product.bottle', BottleRenderer);
registerMotionThreeRenderer('product.apparel', ApparelRenderer);
registerMotionThreeRenderer('product.box', PackagingBoxRenderer);
registerMotionThreeRenderer('product.can', CanRenderer);
registerMotionThreeRenderer('product.jar', JarRenderer);
registerMotionThreeRenderer('product.tube', TubeRenderer);
registerMotionThreeRenderer('product.pouch', PouchRenderer);
registerMotionThreeRenderer('ui.browser', BrowserRenderer);
registerMotionThreeRenderer('ui.code', CodeCardRenderer);
registerMotionThreeRenderer('ui.annotation', AnnotationRenderer);
registerMotionThreeRenderer('ui.terminal', TerminalRenderer);
registerMotionThreeRenderer('ui.chat', ChatRenderer);
registerMotionThreeRenderer('ui.cursor', CursorRenderer);
registerMotionThreeRenderer('ui.notification', NotificationRenderer);
registerMotionThreeRenderer('model.gltf', ModelRenderer);
registerMotionThreeRenderer('light.ambient', AmbientLightRenderer);
registerMotionThreeRenderer('light.directional', DirectionalLightRenderer);
registerMotionThreeRenderer('light.point', PointLightRenderer);
registerMotionThreeRenderer('light.spot', SpotLightRenderer);
registerMotionThreeRenderer('graphic.line', LineRenderer);
registerMotionThreeRenderer('graphic.arrow', ArrowRenderer);
registerMotionThreeRenderer('graphic.badge', BadgeRenderer);
registerMotionThreeRenderer('graphic.lower-third', LowerThirdRenderer);
registerMotionThreeRenderer('graphic.progress-ring', ProgressRingRenderer);
registerMotionThreeRenderer('graphic.waveform', WaveformRenderer);
registerMotionThreeRenderer('graphic.ticker', TickerRenderer);
registerMotionThreeRenderer('data.kpi', KpiRenderer);
registerMotionThreeRenderer('data.progress-bar', ProgressBarRenderer);
registerMotionThreeRenderer('data.bar-chart', BarChartRenderer);
registerMotionThreeRenderer('data.line-chart', LineChartRenderer);
registerMotionThreeRenderer('data.donut-chart', DonutChartRenderer);
registerMotionThreeRenderer('data.stat-grid', StatGridRenderer);
registerMotionThreeRenderer('procedural.array', ProceduralRenderer);
registerMotionThreeRenderer('procedural.radial', ProceduralRenderer);
registerMotionThreeRenderer('procedural.grid', ProceduralRenderer);
registerMotionThreeRenderer('procedural.scatter', ProceduralRenderer);
registerMotionThreeRenderer('procedural.curve', ProceduralRenderer);
