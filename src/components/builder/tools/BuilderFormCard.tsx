/**
 * components/builder/tools/BuilderFormCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders OpenCode v2's typed, keyed interactive forms. Values stay in the
 * renderer until the user submits or cancels; validation follows each field's
 * declared constraints and never submits hidden/invalid values speculatively.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowUpRightIcon,
  ClipboardListIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  getBuilderFormDefaults,
  isBuilderFormFieldVisible,
  type BuilderFormAnswer,
  type BuilderFormField,
  type BuilderFormOption,
  type BuilderFormRequest,
} from '@/lib/builder-interactions';

interface BuilderFormCardProps {
  form: BuilderFormRequest;
  onSubmit: (answer: BuilderFormAnswer) => void;
  onCancel: () => void;
  submitting?: boolean;
  disabled?: boolean;
}

export function BuilderFormCard({
  form,
  onSubmit,
  onCancel,
  submitting = false,
  disabled = false,
}: BuilderFormCardProps) {
  const [answer, setAnswer] = useState(() =>
    getBuilderFormDefaults(form.fields),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const blocked = disabled || submitting;

  const setValue = (key: string, value: BuilderFormAnswer[string]) => {
    setAnswer((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateBuilderForm(form.fields, answer);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const visibleAnswer = Object.fromEntries(
      form.fields
        .filter((field) => isBuilderFormFieldVisible(field, answer))
        .filter(
          (field) =>
            field.type !== 'external' && answer[field.key] !== undefined,
        )
        .map((field) => [field.key, answer[field.key]]),
    );
    onSubmit(visibleAnswer);
  };

  const visibleFields = form.fields.filter((field) =>
    isBuilderFormFieldVisible(field, answer),
  );

  return (
    <section
      className="w-full overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm shadow-primary/5"
      aria-label="OpenCode form"
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-primary/[0.035] px-4 py-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
          <ClipboardListIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">{form.title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            OpenCode needs a little more information to continue.
          </p>
        </div>
        <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Input needed
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        {visibleFields.map((field) => (
          <FormFieldView
            key={field.key}
            field={field}
            value={answer[field.key]}
            error={errors[field.key]}
            disabled={blocked}
            onChange={(value) => setValue(field.key, value)}
          />
        ))}

        {visibleFields.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No additional fields are visible for the current answers.
          </p>
        )}

        {Object.values(errors).some(Boolean) && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">
              Please check the highlighted fields before continuing.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            disabled={blocked}
            onClick={onCancel}
          >
            Cancel request
          </Button>
          <Button
            type="submit"
            size="sm"
            className="gap-1.5"
            disabled={blocked}
          >
            {submitting && (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            )}
            Continue
          </Button>
        </div>
      </form>
    </section>
  );
}

function FormFieldView({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: BuilderFormField;
  value: BuilderFormAnswer[string] | undefined;
  error?: string;
  disabled: boolean;
  onChange: (value: BuilderFormAnswer[string]) => void;
}) {
  const [customOptionSelected, setCustomOptionSelected] = useState(
    () =>
      field.type === 'string' &&
      Boolean(field.custom && field.options?.length) &&
      typeof value === 'string' &&
      !field.options?.some((option) => option.value === value),
  );
  const id = `builder-form-${field.key}`;
  const label = field.title || field.key;
  const inputProps = {
    id,
    disabled,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : undefined,
  } as const;

  let control: ReactNode = null;
  if (field.type === 'external') {
    const href = safeExternalHref(field.url);
    control = href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-4 hover:underline"
      >
        {field.title || field.url}
        <ArrowUpRightIcon className="size-3" />
      </a>
    ) : (
      <span className="text-xs text-muted-foreground">
        External link unavailable because its URL is invalid.
      </span>
    );
  } else if (field.type === 'boolean') {
    control = (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {value === true ? 'Enabled' : 'Disabled'}
        </span>
        <Switch
          id={id}
          aria-label={label}
          checked={value === true}
          disabled={disabled}
          onCheckedChange={onChange}
          aria-invalid={Boolean(error)}
        />
      </div>
    );
  } else if (field.type === 'number' || field.type === 'integer') {
    control = (
      <Input
        {...inputProps}
        type="number"
        step={field.type === 'integer' ? 1 : 'any'}
        min={finiteLimit(field.minimum)}
        max={finiteLimit(field.maximum)}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? '' : Number(raw));
        }}
        placeholder="Enter a number"
      />
    );
  } else if (field.type === 'multiselect') {
    control = (
      <OptionChecklist
        fieldKey={field.key}
        options={field.options}
        selected={Array.isArray(value) ? value : []}
        label={label}
        custom={field.custom ?? false}
        disabled={disabled}
        onChange={onChange}
      />
    );
  } else if (field.type === 'string' && field.options?.length) {
    control = (
      <div className="space-y-2">
        <RadioGroup
          value={
            customOptionSelected
              ? '__qeda_custom_option__'
              : typeof value === 'string'
                ? value
                : ''
          }
          onValueChange={(next) => {
            if (next === '__qeda_custom_option__') {
              setCustomOptionSelected(true);
              if (
                typeof value !== 'string' ||
                field.options?.some((option) => option.value === value)
              ) {
                onChange('');
              }
              return;
            }
            setCustomOptionSelected(false);
            onChange(next);
          }}
          disabled={disabled}
          aria-label={label}
          className="gap-1.5"
        >
          {field.options.map((option) => (
            <OptionRadio
              key={option.value}
              id={`${id}-${option.value}`}
              option={option}
            />
          ))}
          {field.custom && (
            <Label
              htmlFor={`${id}-custom`}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs transition-colors hover:bg-accent/40"
            >
              <RadioGroupItem
                id={`${id}-custom`}
                value="__qeda_custom_option__"
              />
              Something else
            </Label>
          )}
        </RadioGroup>
        {field.custom && customOptionSelected && (
          <Input
            id={`${id}-custom-value`}
            aria-label={`${label} custom value`}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            placeholder="Enter a custom value"
            className="text-xs"
          />
        )}
      </div>
    );
  } else if (field.type === 'string') {
    const text = typeof value === 'string' ? value : '';
    const useMultiline = (field.maxLength ?? 0) > 160;
    const common = {
      ...inputProps,
      required: false,
      minLength: field.minLength,
      maxLength: field.maxLength,
      pattern: field.pattern,
      placeholder: field.placeholder,
      value: text,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange(event.target.value),
    };
    control = useMultiline ? (
      <Textarea {...common} rows={3} className="resize-y text-xs" />
    ) : (
      <Input
        {...common}
        type={inputTypeForFormat(field.format)}
        className="text-xs"
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {field.type !== 'external' && (
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </Label>
      )}
      {control}
      {field.description && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {field.description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[10px] text-destructive">
          {error}
        </p>
      )}
      {field.type === 'multiselect' && field.required && (
        <span className="sr-only">Required</span>
      )}
    </div>
  );
}

function OptionRadio({
  id,
  option,
}: {
  id: string;
  option: BuilderFormOption;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-background/50 px-3 py-2 transition-colors hover:bg-accent/40 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/[0.04]"
    >
      <RadioGroupItem id={id} value={option.value} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{option.label}</span>
        {option.description && (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
            {option.description}
          </span>
        )}
      </span>
    </Label>
  );
}

function OptionChecklist({
  fieldKey,
  options,
  selected,
  label,
  custom,
  disabled,
  onChange,
}: {
  fieldKey: string;
  options: BuilderFormOption[];
  selected: string[];
  label: string;
  custom: boolean;
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      {options.map((option) => {
        const id = `builder-form-${fieldKey}-${option.value}`;
        const checked = selected.includes(option.value);
        return (
          <Label
            key={option.value}
            htmlFor={id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-background/50 px-3 py-2 transition-colors hover:bg-accent/40 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/[0.04]"
          >
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) => {
                const value = next
                  ? [...selected, option.value]
                  : selected.filter((item) => item !== option.value);
                onChange(value);
              }}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </Label>
        );
      })}
      {custom && (
        <Input
          aria-label={`${label} custom values`}
          value={selected
            .filter(
              (value) => !options.some((option) => option.value === value),
            )
            .join(', ')}
          onChange={(event) => {
            const customValues = event.target.value
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);
            const optionValues = selected.filter((value) =>
              options.some((option) => option.value === value),
            );
            onChange([...optionValues, ...customValues]);
          }}
          disabled={disabled}
          placeholder="Add other values, separated by commas"
          className="mt-2 text-xs"
        />
      )}
    </div>
  );
}

function validateBuilderForm(
  fields: BuilderFormField[],
  answer: BuilderFormAnswer,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (
      !isBuilderFormFieldVisible(field, answer) ||
      field.type === 'external'
    ) {
      continue;
    }

    const value = answer[field.key];
    const empty =
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    if (field.required && empty) {
      errors[field.key] = 'This field is required.';
      continue;
    }
    if (empty) continue;

    if (field.type === 'number' || field.type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors[field.key] = 'Enter a valid number.';
      } else if (field.type === 'integer' && !Number.isInteger(value)) {
        errors[field.key] = 'Enter a whole number.';
      } else if (field.minimum !== undefined && value < field.minimum) {
        errors[field.key] = `Must be at least ${field.minimum}.`;
      } else if (field.maximum !== undefined && value > field.maximum) {
        errors[field.key] = `Must be no more than ${field.maximum}.`;
      }
    } else if (field.type === 'string' && typeof value === 'string') {
      if (field.minLength !== undefined && value.length < field.minLength) {
        errors[field.key] = `Use at least ${field.minLength} characters.`;
      } else if (
        field.maxLength !== undefined &&
        value.length > field.maxLength
      ) {
        errors[field.key] = `Use no more than ${field.maxLength} characters.`;
      } else if (field.pattern) {
        try {
          if (!new RegExp(field.pattern).test(value)) {
            errors[field.key] =
              'This value does not match the required format.';
          }
        } catch {
          errors[field.key] = 'This field has an invalid format rule.';
        }
      }
    } else if (field.type === 'multiselect' && Array.isArray(value)) {
      if (field.minItems !== undefined && value.length < field.minItems) {
        errors[field.key] = `Choose at least ${field.minItems} options.`;
      } else if (
        field.maxItems !== undefined &&
        value.length > field.maxItems
      ) {
        errors[field.key] = `Choose no more than ${field.maxItems} options.`;
      }
    }
  }
  return errors;
}

function inputTypeForFormat(
  format: 'email' | 'uri' | 'date' | 'date-time' | undefined,
) {
  if (format === 'email') return 'email';
  if (format === 'uri') return 'url';
  if (format === 'date') return 'date';
  if (format === 'date-time') return 'datetime-local';
  return 'text';
}

function finiteLimit(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function safeExternalHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
