/**
 * components/trace/TraceInspector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Descriptor-driven property inspector, laid out like a design panel:
 * Transform (align to artboard, X/Y, rotation, scale), Layout (dimensions with
 * aspect lock), Appearance, Fill, Stroke, Text, Path, Layer and Animation.
 *
 * Fields read the value resolved at the playhead (so an animated property shows
 * the frame you are looking at) and write through `updateAttributes`, which
 * auto-keyframes when a track already exists. Every numeric field is a
 * `ScrubField`: drag the handle to scrub, commit once on release. The stopwatch
 * lives inside the field and creates/removes that property's track.
 */

import { useState } from 'react';
import {
  BlendIcon,
  CaseSensitiveIcon,
  DiamondIcon,
  EyeIcon,
  EyeOffIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  LockIcon,
  RadiusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SplineIcon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlignGroup,
  ColorField,
  FieldRow,
  LinkToggle,
  PairRow,
  TrackButton,
  type AlignKind,
} from '@/components/trace/inspector/fields';
import { PanelSection } from '@/components/trace/inspector/section';
import { ScrubField } from '@/components/trace/inspector/scrub-field';
import {
  getAnimatableProperties,
  getPropertyDescriptor,
  type PropertyDescriptor,
} from '@/lib/trace/elements/registry';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import { getElementPosition, positionPatch } from '@/lib/trace/resolve';
import {
  findElementDom,
  measureElementBBox,
} from '@/lib/trace/runtime/dom-renderer';
import { getObbCorners } from '@/lib/trace/gizmo/geometry';
import type {
  AnimatableProperty,
  Keyframe,
  TraceElement,
} from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

const EASINGS = [
  'linear',
  'power1.out',
  'power2.out',
  'power2.in',
  'power2.inOut',
  'power3.out',
  'expo.out',
  'sine.out',
  'sine.inOut',
  'circ.out',
  'back.out',
  'back.inOut',
  'elastic.out',
  'bounce.out',
];

/* ── Value helpers ─────────────────────────────────────────────────────────── */

function propertyValue(
  element: TraceElement,
  property: AnimatableProperty,
  timeMs: number,
): string | number {
  if (property === 'x' || property === 'y') {
    const position = getElementPosition(element, timeMs);
    return Math.round(property === 'x' ? position.x : position.y);
  }
  const descriptor = getPropertyDescriptor(element.type, property);
  if (element.tracks.some((track) => track.property === property)) {
    return resolveElementAtTime(element, timeMs).attributes[
      descriptor?.attribute ?? property
    ];
  }
  const raw = element.attributes?.[descriptor?.attribute ?? property];
  if (raw !== undefined && raw !== null && raw !== '') return raw;

  // Sensible defaults so an unset animated property doesn't read as 0%
  // (the old panel showed a freshly selected layer at 0% opacity).
  switch (property) {
    case 'opacity':
    case 'fillOpacity':
    case 'scaleX':
    case 'scaleY':
      return 1;
    case 'strokeWidth':
      return 1;
    case 'fontSize':
      return 16;
    default:
      return descriptor?.kind === 'color' ? '#ffffff' : '';
  }
}

function usePropertySetter(element: TraceElement, timeMs: number) {
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  return (property: AnimatableProperty, next: number | string) => {
    if (property === 'x' || property === 'y') {
      const position = getElementPosition(element, timeMs);
      const target =
        property === 'x'
          ? { x: Number(next), y: position.y }
          : { x: position.x, y: Number(next) };
      updateAttributes(element.id, positionPatch(element, target, timeMs));
      return;
    }
    updateAttributes(element.id, { [property]: next });
  };
}

/* ── Generic descriptor field ──────────────────────────────────────────────── */

