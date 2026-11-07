/**
 * lib/trace/filters/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Nova Trace filter model. A `TraceFilter` is a serialisable description of
 * one SVG `<filter>` element and its `<fe*>` primitives, authored in the
 * inspector rather than as raw SVG markup.
 *
 * Keeping it structured (instead of a free-form string) is what lets the
 * inspector render per-primitive controls — X/Y/Blur/Spread/Color for a drop
 * shadow, stdDeviation for a glow, scale for a displacement, etc. — and round-
 * trip back into `project.defs` as valid SVG on every commit.
 *
 * Filter params are not animatable tracks in SVG, so the element-level
 * `filter` attribute (a `url(#id)` reference) is the animatable knob: switch
 * between two filter variants at a keyframe, or cross-fade two copies.
 */

export type FilterPrimitiveKind =
  | 'feGaussianBlur'
  | 'feOffset'
  | 'feFlood'
  | 'feComposite'
  | 'feMerge'
  | 'feMergeNode'
  | 'feBlend'
  | 'feColorMatrix'
  | 'feComponentTransfer'
  | 'feFuncR'
  | 'feFuncG'
  | 'feFuncB'
  | 'feFuncA'
  | 'feDisplacementMap'
  | 'feTurbulence'
  | 'feMorphology'
  | 'feConvolveMatrix'
  | 'feDiffuseLighting'
  | 'feSpecularLighting'
  | 'feDistantLight'
  | 'fePointLight'
  | 'feSpotLight'
  | 'feImage'
  | 'feTile'
  | 'feDropShadow'
  | 'feMergeNodeSource';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type CompositeOperator =
  | 'over'
  | 'in'
  | 'out'
  | 'atop'
  | 'xor'
  | 'arithmetic'
  | 'source-over'
  | 'source-in'
  | 'source-out'
  | 'source-atop'
  | 'destination-over'
  | 'destination-in'
  | 'destination-out'
  | 'destination-atop';

export type MorphologyOperator = 'erode' | 'dilate';

export type ColorMatrixType =
  | 'matrix'
  | 'saturate'
  | 'hueRotate'
  | 'luminanceToAlpha';

export type TurbulenceType = 'fractalNoise' | 'turbulence';

export type ChannelSelector = 'R' | 'G' | 'B' | 'A';

export type LightSourceKind = 'distant' | 'point' | 'spot';

/**
 * A primitive param value. Scalars map straight to SVG attributes; string
 * arrays carry the `feMerge` node list (`mergeNodes`), which is serialised as
 * child `<feMergeNode>` elements rather than as an attribute.
 */
export type FilterParamValue = string | number | boolean | string[];

export type FilterPrimitive = {
  id: string;
  kind: FilterPrimitiveKind;
  /** Result name used as `in`/`in2` by later primitives. Defaults to the id. */
  result?: string;
  in?: string;
  in2?: string;
  params?: Record<string, FilterParamValue>;
};

export type TraceFilter = {
  /** SVG id, referenced by elements as `filter="url(#<id>)"`. */
  id: string;
  label: string;
  /** Category shown in the Effects list. */
  kind:
    | 'dropShadow'
    | 'glow'
    | 'blur'
    | 'color'
    | 'distort'
    | 'edge'
    | 'composite'
    | 'blend'
    | 'light'
    | 'custom';
  /** Filter region expansion as a percent beyond the element bounds. Defaults to 10. */
  region?: number;
  /** SVG `color-interpolation-filters`. Defaults to "linearRGB". */
  colorSpace?: 'linearRGB' | 'sRGB';
  primitives: FilterPrimitive[];
};

export type FilterPreset = {
  id: string;
  label: string;
  kind: TraceFilter['kind'];
  /** Human-readable summary, e.g. "Soft drop shadow behind text". */
  summary: string;
  filter: Omit<TraceFilter, 'id'>;
};