/**
 * lib/studio/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public surface of the Studio image-composing foundation.
 *
 * One barrel, because a later phase (renderer, IPC, DB) has to import Studio
 * types and helpers from a single place — and because it is the file that
 * makes the module's scope legible: pure document model, pure compiler, frozen
 * tokens. Nothing here touches Electron, React, IPC or the database, so this
 * module can be exercised in a plain unit test and imported from either
 * process.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {
  // Document model
  AlignSchema,
  AnimationSchema,
  BackgroundSchema,
  ColorSchema,
  DirectionSchema,
  DocSchema,
  FitSchema,
  GradientStopSchema,
  GroupSchema,
  ImageSrcSchema,
  ImageSchema,
  JustifySchema,
  NodeSchema,
  ShapeKindSchema,
  ShapeSchema,
  TextSchema,
  FrameSchema,
  TokenNameSchema,
  parseDoc,
  safeParseDoc,
  PRESETS,
  PRESET_LIST,
} from './doc';

export type {
  Align,
  AnimationPreset,
  FrameNode,
  GradientStop,
  GroupNode,
  ImageNode,
  Justify,
  ShapeNode,
  StudioDoc,
  StudioNode,
  TextNode,
} from './doc';

export {
  // Compiler
  compileDoc,
  docOutline,
  escapeAttr,
  escapeText,
} from './compile';

export {
  // Tokens
  TOKEN_COLORS,
  TOKEN_NAMES,
  TOKEN_VALUES,
  tokenVarName,
} from './tokens';

export type { TokenName } from './tokens';
