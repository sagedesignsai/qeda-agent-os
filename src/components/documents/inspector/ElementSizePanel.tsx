/**
 * components/documents/inspector/ElementSizePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Width & Height sizing controls for document nodes (Containers, Images, Text).
 *
 * Exposes:
 *   - Width Sizing Mode: Hug Content (auto), Fill Container (fill), Fixed (pt)
 *   - Height Sizing Mode: Hug Content (auto), Fill Container (fill), Fixed (pt)
 *   - Numerical value inputs when Fixed
 *   - Optional Min/Max dimension constraints
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
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
import type {
  NodeSizing,
  SizingDimension,
  SizingMode,
} from '@/lib/pdf-studio/primitives-ast';

interface ElementSizePanelProps {
  sizing: NodeSizing | undefined;
  onChange: (sizing: NodeSizing) => void;
}

export function ElementSizePanel({ sizing, onChange }: ElementSizePanelProps) {
  const [showConstraints, setShowConstraints] = useState(false);

  const width: SizingDimension = sizing?.width || { mode: 'fill' };
  const height: SizingDimension = sizing?.height || { mode: 'auto' };

  const updateWidth = (patch: Partial<SizingDimension>) => {
    onChange({
      width: { ...width, ...patch },
      height,
    });
  };

  const updateHeight = (patch: Partial<SizingDimension>) => {
    onChange({
      width,
      height: { ...height, ...patch },
    });
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Width Control */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Width
          </Label>
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            {width.mode === 'fixed'
              ? `${width.value ?? 100}pt`
              : width.mode === 'fill'
                ? '100% / flex:1'
                : 'Hug'}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
          <Select
            value={width.mode}
            onValueChange={(val: SizingMode) =>
              updateWidth({
                mode: val,
                value: val === 'fixed' ? width.value || 120 : undefined,
              })
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fill">Fill Container</SelectItem>
              <SelectItem value="auto">Hug Content</SelectItem>
              <SelectItem value="fixed">Fixed Width</SelectItem>
            </SelectContent>
          </Select>

          {width.mode === 'fixed' && (
            <div className="flex w-24 items-center gap-1 rounded-md border border-border/70 px-2 py-1 bg-background">
              <Input
                type="number"
                min={1}
                value={width.value ?? 100}
                onChange={(e) =>
                  updateWidth({ value: Math.max(1, Number(e.target.value)) })
                }
                className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
              />
              <span className="text-[10px] text-muted-foreground">pt</span>
            </div>
          )}
        </div>
      </div>

      {/* Height Control */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Height
          </Label>
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            {height.mode === 'fixed'
              ? `${height.value ?? 60}pt`
              : height.mode === 'fill'
                ? '100% / flex:1'
                : 'Hug'}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
          <Select
            value={height.mode}
            onValueChange={(val: SizingMode) =>
              updateHeight({
                mode: val,
                value: val === 'fixed' ? height.value || 60 : undefined,
              })
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Hug Content</SelectItem>
              <SelectItem value="fill">Fill Container</SelectItem>
              <SelectItem value="fixed">Fixed Height</SelectItem>
            </SelectContent>
          </Select>

          {height.mode === 'fixed' && (
            <div className="flex w-24 items-center gap-1 rounded-md border border-border/70 px-2 py-1 bg-background">
              <Input
                type="number"
                min={1}
                value={height.value ?? 60}
                onChange={(e) =>
                  updateHeight({ value: Math.max(1, Number(e.target.value)) })
                }
                className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
              />
              <span className="text-[10px] text-muted-foreground">pt</span>
            </div>
          )}
        </div>
      </div>

      {/* Constraints toggle */}
      <div className="border-t border-border/50 pt-2">
        <button
          type="button"
          onClick={() => setShowConstraints(!showConstraints)}
          className="flex w-full items-center justify-between py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <span>Min & Max Constraints</span>
          {showConstraints ? (
            <ChevronUpIcon className="h-3 w-3" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" />
          )}
        </button>

        {showConstraints && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background">
              <span className="text-[10px] text-muted-foreground font-mono">
                Min W
              </span>
              <Input
                type="number"
                min={0}
                placeholder="None"
                value={width.min ?? ''}
                onChange={(e) =>
                  updateWidth({
                    min: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background">
              <span className="text-[10px] text-muted-foreground font-mono">
                Max W
              </span>
              <Input
                type="number"
                min={0}
                placeholder="None"
                value={width.max ?? ''}
                onChange={(e) =>
                  updateWidth({
                    max: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background">
              <span className="text-[10px] text-muted-foreground font-mono">
                Min H
              </span>
              <Input
                type="number"
                min={0}
                placeholder="None"
                value={height.min ?? ''}
                onChange={(e) =>
                  updateHeight({
                    min: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background">
              <span className="text-[10px] text-muted-foreground font-mono">
                Max H
              </span>
              <Input
                type="number"
                min={0}
                placeholder="None"
                value={height.max ?? ''}
                onChange={(e) =>
                  updateHeight({
                    max: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
