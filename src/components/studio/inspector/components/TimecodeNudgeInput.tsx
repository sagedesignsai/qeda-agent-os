/**
 * components/studio/inspector/components/TimecodeNudgeInput.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * SMPTE timecode display and precision nudge controls:
 *   - Monospace formatted timecode (MM:SS.mmm)
 *   - Single-click micro nudges (-100ms, +100ms) and macro nudges (-1s, +1s)
 *   - Direct keyboard entry with bounds clamping
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClockIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { InspectorFieldRow } from './InspectorFieldRow';

interface TimecodeNudgeInputProps {
  label: string;
  timeMs: number;
  onChange: (newTimeMs: number) => void;
  min?: number;
  max?: number;
  icon?: React.ReactNode;
  className?: string;
}

export function formatMsToTimecode(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor(ms % 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

export function TimecodeNudgeInput({
  label,
  timeMs,
  onChange,
  min = 0,
  max = Infinity,
  icon = <ClockIcon className="w-3.5 h-3.5" />,
  className = '',
}: TimecodeNudgeInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [textValue, setTextValue] = useState(String(Math.round(timeMs)));

  useEffect(() => {
    if (!isEditing) {
      setTextValue(String(Math.round(timeMs)));
    }
  }, [timeMs, isEditing]);

  const applyNudge = (deltaMs: number) => {
    const next = Math.max(min, Math.min(max, timeMs + deltaMs));
    onChange(next);
  };

  const handleCommitManual = () => {
    setIsEditing(false);
    const parsed = parseFloat(textValue);
    if (isNaN(parsed)) {
      setTextValue(String(Math.round(timeMs)));
      return;
    }
    const next = Math.max(min, Math.min(max, parsed));
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommitManual();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setTextValue(String(Math.round(timeMs)));
    }
  };

  return (
    <InspectorFieldRow
      label={label}
      icon={icon}
      readout={formatMsToTimecode(timeMs)}
      className={className}
    >
      <div className="flex items-center gap-1.5 w-full">
        {/* Step back buttons */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyNudge(-1000)}
            disabled={timeMs <= min}
            title="Nudge back 1 second (-1000ms)"
            className="h-6 px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            -1s
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyNudge(-100)}
            disabled={timeMs <= min}
            title="Nudge back 100 milliseconds"
            className="h-6 px-1 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="w-3 h-3" />
          </Button>
        </div>

        {/* Center millisecond input / display */}
        <div className="flex flex-1 items-center gap-0.5 rounded-md border border-border/70 px-1.5 py-0.5 bg-background shadow-2xs focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Input
            type="number"
            value={textValue}
            onChange={(e) => {
              setIsEditing(true);
              setTextValue(e.target.value);
            }}
            onBlur={handleCommitManual}
            onKeyDown={handleKeyDown}
            className="h-5 w-full border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono text-foreground"
          />
          <span className="text-[10px] text-muted-foreground font-mono select-none">
            ms
          </span>
        </div>

        {/* Step forward buttons */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyNudge(100)}
            disabled={timeMs >= max}
            title="Nudge forward 100 milliseconds"
            className="h-6 px-1 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            <ChevronRightIcon className="w-3 h-3" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyNudge(1000)}
            disabled={timeMs >= max}
            title="Nudge forward 1 second (+1000ms)"
            className="h-6 px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          >
            +1s
          </Button>
        </div>
      </div>
    </InspectorFieldRow>
  );
}
