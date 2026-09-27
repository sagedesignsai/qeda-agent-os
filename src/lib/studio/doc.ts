/**
 * lib/studio/doc.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Studio composition document: a closed, validated, structured tree that
 * *compiles* to HTML. The HTML is a render target, never the source of truth.
 *
 * Why structured instead of "an HTML string":
 *   • A raw string cannot be validated, diffed, or safely merged. Two plugins
 *     editing the same composition concurrently have nothing to reconcile.
 *   • An LLM cannot reliably edit a 200-line string. It can reliably emit and
 *     mutate a discriminated node tree, which is also what makes "change the
 *     headline size" a one-field operation rather than a text surgery.
 *   • Everything is semantic. Colours are `TokenName`s, never hex, so
 *     compositions compose with each other and stay re-themeable *as data*.
 *
 * Non-obvious constraints encoded here:
 *   • The node union is CLOSED (five kinds, discriminated on `kind`). A
 *     document is a tree over a fixed vocabulary; extending it is a schema
 *     change, not a plugin's prerogative.
 *   • `background` and `Color` are values, not nodes. They are discriminated
 *     unions too, so `kind` is unambiguous everywhere in the tree.
 *   • `animation` is present in v1 even though it only compiles to a keyframe.
 *     A later motion/video phase then becomes an additive change instead of a
 *     document rewrite, which is exactly when you least want one.
 *   • Image sources are restricted at the *schema* level, so a remote URL is a
 *     validation error rather than a silently dropped or lazily fetched asset.
 *     See `ImageSrcSchema` for why.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';
import { TOKEN_NAMES } from './tokens';

export type { TokenName } from './tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** A finite, non-negative pixel length. */
const Px = z.number().finite().min(0);
/** A positive pixel length (something that must actually occupy space). */
const PxPositive = z.number().finite().positive();
/** A unitless line-height multiplier. */
const LineHeight = z.number().finite().positive();
/** A CSS hex colour: `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
const Hex = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'Expected a CSS hex colour such as #3384f0 or #3384f0cc.',
  });

/** Semantic design-token name. Closed, derived from the token value map. */
export const TokenNameSchema = z.enum(TOKEN_NAMES as [TokenName, ...TokenName[]]);

/** Cross-axis alignment within a line. */
export const AlignSchema = z.enum(['left', 'center', 'right']);
/** Cross-axis alignment, inferred. */
export type Align = z.infer<typeof AlignSchema>;
/**
 * Main-axis distribution. Flex-idiomatic rather than reusing `AlignSchema`,
 * because "space-between" is the whole point of a spread layout (a story
 * pinning its footer to the bottom edge) and has no `left`/`right` analogue.
 */
export const JustifySchema = z.enum([
  'start',
  'center',
  'end',
  'space-between',
  'space-around',
  'space-evenly',
]);
export type Justify = z.infer<typeof JustifySchema>;
/** Box direction. */
export const DirectionSchema = z.enum(['row', 'column']);
/** How an image fills its box. */
export const FitSchema = z.enum(['cover', 'contain']);
/** Geometric primitive. */
export const ShapeKindSchema = z.enum(['rect', 'ellipse', 'line']);
/** A named motion preset. `none` is the explicit opt-out. */
export const AnimationSchema = z.enum([
  'none',
  'fade-in',
  'rise-in',
  'slide-in-left',
  'scale-in',
]);
/** Named motion preset, inferred. */
export type AnimationPreset = z.infer<typeof AnimationSchema>;

/**
 * Colour value. Same shape as `Background` minus the gradient: a colour is a
 * paint, and a gradient is a background.
 */
export const ColorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('token'), name: TokenNameSchema }),
  z.object({ kind: z.literal('hex'), value: Hex }),
  z.object({
    kind: z.literal('rgba'),
    rgba: z.tuple([
      z.number().finite().min(0).max(255),
      z.number().finite().min(0).max(255),
      z.number().finite().min(0).max(255),
      z.number().finite().min(0).max(1),
    ]),
  }),
]);

/** One gradient stop. Exactly one of `token` / `hex` must be present. */
const GradientStopSchema = z
  .object({
    token: TokenNameSchema.optional(),
    hex: Hex.optional(),
    offset: z.number().finite().min(0).max(1),
  })
  .refine((s) => (s.token !== undefined) !== (s.hex !== undefined), {
    message: 'A gradient stop needs exactly one of `token` or `hex`.',
  });

/** One gradient stop, inferred. */
export type GradientStop = z.infer<typeof GradientStopSchema>;

/** Box background: a token, a raw colour, or a linear gradient. */
export const BackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('token'), name: TokenNameSchema }),
  z.object({ kind: z.literal('hex'), value: Hex }),
  z.object({
    kind: z.literal('linear-gradient'),
    angle: z.number().finite().min(-360).max(360),
    stops: z.array(GradientStopSchema).min(2),
  }),
]);

