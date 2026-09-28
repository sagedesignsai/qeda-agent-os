/**
 * components/documents/inspector/BorderRadiusPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Border width, border style, border color, and corner radius controls.
 *
 * Exposes:
 *   - Corner radius (uniform or 4-corner individual: TL, TR, BR, BL)
 *   - Border width (uniform or 4-side individual: T, R, B, L)
 *   - Border style (solid, dashed, dotted)
 *   - Dual-input token border color picker
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { SlidersIcon, CornerDownRightIcon, SquareIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TokenDualInput, type TokenItem } from './TokenDualInput';
import type {
  NodeBorder,
  NodeCornerRadius,
  StyleValue,
} from '@/lib/pdf-studio/primitives-ast';

interface BorderRadiusPanelProps {
  border: NodeBorder | undefined;
  radius: NodeCornerRadius | undefined;
  tokens: TokenItem[];
  onChangeBorder: (border: NodeBorder) => void;
  onChangeRadius: (radius: NodeCornerRadius) => void;
}

export function BorderRadiusPanel({
  border,
  radius,
  tokens,
  onChangeBorder,
  onChangeRadius,
}: BorderRadiusPanelProps) {
  const [individualRadius, setIndividualRadius] = useState(false);
  const [individualBorder, setIndividualBorder] = useState(false);

  const currentRadius: NodeCornerRadius = radius || {
    topLeft: 0,
    topRight: 0,
    bottomRight: 0,
    bottomLeft: 0,
  };

  const currentBorder: NodeBorder = border || {
    style: 'solid',
    topWidth: 0,
    rightWidth: 0,
    bottomWidth: 0,
    leftWidth: 0,
  };

  const handleUniformRadiusChange = (val: number) => {
    const v = Math.max(0, val);
    onChangeRadius({
      topLeft: v,
      topRight: v,
      bottomRight: v,
      bottomLeft: v,
    });
  };

  const handleCornerRadiusChange = (corner: keyof NodeCornerRadius, val: number) => {
    onChangeRadius({
      ...currentRadius,
      [corner]: Math.max(0, val),
    });
  };

  const handleUniformBorderChange = (val: number) => {
    const v = Math.max(0, val);
    onChangeBorder({
      ...currentBorder,
      topWidth: v,
      rightWidth: v,
      bottomWidth: v,
      leftWidth: v,
    });
  };

  const handleSideBorderChange = (side: 'topWidth' | 'rightWidth' | 'bottomWidth' | 'leftWidth', val: number) => {
    onChangeBorder({
      ...currentBorder,
      [side]: Math.max(0, val),
    });
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Corner Radius */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <CornerDownRightIcon className="h-3 w-3" />
            Corner Radius
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-5 w-5 cursor-pointer ${
              individualRadius ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setIndividualRadius(!individualRadius)}
            title={individualRadius ? 'Uniform radius' : 'Individual corners'}
          >
            <SlidersIcon className="h-3 w-3" />
          </Button>
        </div>

        {!individualRadius ? (
          <div className="flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1 bg-background">
            <span className="text-[10px] text-muted-foreground">All Corners</span>
            <Input
              type="number"
              min={0}
              max={999}
              value={currentRadius.topLeft}
              onChange={(e) => handleUniformRadiusChange(Number(e.target.value))}
              className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
            <span className="text-[10px] text-muted-foreground">pt</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'topLeft', label: 'TL' },
              { key: 'topRight', label: 'TR' },
              { key: 'bottomLeft', label: 'BL' },
              { key: 'bottomRight', label: 'BR' },
            ].map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background"
              >
                <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
                <Input
                  type="number"
                  min={0}
                  value={currentRadius[key as keyof NodeCornerRadius]}
                  onChange={(e) =>
                    handleCornerRadiusChange(key as keyof NodeCornerRadius, Number(e.target.value))
                  }
                  className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
                />
                <span className="text-[10px] text-muted-foreground">pt</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Border Width & Style */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <SquareIcon className="h-3 w-3" />
            Border
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-5 w-5 cursor-pointer ${
              individualBorder ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setIndividualBorder(!individualBorder)}
            title={individualBorder ? 'Uniform border width' : 'Individual sides'}
          >
            <SlidersIcon className="h-3 w-3" />
          </Button>
        </div>

        {/* Style selector */}
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={currentBorder.style || 'solid'}
            onValueChange={(val: 'solid' | 'dashed' | 'dotted') =>
              onChangeBorder({ ...currentBorder, style: val })
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid</SelectItem>
              <SelectItem value="dashed">Dashed</SelectItem>
              <SelectItem value="dotted">Dotted</SelectItem>
            </SelectContent>
          </Select>

          {!individualBorder ? (
            <div className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background">
              <span className="text-[10px] text-muted-foreground">Width</span>
              <Input
                type="number"
                min={0}
                max={20}
                value={currentBorder.topWidth}
                onChange={(e) => handleUniformBorderChange(Number(e.target.value))}
                className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
              />
              <span className="text-[10px] text-muted-foreground">pt</span>
            </div>
          ) : null}
        </div>

        {individualBorder && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            {[
              { key: 'topWidth', label: 'Top' },
              { key: 'rightWidth', label: 'Right' },
              { key: 'bottomWidth', label: 'Bottom' },
              { key: 'leftWidth', label: 'Left' },
            ].map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background"
              >
                <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
                <Input
                  type="number"
                  min={0}
                  value={currentBorder[key as keyof NodeBorder] as number}
                  onChange={(e) =>
                    handleSideBorderChange(
                      key as 'topWidth' | 'rightWidth' | 'bottomWidth' | 'leftWidth',
                      Number(e.target.value),
                    )
                  }
                  className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
                />
                <span className="text-[10px] text-muted-foreground">pt</span>
              </div>
            ))}
          </div>
        )}

        {/* Border Color */}
        <div className="mt-1">
          <TokenDualInput
            label="Border Color"
            value={currentBorder.color}
            tokens={tokens}
            type="color"
            onChange={(val: StyleValue<string>) =>
              onChangeBorder({ ...currentBorder, color: val })
            }
          />
        </div>
      </div>
    </div>
  );
}
