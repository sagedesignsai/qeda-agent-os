import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  BACKGROUND_PALETTES,
  type BauhausShapeMode,
  type GenerativeBackgroundConfig,
  type GenerativeBackgroundStyle,
} from '@/lib/studio/render/background-generator';

const GENERATOR_STYLE_OPTIONS: Array<{
  value: GenerativeBackgroundStyle;
  label: string;
}> = [
  { value: 'bauhaus', label: 'Bauhaus Tiles' },
  { value: 'waves', label: 'Color Waves' },
  { value: 'plasma', label: 'Plasma Shader' },
  { value: 'aurora', label: 'Aurora Mesh' },
  { value: 'terrain', label: 'Dot Terrain' },
  { value: 'orbits', label: 'Orbital Rings' },
  { value: 'trails', label: 'Silk Trails' },
];

const BAUHAUS_SHAPE_OPTIONS: Array<{
  value: BauhausShapeMode;
  label: string;
}> = [
  { value: 'mixed', label: 'Mixed Geometry' },
  { value: 'quarters', label: 'Quarter Circles' },
  { value: 'petals', label: 'Petals & Leaves' },
  { value: 'circles', label: 'Circles & Arches' },
];

function densityLabelForStyle(style: GenerativeBackgroundStyle): string {
  if (style === 'bauhaus') return 'Rows';
  if (style === 'waves') return 'Wave bands';
  if (style === 'plasma') return 'Plasma lines';
  if (style === 'terrain') return 'Grid density';
  if (style === 'orbits') return 'Orbital rings';
  if (style === 'trails') return 'Light streams';
  return 'Mesh orbs';
}

function intensityLabelForStyle(style: GenerativeBackgroundStyle): string {
  if (style === 'bauhaus') return 'Tile gap';
  if (style === 'waves') return 'Wave curve';
  if (style === 'plasma') return 'Warp amount';
  if (style === 'terrain') return 'Wave height';
  if (style === 'orbits') return 'Trail length';
  if (style === 'trails') return 'Path curve';
  return 'Drift range';
}

export interface BackgroundInspectorSidebarProps {
  mode: 'generative' | 'classic';
  genConfig: GenerativeBackgroundConfig;
  classicBackground: string;
  classicColorValue: string;
  onUpdateGenConfig: (
    updater: (current: GenerativeBackgroundConfig) => GenerativeBackgroundConfig,
  ) => void;
  onApplyPalette: (paletteId: string) => void;
  onUpdatePaletteColor: (index: number, hex: string) => void;
  onClassicChange: (value: string) => void;
}

