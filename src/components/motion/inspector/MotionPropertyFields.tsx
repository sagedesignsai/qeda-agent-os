/**
 * components/motion/inspector/MotionPropertyFields.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Embedded, registry-driven property controls for Motion nodes. Controls edit
 * local drafts and report committed values so inspector edits map cleanly to
 * one Motion op instead of an op for every keystroke.
 *
 * The numeric, vector, asset, colour and segmented widgets come from
 * `./controls`; this module only maps a hint's `control` to one of them and
 * decides how the registry's hints group in the panel.
 */

import { useEffect, useMemo, useState } from 'react';

import { AssetPicker } from '@/components/motion/inspector/controls/asset-picker';
import { ColorField } from '@/components/motion/inspector/controls/color-field';
import { ScrubNumberField } from '@/components/motion/inspector/controls/scrub-number';
import { SegmentedSelect } from '@/components/motion/inspector/controls/segmented-select';
import { VectorField } from '@/components/motion/inspector/controls/vector-field';
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
import { Textarea } from '@/components/ui/textarea';
import type { MotionPropertyHint } from '@/lib/motion/node-registry';
import type { MotionAsset, MotionVector3 } from '@/lib/motion/types';

type PropertyValue = string | number | boolean | MotionVector3 | undefined;

type MotionPropertyFieldsProps = {
  hints: Readonly<Record<string, MotionPropertyHint>>;
  values: Readonly<Record<string, unknown>>;
  assets?: readonly MotionAsset[];
  idPrefix?: string;
  mixedProperties?: ReadonlySet<string>;
  disabled?: boolean;
  onChange: (property: string, value: PropertyValue) => void;
};

type MotionPropertyFieldProps = {
  id: string;
  label: string;
  hint: MotionPropertyHint;
  value: unknown;
  assets: readonly MotionAsset[];
  disabled?: boolean;
  onChange: (value: PropertyValue) => void;
};

/**
 * Section order for the generated inspector. Hints declare a group, but the
 * registry is spread across per-type modules, so ordering must be global or the
 * same panel would reorder itself when a definition moves.
 */
const GROUP_ORDER = [
  'Content',
  'Dimensions',
  'Layout',
  'Typography',
  'Transform',
  'Appearance',
  'Material',
  'Shading',
  'Shadow',
  'Light',
  'Attenuation',
  'Lens',
  'Playback',
  'Surface',
  'Properties',
];

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

function MotionNumberInput({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: MotionPropertyHint;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <ScrubNumberField
        id={id}
        label={label}
        value={value}
        min={hint.min}
        max={hint.max}
        step={hint.step}
        disabled={disabled}
        onChange={onChange}
      />
    </Field>
  );
}

function MotionSliderInput({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: MotionPropertyHint;
  value: number;
  disabled?: boolean;
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
          disabled={disabled}
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
          disabled={disabled}
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

function MotionTextInput({
  id,
  label,
  value,
  disabled,
  multiline,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  multiline?: boolean;
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
      {multiline ? (
        <Textarea
          id={id}
          value={draft}
          disabled={disabled}
          rows={4}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            // Enter inserts a newline; Cmd/Ctrl+Enter commits without leaving.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commit();
          }}
          className="min-h-16 resize-y font-mono text-[11px] leading-relaxed"
        />
      ) : (
        <Input
          id={id}
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-7 text-xs"
        />
      )}
    </Field>
  );
}

function MotionPropertyField({
  id,
  label,
  hint,
  value,
  assets,
  disabled,
  onChange,
}: MotionPropertyFieldProps) {
  if (hint.control === 'text' || hint.control === 'textarea') {
    return (
      <MotionTextInput
        id={id}
        label={label}
        value={String(value ?? '')}
        disabled={disabled}
        multiline={hint.control === 'textarea'}
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
          disabled={disabled}
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
        disabled={disabled}
        onChange={change}
      />
    );
  }

  if (hint.control === 'color') {
    return (
      <ColorField
        id={id}
        label={label}
        value={typeof value === 'string' ? value : '#ffffff'}
        disabled={disabled}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (hint.control === 'vector3') {
    const vector =
      Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
        ? (value as MotionVector3)
        : ([0, 0, 0] as MotionVector3);
    return (
      <VectorField
        id={id}
        label={label}
        value={vector}
        disabled={disabled}
        onChange={(next) =>
          onChange([
            next[0] ?? 0,
            next[1] ?? 0,
            next[2] ?? 0,
          ] as MotionVector3)
        }
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
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </Field>
    );
  }

  if (hint.control === 'segmented') {
    return (
      <SegmentedSelect
        id={id}
        label={label}
        value={typeof value === 'string' ? value : ''}
        options={hint.options ?? []}
        disabled={disabled}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (hint.control === 'select') {
    const options = hint.options ?? [];
    const currentValue = typeof value === 'string' ? value : '';
    // A stored enum that is no longer in `options` must still be visible; a bare
    // placeholder would hide the document's real value from the user.
    const hasUnlistedValue =
      currentValue !== '' &&
      !options.some((option) => option.value === currentValue);

    return (
      <Field className="gap-1">
        <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
          {label}
        </FieldLabel>
        <Select
          value={currentValue}
          disabled={disabled}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} size="sm" className="h-7 w-full text-xs">
            <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {hasUnlistedValue && (
                <SelectItem value={currentValue} disabled>
                  Current value unavailable ({currentValue})
                </SelectItem>
              )}
              {options.map((option) => (
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
    return (
      <AssetPicker
        id={id}
        label={label}
        value={typeof value === 'string' ? value : undefined}
        assets={assets}
        kind={hint.assetKind}
        optional={hint.optional}
        disabled={disabled}
        onChange={(next) => onChange(next)}
      />
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
  disabled = false,
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
    return [...grouped.entries()].sort(([a], [b]) => groupRank(a) - groupRank(b));
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
                  disabled={disabled}
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
