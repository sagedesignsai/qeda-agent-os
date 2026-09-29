/**
 * components/studio/inspector/components/InspectorCoordinatePad.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive 2D crosshair coordinate pad for kinetic zoom targeting:
 *   - Normalized coordinate space [0, 1] x [0, 1] representing the video canvas
 *   - Smooth pointer capture for effortless dragging across the pad
 *   - Reference center crosshairs & rule-of-thirds grid lines
 *   - Numerical X & Y inputs with reset-to-center button
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcwIcon, CrosshairIcon } from 'lucide-react';
import { InspectorFieldRow } from './InspectorFieldRow';

interface InspectorCoordinatePadProps {
  targetX: number;
  targetY: number;
  onChange: (x: number, y: number) => void;
  label?: string;
  className?: string;
}

export function InspectorCoordinatePad({
  targetX,
  targetY,
  onChange,
  label = 'Focal Center (X, Y)',
  className = '',
}: InspectorCoordinatePadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const clampAndRound = (val: number): number => {
    const clamped = Math.max(0, Math.min(1, val));
    return Math.round(clamped * 100) / 100;
  };

  const updateFromPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!padRef.current) return;
      const rect = padRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      onChange(clampAndRound(normX), clampAndRound(normY));
    },
    [onChange],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }
  };

  const handleResetCenter = () => {
    onChange(0.5, 0.5);
  };

  const handleManualChange = (axis: 'x' | 'y', valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed)) return;
    if (axis === 'x') {
      onChange(clampAndRound(parsed), targetY);
    } else {
      onChange(targetX, clampAndRound(parsed));
    }
  };

  const clampedX = Math.max(0, Math.min(1, targetX));
  const clampedY = Math.max(0, Math.min(1, targetY));

  return (
    <InspectorFieldRow
      label={label}
      icon={<CrosshairIcon className="w-3.5 h-3.5" />}
      readout={`${(clampedX * 100).toFixed(0)}%, ${(clampedY * 100).toFixed(0)}%`}
      className={className}
    >
      <div className="flex flex-col gap-2">
        {/* 2D Coordinate Pad Frame */}
        <div
          ref={padRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full aspect-video rounded-lg border border-border/70 bg-secondary/30 overflow-hidden cursor-crosshair select-none touch-none hover:border-primary/50 transition-colors shadow-inner"
        >
          {/* Rule of thirds grid lines */}
          <div className="absolute inset-0 grid grid-cols-3 pointer-events-none opacity-20">
            <div className="border-r border-dashed border-foreground" />
            <div className="border-r border-dashed border-foreground" />
            <div />
          </div>
          <div className="absolute inset-0 grid grid-rows-3 pointer-events-none opacity-20">
            <div className="border-b border-dashed border-foreground" />
            <div className="border-b border-dashed border-foreground" />
            <div />
          </div>

          {/* Center reference point */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-muted-foreground/30 pointer-events-none" />

          {/* Focal Crosshair Reticle Indicator */}
          <div
            style={{
              left: `${clampedX * 100}%`,
              top: `${clampedY * 100}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
          >
            {/* Outer pulse circle */}
            <div className="w-6 h-6 rounded-full border border-primary/40 bg-primary/10 animate-pulse absolute" />
            {/* Center target ring */}
            <div className="w-3.5 h-3.5 rounded-full border-2 border-primary bg-background shadow-xs flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-primary" />
            </div>
          </div>
        </div>

        {/* Dual Monospace Coordinate Inputs + Reset */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-1">
            <div className="flex flex-1 items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 bg-background shadow-2xs focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
              <span className="text-[10px] font-mono font-medium text-muted-foreground select-none">
                X
              </span>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={clampedX}
                onChange={(e) => handleManualChange('x', e.target.value)}
                className="h-5 w-full border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono text-foreground"
              />
            </div>

            <div className="flex flex-1 items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 bg-background shadow-2xs focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
              <span className="text-[10px] font-mono font-medium text-muted-foreground select-none">
                Y
              </span>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={clampedY}
                onChange={(e) => handleManualChange('y', e.target.value)}
                className="h-5 w-full border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono text-foreground"
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetCenter}
            title="Reset to center (0.50, 0.50)"
            className="h-6 px-2 text-[11px] gap-1 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <RotateCcwIcon className="w-3 h-3" />
            <span>Center</span>
          </Button>
        </div>
      </div>
    </InspectorFieldRow>
  );
}
