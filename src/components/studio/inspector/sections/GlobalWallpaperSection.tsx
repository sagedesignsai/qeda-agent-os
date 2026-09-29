/**
 * components/studio/inspector/sections/GlobalWallpaperSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-tab wallpaper background selector:
 *   - Gradients: Curated mesh & linear gradients with rich aesthetics
 *   - Solids: Sleek studio solids (Onyx, Slate, Obsidian, Zinc, Titanium)
 *   - Custom: Color picker swatch & direct Hex/CSS input
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { PaletteIcon, PipetteIcon, CheckIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { StudioStyling } from '@/lib/studio-types';
import { InspectorSection } from '../components/InspectorSection';

interface GlobalWallpaperSectionProps {
  styling: StudioStyling;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  defaultOpen?: boolean;
}

const GRADIENT_PRESETS = [
  {
    name: 'Midnight Indigo',
    value: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
    previewColor: '#1e1b4b',
  },
  {
    name: 'Cyber Violet',
    value: 'linear-gradient(135deg, #2e1065 0%, #1e1b4b 50%, #09090b 100%)',
    previewColor: '#2e1065',
  },
  {
    name: 'Obsidian Glow',
    value: 'linear-gradient(135deg, #18181b 0%, #09090b 50%, #000000 100%)',
    previewColor: '#18181b',
  },
  {
    name: 'Emerald Aurora',
    value: 'linear-gradient(135deg, #064e3b 0%, #022c22 50%, #020617 100%)',
    previewColor: '#064e3b',
  },
  {
    name: 'Sunset Ember',
    value: 'linear-gradient(135deg, #451a03 0%, #1c1917 50%, #0c0a09 100%)',
    previewColor: '#451a03',
  },
  {
    name: 'Neon Cyan',
    value: 'linear-gradient(135deg, #083344 0%, #0c4a6e 50%, #020617 100%)',
    previewColor: '#083344',
  },
  {
    name: 'Cosmic Magenta',
    value: 'linear-gradient(135deg, #4a044e 0%, #2e1065 50%, #09090b 100%)',
    previewColor: '#4a044e',
  },
  {
    name: 'Royal Sapphire',
    value: 'linear-gradient(135deg, #172554 0%, #1e3a8a 50%, #020617 100%)',
    previewColor: '#172554',
  },
];

const SOLID_PRESETS = [
  { name: 'Studio Slate', value: '#0f172a' },
  { name: 'Deep Onyx', value: '#09090b' },
  { name: 'Pure Obsidian', value: '#000000' },
  { name: 'Minimal Zinc', value: '#18181b' },
  { name: 'Carbon Gray', value: '#27272a' },
  { name: 'Navy Dusk', value: '#020617' },
  { name: 'Forest Noir', value: '#022c22' },
  { name: 'Berry Velvet', value: '#3b0764' },
];

export function GlobalWallpaperSection({
  styling,
  onUpdateStyling,
  defaultOpen = true,
}: GlobalWallpaperSectionProps) {
  const [customInput, setCustomInput] = useState(styling.background);

  const handleApplyCustom = (color: string) => {
    if (!color.trim()) return;
    onUpdateStyling({ background: color.trim() });
  };

  return (
    <InspectorSection
      title="Wallpaper & Background"
      icon={<PaletteIcon className="w-3.5 h-3.5 text-muted-foreground" />}
      defaultOpen={defaultOpen}
    >
      <Tabs defaultValue="gradients" className="w-full">
        <TabsList className="grid grid-cols-3 h-7 p-0.5 bg-secondary/50 border border-border/40">
          <TabsTrigger value="gradients" className="text-[11px] h-6 px-1">
            Gradients
          </TabsTrigger>
          <TabsTrigger value="solids" className="text-[11px] h-6 px-1">
            Solids
          </TabsTrigger>
          <TabsTrigger value="custom" className="text-[11px] h-6 px-1">
            Custom
          </TabsTrigger>
        </TabsList>

        {/* ── Gradients Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="gradients" className="pt-2">
          <div className="grid grid-cols-4 gap-2">
            {GRADIENT_PRESETS.map((preset) => {
              const isSelected = styling.background === preset.value;
              return (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  onClick={() => onUpdateStyling({ background: preset.value })}
                  style={{ background: preset.value }}
                  className={`h-9 rounded-md border relative transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/40 scale-105 shadow-sm'
                      : 'border-border/60 hover:border-primary/50 hover:scale-105'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-md">
                      <CheckIcon className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Solids Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="solids" className="pt-2">
          <div className="grid grid-cols-4 gap-2">
            {SOLID_PRESETS.map((preset) => {
              const isSelected = styling.background === preset.value;
              return (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  onClick={() => onUpdateStyling({ background: preset.value })}
                  style={{ backgroundColor: preset.value }}
                  className={`h-9 rounded-md border relative transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/40 scale-105 shadow-sm'
                      : 'border-border/60 hover:border-primary/50 hover:scale-105'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-md">
                      <CheckIcon className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Custom Tab ────────────────────────────────────────────────────── */}
        <TabsContent value="custom" className="pt-2 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            {/* Color swatch picker button */}
            <div className="relative w-8 h-8 rounded-md border border-border/70 overflow-hidden shrink-0 shadow-2xs">
              <input
                type="color"
                value={
                  styling.background.startsWith('#')
                    ? styling.background
                    : '#1e1b4b'
                }
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  onUpdateStyling({ background: e.target.value });
                }}
                className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer opacity-0"
              />
              <div
                style={{ background: styling.background }}
                className="w-full h-full pointer-events-none flex items-center justify-center"
              >
                <PipetteIcon className="w-3 h-3 text-white/80 drop-shadow" />
              </div>
            </div>

            {/* Direct Hex / CSS string input */}
            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleApplyCustom(customInput);
                }
              }}
              placeholder="#000000 or linear-gradient(...)"
              className="h-8 text-xs font-mono flex-1 bg-background"
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApplyCustom(customInput)}
              className="h-8 px-2.5 text-xs cursor-pointer"
            >
              Apply
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </InspectorSection>
  );
}
