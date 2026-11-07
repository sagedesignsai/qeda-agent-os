/**
 * components/trace/dialogs/RecipeSetupDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "a few honest questions" step between picking a recipe and inserting it.
 *
 * Recipes previously dropped in at their defaults, so every lower third said
 * "Speaker Name" until the user hunted through four child layers. This dialog
 * asks only for options the compiler actually reads, pre-filled with those same
 * defaults, so confirming without editing reproduces the old insert exactly.
 */

import { useEffect, useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorField } from '@/components/trace/inspector/fields';
import {
  RECIPE_BAR_COLORS,
  RECIPE_SETUPS,
  recipeDefaults,
  sanitizeRecipeOptions,
  type RecipeBar,
  type RecipeFieldSpec,
} from '@/lib/trace/recipes';
import type { RecipeId } from '@/lib/trace/recipes';

export type RecipeSetupDialogProps = {
  open: boolean;
  recipeId: RecipeId | null;
  onOpenChange: (open: boolean) => void;
  onInsert: (recipeId: RecipeId, options: Record<string, unknown>) => void;
};

const MAX_BARS = 8;

export function RecipeSetupDialog({
  open,
  recipeId,
  onOpenChange,
  onInsert,
}: RecipeSetupDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  // Reload the form whenever a different recipe is picked, so reopening never
  // shows the previous recipe's answers.
  useEffect(() => {
    if (open && recipeId) setValues(recipeDefaults(recipeId));
  }, [open, recipeId]);

  if (!recipeId) return null;
  const setup = RECIPE_SETUPS[recipeId];

  const setValue = (key: string, value: unknown) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = () => {
    onInsert(recipeId, sanitizeRecipeOptions(recipeId, values));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">{setup.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {setup.summary}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2"
        >
          {setup.fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(value) => setValue(field.key, value)}
            />
          ))}

          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/60">
            Inserts at the centre of the canvas as an ordinary group — every
            layer, track and colour stays editable.
          </p>

          <DialogFooter className="mt-1 gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 bg-sky-500 text-[11px] text-slate-950 hover:bg-sky-400"
            >
              <PlusIcon className="size-3.5" />
              Add to canvas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Fields ───────────────────────────────────────────────────────────────── */

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: RecipeFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === 'bars') {
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel>{field.label}</FieldLabel>
        <BarsEditor
          bars={Array.isArray(value) ? (value as RecipeBar[]) : []}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
      <FieldLabel>{field.label}</FieldLabel>

      {field.kind === 'text' ? (
        <Input
          value={String(value ?? '')}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-label={field.label}
          spellCheck={false}
          className="h-7 bg-muted/20 text-[11px]"
        />
      ) : null}

      {field.kind === 'number' ? (
        <div className="relative">
          <Input
            type="number"
            value={String(value ?? '')}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onChange={(event) => onChange(event.target.value)}
            aria-label={field.label}
            className="h-7 bg-muted/20 pr-9 font-mono text-[11px]"
          />
          {field.suffix ? (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-foreground/60">
              {field.suffix}
            </span>
          ) : null}
        </div>
      ) : null}

      {field.kind === 'color' ? (
        <ColorField
          label={field.label}
          value={String(value ?? '#38bdf8')}
          onChange={onChange}
        />
      ) : null}

      {field.kind === 'select' ? (
        <Select
          value={String(value ?? '')}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger
            aria-label={field.label}
            className="h-7 bg-muted/20 text-[11px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function BarsEditor({
  bars,
  onChange,
}: {
  bars: RecipeBar[];
  onChange: (value: unknown) => void;
}) {
  const update = (index: number, patch: Partial<RecipeBar>) => {
    onChange(
      bars.map((bar, position) =>
        position === index ? { ...bar, ...patch } : bar,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {bars.map((bar, index) => (
        <div key={index} className="flex items-center gap-1">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-[2px] ring-1 ring-black/30 ring-inset"
            style={{
              background:
                bar.color ??
                RECIPE_BAR_COLORS[index % RECIPE_BAR_COLORS.length],
            }}
          />
          <Input
            value={bar.label}
            maxLength={12}
            aria-label={`Bar ${index + 1} label`}
            onChange={(event) => update(index, { label: event.target.value })}
            className="h-7 min-w-0 flex-1 bg-muted/20 text-[11px]"
          />
          <Input
            type="number"
            min={0}
            max={1000}
            value={String(bar.value)}
            aria-label={`Bar ${index + 1} value`}
            onChange={(event) =>
              update(index, { value: Number(event.target.value) })
            }
            className="h-7 w-16 shrink-0 bg-muted/20 font-mono text-[11px]"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remove bar ${index + 1}`}
            disabled={bars.length <= 1}
            onClick={() =>
              onChange(bars.filter((_, position) => position !== index))
            }
            className="size-7 shrink-0 text-muted-foreground/50 hover:bg-accent/30 hover:text-rose-300 disabled:opacity-30"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={bars.length >= MAX_BARS}
        onClick={() =>
          onChange([
            ...bars,
            {
              label: `Item ${bars.length + 1}`,
              value: 50,
              color: RECIPE_BAR_COLORS[bars.length % RECIPE_BAR_COLORS.length],
            },
          ])
        }
        className="h-6 w-fit gap-1 px-1.5 text-[10px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
      >
        <PlusIcon className="size-3" />
        Add row
      </Button>
    </div>
  );
}
