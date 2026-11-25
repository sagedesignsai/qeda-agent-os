import { CheckIcon, DicesIcon, WavesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CLASSIC_BACKGROUND_PRESETS,
  GENERATIVE_BACKGROUND_PRESETS,
  getBackgroundPreviewCss,
  serializeGenerativeBackground,
  type GenerativeBackgroundConfig,
} from '@/lib/studio/render/background-generator';

export interface BackgroundPresetsGalleryProps {
  mode: 'generative' | 'classic';
  onModeChange: (mode: 'generative' | 'classic') => void;
  genConfig: GenerativeBackgroundConfig;
  currentSerializedGen: string;
  classicBackground: string;
  onSelectGenerativePreset: (config: GenerativeBackgroundConfig) => void;
  onSelectClassicPreset: (value: string) => void;
  onToggleAnimated: (animated: boolean) => void;
  onRandomize: () => void;
}

export function BackgroundPresetsGallery({
  mode,
  onModeChange,
  genConfig,
  currentSerializedGen,
  classicBackground,
  onSelectGenerativePreset,
  onSelectClassicPreset,
  onToggleAnimated,
  onRandomize,
}: BackgroundPresetsGalleryProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) =>
        onModeChange(value as 'generative' | 'classic')
      }
      className="flex min-h-0 flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="h-8">
          <TabsTrigger value="generative" className="gap-1.5 text-xs">
            <WavesIcon className="size-3.5" />
            Generator
          </TabsTrigger>
          <TabsTrigger value="classic" className="text-xs">
            Gradients &amp; Solids
          </TabsTrigger>
        </TabsList>

        {mode === 'generative' && (
          <div className="flex items-center gap-2.5">
            <label
              htmlFor="studio-addon-animate-bg"
              className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Switch
                id="studio-addon-animate-bg"
                size="sm"
                checked={genConfig.animated}
                onCheckedChange={onToggleAnimated}
                aria-label="Animate background"
              />
              <span>Animate</span>
            </label>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onRandomize}
                  className="h-7 px-2.5 text-xs"
                >
                  <DicesIcon className="mr-1 size-3.5" />
                  Generate
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Randomize seed, layout, and palette
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <TabsContent value="generative" className="mt-0">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Animated Presets
          </span>
          <span className="text-[10px] text-muted-foreground">
            Exports frame-accurately
          </span>
        </div>
        <ScrollArea className="h-[172px] pr-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GENERATIVE_BACKGROUND_PRESETS.map((preset) => {
              const presetValue = serializeGenerativeBackground(preset.config);
              const isSelected = currentSerializedGen === presetValue;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={preset.name}
                  aria-pressed={isSelected}
                  title={preset.description}
                  onClick={() =>
                    onSelectGenerativePreset({
                      ...preset.config,
                      colors: [...preset.config.colors],
                    })
                  }
                  className={`group flex cursor-pointer flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : 'border-border/60 bg-card/40 hover:border-primary/50'
                  }`}
                >
                  <div
                    className="relative h-8 w-full overflow-hidden rounded border border-white/10"
                    style={{
                      background: getBackgroundPreviewCss(presetValue),
                    }}
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
        </ScrollArea>
      </TabsContent>

      <TabsContent value="classic" className="mt-0">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Classic Gradients &amp; Solids
          </span>
          <span className="text-[10px] text-muted-foreground">
            Static CSS or hex
          </span>
        </div>
        <ScrollArea className="h-[172px] pr-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CLASSIC_BACKGROUND_PRESETS.map((preset) => {
              const isSelected = classicBackground === preset.value;
              return (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  aria-label={preset.name}
                  aria-pressed={isSelected}
                  onClick={() => onSelectClassicPreset(preset.value)}
                  className={`group flex cursor-pointer flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : 'border-border/60 bg-card/40 hover:border-primary/50'
                  }`}
                >
                  <div
                    className="relative h-8 w-full rounded border border-white/10"
                    style={{ background: preset.value }}
                  >
                    {isSelected && (
                      <CheckIcon className="absolute inset-0 m-auto size-4 text-white drop-shadow" />
                    )}
                  </div>
                  <span className="truncate text-[11px] font-medium text-foreground">
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
