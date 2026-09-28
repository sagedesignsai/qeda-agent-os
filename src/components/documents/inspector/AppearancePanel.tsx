/**
 * components/documents/inspector/AppearancePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Appearance controls: Background fill, Opacity %, and Blend Mode.
 *
 * Exposes:
 *   - Dual-input token background color picker
 *   - Opacity slider & percentage numerical input
 *   - Blend mode select (normal, multiply, screen, overlay)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { EyeIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TokenDualInput, type TokenItem } from './TokenDualInput';
import type { NodeAppearance, StyleValue } from '@/lib/pdf-studio/primitives-ast';

interface AppearancePanelProps {
  appearance: NodeAppearance | undefined;
  tokens: TokenItem[];
  onChange: (appearance: NodeAppearance) => void;
}

export function AppearancePanel({
  appearance = {},
  tokens,
  onChange,
}: AppearancePanelProps) {
  const opacity = appearance.opacity ?? 100;
  const blendMode = appearance.blendMode || 'normal';

  const update = (patch: Partial<NodeAppearance>) => {
    onChange({ ...appearance, ...patch });
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Background Fill Dual-Input */}
      <TokenDualInput
        label="Background Fill"
        value={appearance.background}
        tokens={tokens}
        type="color"
        onChange={(val: StyleValue<string>) => update({ background: val })}
      />

      {/* Opacity Slider & Input */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <EyeIcon className="h-3 w-3" />
            Opacity
          </Label>
          <div className="flex w-16 items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 bg-background">
            <Input
              type="number"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) =>
                update({
                  opacity: Math.min(100, Math.max(0, Number(e.target.value))),
                })
              }
              className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        </div>
        <Slider
          value={[opacity]}
          min={0}
          max={100}
          step={1}
          onValueChange={(vals) => update({ opacity: vals[0] })}
          className="cursor-pointer"
        />
      </div>

      {/* Blend Mode */}
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium text-muted-foreground">Blend Mode</Label>
        <Select
          value={blendMode}
          onValueChange={(val: 'normal' | 'multiply' | 'screen' | 'overlay') =>
            update({ blendMode: val })
          }
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="multiply">Multiply</SelectItem>
            <SelectItem value="screen">Screen</SelectItem>
            <SelectItem value="overlay">Overlay</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
