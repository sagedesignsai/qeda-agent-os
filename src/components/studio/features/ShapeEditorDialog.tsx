/**
 * components/studio/features/ShapeEditorDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Vector shape editor for `itemType: 'shape'` clips.
 *
 * Supports preset kinds plus raw SVG path data, fill/stroke styling and a
 * trimmed-path preview. Apply writes a full `ShapeClipPayload` onto the clip.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleIcon,
  MessageSquareIcon,
  MoveRightIcon,
  PenToolIcon,
  RectangleHorizontalIcon,
  ShapesIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { StudioShapeKind } from '@/lib/studio/types';
import {
  createArrowShape,
  createCalloutShape,
  createCircleShape,
  createHeartShape,
  createRectShape,
} from '@/lib/studio/shapes/presets';
import { FeatureDialog } from './FeatureDialog';

export interface ShapeEditorValue {
  shapeKind: StudioShapeKind;
  pathData: string;
  fill?: string;
  stroke?: { color: string; width: number };
  trim?: { start: number; end: number; offset: number };
  pathLengthPx?: number;
}

interface ShapeEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipName: string;
  value: ShapeEditorValue;
  onApply: (value: ShapeEditorValue) => void;
}

const KIND_OPTIONS: Array<{
  value: StudioShapeKind;
  label: string;
  icon: typeof ShapesIcon;
  create: () => string;
}> = [
  {
    value: 'rect',
    label: 'Rectangle',
    icon: RectangleHorizontalIcon,
    create: () => createRectShape(120, 90, 10),
  },
  {
    value: 'circle',
    label: 'Circle',
    icon: CircleIcon,
    create: () => createCircleShape(60),
  },
  {
    value: 'arrow',
    label: 'Arrow',
    icon: MoveRightIcon,
    create: () => createArrowShape(160, 64, 46),
  },
  {
    value: 'callout',
    label: 'Callout',
    icon: MessageSquareIcon,
    create: () => createCalloutShape(140, 80, 10, 18),
  },
  {
    value: 'path',
    label: 'Custom Path',
    icon: PenToolIcon,
    create: () => createHeartShape(120),
  },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isValidPath(pathData: string): boolean {
  if (!pathData.trim()) return false;
  if (typeof Path2D === 'undefined') return true;
  try {
    new Path2D(pathData);
    return true;
  } catch {
    return false;
  }
}

export function ShapeEditorDialog({
  open,
  onOpenChange,
  clipName,
  value,
  onApply,
}: ShapeEditorDialogProps) {
  const [kind, setKind] = useState<StudioShapeKind>(value.shapeKind);
  const [pathData, setPathData] = useState(value.pathData);
  const [fill, setFill] = useState(value.fill ?? '#ffffff');
  const [fillEnabled, setFillEnabled] = useState(Boolean(value.fill));
  const [strokeColor, setStrokeColor] = useState(
    value.stroke?.color ?? '#0f172a',
  );
  const [strokeWidth, setStrokeWidth] = useState(value.stroke?.width ?? 2);
  const [trimStart, setTrimStart] = useState(value.trim?.start ?? 0);
  const [trimEnd, setTrimEnd] = useState(value.trim?.end ?? 1);
  const [trimOffset, setTrimOffset] = useState(value.trim?.offset ?? 0);
  const [measuredLength, setMeasuredLength] = useState<number>(
    value.pathLengthPx ?? 0,
  );
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind(value.shapeKind);
    setPathData(value.pathData);
    setFill(value.fill ?? '#ffffff');
    setFillEnabled(Boolean(value.fill));
    setStrokeColor(value.stroke?.color ?? '#0f172a');
    setStrokeWidth(value.stroke?.width ?? 2);
    setTrimStart(value.trim?.start ?? 0);
    setTrimEnd(value.trim?.end ?? 1);
    setTrimOffset(value.trim?.offset ?? 0);
    setMeasuredLength(value.pathLengthPx ?? 0);
    // Reset only when the dialog opens or the underlying clip changes; the
    // parent recreates `value` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    value.shapeKind,
    value.pathData,
    value.fill,
    value.stroke?.color,
    value.stroke?.width,
    value.trim?.start,
    value.trim?.end,
    value.trim?.offset,
    value.pathLengthPx,
  ]);

  useEffect(() => {
    const path = pathRef.current;
    if (!path || typeof path.getTotalLength !== 'function') return;
    try {
      const length = path.getTotalLength();
      if (Number.isFinite(length) && length > 0) setMeasuredLength(length);
    } catch {
      // Measurement is only needed for the trim preview; ignore failures.
    }
  }, [pathData]);

  const valid = useMemo(() => isValidPath(pathData), [pathData]);
  const total = measuredLength > 0 ? measuredLength : 0;
  const startPx = clamp01(trimStart) * total;
  const endPx = clamp01(trimEnd) * total;
  const visiblePx = Math.max(0, endPx - startPx);
  const trimActive = trimStart > 0 || trimEnd < 1 || trimOffset !== 0;
  const strokeDash = trimActive && total > 0
    ? `${visiblePx} ${Math.max(total, visiblePx + 1)}`
    : undefined;

  const chooseKind = (next: StudioShapeKind) => {
    setKind(next);
    const preset = KIND_OPTIONS.find((option) => option.value === next);
    if (preset && (next !== 'path' || !valid)) {
      setPathData(preset.create());
    }
  };

  return (
    <FeatureDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Shape"
      description={clipName}
      icon={<ShapesIcon className="size-4 text-amber-400" />}
      helpText="Shapes are live vector paths. Trim reveals a stroke progressively — animate start/end with keyframes for hand-drawn reveals."
      width="lg"
      applyDisabled={!valid}
      onApply={() =>
        onApply({
          shapeKind: kind,
          pathData: pathData.trim(),
          fill: fillEnabled ? fill : undefined,
          stroke: { color: strokeColor, width: Math.max(0, strokeWidth) },
          trim: {
            start: clamp01(trimStart),
            end: clamp01(trimEnd),
            offset: clamp01(trimOffset),
          },
          pathLengthPx: measuredLength > 0 ? measuredLength : undefined,
        })
      }
      testId="shape-editor-dialog"
      preview={
        <div
          role="img"
          aria-label="Live shape preview"
          className="relative overflow-hidden rounded-lg border border-border/60 bg-[#0b1020]"
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.04)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.04)_75%),linear-gradient(45deg,rgba(255,255,255,0.04)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.04)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px]" />
          <svg
            viewBox="-130 -100 260 200"
            className="relative block h-44 w-full"
            aria-hidden="true"
          >
            {valid && (
              <path
                ref={pathRef}
                d={pathData}
                fill={fillEnabled ? fill : 'none'}
                stroke={strokeColor}
                strokeWidth={Math.max(0, strokeWidth)}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={strokeDash}
                strokeDashoffset={trimActive ? -startPx - trimOffset * total : 0}
              />
            )}
          </svg>
          <span className="absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80">
            {KIND_OPTIONS.find((option) => option.value === kind)?.label}
            {total > 0 ? ` · ${Math.round(total)}px` : ''}
          </span>
        </div>
      }
    >
      <div
        role="radiogroup"
        aria-label="Shape kind"
        className="grid grid-cols-5 gap-1"
      >
        {KIND_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.value === kind;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              onClick={() => chooseKind(option.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[9px] transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/40'
                  : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              <Icon className="size-4" />
              {option.label}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
        SVG path data
        <Textarea
          value={pathData}
          onChange={(event) => setPathData(event.target.value)}
          aria-label="SVG path data"
          spellCheck={false}
          className={cn(
            'min-h-16 resize-none bg-background font-mono text-[11px]',
            !valid && 'border-destructive ring-1 ring-destructive/40',
          )}
        />
        <span
          className={cn(
            'text-[9px]',
            valid ? 'text-muted-foreground' : 'text-destructive',
          )}
        >
          {valid
            ? 'Valid path. Coordinates are relative to the shape centre.'
            : 'Invalid SVG path data. Expected commands like M, L, C, Q, A and Z.'}
        </span>
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[10px] font-medium text-muted-foreground">
            Fill
            <Input
              type="color"
              value={fill}
              disabled={!fillEnabled}
              onChange={(event) => setFill(event.target.value)}
              aria-label="Shape fill color"
              className="h-7 w-full cursor-pointer bg-background p-1"
            />
          </label>
          <label className="flex h-7 items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={fillEnabled}
              onChange={(event) => setFillEnabled(event.target.checked)}
              className="size-3.5 accent-primary"
            />
            Filled
          </label>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
            Stroke
            <Input
              type="color"
              value={strokeColor}
              onChange={(event) => setStrokeColor(event.target.value)}
              aria-label="Shape stroke color"
              className="h-7 w-full cursor-pointer bg-background p-1"
            />
          </label>
          <label className="flex w-24 flex-col gap-1 text-[10px] font-medium text-muted-foreground">
            Width · {strokeWidth}px
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={strokeWidth}
              aria-label="Shape stroke width"
              onChange={(event) => setStrokeWidth(Number(event.target.value))}
              className="h-7 w-full accent-primary"
            />
          </label>
        </div>
      </div>

      <fieldset className="rounded-md border border-border/40 p-2">
        <legend className="px-1 text-[10px] font-semibold text-muted-foreground">
          Path trim
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            {
              label: 'Start',
              value: trimStart,
              set: setTrimStart,
              aria: 'Trim start',
            },
            {
              label: 'End',
              value: trimEnd,
              set: setTrimEnd,
              aria: 'Trim end',
            },
            {
              label: 'Offset',
              value: trimOffset,
              set: setTrimOffset,
              aria: 'Trim offset',
            },
          ].map((field) => (
            <label
              key={field.label}
              className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground"
            >
              {field.label} · {field.value.toFixed(2)}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={field.value}
                aria-label={field.aria}
                onChange={(event) => field.set(Number(event.target.value))}
                className="h-7 w-full accent-primary"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-[9px] text-muted-foreground">
          Trim only affects the stroke, matching how the canvas renders paths.
        </p>
      </fieldset>
    </FeatureDialog>
  );
}