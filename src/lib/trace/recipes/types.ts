import type { TraceElement } from '../types';

export type RecipeId =
  'lower-third' | 'progress-ring' | 'bar-chart' | 'kinetic-text' | 'counter';

export interface BaseRecipeOptions {
  x?: number;
  y?: number;
  name?: string;
  sceneId?: string | null;
  [key: string]: any;
}

export interface LowerThirdRecipeOptions extends BaseRecipeOptions {
  title?: string;
  subtitle?: string;
  accentColor?: string;
  cardBg?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface ProgressRingRecipeOptions extends BaseRecipeOptions {
  radius?: number;
  thickness?: number;
  progress?: number;
  progressColor?: string;
  trackColor?: string;
  showPercentageLabel?: boolean;
  durationMs?: number;
}

export interface BarChartRecipeOptions extends BaseRecipeOptions {
  bars?: Array<{ id: string; label: string; value: number; color?: string }>;
  maxVal?: number;
  width?: number;
  height?: number;
  barSpacing?: number;
  barRadius?: number;
  orientation?: 'vertical' | 'horizontal';
  durationMs?: number;
}

export interface KineticTextRecipeOptions extends BaseRecipeOptions {
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  fill?: string;
  effect?: 'fade' | 'slide-up' | 'pop';
  staggerMs?: number;
  durationMs?: number;
}

export interface CounterRecipeOptions extends BaseRecipeOptions {
  startVal?: number;
  endVal?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  caption?: string;
  fontSize?: number;
  fill?: string;
  durationMs?: number;
}

export interface ExpandedRecipe {
  rootId: string;
  root: TraceElement;
  children: TraceElement[];
}

export type RecipeCompiler<T extends BaseRecipeOptions = BaseRecipeOptions> = (
  options: T,
  idFactory: (prefix: string) => string,
) => ExpandedRecipe;
