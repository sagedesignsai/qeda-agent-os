export type GenerativeBackgroundStyle =
  | 'bauhaus'
  | 'waves'
  | 'plasma'
  | 'aurora'
  | 'terrain'
  | 'orbits'
  | 'trails';

export type BauhausShapeMode =
  | 'mixed'
  | 'quarters'
  | 'petals'
  | 'circles';

export interface GenerativeBackgroundConfig {
  style: GenerativeBackgroundStyle;
  paletteId: string;
  baseColor: string;
  colors: string[];
  animated: boolean;
  speed: number;
  seed: number;
  density: number;
  intensity: number;
  angle: number;
  shapeMode: BauhausShapeMode;
  audioReactive?: boolean;
}

export interface BackgroundPalette {
  id: string;
  name: string;
  baseColor: string;
  colors: readonly [string, string, string, string, string];
}

export interface GenerativeBackgroundPreset {
  id: string;
  name: string;
  description: string;
  config: GenerativeBackgroundConfig;
}

export interface ClassicBackgroundPreset {
  name: string;
  value: string;
}
