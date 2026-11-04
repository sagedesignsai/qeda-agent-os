/**
 * components/motion/inspector/controls/rotation-orb.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A sphere you grab to aim an object: horizontal drag is yaw (Y), vertical drag
 * is pitch (X). Roll (Z) stays on the numeric row because a 2D projection cannot
 * show it without becoming a rubber-band UI.
 *
 * Pitch is clamped to ±90° the way an orbit camera is; use the numeric fields
 * when a full flip is genuinely wanted.
 */

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { MotionVector3 } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

const PITCH_LIMIT = 90;
const YAW_LIMIT = 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value);
}

export type RotationOrbProps = {
  id: string;
  label?: string;
  value: MotionVector3;
  onChange: (value: MotionVector3) => void;
  disabled?: boolean;
  className?: string;
};

export function RotationOrb({
  id,
  label = 'Rotation orb',
  value,
  onChange,
  disabled = false,
  className,
}: RotationOrbProps) {
  const orbRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    originPitch: number;
    originYaw: number;
  } | null>(null);
  const draftRef = useRef<{ pitch: number; yaw: number } | null>(null);
  const [draft, setDraft] = useState<{ pitch: number; yaw: number } | null>(null);

  const [pitch, yaw, roll] = value;
  const shownPitch = draft?.pitch ?? pitch;
  const shownYaw = draft?.yaw ?? yaw;

  const updateDraft = (point: { pitch: number; yaw: number } | null) => {
    draftRef.current = point;
    setDraft(point);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originPitch: pitch,
      originYaw: yaw,
    };
    updateDraft({ pitch, yaw });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const rect = orbRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    updateDraft({
      pitch: clamp(
        round(state.originPitch + ((event.clientY - state.startY) / rect.height) * 180),
        -PITCH_LIMIT,
        PITCH_LIMIT,
      ),
      yaw: clamp(
        round(state.originYaw + ((event.clientX - state.startX) / rect.width) * 360),
        -YAW_LIMIT,
        YAW_LIMIT,
      ),
    });
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const next = draftRef.current;
    updateDraft(null);
    if (!next) return;
    if (next.pitch !== pitch || next.yaw !== yaw) {
      onChange([next.pitch, next.yaw, roll]);
    }
  };

  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const delta = event.shiftKey ? 15 : 5;
    let nextPitch = pitch;
    let nextYaw = yaw;
    if (event.key === 'ArrowUp') nextPitch = clamp(pitch - delta, -PITCH_LIMIT, PITCH_LIMIT);
    else if (event.key === 'ArrowDown') nextPitch = clamp(pitch + delta, -PITCH_LIMIT, PITCH_LIMIT);
    else if (event.key === 'ArrowLeft') nextYaw = clamp(yaw - delta, -YAW_LIMIT, YAW_LIMIT);
    else if (event.key === 'ArrowRight') nextYaw = clamp(yaw + delta, -YAW_LIMIT, YAW_LIMIT);
    else if (event.key === 'Home') {
      nextPitch = 0;
      nextYaw = 0;
    } else {
      return;
    }
    event.preventDefault();
    onChange([nextPitch, nextYaw, roll]);
  };

  const yawRatio = clamp(shownYaw / YAW_LIMIT, -1, 1);
  const pitchRatio = clamp(shownPitch / PITCH_LIMIT, -1, 1);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {shownYaw}° · {shownPitch}°
        </span>
      </div>
      <div
        ref={orbRef}
        id={id}
        role="application"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={nudge}
        onDoubleClick={() => {
          if (!disabled && (pitch !== 0 || yaw !== 0)) onChange([0, 0, roll]);
        }}
        className={cn(
          'relative mx-auto aspect-square w-full max-w-[150px] touch-none overflow-hidden rounded-full border border-border/60 bg-gradient-to-br from-muted/70 via-background to-background outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing',
        )}
      >
        <div className="pointer-events-none absolute inset-[10%] rounded-full border border-border/40" />
        <div className="pointer-events-none absolute inset-[26%] rounded-full border border-border/30" />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/40" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/40" />
        <div className="pointer-events-none absolute inset-[6%] rounded-full border border-dashed border-border/20" />
        <div
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-primary/30"
          style={{ left: `${50 + yawRatio * 42}%`, top: `${50 + pitchRatio * 42}%` }}
        />
      </div>
    </div>
  );
}