/**
 * Image source policy — enforced here so it is a validation error, never a
 * silent drop.
 *
 * Accepted:
 *   • `data:image/*` — self-contained, deterministic, survives export.
 *   • An absolute local filesystem path (`/…`, `C:\…`) — compiled to `file://`.
 * Rejected: `http:`, `https:`, protocol-relative `//host/…`, and every other
 * scheme. A remote image makes an export non-deterministic (it changes if the
 * asset does), leaks the viewer's IP/referrer to whoever controls the URL, and
 * is the classic tracking-pixel channel. An exported image has no business
 * doing any of that.
 */
export const ImageSrcSchema = z.string().min(1).superRefine((src, ctx) => {
  const isDataImage = /^data:image\/[a-z0-9.+-]+[;,]/i.test(src);
  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(src);
  const isPosixAbsolute = src.startsWith('/') && !src.startsWith('//');
  if (isDataImage || isWindowsPath || isPosixAbsolute) return;
  ctx.addIssue({
    code: 'custom',
    message:
      'Image source must be a `data:image/…` URI or an absolute local filesystem path. ' +
      'Remote (`http:`/`https:`/`//`) sources are rejected: they make exports nondeterministic and remote images are a tracking channel.',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Node union
// ─────────────────────────────────────────────────────────────────────────────

export interface FrameNode {
  kind: 'frame';
  w: number;
  h: number;
  background: z.infer<typeof BackgroundSchema>;
  padding: number;
  gap: number;
  align: z.infer<typeof AlignSchema>;
  justify: Justify;
  direction: z.infer<typeof DirectionSchema>;
  radius: number;
  animation?: z.infer<typeof AnimationSchema>;
  children: StudioNode[];
}

export interface TextNode {
  kind: 'text';
  content: string;
  size: number;
  weight: number;
  color: z.infer<typeof ColorSchema>;
  align: z.infer<typeof AlignSchema>;
  lineHeight: number;
  letterSpacing: number;
  maxWidth: number;
  animation?: z.infer<typeof AnimationSchema>;
}

export interface ImageNode {
  kind: 'image';
  src: string;
  fit: z.infer<typeof FitSchema>;
  radius: number;
  w?: number;
  h?: number;
}

export interface ShapeNode {
  kind: 'shape';
  shape: z.infer<typeof ShapeKindSchema>;
  fill: z.infer<typeof ColorSchema>;
  w: number;
  h: number;
  radius: number;
}

export interface GroupNode {
  kind: 'group';
  opacity?: number;
  rotate?: number;
  scale?: number;
  children: StudioNode[];
}

/** The closed node union. Exactly five kinds, no more. */
export type StudioNode =
  | FrameNode
  | TextNode
  | ImageNode
  | ShapeNode
  | GroupNode;

const FrameSchema: z.ZodType<FrameNode> = z.object({
  kind: z.literal('frame'),
  w: PxPositive,
  h: PxPositive,
  background: BackgroundSchema,
  padding: Px,
  gap: Px,
  align: AlignSchema,
  justify: JustifySchema,
  direction: DirectionSchema,
  radius: Px,
  animation: AnimationSchema.optional(),
  children: z.array(z.lazy((): z.ZodType<StudioNode> => NodeSchema)),
});

const TextSchema: z.ZodType<TextNode> = z.object({
  kind: z.literal('text'),
  content: z.string(),
  size: PxPositive,
  weight: z.number().finite().int().min(100).max(900),
  color: ColorSchema,
  align: AlignSchema,
  lineHeight: LineHeight,
  letterSpacing: z.number().finite(),
  maxWidth: PxPositive,
  animation: AnimationSchema.optional(),
});

const ImageSchema: z.ZodType<ImageNode> = z.object({
  kind: z.literal('image'),
  src: ImageSrcSchema,
  fit: FitSchema,
  radius: Px,
  w: PxPositive.optional(),
  h: PxPositive.optional(),
});

const ShapeSchema: z.ZodType<ShapeNode> = z.object({
  kind: z.literal('shape'),
  shape: ShapeKindSchema,
  fill: ColorSchema,
  w: Px,
  h: Px,
  radius: Px,
});

const GroupSchema: z.ZodType<GroupNode> = z.object({
  kind: z.literal('group'),
  opacity: z.number().finite().min(0).max(1).optional(),
  rotate: z.number().finite().min(-360).max(360).optional(),
  scale: z.number().finite().positive().optional(),
  children: z.array(z.lazy((): z.ZodType<StudioNode> => NodeSchema)),
});

/** The closed, discriminated node union. */
export const NodeSchema: z.ZodType<StudioNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    FrameSchema,
    TextSchema,
    ImageSchema,
    ShapeSchema,
    GroupSchema,
  ]),
);

/**
 * A whole composition: the document root is a `frame`, because a composition
 * always has an exact pixel size — that size is the artefact (1200×630 OG, 1080×1080
 * square, 1080×1920 story, …).
 */
export const DocSchema: z.ZodType<FrameNode> = FrameSchema;
export type StudioDoc = FrameNode;

/** Parse and throw on failure. Use when the caller has already validated. */
export function parseDoc(input: unknown): StudioDoc {
  return DocSchema.parse(input);
}

/** Parse without throwing. */
export function safeParseDoc(input: unknown) {
  return DocSchema.safeParse(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────

// Type-only constructors: they exist so the presets below stay readable. They
// add no defaults — a preset is a complete, explicit document, and nothing is
// inferred at runtime.
const frame = (p: Omit<FrameNode, 'kind'>): FrameNode => ({ kind: 'frame', ...p });
const text = (p: Omit<TextNode, 'kind'>): TextNode => ({ kind: 'text', ...p });
const shape = (p: Omit<ShapeNode, 'kind'>): ShapeNode => ({ kind: 'shape', ...p });
const group = (p: Omit<GroupNode, 'kind'>): GroupNode => ({ kind: 'group', ...p });

/**
 * Ready-made documents, all built from the token system. These are real
 * layouts, not placeholder boxes: each is the composition an author would
 * reach for at that aspect ratio.
 */
export const PRESETS = {
  /** 1200×630 — link preview / Open Graph card. */
  'og-1200x630': frame({
    w: 1200,
    h: 630,
    background: {
      kind: 'linear-gradient',
      angle: 135,
      stops: [
        { token: 'background', offset: 0 },
        { token: 'card', offset: 0.55 },
        { token: 'accent', offset: 1 },
      ],
    },
    padding: 80,
    gap: 28,
    align: 'left',
    justify: 'center',
    direction: 'column',
    radius: 0,
    children: [
      text({
        content: 'QEDA · STUDIO',
        size: 20,
        weight: 600,
        color: { kind: 'token', name: 'primary' },
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 6,
        maxWidth: 1040,
        animation: 'fade-in',
      }),
      text({
        content: 'Compose images like\nyou edit code.',
        size: 78,
        weight: 700,
        color: { kind: 'token', name: 'foreground' },
        align: 'left',
        lineHeight: 1.04,
        letterSpacing: -2.4,
        maxWidth: 940,
        animation: 'rise-in',
      }),
      shape({
        shape: 'rect',
        fill: { kind: 'token', name: 'primary' },
        w: 96,
        h: 5,
        radius: 3,
      }),
      text({
        content:
          'Structured documents that compile to deterministic, self-contained HTML. No classes, no network, no surprises.',
        size: 27,
        weight: 400,
        color: { kind: 'token', name: 'muted-foreground' },
        align: 'left',
        lineHeight: 1.45,
        letterSpacing: 0,
        maxWidth: 860,
      }),
      frame({
        w: 1040,
        h: 44,
        background: { kind: 'token', name: 'muted' },
        padding: 0,
        gap: 14,
        align: 'center',
        justify: 'start',
        direction: 'row',
        radius: 12,
        children: [
          shape({
            shape: 'ellipse',
            fill: { kind: 'token', name: 'chart-1' },
            w: 18,
            h: 18,
            radius: 9,
          }),
          shape({
            shape: 'ellipse',
            fill: { kind: 'token', name: 'chart-2' },
            w: 18,
            h: 18,
            radius: 9,
          }),
          shape({
            shape: 'ellipse',
            fill: { kind: 'token', name: 'chart-3' },
            w: 18,
            h: 18,
            radius: 9,
          }),
          shape({
            shape: 'ellipse',
            fill: { kind: 'token', name: 'chart-4' },
            w: 18,
            h: 18,
            radius: 9,
          }),
          text({
            content: 'five presets · one grammar',
            size: 22,
            weight: 500,
            color: { kind: 'token', name: 'muted-foreground' },
            align: 'left',
            lineHeight: 1.2,
            letterSpacing: 0.4,
            maxWidth: 900,
          }),
        ],
      }),
    ],
  }),

  /** 1080×1080 — square post. */
  'square-1080x1080': frame({
    w: 1080,
    h: 1080,
    background: { kind: 'token', name: 'background' },
    padding: 96,
    gap: 36,
    align: 'center',
    justify: 'center',
    direction: 'column',
    radius: 0,
    children: [
      group({
        opacity: 1,
        children: [
          shape({
            shape: 'ellipse',
            fill: { kind: 'token', name: 'primary' },
            w: 88,
            h: 88,
            radius: 44,
          }),
        ],
      }),
      text({
        content: '01',
        size: 34,
        weight: 700,
        color: { kind: 'token', name: 'primary' },
        align: 'center',
        lineHeight: 1,
        letterSpacing: 10,
        maxWidth: 888,
        animation: 'fade-in',
      }),
      text({
        content: 'One document.\nFive node kinds.\nZero class names.',
        size: 96,
        weight: 700,
        color: { kind: 'token', name: 'foreground' },
        align: 'center',
        lineHeight: 1.06,
        letterSpacing: -3,
        maxWidth: 888,
        animation: 'rise-in',
      }),
      text({
        content:
          'Every colour is a design token, so two compositions made months apart still belong to the same system.',
        size: 30,
        weight: 400,
        color: { kind: 'token', name: 'muted-foreground' },
        align: 'center',
        lineHeight: 1.5,
        letterSpacing: 0,
        maxWidth: 720,
      }),
      frame({
        w: 888,
        h: 2,
        background: { kind: 'token', name: 'border' },
        padding: 0,
        gap: 0,
        align: 'center',
        justify: 'center',
        direction: 'row',
        radius: 1,
        children: [],
      }),
      text({
        content: 'qeda · studio',
        size: 24,
        weight: 500,
        color: { kind: 'token', name: 'muted-foreground' },
        align: 'center',
        lineHeight: 1.2,
        letterSpacing: 3,
        maxWidth: 888,
      }),
    ],
  }),

  /** 1080×1920 — story / vertical. */
  'story-1080x1920': frame({
    w: 1080,
    h: 1920,
    background: {
      kind: 'linear-gradient',
      angle: 180,
      stops: [
        { token: 'card', offset: 0 },
        { token: 'background', offset: 0.62 },
        { token: 'accent', offset: 1 },
      ],
    },
    padding: 104,
    gap: 40,
    align: 'left',
    justify: 'space-between',
    direction: 'column',
    radius: 0,
    children: [
      frame({
        w: 872,
        h: 76,
        background: { kind: 'token', name: 'muted' },
        padding: 28,
        gap: 16,
        align: 'center',
        justify: 'start',
        direction: 'row',
        radius: 38,
        children: [
          shape({
            shape: 'ellipse',
            fill: { kind: 'token', name: 'chart-3' },
            w: 18,
            h: 18,
            radius: 9,
          }),
          text({
            content: 'NEW · MOTION PRESETS',
            size: 26,
            weight: 600,
            color: { kind: 'token', name: 'secondary-foreground' },
            align: 'left',
            lineHeight: 1.2,
            letterSpacing: 3,
            maxWidth: 760,
          }),
        ],
      }),
      group({
        children: [
          text({
            content: 'Story',
            size: 168,
            weight: 800,
            color: { kind: 'token', name: 'foreground' },
            align: 'left',
            lineHeight: 0.98,
            letterSpacing: -6,
            maxWidth: 872,
            animation: 'scale-in',
          }),
          text({
            content:
              'Tall compositions are the same document model at a different size. Nothing is special-cased.',
            size: 34,
            weight: 400,
            color: { kind: 'token', name: 'muted-foreground' },
            align: 'left',
            lineHeight: 1.5,
            letterSpacing: 0,
            maxWidth: 760,
            animation: 'slide-in-left',
          }),
        ],
      }),
      frame({
        w: 872,
        h: 420,
        background: { kind: 'token', name: 'card' },
        padding: 44,
        gap: 22,
        align: 'left',
        justify: 'center',
        direction: 'column',
        radius: 32,
        children: [
          shape({
            shape: 'rect',
            fill: { kind: 'token', name: 'chart-5' },
            w: 120,
            h: 8,
            radius: 4,
          }),
          shape({
            shape: 'line',
            fill: { kind: 'token', name: 'border' },
            w: 784,
            h: 1,
            radius: 0,
          }),
          text({
            content: '1080 × 1920',
            size: 44,
            weight: 600,
            color: { kind: 'token', name: 'card-foreground' },
            align: 'left',
            lineHeight: 1.2,
            letterSpacing: -0.8,
            maxWidth: 784,
          }),
          text({
            content: 'pixel-exact, no scrollbars, no external anything.',
            size: 26,
            weight: 400,
            color: { kind: 'token', name: 'muted-foreground' },
            align: 'left',
            lineHeight: 1.4,
            letterSpacing: 0,
            maxWidth: 784,
          }),
        ],
      }),
      shape({
        shape: 'rect',
        fill: { kind: 'token', name: 'primary' },
        w: 200,
        h: 6,
        radius: 3,
      }),
    ],
  }),
} satisfies Record<string, StudioDoc>;

/** Every preset, in a stable order. */
export const PRESET_LIST: StudioDoc[] = Object.values(PRESETS);
