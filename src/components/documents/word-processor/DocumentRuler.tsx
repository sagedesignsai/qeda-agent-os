/**
 * components/documents/word-processor/DocumentRuler.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive horizontal margin ruler for the Word Processor:
 *   - Calibrated to page width in centimeters / units
 *   - Visualizes left/right margin bounds with shaded margins
 *   - Allows dragging left and right margin sliders to adjust document padding
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useRef, useState } from 'react';
import type { DocumentMargins } from '@/lib/pdf-studio/types';

interface DocumentRulerProps {
  pageWidthPx: number;
  margins: DocumentMargins;
  onUpdateMargins: (margins: Partial<DocumentMargins>) => void;
  scale?: number;
}

export function DocumentRuler({
  pageWidthPx,
  margins,
  onUpdateMargins,
  scale = 1,
}: DocumentRulerProps) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<'left' | 'right' | null>(null);

  // Convert points to pixels based on current scale
  // Standard A4 width: 595.28 pt -> mapped to pageWidthPx
  const ptToPx = pageWidthPx / 595.28;
  const leftPx = margins.left * ptToPx;
  const rightPx = margins.right * ptToPx;

  // Number of centimeter increments across A4 (21cm)
  const totalCm = 21;
  const cmWidthPx = pageWidthPx / totalCm;

  const handleMouseDown = (type: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDrag(type);

    const startX = e.clientX;
    const initialMargin = type === 'left' ? margins.left : margins.right;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = (moveEvent.clientX - startX) / scale;
      const deltaPt = deltaPx / ptToPx;

      if (type === 'left') {
        const nextLeft = Math.max(18, Math.min(144, Math.round(initialMargin + deltaPt)));
        onUpdateMargins({ left: nextLeft });
      } else {
        const nextRight = Math.max(18, Math.min(144, Math.round(initialMargin - deltaPt)));
        onUpdateMargins({ right: nextRight });
      }
    };

    const handleMouseUp = () => {
      setActiveDrag(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="flex justify-center w-full bg-muted/10 border-b border-border/40 py-0.5 select-none overflow-hidden">
      <div
        ref={rulerRef}
        className="relative h-4 bg-muted/40 border border-border/40 rounded-sm text-[9px] text-muted-foreground font-mono flex items-center"
        style={{ width: `${pageWidthPx}px` }}
      >
        {/* Shaded Left Margin Area */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-muted/80 border-r border-border/60 pointer-events-none transition-all duration-75"
          style={{ width: `${leftPx}px` }}
        />

        {/* Shaded Right Margin Area */}
        <div
          className="absolute right-0 top-0 bottom-0 bg-muted/80 border-l border-border/60 pointer-events-none transition-all duration-75"
          style={{ width: `${rightPx}px` }}
        />

        {/* Centimeter Tick Marks */}
        {Array.from({ length: totalCm + 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex flex-col justify-between pointer-events-none"
            style={{ left: `${i * cmWidthPx}px` }}
          >
            <div className="h-1.5 w-[1px] bg-border/80" />
            {i > 0 && i < totalCm && i % 2 === 0 && (
              <span className="text-[8px] -translate-x-1/2 leading-none text-muted-foreground/70">
                {i}
              </span>
            )}
            <div className="h-1.5 w-[1px] bg-border/80" />
          </div>
        ))}

        {/* Left Margin Slider Marker */}
        <div
          className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-ew-resize z-10 flex flex-col items-center justify-center transition-colors group ${
            activeDrag === 'left' ? 'text-primary' : 'text-zinc-500 hover:text-primary'
          }`}
          style={{ left: `${leftPx}px` }}
          onMouseDown={(e) => handleMouseDown('left', e)}
          title={`Left Margin: ${Math.round(margins.left)} pt`}
        >
          {/* Inverted triangle handle */}
          <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[4px] border-t-current" />
          <div className="w-[1.5px] h-full bg-current" />
        </div>

        {/* Right Margin Slider Marker */}
        <div
          className={`absolute top-0 bottom-0 w-2 -ml-1 cursor-ew-resize z-10 flex flex-col items-center justify-center transition-colors group ${
            activeDrag === 'right' ? 'text-primary' : 'text-zinc-500 hover:text-primary'
          }`}
          style={{ right: `${rightPx}px` }}
          onMouseDown={(e) => handleMouseDown('right', e)}
          title={`Right Margin: ${Math.round(margins.right)} pt`}
        >
          <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[4px] border-t-current" />
          <div className="w-[1.5px] h-full bg-current" />
        </div>
      </div>
    </div>
  );
}
