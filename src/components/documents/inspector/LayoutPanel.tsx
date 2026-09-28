/**
 * components/documents/inspector/LayoutPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Yoga Flexbox layout controls for Container nodes (Box, Row, Column).
 *
 * Exposes:
 *   - Direction controls (Row, Column, Wrap)
 *   - Gap controls (row gap, column gap, linked/unlinked)
 *   - Padding controls (all-sides uniform or 4-box individual)
 *   - Visual 9-point Alignment Grid (mapping to justifyContent & alignItems)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  ArrowRightIcon,
  ArrowDownIcon,
  WrapTextIcon,
  Maximize2Icon,
  SlidersIcon,
  LockIcon,
  UnlockIcon,
} from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { YogaFlexProps, NodePadding } from '@/lib/pdf-studio/primitives-ast';

interface LayoutPanelProps {
  layout: YogaFlexProps | undefined;
  onChange: (layout: YogaFlexProps) => void;
}

export function LayoutPanel({ layout = {}, onChange }: LayoutPanelProps) {
  const [individualPadding, setIndividualPadding] = useState(false);
  const [gapsLinked, setGapsLinked] = useState(true);

  const direction = layout.flexDirection || 'column';
  const wrap = layout.flexWrap || 'nowrap';
  const padding: NodePadding = layout.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  const rowGap = layout.rowGap ?? 8;
  const colGap = layout.columnGap ?? 8;
  const justify = layout.justifyContent || 'flex-start';
  const align = layout.alignItems || 'stretch';

  const update = (patch: Partial<YogaFlexProps>) => {
    onChange({ ...layout, ...patch });
  };

  const handleUniformPaddingChange = (val: number) => {
    update({
      padding: { top: val, right: val, bottom: val, left: val },
    });
  };

  const handlePaddingSideChange = (side: keyof NodePadding, val: number) => {
    update({
      padding: { ...padding, [side]: Math.max(0, val) },
    });
  };

  const handleRowGapChange = (val: number) => {
    const v = Math.max(0, val);
    update({
      rowGap: v,
      ...(gapsLinked ? { columnGap: v } : {}),
    });
  };

  const handleColGapChange = (val: number) => {
    const v = Math.max(0, val);
    update({
      columnGap: v,
      ...(gapsLinked ? { rowGap: v } : {}),
    });
  };

  // Determine active cell in 9-point grid
  // Rows: top (0), center (1), bottom (2)
  // Cols: left (0), center (1), right (2)
  const getGridPoint = (): [number, number] => {
    const isRow = direction.startsWith('row');
    const mainPos =
      justify === 'center' ? 1 : justify === 'flex-end' ? 2 : 0;
    const crossPos =
      align === 'center' ? 1 : align === 'flex-end' ? 2 : 0;

    return isRow ? [crossPos, mainPos] : [mainPos, crossPos];
  };

  const setGridPoint = (r: number, c: number) => {
    const isRow = direction.startsWith('row');
    const mainValues: YogaFlexProps['justifyContent'][] = ['flex-start', 'center', 'flex-end'];
    const crossValues: YogaFlexProps['alignItems'][] = ['flex-start', 'center', 'flex-end'];

    if (isRow) {
      update({
        justifyContent: mainValues[c],
        alignItems: crossValues[r],
      });
    } else {
      update({
        justifyContent: mainValues[r],
        alignItems: crossValues[c],
      });
    }
  };

  const [activeRow, activeCol] = getGridPoint();

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Direction & Wrap */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground">Direction & Wrap</Label>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
          <Button
            type="button"
            variant={direction === 'row' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 text-[11px] px-2 font-normal cursor-pointer"
            onClick={() => update({ flexDirection: 'row' })}
          >
            <ArrowRightIcon className="h-3.5 w-3.5" />
            Row
          </Button>
          <Button
            type="button"
            variant={direction === 'column' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 text-[11px] px-2 font-normal cursor-pointer"
            onClick={() => update({ flexDirection: 'column' })}
          >
            <ArrowDownIcon className="h-3.5 w-3.5" />
            Column
          </Button>
          <Button
            type="button"
            variant={wrap === 'wrap' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 gap-1 text-[11px] px-2 font-normal cursor-pointer"
            onClick={() => update({ flexWrap: wrap === 'wrap' ? 'nowrap' : 'wrap' })}
          >
            <WrapTextIcon className="h-3.5 w-3.5" />
            Wrap
          </Button>
        </div>
      </div>

      {/* Alignment Grid & Distribution */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground">Alignment</Label>
          <span className="text-[10px] text-muted-foreground/80 font-mono">
            {justify} / {align}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* 3x3 Grid Box */}
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border/80 bg-background p-1.5 shadow-2xs shrink-0">
            {[0, 1, 2].map((r) =>
              [0, 1, 2].map((c) => {
                const isActive = activeRow === r && activeCol === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => setGridPoint(r, c)}
                    title={`Align ${r === 0 ? 'Top' : r === 1 ? 'Middle' : 'Bottom'} ${
                      c === 0 ? 'Left' : c === 1 ? 'Center' : 'Right'
                    }`}
                    className={`h-4.5 w-4.5 rounded-xs transition-colors cursor-pointer flex items-center justify-center ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/40 hover:bg-muted-foreground/20'
                    }`}
                  >
                    <span
                      className={`h-1 w-1 rounded-full ${
                        isActive ? 'bg-primary-foreground' : 'bg-muted-foreground/60'
                      }`}
                    />
                  </button>
                );
              }),
            )}
          </div>

          {/* Quick distribute & stretch options */}
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-12 text-[10px] text-muted-foreground">Distribute</span>
              <Select
                value={justify}
                onValueChange={(val: string) =>
                  update({ justifyContent: val as YogaFlexProps['justifyContent'] })
                }
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flex-start">Start</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="flex-end">End</SelectItem>
                  <SelectItem value="space-between">Space Between</SelectItem>
                  <SelectItem value="space-around">Space Around</SelectItem>
                  <SelectItem value="space-evenly">Space Evenly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-12 text-[10px] text-muted-foreground">Cross Axis</span>
              <Select
                value={align}
                onValueChange={(val: string) =>
                  update({ alignItems: val as YogaFlexProps['alignItems'] })
                }
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flex-start">Start</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="flex-end">End</SelectItem>
                  <SelectItem value="stretch">Stretch</SelectItem>
                  <SelectItem value="baseline">Baseline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Gap Controls */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground">Item Spacing / Gap</Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setGapsLinked(!gapsLinked)}
            title={gapsLinked ? 'Unlink Row and Column gaps' : 'Link Row and Column gaps'}
          >
            {gapsLinked ? <LockIcon className="h-3 w-3" /> : <UnlockIcon className="h-3 w-3" />}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background">
            <span className="text-[10px] text-muted-foreground font-mono">Row</span>
            <Input
              type="number"
              min={0}
              value={rowGap}
              onChange={(e) => handleRowGapChange(Number(e.target.value))}
              className="h-6 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
            <span className="text-[10px] text-muted-foreground">pt</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background">
            <span className="text-[10px] text-muted-foreground font-mono">Col</span>
            <Input
              type="number"
              min={0}
              value={colGap}
              onChange={(e) => handleColGapChange(Number(e.target.value))}
              className="h-6 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
            <span className="text-[10px] text-muted-foreground">pt</span>
          </div>
        </div>
      </div>

      {/* Padding Controls */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-medium text-muted-foreground">Padding</Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-5 w-5 cursor-pointer ${
              individualPadding ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setIndividualPadding(!individualPadding)}
            title={individualPadding ? 'Switch to uniform padding' : 'Switch to individual side padding'}
          >
            <SlidersIcon className="h-3 w-3" />
          </Button>
        </div>

        {!individualPadding ? (
          <div className="flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1 bg-background">
            <span className="text-[10px] text-muted-foreground">All Sides</span>
            <Input
              type="number"
              min={0}
              value={padding.top}
              onChange={(e) => handleUniformPaddingChange(Number(e.target.value))}
              className="h-6 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
            />
            <span className="text-[10px] text-muted-foreground">pt</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
              <div
                key={side}
                className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 bg-background"
              >
                <span className="text-[10px] capitalize text-muted-foreground font-mono">
                  {side.charAt(0).toUpperCase()}
                </span>
                <Input
                  type="number"
                  min={0}
                  value={padding[side]}
                  onChange={(e) => handlePaddingSideChange(side, Number(e.target.value))}
                  className="h-6 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
                />
                <span className="text-[10px] text-muted-foreground">pt</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