function PropertyField({
  element,
  descriptor,
}: {
  element: TraceElement;
  descriptor: PropertyDescriptor;
}) {
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const set = usePropertySetter(element, timeMs);
  const value = propertyValue(element, descriptor.property, timeMs);
  const track = (
    <TrackButton
      element={element}
      property={descriptor.property}
      label={descriptor.label}
    />
  );

  if (descriptor.kind === 'color') {
    return (
      <FieldRow label={descriptor.label} wide>
        <ColorField
          label={descriptor.label}
          value={String(value ?? '#ffffff')}
          onChange={(next) => set(descriptor.property, next)}
          trailing={track}
        />
      </FieldRow>
    );
  }

  if (descriptor.kind === 'select' && descriptor.options) {
    return (
      <FieldRow label={descriptor.label} wide>
        <div className="flex items-center gap-1">
          <Select
            value={String(value ?? '')}
            onValueChange={(next) => set(descriptor.property, next)}
          >
            <SelectTrigger
              aria-label={descriptor.label}
              className="h-7 min-w-0 flex-1 bg-muted/20 text-[11px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {descriptor.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {track}
        </div>
      </FieldRow>
    );
  }

  if (descriptor.kind === 'boolean') {
    return (
      <FieldRow label={descriptor.label}>
        <div className="group/row flex h-7 items-center justify-end gap-2">
          {track}
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) =>
              set(descriptor.property, event.target.checked)
            }
            aria-label={descriptor.label}
            className="size-4 accent-sky-500"
          />
        </div>
      </FieldRow>
    );
  }

  if (
    descriptor.kind === 'text' ||
    descriptor.kind === 'strokeDash' ||
    descriptor.kind === 'boxShadow'
  ) {
    return (
      <FieldRow label={descriptor.label} wide align="start">
        <div className="group/row flex items-start gap-1">
          <Input
            value={String(value ?? '')}
            onChange={(event) =>
              set(descriptor.property, event.target.value)
            }
            aria-label={descriptor.label}
            spellCheck={false}
            className="h-7 min-w-0 flex-1 bg-muted/20 font-mono text-[11px]"
          />
          {track}
        </div>
      </FieldRow>
    );
  }

  // Numeric kinds: number, percent, progress, borderRadius.
  const ratio = descriptor.kind === 'percent' && descriptor.max === 1;
  const numeric = Number(value);
  const display = ratio
    ? Math.round((Number.isFinite(numeric) ? numeric : 0) * 100)
    : Number.isFinite(numeric)
      ? numeric
      : 0;
  const suffix =
    ratio || descriptor.kind === 'percent' || descriptor.kind === 'progress'
      ? '%'
      : descriptor.kind === 'borderRadius'
        ? 'px'
        : undefined;

  return (
    <FieldRow label={descriptor.label}>
      <ScrubField
        label={descriptor.label}
        value={display}
        min={ratio ? 0 : descriptor.min}
        max={ratio ? 100 : descriptor.max}
        step={ratio ? 1 : (descriptor.step ?? 1)}
        suffix={suffix}
        onChange={(next) =>
          set(
            descriptor.property,
            ratio ? Math.max(0, Math.min(1, next / 100)) : next,
          )
        }
        trailing={track}
      />
    </FieldRow>
  );
}

/* ── Transform ─────────────────────────────────────────────────────────────── */

