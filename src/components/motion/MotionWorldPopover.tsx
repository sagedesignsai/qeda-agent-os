/**
 * components/motion/MotionWorldPopover.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The viewport's world control: what fills the frame behind content.
 *
 * Replaces the old "Preview background" tone picker, which was editor chrome
 * pretending to be the document's background. Tone still exists here, but under
 * "Editor view" and clearly labelled as the fallback for scenes with no world —
 * so what you pick is what renders.
 */

import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  ImageOffIcon,
  SparklesIcon,
} from 'lucide-react';

import { AssetPicker } from '@/components/motion/inspector/controls/asset-picker';
import { ColorField } from '@/components/motion/inspector/controls/color-field';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { motionStore } from '@/hooks/use-motion-store';
import {
  DEFAULT_STUDIO_COLORS,
  MOTION_ENVIRONMENT_PRESETS,
  MOTION_STUDIO_VARIANTS,
  activeEnvironmentPreset,
  buildEnvironmentPresetOps,
  describeResolvedWorld,
  resolveSceneWorld,
  type MotionSceneBackground,
  type MotionWorldMode,
} from '@/lib/motion/environment';
import { createMotionId } from '@/lib/motion/ids';
import type { MotionDocument, MotionStudioWorldVariant } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

export type MotionStageTone = 'graphite' | 'slate' | 'paper';

const STAGE_TONES: Array<{ value: MotionStageTone; label: string }> = [
  { value: 'graphite', label: 'Graphite' },
  { value: 'slate', label: 'Slate' },
  { value: 'paper', label: 'Paper' },
];

const MODES: Array<{ value: MotionWorldMode; label: string }> = [
  { value: 'color', label: 'Solid' },
  { value: 'transparent', label: 'Alpha' },
  { value: 'environment', label: 'HDRI' },
  { value: 'studio', label: 'Studio' },
];

const QUICK_COLORS = ['#0e1118', '#080a10', '#04060c', '#0b1020', '#c8d4e2', '#f2f4f8'];

const CHECKERBOARD =
  'repeating-conic-gradient(#22262f 0% 25%, #171a21 0% 50%) 50% / 8px 8px';