export function BackgroundInspectorSidebar({
  mode,
  genConfig,
  classicBackground,
  classicColorValue,
  onUpdateGenConfig,
  onApplyPalette,
  onUpdatePaletteColor,
  onClassicChange,
}: BackgroundInspectorSidebarProps) {
  return (
    <ScrollArea className="border-t border-border/60 bg-card/30 md:max-h-[calc(88vh-132px)] md:border-l md:border-t-0">
      <div className="p-4">
        {mode === 'generative' ? (
          <FieldGroup className="gap-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Shape &amp; Style
            </div>

            <Field>
              <FieldLabel>Generator style</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={genConfig.style}
                onValueChange={(value) => {
                  if (!value) return;
                  const nextStyle = value as GenerativeBackgroundStyle;
                  onUpdateGenConfig((current) => ({
                    ...current,
                    style: nextStyle,
                    density:
                      nextStyle === 'plasma' || nextStyle === 'terrain'
                        ? Math.max(8, current.density)
                        : Math.min(8, current.density),
                  }));
                }}
                className="grid w-full grid-cols-2"
              >
                {GENERATOR_STYLE_OPTIONS.map((opt) => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    className="h-7 justify-center text-[11px]"
                  >
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            {genConfig.style === 'bauhaus' && (
              <Field>
                <FieldLabel htmlFor="studio-addon-bg-shape">
                  Tile geometry
                </FieldLabel>
                <Select
                  value={genConfig.shapeMode}
                  onValueChange={(value: BauhausShapeMode) =>
                    onUpdateGenConfig((current) => ({
                      ...current,
                      shapeMode: value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="studio-addon-bg-shape"
                    className="h-8 w-full text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {BAUHAUS_SHAPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Separator />

            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Layout &amp; Motion
            </div>

            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>
                  {densityLabelForStyle(genConfig.style)}
                </FieldLabel>
                <span className="font-mono text-xs text-muted-foreground">
                  {genConfig.density}
                </span>
              </div>
              <Slider
                min={genConfig.style === 'plasma' ? 6 : 2}
                max={genConfig.style === 'plasma' ? 24 : 16}
                step={1}
                value={[genConfig.density]}
                onValueChange={([value]) =>
                  onUpdateGenConfig((current) => ({
                    ...current,
                    density: value ?? current.density,
                  }))
                }
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>
                  {intensityLabelForStyle(genConfig.style)}
                </FieldLabel>
                <span className="font-mono text-xs text-muted-foreground">
                  {genConfig.intensity}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[genConfig.intensity]}
                onValueChange={([value]) =>
                  onUpdateGenConfig((current) => ({
                    ...current,
                    intensity: value ?? current.intensity,
                  }))
                }
              />
            </Field>

            {genConfig.style === 'plasma' && (
              <Field>
                <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                  <FieldLabel className="cursor-pointer">
                    Audio-Reactive Modulation
                  </FieldLabel>
                  <Checkbox
                    aria-label="Audio-Reactive Modulation"
                    checked={Boolean(genConfig.audioReactive)}
                    onCheckedChange={(checked) =>
                      onUpdateGenConfig((current) => ({
                        ...current,
                        audioReactive: checked === true,
                      }))
                    }
                  />
                </label>
              </Field>
            )}

            {(genConfig.style === 'waves' ||
              genConfig.style === 'trails') && (
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel>
                    {genConfig.style === 'trails'
                      ? 'Stream angle'
                      : 'Wave angle'}
                  </FieldLabel>
                  <span className="font-mono text-xs text-muted-foreground">
                    {genConfig.angle}°
                  </span>
                </div>
                <Slider
                  min={-45}
                  max={45}
                  step={2}
                  value={[genConfig.angle]}
                  onValueChange={([value]) =>
                    onUpdateGenConfig((current) => ({
                      ...current,
                      angle: value ?? current.angle,
                    }))
                  }
                />
              </Field>
            )}

            {genConfig.animated && (
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel>Animation speed</FieldLabel>
                  <span className="font-mono text-xs text-muted-foreground">
                    {genConfig.speed.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  min={0.25}
                  max={2.5}
                  step={0.25}
                  value={[genConfig.speed]}
                  onValueChange={([value]) =>
                    onUpdateGenConfig((current) => ({
                      ...current,
                      speed: value ?? current.speed,
                    }))
                  }
                />
              </Field>
            )}

            <Separator />

            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Palette
            </div>

            <Field>
              <FieldLabel htmlFor="studio-addon-bg-palette">
                Color palette
              </FieldLabel>
              <Select value={genConfig.paletteId} onValueChange={onApplyPalette}>
                <SelectTrigger
                  id="studio-addon-bg-palette"
                  className="h-8 w-full text-xs"
                >
                  <SelectValue placeholder="Custom palette" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {BACKGROUND_PALETTES.map((palette) => (
                      <SelectItem key={palette.id} value={palette.id}>
                        {palette.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="studio-addon-bg-base-color">
                  Base &amp; swatches
                </FieldLabel>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] font-normal"
                >
                  Seed #{genConfig.seed}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  id="studio-addon-bg-base-color"
                  type="color"
                  title="Base background color"
                  aria-label="Base background color"
                  value={genConfig.baseColor}
                  onChange={(event) =>
                    onUpdateGenConfig((current) => ({
                      ...current,
                      baseColor: event.target.value,
                    }))
                  }
                  className="h-8 w-10 shrink-0 cursor-pointer p-0.5"
                />
                <div className="flex flex-1 items-center gap-1 rounded-md border border-border/60 bg-background/60 p-1">
                  {genConfig.colors.map((hex, idx) => (
                    <input
                      key={`swatch-${idx}`}
                      type="color"
                      aria-label={`Palette color ${idx + 1}`}
                      value={hex}
                      onChange={(event) =>
                        onUpdatePaletteColor(idx, event.target.value)
                      }
                      className="h-6 w-full min-w-0 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                  ))}
                </div>
              </div>
            </Field>
          </FieldGroup>
        ) : (
          <FieldGroup className="gap-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Classic Color &amp; CSS
            </div>
            <Field>
              <FieldLabel htmlFor="studio-addon-canvas-background-color">
                Solid color
              </FieldLabel>
              <Input
                id="studio-addon-canvas-background-color"
                type="color"
                value={classicColorValue}
                onChange={(event) => onClassicChange(event.target.value)}
                className="h-9 cursor-pointer p-1"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="studio-addon-canvas-background-css">
                Color or CSS gradient
              </FieldLabel>
              <Input
                id="studio-addon-canvas-background-css"
                value={classicBackground}
                onChange={(event) => onClassicChange(event.target.value)}
                placeholder="#101827 or linear-gradient(...)"
              />
            </Field>
          </FieldGroup>
        )}
      </div>
    </ScrollArea>
  );
}
