import { useEffect, useState } from 'react';
import { PaletteIcon } from 'lucide-react';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  BACKGROUND_PALETTES,
  CLASSIC_BACKGROUND_PRESETS,
  DEFAULT_GENERATIVE_BACKGROUND,
  parseGenerativeBackground,
  randomizeGenerativeConfig,
  serializeGenerativeBackground,
  type GenerativeBackgroundConfig,
} from '@/lib/studio/render/background-generator';
import type { StudioCanvasAddonDialogProps } from './StudioAddonRegistry';
import { BackgroundInspectorSidebar } from './background-studio/BackgroundInspectorSidebar';
import { BackgroundPresetsGallery } from './background-studio/BackgroundPresetsGallery';
import { BackgroundPreviewStage } from './background-studio/BackgroundPreviewStage';

type BackgroundEditorMode = 'generative' | 'classic';

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
      <DialogContent className="flex max-h-[88vh] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <PaletteIcon className="size-4 text-primary" />
            Background Studio
            <Badge variant="secondary" className="text-[10px] font-medium">
              Animated &amp; Generative
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Generate animated Bauhaus tiles, flowing waves, WebGL plasma
            shaders, dot terrain, orbital rings, or silk light trails.
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider delayDuration={250}>
          <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_290px] md:overflow-hidden">
            <div className="flex shrink-0 flex-col gap-3 p-4 md:min-h-0 md:overflow-y-auto">
              <BackgroundPreviewStage
                open={open}
                mode={mode}
                genConfig={genConfig}
                classicCss={activeClassicCss}
              />
              <BackgroundPresetsGallery
                mode={mode}
                onModeChange={setMode}
                genConfig={genConfig}
                currentSerializedGen={currentSerializedGen}
                classicBackground={classicBackground}
                onSelectGenerativePreset={(config) => {
                  setMode('generative');
                  setGenConfig(config);
                }}
                onSelectClassicPreset={(value) => {
                  setMode('classic');
                  setClassicBackground(value);
                }}
                onToggleAnimated={(animated) =>
                  setGenConfig((current) => ({ ...current, animated }))
                }
                onRandomize={() =>
                  setGenConfig((current) => randomizeGenerativeConfig(current))
                }
              />
            </div>

            <BackgroundInspectorSidebar
              mode={mode}
              genConfig={genConfig}
              classicBackground={classicBackground}
              classicColorValue={colorValue}
              onUpdateGenConfig={setGenConfig}
              onApplyPalette={applyPalette}
              onUpdatePaletteColor={updatePaletteColor}
              onClassicChange={setClassicBackground}
            />
          </div>
        </TooltipProvider>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-muted/20 px-5 py-3">
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