function TransformSection({ element }: { element: TraceElement }) {
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const set = usePropertySetter(element, timeMs);
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  const project = useTraceStore((state) => state.project);
  const [scaleLinked, setScaleLinked] = useState(false);

  const x = Number(propertyValue(element, 'x', timeMs)) || 0;
  const y = Number(propertyValue(element, 'y', timeMs)) || 0;
  const rotation = Number(propertyValue(element, 'rotation', timeMs)) || 0;
  const scaleX = Number(propertyValue(element, 'scaleX', timeMs)) || 1;
  const scaleY = Number(propertyValue(element, 'scaleY', timeMs)) || 1;

  const align = (kind: AlignKind) => {
    if (!project) return;
    const node = findElementDom(element.id) as SVGGraphicsElement | null;
    if (!node) return;
    const box = measureElementBBox(node);
    if (!box) return;
    const { transform } = resolveElementAtTime(element, timeMs);
    const corners = getObbCorners(box, transform, element.origin ?? { x: 0, y: 0 });
    const xs = [corners.nw.x, corners.ne.x, corners.se.x, corners.sw.x];
    const ys = [corners.nw.y, corners.ne.y, corners.se.y, corners.sw.y];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    let dx = 0;
    let dy = 0;
    if (kind === 'left') dx = 0 - minX;
    if (kind === 'centerH') dx = project.width / 2 - (minX + maxX) / 2;
    if (kind === 'right') dx = project.width - maxX;
    if (kind === 'top') dy = 0 - minY;
    if (kind === 'centerV') dy = project.height / 2 - (minY + maxY) / 2;
    if (kind === 'bottom') dy = project.height - maxY;
    if (dx === 0 && dy === 0) return;
    // Move the base position only — alignment must not disturb rotation or
    // scale tracks the way a full transform patch would.
    updateAttributes(
      element.id,
      positionPatch(
        element,
        { x: transform.x + dx, y: transform.y + dy },
        timeMs,
      ),
    );
  };

  const setScale = (axis: 'x' | 'y', percent: number) => {
    const next = percent / 100;
    if (scaleLinked) {
      // One dispatch for both axes: a single undo entry, and no unrelated
      // rotation/position keyframes (transformPatch would write those too).
      updateAttributes(element.id, { scaleX: next, scaleY: next });
      return;
    }
    set(axis === 'x' ? 'scaleX' : 'scaleY', next);
  };

  return (
    <PanelSection
      title="Transform"
      action={
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Reset rotation"
            title="Reset rotation to 0°"
            onClick={() => set('rotation', 0)}
            className="size-6 text-muted-foreground hover:text-foreground"
          >
            <RotateCcwIcon className="size-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Flip horizontally"
            title="Flip horizontally"
            onClick={() => set('scaleX', -scaleX)}
            className="size-6 text-muted-foreground hover:text-foreground"
          >
            <FlipHorizontalIcon className="size-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Flip vertically"
            title="Flip vertically"
            onClick={() => set('scaleY', -scaleY)}
            className="size-6 text-muted-foreground hover:text-foreground"
          >
            <FlipVerticalIcon className="size-3" />
          </Button>
        </>
      }
    >
      <AlignGroup onAlign={align} />

      <PairRow
        left={
          <ScrubField
            label="X position"
            prefix="X"
            tone="x"
            value={x}
            step={1}
            onChange={(next) => set('x', next)}
            trailing={
              <TrackButton element={element} property="x" label="X position" />
            }
          />
        }
        right={
          <ScrubField
            label="Y position"
            prefix="Y"
            tone="y"
            value={y}
            step={1}
            onChange={(next) => set('y', next)}
            trailing={
              <TrackButton element={element} property="y" label="Y position" />
            }
          />
        }
      />

      <FieldRow label="Rotation">
        <ScrubField
          label="Rotation"
          prefix={<RotateCwIcon className="size-3" />}
          suffix="°"
          value={rotation}
          step={1}
          onChange={(next) => set('rotation', next)}
          trailing={
            <TrackButton
              element={element}
              property="rotation"
              label="Rotation"
            />
          }
        />
      </FieldRow>

      <PairRow
        link={
          <LinkToggle
            linked={scaleLinked}
            onToggle={() => setScaleLinked((linked) => !linked)}
            label="scale axes"
          />
        }
        left={
          <ScrubField
            label="Scale X"
            prefix="X"
            tone="x"
            suffix="%"
            value={Math.round(scaleX * 100)}
            step={1}
            onChange={(next) => setScale('x', next)}
            trailing={
              <TrackButton element={element} property="scaleX" label="Scale X" />
            }
          />
        }
        right={
          <ScrubField
            label="Scale Y"
            prefix="Y"
            tone="y"
            suffix="%"
            value={Math.round(scaleY * 100)}
            step={1}
            onChange={(next) => setScale('y', next)}
            trailing={
              <TrackButton element={element} property="scaleY" label="Scale Y" />
            }
          />
        }
      />
    </PanelSection>
  );
}

/* ── Layout ────────────────────────────────────────────────────────────────── */

function LayoutSection({ element }: { element: TraceElement }) {
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const set = usePropertySetter(element, timeMs);
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  const [linked, setLinked] = useState(false);

  const hasWidth = getPropertyDescriptor(element.type, 'width') !== undefined;
  const hasHeight =
    getPropertyDescriptor(element.type, 'height') !== undefined;
  const width = Number(propertyValue(element, 'width', timeMs));
  const height = Number(propertyValue(element, 'height', timeMs));

  const setDimension = (axis: 'width' | 'height', next: number) => {
    const value = Math.max(0, next);
    if (linked && Number.isFinite(width) && Number.isFinite(height)) {
      if (axis === 'width' && width > 0) {
        // One dispatch so an aspect-locked resize is a single undo entry.
        updateAttributes(element.id, {
          width: value,
          height: Math.round((height * value) / width),
        });
        return;
      }
      if (axis === 'height' && height > 0) {
        updateAttributes(element.id, {
          height: value,
          width: Math.round((width * value) / height),
        });
        return;
      }
    }
    set(axis, value);
  };

  const remaining = getAnimatableProperties(element.type).filter(
    (descriptor) =>
      descriptor.group === 'geometry' &&
      descriptor.property !== 'width' &&
      descriptor.property !== 'height' &&
      descriptor.property !== 'rx' &&
      // Poly points are edited by the Path section below.
      descriptor.property !== 'points' &&
      // Radii live in Appearance so they read consistently across types.
      descriptor.property !== 'borderRadius',
  );

  if (!hasWidth && remaining.length === 0) return null;

  return (
    <PanelSection title="Layout">
      {hasWidth ? (
        <PairRow
          link={
            hasHeight ? (
              <LinkToggle
                linked={linked}
                onToggle={() => setLinked((value) => !value)}
                label="dimensions"
              />
            ) : undefined
          }
          left={
            <ScrubField
              label="Width"
              prefix="W"
              value={Number.isFinite(width) ? width : 0}
              step={1}
              min={0}
              onChange={(next) => setDimension('width', next)}
              trailing={
                <TrackButton element={element} property="width" label="Width" />
              }
            />
          }
          right={
            hasHeight ? (
              <ScrubField
                label="Height"
                prefix="H"
                value={Number.isFinite(height) ? height : 0}
                step={1}
                min={0}
                onChange={(next) => setDimension('height', next)}
                trailing={
                  <TrackButton
                    element={element}
                    property="height"
                    label="Height"
                  />
                }
              />
            ) : (
              <span />
            )
          }
        />
      ) : null}

      {remaining.map((descriptor) => (
        <PropertyField
          key={descriptor.property}
          element={element}
          descriptor={descriptor}
        />
      ))}
    </PanelSection>
  );
}

