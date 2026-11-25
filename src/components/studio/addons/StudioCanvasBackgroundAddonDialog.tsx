import { useEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  DicesIcon,
  LayersIcon,
  PaletteIcon,
  SparklesIcon,
  WavesIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BACKGROUND_PALETTES,
  CLASSIC_BACKGROUND_PRESETS,
  DEFAULT_GENERATIVE_BACKGROUND,
  GENERATIVE_BACKGROUND_PRESETS,
  drawGenerativeBackground,
  getBackgroundPreviewCss,
  parseGenerativeBackground,
  randomizeGenerativeConfig,
  serializeGenerativeBackground,
  type BauhausShapeMode,
  type GenerativeBackgroundConfig,
  type GenerativeBackgroundStyle,
} from '@/lib/studio/render/background-generator';
import type { StudioCanvasAddonDialogProps } from './StudioAddonRegistry';

type BackgroundEditorMode = 'generative' | 'classic';

const GENERATOR_STYLE_OPTIONS: Array<{
  value: GenerativeBackgroundStyle;
  label: string;
}> = [
  { value: 'bauhaus', label: 'Bauhaus Tiles' },
  { value: 'waves', label: 'Color Waves' },
  { value: 'plasma', label: 'Plasma Shader' },
  { value: 'aurora', label: 'Aurora Mesh' },
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
  return 'Mesh orbs';
}

function intensityLabelForStyle(style: GenerativeBackgroundStyle): string {
  if (style === 'bauhaus') return 'Tile gap';
  if (style === 'waves') return 'Wave curve';
  if (style === 'plasma') return 'Warp amount';
  return 'Drift range';
}