export function MotionWorldPopover({
  doc,
  stageTone,
  onStageToneChange,
}: {
  doc: MotionDocument;
  stageTone: MotionStageTone;
  onStageToneChange: (tone: MotionStageTone) => void;
}) {
  const scene = doc.scenes.find((item) => item.id === doc.activeSceneId);
  const world = resolveSceneWorld(scene, doc.assets, doc.meta.id);
  const summary = describeResolvedWorld(world, doc.assets);
  const environmentAssets = doc.assets.filter((asset) => asset.kind === 'environment');
  const appliedPreset = activeEnvironmentPreset(scene);

  const commitWorld = (
    background: MotionSceneBackground,
    label = 'Set scene world',
  ) => {
    if (!scene) return;
    motionStore.commit(label, [
      { op: 'scene.setBackground', sceneId: scene.id, background },
    ]);
  };

  const mode: MotionWorldMode =
    world?.kind === 'transparent' || world?.kind === 'color'
      ? world.kind
      : world?.kind === 'studio'
        ? 'studio'
        : world?.kind === 'environment' || world?.kind === 'unresolved-environment'
          ? 'environment'
          : 'color';

  const environment =
    world?.kind === 'environment' ? world : null;
  const studio = world?.kind === 'studio' ? world : null;
  const solidColor =
    world?.kind === 'color' || world?.kind === 'studio' ? world.color : '#0e1118';

  const setMode = (next: MotionWorldMode) => {
    if (!scene || next === mode) return;
    if (next === 'transparent') {
      commitWorld({ type: 'transparent' }, 'Set transparent background');
      return;
    }
    if (next === 'environment') {
      const assetId = environment?.assetId ?? environmentAssets[0]?.id;
      if (!assetId) {
        // No HDRI in the bundle yet: keep the document valid, the picker below
        // explains where to get one.
        commitWorld(
          { type: 'color', color: solidColor },
          'Set solid background',
        );
        return;
      }
      commitWorld(
        { type: 'environment', assetId, intensity: 1, blur: 0, rotation: 0 },
        'Set HDRI background',
      );
      return;
    }
    if (next === 'studio') {
      const variant: MotionStudioWorldVariant = studio?.variant ?? 'softbox';
      commitWorld(
        {
          type: 'studio',
          variant,
          color: studio?.color ?? DEFAULT_STUDIO_COLORS[variant],
          intensity: studio?.intensity ?? 1,
          rotation: studio?.rotation ?? 0,
        },
        'Set studio background',
      );
      return;
    }
    commitWorld(
      { type: 'color', color: solidColor },
      'Set solid background',
    );
  };

  const updateEnvironment = (patch: {
    assetId?: string;
    intensity?: number;
    blur?: number;
    rotation?: number;
  }) => {
    const assetId = patch.assetId ?? environment?.assetId ?? environmentAssets[0]?.id;
    if (!assetId) return;
    commitWorld(
      {
        type: 'environment',
        assetId,
        intensity: patch.intensity ?? environment?.intensity ?? 1,
        blur: patch.blur ?? environment?.blur ?? 0,
        rotation: patch.rotation ?? environment?.rotation ?? 0,
      },
      'Tune environment',
    );
  };

  const swatch =
    world?.kind === 'color'
      ? world.color
      : world?.kind === 'studio'
        ? world.color
        : world?.kind === 'environment'
          ? 'linear-gradient(135deg, #2b3a5c, #0a0d16)'
          : CHECKERBOARD;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 max-w-44 gap-1.5 px-1.5 text-[10px] font-normal"
          aria-label="Scene background"
          title={summary.detail}
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-sm border border-border/70"
            style={{ background: swatch }}
          />
          <span className="min-w-0 flex-1 truncate text-left">{summary.label}</span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-col">
          <section className="border-b border-border/60 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <GlobeIcon className="size-3.5 text-muted-foreground" />
              <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                World
              </h3>
              <span className="ml-auto text-[9px] text-muted-foreground/80">
                {scene?.name ?? 'No scene'}
              </span>
            </div>

            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(value) => {
                if (
                  value === 'color' ||
                  value === 'transparent' ||
                  value === 'environment' ||
                  value === 'studio'
                ) {
                  setMode(value);
                }
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Background type"
              className="h-7 w-full"
            >
              {MODES.map((item) => (
                <ToggleGroupItem
                  key={item.value}
                  value={item.value}
                  className="flex-1 text-[10px]"
                >
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            {mode === 'color' && (
              <div className="mt-2.5 flex flex-col gap-2">
                <ColorField
                  id="motion-world-color"
                  label="Colour"
                  value={solidColor}
                  onChange={(color) => commitWorld({ type: 'color', color })}
                />
                <div className="flex items-center gap-1">
                  {QUICK_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Background ${color}`}
                      onClick={() => commitWorld({ type: 'color', color }, 'Set solid background')}
                      className={cn(
                        'size-5 rounded border border-border/70 outline-none transition-transform hover:scale-110 focus-visible:ring-1 focus-visible:ring-ring',
                        world?.kind === 'color' && world.color === color && 'ring-1 ring-primary',
                      )}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>
            )}

            {mode === 'studio' && (
              <div className="mt-2.5 flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground">Lighting rig</span>
                  <div className="grid grid-cols-3 gap-1">
                    {MOTION_STUDIO_VARIANTS.map((variant) => {
                      const active = (studio?.variant ?? 'softbox') === variant.value;
                      return (
                        <button
                          key={variant.value}
                          type="button"
                          title={variant.description}
                          aria-pressed={active}
                          onClick={() =>
                            commitWorld(
                              {
                                type: 'studio',
                                variant: variant.value,
                                color: DEFAULT_STUDIO_COLORS[variant.value],
                                intensity: studio?.intensity ?? 1,
                                rotation: studio?.rotation ?? 0,
                              },
                              'Set studio lighting',
                            )
                          }
                          className={cn(
                            'h-7 rounded border px-1 text-[10px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
                            active
                              ? 'border-primary/70 bg-primary/10 text-foreground'
                              : 'border-border/70 text-muted-foreground hover:border-border',
                          )}
                        >
                          {variant.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <ColorField
                  id="motion-world-studio-color"
                  label="Backdrop"
                  value={studio?.color ?? DEFAULT_STUDIO_COLORS[studio?.variant ?? 'softbox']}
                  onChange={(color) =>
                    commitWorld({
                      type: 'studio',
                      variant: studio?.variant ?? 'softbox',
                      color,
                      intensity: studio?.intensity ?? 1,
                      rotation: studio?.rotation ?? 0,
                    })
                  }
                />
                <WorldSlider
                  id="motion-world-studio-intensity"
                  label="Reflection strength"
                  value={studio?.intensity ?? 1}
                  min={0}
                  max={3}
                  step={0.05}
                  suffix="×"
                  onCommit={(intensity) =>
                    commitWorld({
                      type: 'studio',
                      variant: studio?.variant ?? 'softbox',
                      color: studio?.color ?? DEFAULT_STUDIO_COLORS[studio?.variant ?? 'softbox'],
                      intensity,
                      rotation: studio?.rotation ?? 0,
                    })
                  }
                />
                <WorldSlider
                  id="motion-world-studio-rotation"
                  label="Rotate"
                  value={Math.round(((studio?.rotation ?? 0) * 180) / Math.PI)}
                  min={-180}
                  max={180}
                  step={1}
                  suffix="°"
                  onCommit={(degrees) =>
                    commitWorld({
                      type: 'studio',
                      variant: studio?.variant ?? 'softbox',
                      color: studio?.color ?? DEFAULT_STUDIO_COLORS[studio?.variant ?? 'softbox'],
                      intensity: studio?.intensity ?? 1,
                      rotation: (degrees * Math.PI) / 180,
                    })
                  }
                />
                <p className="text-[9px] leading-relaxed text-muted-foreground">
                  A procedural softbox is captured into an environment map, so
                  chrome, gold and glass reflect a studio without an HDRI file.
                </p>
              </div>
            )}

            {mode === 'transparent' && (
              <p className="mt-2.5 flex items-start gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                <ImageOffIcon className="mt-px size-3 shrink-0" />
                Export to WebM to keep the alpha channel. MP4 composites the
                background colour and preflight warns about it.
              </p>
            )}

            {mode === 'environment' && (
              <div className="mt-2.5 flex flex-col gap-2.5">
                {environmentAssets.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border/70 px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">
                    No HDRI in this project yet. Import one from Assets →
                    Environments (Polyhaven) — a 1–2k .hdr is enough for preview.
                  </p>
                ) : (
                  <AssetPicker
                    id="motion-world-environment"
                    label="Environment"
                    value={environment?.assetId}
                    assets={doc.assets}
                    kind="environment"
                    onChange={(assetId) => {
                      if (assetId) updateEnvironment({ assetId });
                    }}
                  />
                )}

                {world?.kind === 'unresolved-environment' && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">
                    The chosen environment is not in the bundle. Relink it or
                    pick another.
                  </p>
                )}

                {environment && (
                  <>
                    <WorldSlider
                      id="motion-world-intensity"
                      label="Light intensity"
                      value={environment.intensity}
                      min={0}
                      max={3}
                      step={0.05}
                      suffix="×"
                      onCommit={(intensity) => updateEnvironment({ intensity })}
                    />
                    <WorldSlider
                      id="motion-world-blur"
                      label="Background blur"
                      value={environment.blur}
                      min={0}
                      max={1}
                      step={0.01}
                      onCommit={(blur) => updateEnvironment({ blur })}
                    />
                    <WorldSlider
                      id="motion-world-rotation"
                      label="Rotate"
                      value={Math.round((environment.rotation * 180) / Math.PI)}
                      min={-180}
                      max={180}
                      step={1}
                      suffix="°"
                      onCommit={(degrees) =>
                        updateEnvironment({ rotation: (degrees * Math.PI) / 180 })
                      }
                    />
                  </>
                )}
              </div>
            )}
          </section>

          <section className="border-b border-border/60 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <SparklesIcon className="size-3.5 text-muted-foreground" />
              <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Presets
              </h3>
              {appliedPreset && (
                <span className="ml-auto text-[9px] text-muted-foreground/80">
                  {MOTION_ENVIRONMENT_PRESETS.find((preset) => preset.id === appliedPreset)?.label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {MOTION_ENVIRONMENT_PRESETS.map((preset) => {
                const active = appliedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.description}
                    aria-pressed={active}
                    onClick={() =>
                      motionStore.commit('Apply environment preset', [
                        ...buildEnvironmentPresetOps(doc, preset.id, () => createMotionId('scene')),
                      ])
                    }
                    className={cn(
                      'group relative flex h-11 items-end overflow-hidden rounded-md border px-1.5 pb-1 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
                      active
                        ? 'border-primary/70 ring-1 ring-primary/40'
                        : 'border-border/70 hover:border-border',
                    )}
                    style={{
                      backgroundImage: `linear-gradient(160deg, ${preset.swatch[0]}, ${preset.swatch[1]})`,
                    }}
                  >
                    <span className="truncate text-[10px] font-medium text-white drop-shadow">
                      {preset.label}
                    </span>
                    {active && (
                      <CheckIcon className="absolute right-1 top-1 size-3 text-white drop-shadow" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
              Re-applying a preset updates its rig in place — lights, floor and
              backdrop stay one group you can edit.
            </p>
          </section>

          <section className="p-3">
            <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Editor view
            </h3>
            <ToggleGroup
              type="single"
              value={stageTone}
              onValueChange={(value) => {
                if (value === 'graphite' || value === 'slate' || value === 'paper') {
                  onStageToneChange(value);
                }
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Editor stage tone"
              className="h-7 w-full"
            >
              {STAGE_TONES.map((tone) => (
                <ToggleGroupItem key={tone.value} value={tone.value} className="flex-1 text-[10px]">
                  {tone.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
              Only the surface around scenes that declare no world. It never
              appears in the export.
            </p>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorldSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[10px] text-muted-foreground">
          {label}
        </label>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {value.toFixed(suffix === '°' || suffix === '' ? 0 : 2)}
          {suffix}
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueCommit={([next]) => {
          if (next !== undefined) onCommit(next);
        }}
      />
    </div>
  );
}