/* ── Appearance ────────────────────────────────────────────────────────────── */

const PAINT_PROPERTIES = new Set<string>([
  'fill',
  'fillOpacity',
  'stroke',
  'strokeWidth',
  'strokeDasharray',
  'strokeDashoffset',
]);

function AppearanceSection({ element }: { element: TraceElement }) {
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const set = usePropertySetter(element, timeMs);
  const hasOpacity =
    getPropertyDescriptor(element.type, 'opacity') !== undefined;
  // Only a <rect> has a meaningful corner radius. See LayoutSection.
  const hasRadius =
    element.type === 'rect' &&
    getPropertyDescriptor(element.type, 'rx') !== undefined;
  const borderRadius =
    hasRadius ? undefined : getPropertyDescriptor(element.type, 'borderRadius');
  const opacity = Number(propertyValue(element, 'opacity', timeMs));
  const radius = Number(propertyValue(element, 'rx', timeMs));

  const remaining = getAnimatableProperties(element.type).filter(
    (descriptor) =>
      descriptor.group === 'appearance' &&
      !PAINT_PROPERTIES.has(descriptor.property) &&
      descriptor.property !== 'opacity',
  );

  if (!hasOpacity && !hasRadius && !borderRadius && remaining.length === 0) {
    return null;
  }

  return (
    <PanelSection title="Appearance">
      {hasOpacity ? (
        <FieldRow label="Opacity">
          <ScrubField
            label="Opacity"
            prefix={<BlendIcon className="size-3" />}
            suffix="%"
            value={Math.round(
              (Number.isFinite(opacity) ? opacity : 1) * 100,
            )}
            min={0}
            max={100}
            step={1}
            onChange={(next) =>
              set('opacity', Math.max(0, Math.min(1, next / 100)))
            }
            trailing={
              <TrackButton
                element={element}
                property="opacity"
                label="Opacity"
              />
            }
          />
        </FieldRow>
      ) : null}

      {hasRadius ? (
        <FieldRow label="Corner radius">
          <ScrubField
            label="Corner radius"
            prefix={<RadiusIcon className="size-3" />}
            suffix="px"
            value={Number.isFinite(radius) ? radius : 0}
            min={0}
            step={1}
            onChange={(next) => set('rx', Math.max(0, next))}
            trailing={
              <TrackButton
                element={element}
                property="rx"
                label="Corner radius"
              />
            }
          />
        </FieldRow>
      ) : null}

      {borderRadius ? (
        <PropertyField element={element} descriptor={borderRadius} />
      ) : null}

      {remaining.map((descriptor) => (
        <PropertyField
          key={descriptor.property}
          element={element}
          descriptor={descriptor}
        />
      ))}
    </PanelSection>
  );
}

/* ── Fill / Stroke ─────────────────────────────────────────────────────────── */