export function StudioCanvasBackgroundAddonDialog({
  open,
  styling,
  onOpenChange,
  onApply,
}: StudioCanvasAddonDialogProps) {
  const initialGen = parseGenerativeBackground(styling.background);
  const [mode, setMode] = useState<BackgroundEditorMode>(
    initialGen ? 'generative' : 'classic',
  );
  const [genConfig, setGenConfig] = useState<GenerativeBackgroundConfig>(
    initialGen ?? DEFAULT_GENERATIVE_BACKGROUND,
  );
  const [classicBackground, setClassicBackground] = useState(
    initialGen ? CLASSIC_BACKGROUND_PRESETS[0].value : styling.background,
  );
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = parseGenerativeBackground(styling.background);
    if (parsed) {
      setMode('generative');
      setGenConfig(parsed);
    } else {
      setMode('classic');
      setClassicBackground(styling.background);
    }
  }, [open, styling.background]);

  // Live 60fps canvas preview for generative / animated backgrounds
  useEffect(() => {
    if (!open || mode !== 'generative') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();

    const paint = (now: number) => {
      drawGenerativeBackground(ctx, {
        width: canvas.width,
        height: canvas.height,
        config: genConfig,
        timeMs: genConfig.animated ? now - start : 0,
      });
      if (genConfig.animated) {
        rafId = requestAnimationFrame(paint);
      }
    };

    paint(start);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open, mode, genConfig]);

  const colorValue = /^#[\da-f]{6}$/i.test(classicBackground)
    ? classicBackground
    : '#1e1b4b';
  const currentSerializedGen = serializeGenerativeBackground(genConfig);
  const activeClassicCss = classicBackground.trim() || '#090a0f';

  const handleApply = () => {
    if (mode === 'generative') {
      onApply(currentSerializedGen);
      onOpenChange(false);
      return;
    }
    const value = classicBackground.trim();
    if (!value) return;
    onApply(value);
    onOpenChange(false);
  };

  const applyPalette = (paletteId: string) => {
    const palette = BACKGROUND_PALETTES.find((p) => p.id === paletteId);
    if (!palette) return;
    setMode('generative');
    setGenConfig((current) => ({
      ...current,
      paletteId: palette.id,
      baseColor: palette.baseColor,
      colors: [...palette.colors],
    }));
  };

  const updatePaletteColor = (index: number, hex: string) => {
    setGenConfig((current) => {
      const nextColors = [...current.colors];
      nextColors[index] = hex;
      return {
        ...current,
        paletteId: 'custom',
        colors: nextColors,
      };
    });
  };

  const canApply =
    mode === 'generative' || classicBackground.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(940px,calc(100vw-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PaletteIcon className="size-4 text-primary" />
            Background Studio
            <Badge variant="secondary" className="text-[10px] font-medium">
              Animated &amp; Generative
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Generate animated Bauhaus tiles, flowing waves, WebGL plasma
            shaders, or choose a classic showcase backdrop.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1fr_290px]">
          {/* ── Left: Stage Preview & Presets Gallery ───────────────────────── */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-black/40 shadow-inner">
              {mode === 'generative' ? (
                <canvas
                  ref={previewCanvasRef}
                  width={640}
                  height={360}
                  aria-label="Canvas background preview"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: activeClassicCss }}
                  aria-label="Canvas background preview"
                />
              )}

              {/* Subtle showcase window mockup overlay */}
              <div className="relative z-10 aspect-video w-[58%] rounded-lg border border-white/25 bg-black/55 shadow-2xl backdrop-blur-[2px] flex items-center justify-center">
                <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white/80">
                  {mode === 'generative' && genConfig.animated ? (
                    <>
                      <SparklesIcon className="size-3 text-primary" />
                      Live Animated Backdrop
                    </>
                  ) : (
                    <>
                      <LayersIcon className="size-3 text-white/70" />
                      Showcase Frame Preview
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick toolbar under preview */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'generative' ? 'default' : 'outline'}
                  onClick={() => setMode('generative')}
                  className="h-7 text-xs"
                >
                  <WavesIcon className="size-3.5 mr-1" />
                  Generator
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'classic' ? 'default' : 'outline'}
                  onClick={() => setMode('classic')}
                  className="h-7 text-xs"
                >
                  Gradients &amp; Solids
                </Button>
              </div>

              {mode === 'generative' && (
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="studio-addon-animate-bg"
                    className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
                  >
                    <Switch
                      id="studio-addon-animate-bg"
                      size="sm"
                      checked={genConfig.animated}
                      onCheckedChange={(checked) =>
                        setGenConfig((current) => ({
                          ...current,
                          animated: checked,
                        }))
                      }
                      aria-label="Animate background"
                    />
                    <span>Animate</span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setGenConfig((current) => randomizeGenerativeConfig(current))
                    }
                    className="h-7 text-xs"
                  >
                    <DicesIcon className="size-3.5 mr-1" />
                    Generate
                  </Button>
                </div>
              )}
            </div>

            {/* Generative Animated Presets */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Animated Presets
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Exports frame-accurately
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GENERATIVE_BACKGROUND_PRESETS.map((preset) => {
                  const presetValue = serializeGenerativeBackground(preset.config);
                  const isSelected =
                    mode === 'generative' && currentSerializedGen === presetValue;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-label={preset.name}
                      aria-pressed={isSelected}
                      title={preset.description}
                      onClick={() => {
                        setMode('generative');
                        setGenConfig({
                          ...preset.config,
                          colors: [...preset.config.colors],
                        });
                      }}
                      className={`group flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                          : 'border-border/60 bg-card/40 hover:border-primary/50'
                      }`}
                    >
                      <div
                        className="relative h-8 w-full overflow-hidden rounded border border-white/10"
                        style={{ background: getBackgroundPreviewCss(presetValue) }}
                      >
                        <div className="absolute bottom-1 left-1 flex gap-0.5">
                          {preset.config.colors.slice(0, 4).map((hex, idx) => (
                            <span
                              key={`${preset.id}-${idx}`}
                              className="size-2 rounded-full border border-black/30"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </div>
                        {isSelected && (
                          <CheckIcon className="absolute right-1 top-1 size-3.5 text-white drop-shadow" />
                        )}
                      </div>
                      <span className="truncate text-[11px] font-medium text-foreground">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Classic Gradients & Solids Presets */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Classic Gradients &amp; Solids
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {CLASSIC_BACKGROUND_PRESETS.map((preset) => {
                  const isSelected =
                    mode === 'classic' && classicBackground === preset.value;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      title={preset.name}
                      aria-label={preset.name}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setMode('classic');
                        setClassicBackground(preset.value);
                      }}
                      style={{ background: preset.value }}
                      className={`relative h-9 rounded-md border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/40'
                          : 'border-border/70 hover:border-primary/50'
                      }`}
                    >
                      {isSelected && (
                        <CheckIcon className="absolute inset-0 m-auto size-4 text-white drop-shadow" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right: Inspector Sidebar (Layout, Palette, Shape) ───────────── */}
          <div className="rounded-xl border border-border/60 bg-card/30 p-3.5">
            {mode === 'generative' ? (
              <FieldGroup className="gap-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Shape &amp; Style
                </div>
                <Field>
                  <FieldLabel htmlFor="studio-addon-bg-style">
                    Generator style
                  </FieldLabel>
                  <Select
                    value={genConfig.style}
                    onValueChange={(value: GenerativeBackgroundStyle) =>
                      setGenConfig((current) => ({
                        ...current,
                        style: value,
                        density:
                          value === 'plasma'
                            ? Math.max(8, current.density)
                            : Math.min(8, current.density),
                      }))
                    }
                  >
                    <SelectTrigger id="studio-addon-bg-style" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {GENERATOR_STYLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                {genConfig.style === 'bauhaus' && (
                  <Field>
                    <FieldLabel htmlFor="studio-addon-bg-shape">
                      Tile geometry
                    </FieldLabel>
                    <Select
                      value={genConfig.shapeMode}
                      onValueChange={(value: BauhausShapeMode) =>
                        setGenConfig((current) => ({
                          ...current,
                          shapeMode: value,
                        }))
                      }
                    >
                      <SelectTrigger id="studio-addon-bg-shape" className="w-full">
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

                <div className="border-t border-border/50 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Layout &amp; Motion
                </div>

                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>{densityLabelForStyle(genConfig.style)}</FieldLabel>
                    <span className="text-xs font-mono text-muted-foreground">
                      {genConfig.density}
                    </span>
                  </div>
                  <Slider
                    min={genConfig.style === 'plasma' ? 6 : 2}
                    max={genConfig.style === 'plasma' ? 24 : 10}
                    step={1}
                    value={[genConfig.density]}
                    onValueChange={([value]) =>
                      setGenConfig((current) => ({
                        ...current,
                        density: value ?? current.density,
                      }))
                    }
                  />
                </Field>

                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel>{intensityLabelForStyle(genConfig.style)}</FieldLabel>
                    <span className="text-xs font-mono text-muted-foreground">
                      {genConfig.intensity}%
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[genConfig.intensity]}
                    onValueChange={([value]) =>
                      setGenConfig((current) => ({
                        ...current,
                        intensity: value ?? current.intensity,
                      }))
                    }
                  />
                </Field>

                {genConfig.style === 'waves' && (
                  <Field>
                    <div className="flex items-center justify-between">
                      <FieldLabel>Wave angle</FieldLabel>
                      <span className="text-xs font-mono text-muted-foreground">
                        {genConfig.angle}°
                      </span>
                    </div>
                    <Slider
                      min={-45}
                      max={45}
                      step={2}
                      value={[genConfig.angle]}
                      onValueChange={([value]) =>
                        setGenConfig((current) => ({
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
                      <span className="text-xs font-mono text-muted-foreground">
                        {genConfig.speed.toFixed(2)}x
                      </span>
                    </div>
                    <Slider
                      min={0.25}
                      max={2.5}
                      step={0.25}
                      value={[genConfig.speed]}
                      onValueChange={([value]) =>
                        setGenConfig((current) => ({
                          ...current,
                          speed: value ?? current.speed,
                        }))
                      }
                    />
                  </Field>
                )}

                <div className="border-t border-border/50 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Palette
                </div>

                <Field>
                  <FieldLabel htmlFor="studio-addon-bg-palette">
                    Color palette
                  </FieldLabel>
                  <Select
                    value={genConfig.paletteId}
                    onValueChange={applyPalette}
                  >
                    <SelectTrigger id="studio-addon-bg-palette" className="w-full">
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
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Seed #{genConfig.seed}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="studio-addon-bg-base-color"
                      type="color"
                      title="Base background color"
                      aria-label="Base background color"
                      value={genConfig.baseColor}
                      onChange={(event) =>
                        setGenConfig((current) => ({
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
                            updatePaletteColor(idx, event.target.value)
                          }
                          className="h-6 w-full min-w-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                      ))}
                    </div>
                  </div>
                </Field>
              </FieldGroup>
            ) : (
              <FieldGroup className="gap-4">
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
                    value={colorValue}
                    onChange={(event) =>
                      setClassicBackground(event.target.value)
                    }
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
                    onChange={(event) =>
                      setClassicBackground(event.target.value)
                    }
                    placeholder="#101827 or linear-gradient(...)"
                  />
                </Field>
              </FieldGroup>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={!canApply}>
            Apply background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
