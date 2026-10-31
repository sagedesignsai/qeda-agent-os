/**
 * components/motion/inspector/MotionPropertyFields.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Embedded, registry-driven property controls for Motion nodes. Controls edit
 * local drafts and report committed values so inspector edits map cleanly to
 * one Motion op instead of an op for every keystroke.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { MotionPropertyHint } from '@/lib/motion/node-registry';
import type { MotionAsset, MotionVector3 } from '@/lib/motion/types';

type PropertyValue = string | number | boolean | MotionVector3 | undefined;

type MotionPropertyFieldsProps = {
  hints: Readonly<Record<string, MotionPropertyHint>>;
  values: Readonly<Record<string, unknown>>;
  assets?: readonly MotionAsset[];
  idPrefix?: string;
  mixedProperties?: ReadonlySet<string>;
  onChange: (property: string, value: PropertyValue) => void;
};

type MotionPropertyFieldProps = {
  id: string;
  label: string;
  hint: MotionPropertyHint;
  value: unknown;
  assets: readonly MotionAsset[];
  onChange: (value: PropertyValue) => void;
};

const ASSET_NONE = '__motion_no_asset__';
const AXES = ['x', 'y', 'z'] as const;

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

function toHexColor(value: string): string {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return '#ffffff';
}

function MotionNumberInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: MotionPropertyHint;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    if (draft.trim() === '') {
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(parsed, hint.min, hint.max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        min={hint.min}
        max={hint.max}
        step={hint.step ?? 'any'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="h-7 text-xs tabular-nums"
      />
    </Field>
  );
}

function MotionSliderInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: MotionPropertyHint;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const min = hint.min ?? 0;
  const max = hint.max ?? 1;
  const step = hint.step ?? 0.01;

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = clamp(draft, hint.min, hint.max);
    setDraft(next);
    if (next !== value) onChange(next);
  };

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Slider
          aria-label={`${label} slider`}
          value={[draft]}
          min={min}
          max={max}
          step={step}
          onValueChange={([next]) => {
            if (next !== undefined) setDraft(next);
          }}
          onValueCommit={([next]) => {
            if (next !== undefined) {
              const bounded = clamp(next, hint.min, hint.max);
              setDraft(bounded);
              if (bounded !== value) onChange(bounded);
            }
          }}
          className="min-w-0 flex-1"
        />
        <Input
          id={id}
          type="number"
          min={hint.min}
          max={hint.max}
          step={step}
          value={draft}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) setDraft(clamp(parsed, hint.min, hint.max));
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-7 w-16 shrink-0 px-1.5 text-right text-xs tabular-nums"
        />
      </div>
    </Field>
  );
}

function MotionColorInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (!draft.trim()) {
      setDraft(value);
      return;
    }
    if (draft !== value) onChange(draft);
  };

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={toHexColor(draft)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="size-7 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-7 text-xs"
        />
      </div>
    </Field>
  );
}

function MotionTextInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onChange(draft);
  };

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="h-7 text-xs"
      />
    </Field>
  );
}

export function MotionVector3Field({
  id,
  label,
  value,
  mixed = false,
  onChange,
}: {
  id: string;
  label: string;
  value: MotionVector3;
  mixed?: boolean;
  onChange: (value: MotionVector3) => void;
}) {
  const [draft, setDraft] = useState(value.map(String));

  useEffect(() => setDraft(value.map(String)), [value[0], value[1], value[2]]);

  const commit = (axisIndex: number) => {
    const parsed = draft.map(Number);
    if (!parsed.every(Number.isFinite)) {
      setDraft(value.map(String));
      return;
    }
    const next = parsed as MotionVector3;
    setDraft(next.map(String));
    if (next[axisIndex] !== value[axisIndex]) onChange(next);
  };

  return (
    <Field className="gap-1">
        <FieldLabel className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {label}
          {mixed && <span className="font-normal">Mixed</span>}
        </FieldLabel>
      <div className="grid grid-cols-3 gap-1">
        {AXES.map((axis, index) => (
          <Input
            key={axis}
            id={`${id}-${axis}`}
            aria-label={`${label} ${axis.toUpperCase()}`}
            type="number"
            step="any"
            value={draft[index]}
            onChange={(event) =>
              setDraft((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                ),
              )
            }
            onBlur={() => commit(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            className="h-7 min-w-0 px-1.5 text-center text-xs tabular-nums"
          />
        ))}
      </div>
    </Field>
  );
}

function MotionPropertyField({
  id,
  label,
  hint,
  value,
  assets,
  onChange,
}: MotionPropertyFieldProps) {
  if (hint.control === 'text') {
    return (
      <MotionTextInput
          id={id}
          label={label}
          value={String(value ?? '')}
          onChange={(next) => onChange(next)}
        />
    );
  }

  if (hint.control === 'number' || hint.control === 'slider') {
    const numericValue = typeof value === 'number' ? value : 0;
    const change = (next: number) => onChange(next);

    if (
      hint.control === 'slider' &&
      Number.isFinite(hint.min) &&
      Number.isFinite(hint.max) &&
      hint.max! > hint.min!
    ) {
      return (
        <MotionSliderInput
          id={id}
          label={label}
          hint={hint}
          value={numericValue}
          onChange={change}
        />
      );
    }
    return (
      <MotionNumberInput
        id={id}
        label={label}
        hint={hint}
        value={numericValue}
        onChange={change}
      />
    );
  }

  if (hint.control === 'color') {
    return (
      <MotionColorInput
        id={id}
        label={label}
        value={typeof value === 'string' ? value : '#ffffff'}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (hint.control === 'vector3') {
    const vector =
      Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
        ? (value as MotionVector3)
        : [0, 0, 0] as MotionVector3;
    return (
      <MotionVector3Field
        id={id}
        label={label}
        value={vector}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (hint.control === 'toggle') {
    return (
      <Field orientation="horizontal" className="items-center justify-between">
        <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
          {label}
        </FieldLabel>
        <Switch
          id={id}
          size="sm"
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </Field>
    );
  }

  if (hint.control === 'select') {
    return (
      <Field className="gap-1">
        <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
          {label}
        </FieldLabel>
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} size="sm" className="h-7 w-full text-xs">
            <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(hint.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  if (hint.control === 'asset') {
    const compatibleAssets = assets.filter(
      (asset) => !hint.assetKind || asset.kind === hint.assetKind,
    );
    const currentValue = typeof value === 'string' ? value : ASSET_NONE;
    const selectedAsset = compatibleAssets.find(
      (asset) =>
        asset.id === currentValue ||
        asset.id === `builtin:${currentValue}`,
    );
    const selectValue = selectedAsset?.id ?? currentValue;

    return (
      <Field className="gap-1">
        <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
          {label}
        </FieldLabel>
        <Select
          value={selectValue}
          disabled={compatibleAssets.length === 0}
          onValueChange={(next) =>
            onChange(next === ASSET_NONE ? undefined : next)
          }
        >
          <SelectTrigger id={id} size="sm" className="h-7 w-full text-xs">
            <SelectValue
              placeholder={
                compatibleAssets.length > 0
                  ? `Choose ${label.toLowerCase()}`
                  : 'No compatible assets'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ASSET_NONE}>No asset</SelectItem>
              {selectValue !== ASSET_NONE &&
                !compatibleAssets.some((asset) => asset.id === selectValue) && (
                  <SelectItem value={selectValue} disabled>
                    Current asset unavailable
                  </SelectItem>
                )}
              {compatibleAssets.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {asset.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }

  return null;
}

export function MotionPropertyFields({
  hints,
  values,
  assets = [],
  idPrefix = 'motion-property',
  mixedProperties = new Set(),
  onChange,
}: MotionPropertyFieldsProps) {
  const groups = useMemo(() => {
    const grouped = new Map<string, Array<[string, MotionPropertyHint]>>();
    for (const [property, hint] of Object.entries(hints)) {
      const group = hint.group ?? 'Properties';
      const fields = grouped.get(group) ?? [];
      fields.push([property, hint]);
      grouped.set(group, fields);
    }
    return [...grouped.entries()];
  }, [hints]);

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([group, fields]) => (
        <section key={group} aria-label={`${group} properties`}>
          <h3 className="mb-2 text-[10px] font-medium text-muted-foreground">
            {group}
          </h3>
          <FieldGroup className="gap-2.5">
            {fields.map(([property, hint]) => (
              <div key={property}>
                {mixedProperties.has(property) && (
                  <span className="mb-1 block text-[9px] font-medium text-muted-foreground">
                    Mixed values across selection
                  </span>
                )}
                <MotionPropertyField
                  id={`${idPrefix}-${property}`}
                  label={hint.label ?? property}
                  hint={hint}
                  value={values[property]}
                  assets={assets}
                  onChange={(next) => onChange(property, next)}
                />
              </div>
            ))}
          </FieldGroup>
        </section>
      ))}
    </div>
  );
}

export type { MotionPropertyHint };