function FillSection({ element }: { element: TraceElement }) {
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const set = usePropertySetter(element, timeMs);
  const hasFill = getPropertyDescriptor(element.type, 'fill') !== undefined;
  const hasFillOpacity =
    getPropertyDescriptor(element.type, 'fillOpacity') !== undefined;
  if (!hasFill && !hasFillOpacity) return null;

  const fill = String(
    propertyValue(element, 'fill', timeMs) ?? '#ffffff',
  );
  const opacity = Number(propertyValue(element, 'fillOpacity', timeMs));

  return (
    <PanelSection title="Fill">
      {hasFill ? (
        <FieldRow label="Color" wide>
          <ColorField
            label="Fill"
            value={fill}
            onChange={(next) => set('fill', next)}
            trailing={
              <TrackButton element={element} property="fill" label="Fill" />
            }
          />
        </FieldRow>
      ) : null}
      {hasFillOpacity ? (
        <FieldRow label="Opacity">
          <ScrubField
            label="Fill opacity"
            prefix={<BlendIcon className="size-3" />}
            suffix="%"
            value={Math.round(
              (Number.isFinite(opacity) ? opacity : 1) * 100,
            )}
            min={0}
            max={100}
            step={1}
            onChange={(next) =>
              set('fillOpacity', Math.max(0, Math.min(1, next / 100)))
            }
            trailing={
              <TrackButton
                element={element}
                property="fillOpacity"
                label="Fill opacity"
              />
            }
          />
        </FieldRow>
      ) : null}
    </PanelSection>
  );
}

function StrokeSection({ element }: { element: TraceElement }) {
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const set = usePropertySetter(element, timeMs);
  const hasStroke =
    getPropertyDescriptor(element.type, 'stroke') !== undefined;
  const hasWidth =
    getPropertyDescriptor(element.type, 'strokeWidth') !== undefined;
  if (!hasStroke && !hasWidth) return null;

  const stroke = String(
    propertyValue(element, 'stroke', timeMs) ?? '#38bdf8',
  );
  const width = Number(propertyValue(element, 'strokeWidth', timeMs));
  const dash = getPropertyDescriptor(element.type, 'strokeDasharray');
  const dashOffset = getPropertyDescriptor(element.type, 'strokeDashoffset');

  return (
    <PanelSection title="Stroke">
      {hasStroke ? (
        <FieldRow label="Color" wide>
          <ColorField
            label="Stroke"
            value={stroke}
            onChange={(next) => set('stroke', next)}
            trailing={
              <TrackButton element={element} property="stroke" label="Stroke" />
            }
          />
        </FieldRow>
      ) : null}
      {hasWidth ? (
        <FieldRow label="Weight">
          <ScrubField
            label="Stroke width"
            value={Number.isFinite(width) ? width : 0}
            min={0}
            step={0.5}
            suffix="px"
            onChange={(next) => set('strokeWidth', Math.max(0, next))}
            trailing={
              <TrackButton
                element={element}
                property="strokeWidth"
                label="Stroke width"
              />
            }
          />
        </FieldRow>
      ) : null}
      {dash ? <PropertyField element={element} descriptor={dash} /> : null}
      {dashOffset ? (
        <PropertyField element={element} descriptor={dashOffset} />
      ) : null}
    </PanelSection>
  );
}

/* ── Text ──────────────────────────────────────────────────────────────────── */

function TextSection({ element }: { element: TraceElement }) {
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);
  const set = usePropertySetter(element, timeMs);
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  const fontWeight = String(element.attributes.fontWeight ?? 400);
  const fontFamily = String(
    element.attributes.fontFamily ?? 'Inter, sans-serif',
  );
  const textAnchor = String(element.attributes.textAnchor ?? 'start');
  const hasColor = getPropertyDescriptor(element.type, 'color') !== undefined;
  const color = String(propertyValue(element, 'color', timeMs) ?? '#ffffff');

  return (
    <PanelSection title="Text">
      <div className="group/row space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Content</span>
          <TrackButton element={element} property="text" label="Text" />
        </div>
        <textarea
          value={String(propertyValue(element, 'text', timeMs) ?? '')}
          onChange={(event) => set('text', event.target.value)}
          rows={2}
          aria-label="Text content"
          className="w-full resize-y rounded-md border border-input bg-muted/20 px-2 py-1.5 text-[11px] leading-relaxed text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
        />
      </div>

      <PairRow
        left={
          <ScrubField
            label="Font size"
            prefix={<CaseSensitiveIcon className="size-3" />}
            suffix="px"
            value={Number(propertyValue(element, 'fontSize', timeMs)) || 1}
            min={1}
            step={1}
            onChange={(next) => set('fontSize', Math.max(1, next))}
            trailing={
              <TrackButton
                element={element}
                property="fontSize"
                label="Font size"
              />
            }
          />
        }
        right={
          <ScrubField
            label="Tracking"
            prefix={<SplineIcon className="size-3" />}
            value={Number(propertyValue(element, 'letterSpacing', timeMs)) || 0}
            step={0.5}
            onChange={(next) => set('letterSpacing', next)}
            trailing={
              <TrackButton
                element={element}
                property="letterSpacing"
                label="Tracking"
              />
            }
          />
        }
      />

      <FieldRow label="Weight">
        <Select
          value={fontWeight}
          onValueChange={(next) =>
            updateAttributes(element.id, { fontWeight: Number(next) })
          }
        >
          <SelectTrigger
            aria-label="Font weight"
            className="h-7 bg-muted/20 text-[11px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['400', '500', '600', '700', '800'].map((weight) => (
              <SelectItem key={weight} value={weight}>
                {weight}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Font" wide>
        <Select
          value={fontFamily}
          onValueChange={(next) =>
            updateAttributes(element.id, { fontFamily: next })
          }
        >
          <SelectTrigger
            aria-label="Font family"
            className="h-7 bg-muted/20 text-[11px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              'Inter, sans-serif',
              'system-ui, sans-serif',
              'Georgia, serif',
              'ui-monospace, monospace',
            ].map((family) => (
              <SelectItem key={family} value={family}>
                {family}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Align">
        <div className="flex h-7 items-center gap-1">
          {(
            [
              { value: 'start', label: 'Left' },
              { value: 'middle', label: 'Centre' },
              { value: 'end', label: 'Right' },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={textAnchor === option.value ? 'secondary' : 'ghost'}
              aria-pressed={textAnchor === option.value}
              className="h-6 flex-1 px-1 text-[10px]"
              onClick={() =>
                updateAttributes(element.id, {
                  textAnchor: option.value,
                })
              }
            >
              {option.label}
            </Button>
          ))}
        </div>
      </FieldRow>

      {hasColor ? (
        <FieldRow label="Color" wide>
          <ColorField
            label="Text color"
            value={color}
            onChange={(next) => set('color', next)}
            trailing={
              <TrackButton
                element={element}
                property="color"
                label="Text color"
              />
            }
          />
        </FieldRow>
      ) : null}
    </PanelSection>
  );
}

