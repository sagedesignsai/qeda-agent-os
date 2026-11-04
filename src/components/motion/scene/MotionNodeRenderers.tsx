/**
 * components/motion/scene/MotionNodeRenderers.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Public surface for node renderers. The registry engine lives in
 * `./renderer-registry` and the per-category implementations in `./nodes/*`;
 * importing this module performs the registration side effect.
 */

import './nodes';

export type { MotionThreeNodeRenderer } from './renderer-registry';
export { getMotionThreeRenderer, registerMotionThreeRenderer } from './renderer-registry';
export { MissingAssetRenderer, MissingRenderer } from './nodes/placeholders';