/* ── Animation tracks ──────────────────────────────────────────────────────── */

function nearestKeyframe(
  element: TraceElement,
  property: AnimatableProperty,
): {
  trackId: string;
  keyframe: Keyframe;
} | null {
  const timeMs = useTraceStore.getState().playback.currentTimeMs;
  const track = element.tracks.find((entry) => entry.property === property);
  if (!track || track.keyframes.length === 0) return null;
  const nearest = track.keyframes.reduce((best, keyframe) =>
    Math.abs(keyframe.timeMs - timeMs) < Math.abs(best.timeMs - timeMs)
      ? keyframe
      : best,
  );
  return { trackId: track.id, keyframe: nearest };
}

function TrackRows({ element }: { element: TraceElement }) {
  const updateKeyframe = useTraceStore((state) => state.updateKeyframe);
  const deleteKeyframe = useTraceStore((state) => state.deleteKeyframe);
  const addKeyframe = useTraceStore((state) => state.addKeyframe);
  const removePropertyTrack = useTraceStore(
    (state) => state.removePropertyTrack,
  );
  const timeMs = useTraceStore((state) => state.playback.currentTimeMs);

  if (element.tracks.length === 0) {
    return (
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        No animation yet. Hover a property and click its stopwatch to start a
        track at the playhead.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {element.tracks.map((track) => {
        const nearest = nearestKeyframe(element, track.property);
        return (
          <div
            key={track.id}
            className="rounded-md border border-border/60 bg-muted/30 p-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-foreground">
                {getPropertyDescriptor(element.type, track.property)?.label ??
                  track.label}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 text-muted-foreground hover:text-sky-400"
                  onClick={() => addKeyframe(element.id, track.property)}
                  aria-label="Add keyframe at playhead"
                >
                  <DiamondIcon className="size-3" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 text-muted-foreground hover:text-rose-400"
                  onClick={() =>
                    removePropertyTrack(element.id, track.property)
                  }
                  aria-label="Remove track"
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
            </div>

            {nearest ? (
              <div className="mt-1 flex items-center gap-1">
                <span className="w-14 shrink-0 font-mono text-[9px] text-muted-foreground">
                  {Math.round(nearest.keyframe.timeMs)}ms
                </span>
                <Select
                  value={String(nearest.keyframe.easing)}
                  onValueChange={(next) =>
                    updateKeyframe(
                      element.id,
                      track.property,
                      nearest.keyframe.id,
                      { easing: next },
                    )
                  }
                >
                  <SelectTrigger
                    aria-label="Keyframe easing"
                    className="h-6 min-w-0 flex-1 bg-transparent px-1 text-[10px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EASINGS.map((easing) => (
                      <SelectItem key={easing} value={easing}>
                        {easing}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6 text-muted-foreground hover:text-rose-400"
                  onClick={() =>
                    deleteKeyframe(
                      element.id,
                      track.property,
                      nearest.keyframe.id,
                    )
                  }
                  aria-label="Delete nearest keyframe"
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
            ) : null}

            <div className="mt-1 flex flex-wrap gap-0.5">
              {track.keyframes.map((keyframe) => (
                <span
                  key={keyframe.id}
                  className={cn(
                    'size-1.5 rotate-45 rounded-[1px]',
                    Math.abs(keyframe.timeMs - timeMs) <= 10
                      ? 'bg-sky-400'
                      : 'bg-muted-foreground/50',
                  )}
                  title={`${Math.round(keyframe.timeMs)}ms`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Path data (double-click canvas editing entry point) ─────────────────── */

function PathDataSection({ element }: { element: TraceElement }) {
  const updateAttributes = useTraceStore((state) => state.updateAttributes);
  const startPathEdit = useTraceStore((state) => state.startPathEdit);
  const endPathEdit = useTraceStore((state) => state.endPathEdit);
  const editing = useTraceStore(
    (state) => state.selection.editingPathElementId === element.id,
  );
  const isPoints =
    element.type === 'polyline' || element.type === 'polygon';
  const value = isPoints
    ? String(element.attributes.points ?? '')
    : String(element.attributes.d ?? '');

  return (
    <PanelSection
      title="Path"
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => (editing ? endPathEdit() : startPathEdit(element.id))}
        >
          {editing ? 'Done editing' : 'Edit on canvas'}
        </Button>
      }
    >
      <textarea
        key={`${element.id}:${isPoints ? 'points' : 'd'}:${value}`}
        defaultValue={value}
        rows={4}
        spellCheck={false}
        onBlur={(event) => {
          const next = event.target.value;
          if (next !== value) {
            updateAttributes(element.id, {
              [isPoints ? 'points' : 'd']: next,
            });
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.blur();
          }
        }}
        aria-label={isPoints ? 'Points data' : 'Path data'}
        className="w-full resize-y rounded-md border border-input bg-muted/20 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
      />
      <p className="text-[9px] leading-relaxed text-muted-foreground">
        Double-click the layer on canvas to edit anchors directly.
        Cmd/Ctrl+Enter applies text edits.
      </p>
    </PanelSection>
  );
}

/* ── Canvas (no selection) ─────────────────────────────────────────────────── */

function CanvasInspector() {
  const project = useTraceStore((state) => state.project);
  const setCanvas = useTraceStore((state) => state.setCanvas);
  if (!project) return null;

  return (
    <>
      <PanelSection title="Artboard">
        <PairRow
          left={
            <ScrubField
              label="Width"
              prefix="W"
              value={project.width}
              min={16}
              step={2}
              onChange={(width) =>
                setCanvas({ width: Math.max(16, Math.round(width)) })
              }
            />
          }
          right={
            <ScrubField
              label="Height"
              prefix="H"
              value={project.height}
              min={16}
              step={2}
              onChange={(height) =>
                setCanvas({ height: Math.max(16, Math.round(height)) })
              }
            />
          }
        />
        <PairRow
          left={
            <ScrubField
              label="Duration"
              suffix="ms"
              value={project.durationMs}
              min={100}
              step={100}
              onChange={(durationMs) =>
                setCanvas({
                  durationMs: Math.max(100, Math.round(durationMs)),
                })
              }
            />
          }
          right={
            <ScrubField
              label="Frame rate"
              suffix="fps"
              value={project.fps}
              min={1}
              max={120}
              step={1}
              onChange={(fps) =>
                setCanvas({ fps: Math.max(1, Math.min(120, Math.round(fps))) })
              }
            />
          }
        />
      </PanelSection>

      <PanelSection title="Document">
        <dl className="space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Layers</dt>
            <dd className="font-mono text-foreground">
              {Object.keys(project.elements).length}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tracks</dt>
            <dd className="font-mono text-foreground">
              {Object.values(project.elements).reduce(
                (sum, element) => sum + element.tracks.length,
                0,
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Scenes</dt>
            <dd className="font-mono text-foreground">
              {project.storyboard?.scenes.length ?? 0}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Gradients</dt>
            <dd className="font-mono text-foreground">
              {Object.keys(project.gradients ?? {}).length}
            </dd>
          </div>
        </dl>
      </PanelSection>

      <PanelSection title="Shortcuts" defaultOpen={false}>
        <ul className="space-y-1 text-[10px] text-muted-foreground">
          <li>
            <span className="font-mono text-foreground">Space</span> play /
            pause
          </li>
          <li>
            <span className="font-mono text-foreground">⌘/Ctrl+Z</span> undo
          </li>
          <li>
            <span className="font-mono text-foreground">⌘/Ctrl+S</span> save
          </li>
          <li>
            <span className="font-mono text-foreground">⌘/Ctrl+D</span>{' '}
            duplicate layer
          </li>
          <li>
            <span className="font-mono text-foreground">Double-click path</span>{' '}
            edit anchors
          </li>
          <li>
            <span className="font-mono text-foreground">Delete</span> remove
            layer / keyframe / anchor
          </li>
          <li>
            <span className="font-mono text-foreground">← →</span> step 1 frame
          </li>
        </ul>
      </PanelSection>
    </>
  );
}

/* ── Inspector root ────────────────────────────────────────────────────────── */

export function TraceInspector() {
  const project = useTraceStore((state) => state.project);
  const selectedElementId = useTraceStore(
    (state) => state.selection.selectedElementId,
  );
  const element = selectedElementId
    ? (project?.elements[selectedElementId] ?? null)
    : null;

  const toggleFlag = (
    patch: Partial<Pick<TraceElement, 'visible' | 'locked'>>,
  ) => {
    if (!element) return;
    useTraceStore
      .getState()
      .dispatch([{ type: 'updateElement', id: element.id, ...patch }]);
  };

  return (
    <aside className="flex w-[304px] shrink-0 flex-col border-l border-border bg-card text-card-foreground">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0 flex-1">
          {element ? (
            <Input
              key={element.id}
              defaultValue={element.name}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== element.name) {
                  useTraceStore
                    .getState()
                    .dispatch([
                      { type: 'updateElement', id: element.id, name: next },
                    ]);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              aria-label="Layer name"
              className="h-7 border-transparent bg-transparent px-1 text-[12px] font-medium shadow-none hover:border-input focus-visible:border-input focus-visible:ring-0"
            />
          ) : (
            <p className="truncate text-[12px] font-medium">
              {project?.name ?? 'Composition'}
            </p>
          )}
          <div className="flex min-w-0 items-center gap-1.5 px-1">
            <span className="inline-flex shrink-0 rounded bg-muted px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {element ? element.type : 'artboard'}
            </span>
            {element ? (
              <span className="truncate font-mono text-[9px] text-muted-foreground/70">
                {element.id}
              </span>
            ) : null}
          </div>
        </div>
        {element ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => toggleFlag({ visible: !element.visible })}
              title={element.visible ? 'Hide layer' : 'Show layer'}
              aria-label={element.visible ? 'Hide layer' : 'Show layer'}
              aria-pressed={!element.visible}
              className={cn(
                'text-muted-foreground hover:text-foreground',
                !element.visible && 'text-muted-foreground/50',
              )}
            >
              {element.visible ? (
                <EyeIcon className="size-3.5" />
              ) : (
                <EyeOffIcon className="size-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => toggleFlag({ locked: !element.locked })}
              title={element.locked ? 'Unlock layer' : 'Lock layer'}
              aria-label={element.locked ? 'Unlock layer' : 'Lock layer'}
              aria-pressed={element.locked}
              className={cn(
                'text-muted-foreground hover:text-foreground',
                element.locked && 'text-sky-400 hover:text-sky-300',
              )}
            >
              <LockIcon className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!element ? (
          <CanvasInspector />
        ) : (
          <>
            <TransformSection element={element} />
            <LayoutSection element={element} />
            <AppearanceSection element={element} />
            <FillSection element={element} />
            <StrokeSection element={element} />
            {element.type === 'text' ? <TextSection element={element} /> : null}
            {element.type === 'path' ||
            element.type === 'polyline' ||
            element.type === 'polygon' ? (
              <PathDataSection element={element} />
            ) : null}
            <PanelSection title="Layer">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 px-2 text-[10px]"
                  onClick={() =>
                    useTraceStore.getState().dispatch([
                      {
                        type: 'duplicateElement',
                        id: element.id,
                        offset: { x: 20, y: 20 },
                      },
                    ])
                  }
                >
                  Duplicate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 px-2 text-[10px] text-rose-400 hover:text-rose-300"
                  onClick={() =>
                    useTraceStore
                      .getState()
                      .dispatch([{ type: 'deleteElement', id: element.id }])
                  }
                >
                  Delete
                </Button>
              </div>
            </PanelSection>
            <PanelSection title="Animation">
              <TrackRows element={element} />
            </PanelSection>
          </>
        )}
      </ScrollArea>

      <div className="border-t border-border/60 px-3 py-1.5">
        <p className="truncate font-mono text-[9px] text-muted-foreground">
          {element?.id ?? project?.id}
        </p>
      </div>
    </aside>
  );
}
