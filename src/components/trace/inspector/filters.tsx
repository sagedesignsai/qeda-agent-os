/**
 * components/trace/inspector/filters.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Effects" inspector section: creative field renders for SVG filters.
 *
 * Mirrors Figma's Effects panel: a list of applied effects with toggles and
 * inline key params, a `+` add button that opens a preset/project-filter
 * picker popover, and a `⋯` settings button per effect that opens a popover
 * with additional primitive controls (the "creative field renders").
 *
 * Elements reference a filter via `attributes.filter = "url(#id)"`. The filter
 * definition lives in `project.filters` (structured) or `project.defs` (raw).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  BlendIcon,
  DropletIcon,
  EllipsisIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
  Wand2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTraceStore } from '@/stores/trace-store';
import type { TraceElement, TraceProject } from '@/lib/trace/types';
import type {
  FilterParamValue,
  FilterPrimitive,
  FilterPreset,
  TraceFilter,
} from '@/lib/trace/filters/types';
import { FILTER_PRESETS } from '@/lib/trace/filters/presets';
import { filterToSvg } from '@/lib/trace/filters/serialize';
import { PanelSection } from './section';
import { ColorField, FieldRow } from './fields';
import { ScrubField } from './scrub-field';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function parseFilterId(filterAttr: string | undefined | null): string | null {
  if (!filterAttr) return null;
  const m = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(filterAttr);
  return m?.[1] ?? null;
}

function nextFilterId(base: string, filters: Record<string, TraceFilter> | undefined): string {
  let id = base;
  let n = 1;
  while (filters?.[id]) {
    n += 1;
    id = `${base}-${n}`;
  }
  return id;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setFilterOnElement(elementId: string, filterId: string | null) {
  const { updateAttributes } = useTraceStore.getState();
  updateAttributes(
    elementId,
    { filter: filterId ? `url(#${filterId})` : null },
  );
}

function upsertProjectFilter(
  project: TraceProject,
  filter: TraceFilter,
): Record<string, TraceFilter> {
  return { ...(project.filters ?? {}), [filter.id]: filter };
}

function commitFilters(filters: Record<string, TraceFilter>) {
  useTraceStore.getState().dispatch([{ type: 'setFilters', filters }]);
}

const KIND_META: Record<string, { icon: typeof SparklesIcon; label: string; color: string }> = {
  dropShadow: { icon: SquareIcon, label: 'Drop shadow', color: 'bg-slate-500' },
  glow: { icon: SparklesIcon, label: 'Glow', color: 'bg-sky-500' },
  blur: { icon: DropletIcon, label: 'Blur', color: 'bg-indigo-500' },
  color: { icon: BlendIcon, label: 'Color', color: 'bg-fuchsia-500' },
  distort: { icon: Wand2Icon, label: 'Distort', color: 'bg-amber-500' },
  edge: { icon: SquareIcon, label: 'Edge', color: 'bg-emerald-500' },
  composite: { icon: BlendIcon, label: 'Composite', color: 'bg-orange-500' },
  blend: { icon: BlendIcon, label: 'Blend', color: 'bg-violet-500' },
  light: { icon: SparklesIcon, label: 'Light', color: 'bg-yellow-400' },
  custom: { icon: SparklesIcon, label: 'Custom', color: 'bg-zinc-500' },
};

/* ── Primitive param editor (creative field renders) ───────────────────────── */

function ParamField({
  label,
  value,
  onChange,
  kind = 'text',
}: {
  label: string;
  value: FilterParamValue | undefined;
  onChange: (next: string | number) => void;
  kind?: 'text' | 'number' | 'color' | 'select';
}) {
  const isColorKey =
    kind === 'color' ||
    label.toLowerCase().includes('flood-color') ||
    label.toLowerCase().includes('fill-color') ||
    label.toLowerCase().includes('light-color');

  if (isColorKey) {
    return (
      <FieldRow label={label} wide>
        <ColorField
          label={label}
          value={String(value ?? '#000000')}
          onChange={(next) => onChange(next)}
        />
      </FieldRow>
    );
  }
  if (kind === 'number' || typeof value === 'number') {
    const num = Number(value ?? 0);
    const isOpacity = label.toLowerCase().includes('opacity');
    return (
      <FieldRow label={label}>
        <ScrubField
          label={label}
          value={Number.isFinite(num) ? num : 0}
          min={isOpacity ? 0 : undefined}
          max={isOpacity ? 1 : undefined}
          step={isOpacity ? 0.05 : 0.5}
          onChange={(next) => onChange(next)}
        />
      </FieldRow>
    );
  }
  return (
    <FieldRow label={label} wide>
      <Input
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        spellCheck={false}
        className="h-7 min-w-0 flex-1 bg-muted/20 font-mono text-[11px]"
      />
    </FieldRow>
  );
}

const PRIMITIVE_KIND_LABELS: Record<string, string> = {
  feGaussianBlur: 'Gaussian blur',
  feOffset: 'Offset',
  feFlood: 'Flood',
  feComposite: 'Composite',
  feMerge: 'Merge',
  feMergeNode: 'Merge node',
  feBlend: 'Blend',
  feColorMatrix: 'Color matrix',
  feComponentTransfer: 'Component transfer',
  feDisplacementMap: 'Displacement map',
  feTurbulence: 'Turbulence',
  feMorphology: 'Morphology',
  feConvolveMatrix: 'Convolve matrix',
  feDiffuseLighting: 'Diffuse lighting',
  feSpecularLighting: 'Specular lighting',
};

function PrimitiveCard({
  primitive,
  index,
  onUpdate,
  onRemove,
}: {
  primitive: FilterPrimitive;
  index: number;
  onUpdate: (next: FilterPrimitive) => void;
  onRemove: () => void;
}) {
  const params = primitive.params ?? {};
  const label = PRIMITIVE_KIND_LABELS[primitive.kind] ?? primitive.kind;
  const setParam = (key: string, val: string | number) => {
    onUpdate({ ...primitive, params: { ...params, [key]: val } });
  };
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-medium text-foreground">
            {label}
          </span>
          <span className="block font-mono text-[9px] text-muted-foreground">
            {primitive.id}{primitive.result && primitive.result !== primitive.id ? ` → ${primitive.result}` : ''}
          </span>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className="size-5 text-muted-foreground hover:text-rose-400"
        >
          <Trash2Icon className="size-3" />
        </Button>
      </div>
      <div className="space-y-1">
        {Object.entries(params).map(([key, val]) => (
          <ParamField
            key={key}
            label={key}
            value={val}
            onChange={(next) => setParam(key, next)}
          />
        ))}
        {Object.keys(params).length === 0 ? (
          <p className="text-[9px] text-muted-foreground">No editable params.</p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Filter config popover (additional controls) ───────────────────────────── */

function FilterConfigPopover({
  filter,
  onChange,
  onRemove,
}: {
  filter: TraceFilter;
  onChange: (next: TraceFilter) => void;
  onRemove: () => void;
}) {
  const updatePrimitive = (index: number, next: FilterPrimitive) => {
    const primitives = filter.primitives.map((p, i) => (i === index ? next : p));
    onChange({ ...filter, primitives });
  };
  const removePrimitive = (index: number) => {
    onChange({
      ...filter,
      primitives: filter.primitives.filter((_, i) => i !== index),
    });
  };
  return (
    <PopoverContent
      align="end"
      side="left"
      sideOffset={8}
      className="w-80 p-0"
    >
      <div className="border-b border-border/60 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold">{filter.label}</p>
          <span className="font-mono text-[9px] text-muted-foreground">{filter.id}</span>
        </div>
      </div>
      <ScrollArea className="max-h-[360px]">
        <div className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[10px] text-muted-foreground">Region %</p>
              <ScrubField
                label="Region"
                value={filter.region ?? 10}
                min={0}
                max={80}
                step={1}
                onChange={(next) => onChange({ ...filter, region: Math.round(next) })}
              />
            </div>
            <div>
              <p className="mb-1 text-[10px] text-muted-foreground">Color space</p>
              <Select
                value={filter.colorSpace ?? 'linearRGB'}
                onValueChange={(v) => onChange({ ...filter, colorSpace: v as TraceFilter['colorSpace'] })}
              >
                <SelectTrigger className="h-7 bg-muted/20 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linearRGB">linearRGB</SelectItem>
                  <SelectItem value="sRGB">sRGB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">Primitives</p>
            {filter.primitives.map((p, i) => (
              <PrimitiveCard
                key={`${p.id}-${i}`}
                primitive={p}
                index={i}
                onUpdate={(next) => updatePrimitive(i, next)}
                onRemove={() => removePrimitive(i)}
              />
            ))}
          </div>
        </div>
      </ScrollArea>
      <div className="border-t border-border/60 p-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 w-full px-2 text-[10px] text-rose-400 hover:text-rose-300"
          onClick={onRemove}
        >
          Remove effect
        </Button>
      </div>
    </PopoverContent>
  );
}

/* ── Filter picker popover (+ add) ─────────────────────────────────────────── */

function FilterPickerPopover({
  element,
  project,
}: {
  element: TraceElement;
  project: TraceProject;
}) {
  const [open, setOpen] = useState(false);
  const projectFilters = useMemo(
    () => Object.values(project.filters ?? {}),
    [project.filters],
  );

  const applyPreset = (preset: FilterPreset) => {
    const id = nextFilterId(preset.id.replace('preset-', ''), project.filters);
    const filter: TraceFilter = { id, ...deepClone(preset.filter) };
    commitFilters(upsertProjectFilter(project, filter));
    setFilterOnElement(element.id, id);
    setOpen(false);
  };

  const applyExisting = (id: string) => {
    setFilterOnElement(element.id, id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Add effect"
          title="Add effect"
          className="size-6 text-muted-foreground hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={6} className="w-72 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-[11px] font-semibold">Add effect</p>
        </div>
        <ScrollArea className="max-h-[320px]">
          <div className="p-2">
            {projectFilters.length > 0 ? (
              <div className="mb-2">
                <p className="mb-1 px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  Project filters
                </p>
                {projectFilters.map((f) => {
                  const meta = KIND_META[f.kind] ?? KIND_META.custom;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => applyExisting(f.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <span className={cn('size-2 rounded-full', meta.color)} />
                      <Icon className="size-3 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[11px]">{f.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div>
              <p className="mb-1 px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                Presets
              </p>
              {FILTER_PRESETS.map((preset) => {
                const meta = KIND_META[preset.kind] ?? KIND_META.custom;
                const Icon = meta.icon;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', meta.color)} />
                    <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-[11px] text-foreground">{preset.label}</span>
                      <span className="block text-[9px] leading-snug text-muted-foreground">{preset.summary}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/* ── Inline key-param renders (creative field renders) ─────────────────────── */

function inlineParams(filter: TraceFilter): Array<{ label: string; key: string; primitive: FilterPrimitive; paramKey: string; kind: 'color' | 'number' }> {
  const out: Array<{ label: string; key: string; primitive: FilterPrimitive; paramKey: string; kind: 'color' | 'number' }> = [];
  for (const p of filter.primitives) {
    if (p.kind === 'feGaussianBlur' && p.params?.stdDeviation !== undefined)
      out.push({ label: 'Blur', key: `${p.id}-blur`, primitive: p, paramKey: 'stdDeviation', kind: 'number' });
    if (p.kind === 'feOffset') {
      if (p.params?.dx !== undefined) out.push({ label: 'X', key: `${p.id}-dx`, primitive: p, paramKey: 'dx', kind: 'number' });
      if (p.params?.dy !== undefined) out.push({ label: 'Y', key: `${p.id}-dy`, primitive: p, paramKey: 'dy', kind: 'number' });
    }
    if (p.kind === 'feFlood' && p.params?.['flood-color'] !== undefined)
      out.push({ label: 'Color', key: `${p.id}-color`, primitive: p, paramKey: 'flood-color', kind: 'color' });
    if (p.kind === 'feFlood' && p.params?.['flood-opacity'] !== undefined)
      out.push({ label: 'Opacity', key: `${p.id}-opacity`, primitive: p, paramKey: 'flood-opacity', kind: 'number' });
    if (p.kind === 'feDisplacementMap' && p.params?.scale !== undefined)
      out.push({ label: 'Scale', key: `${p.id}-scale`, primitive: p, paramKey: 'scale', kind: 'number' });
    if (p.kind === 'feMorphology' && p.params?.radius !== undefined)
      out.push({ label: 'Radius', key: `${p.id}-radius`, primitive: p, paramKey: 'radius', kind: 'number' });
    if (p.kind === 'feColorMatrix' && p.params?.values !== undefined) {
      const type = p.params?.type as string;
      if (type === 'saturate') {
        out.push({ label: 'Saturation', key: `${p.id}-sat`, primitive: p, paramKey: 'values', kind: 'number' });
      } else if (type === 'hueRotate') {
        out.push({ label: 'Hue', key: `${p.id}-hue`, primitive: p, paramKey: 'values', kind: 'number' });
      }
    }
  }
  return out.slice(0, 6);
}

/* ── Effect row ────────────────────────────────────────────────────────────── */

function EffectRow({
  element,
  filter,
  project,
}: {
  element: TraceElement;
  filter: TraceFilter;
  project: TraceProject;
}) {
  const meta = KIND_META[filter.kind] ?? KIND_META.custom;
  const Icon = meta.icon;
  const inlines = inlineParams(filter);
  const [disabled, setDisabled] = useState(false);

  const updateFilter = useCallback(
    (next: TraceFilter) => {
      commitFilters(upsertProjectFilter(project, next));
    },
    [project, filter.id],
  );

  const removeFilter = useCallback(() => {
    // Only remove the reference from this element — do not delete the
    // filter definition from the project because other elements may share it.
    setFilterOnElement(element.id, null);
  }, [element.id]);

  const updateInline = useCallback(
    (primitive: FilterPrimitive, paramKey: string, val: string | number) => {
      const next: TraceFilter = {
        ...filter,
        primitives: filter.primitives.map((p) =>
          p.id === primitive.id
            ? { ...p, params: { ...(p.params ?? {}), [paramKey]: val } }
            : p,
        ),
      };
      updateFilter(next);
    },
    [filter, updateFilter],
  );

  return (
    <div
      className={cn(
        'rounded-md border border-border/60 bg-muted/10 transition-opacity',
        disabled && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className={cn('size-2 shrink-0 rounded-full', meta.color)} title={meta.label} />
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[11px] font-medium text-foreground',
            disabled && 'line-through',
          )}
          title={filter.label}
        >
          {filter.label}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={disabled ? 'Enable effect' : 'Disable effect'}
          title={disabled ? 'Enable effect' : 'Disable effect'}
          aria-pressed={disabled}
          onClick={() => setDisabled((d) => !d)}
          className={cn(
            'size-6',
            disabled
              ? 'text-muted-foreground/50 hover:text-muted-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {disabled ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Effect settings"
              title="Additional controls"
              className="size-6 text-muted-foreground hover:text-foreground"
            >
              <EllipsisIcon className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <FilterConfigPopover filter={filter} onChange={updateFilter} onRemove={removeFilter} />
        </Popover>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Remove effect"
          title="Remove effect"
          onClick={removeFilter}
          className="size-6 text-muted-foreground hover:text-rose-400"
        >
          <Trash2Icon className="size-3" />
        </Button>
      </div>
      {inlines.length > 0 ? (
        <div className="border-t border-border/40 px-2 pb-2 pt-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {inlines.map((entry) => {
              const val = entry.primitive.params?.[entry.paramKey];
              if (entry.kind === 'color') {
                return (
                  <div key={entry.key} className="col-span-2">
                    <ColorField
                      label={entry.label}
                      value={String(val ?? '#000000')}
                      onChange={(next) => updateInline(entry.primitive, entry.paramKey, next)}
                    />
                  </div>
                );
              }
              const numVal = Number(val ?? 0);
              const isOpacity = entry.paramKey.includes('opacity');
              return (
                <ScrubField
                  key={entry.key}
                  label={entry.label}
                  prefix={entry.label.charAt(0)}
                  value={Number.isFinite(numVal) ? numVal : 0}
                  min={isOpacity ? 0 : undefined}
                  max={isOpacity ? 1 : undefined}
                  step={isOpacity ? 0.05 : 0.5}
                  onChange={(next) => updateInline(entry.primitive, entry.paramKey, next)}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Effects section ───────────────────────────────────────────────────────── */

export function FiltersSection({ element }: { element: TraceElement }) {
  const project = useTraceStore((s) => s.project);
  if (!project) return null;

  const filterId = parseFilterId(element.attributes?.filter as string | undefined);
  const filter = filterId ? project.filters?.[filterId] : undefined;
  const isRawRef = Boolean(filterId && !filter);

  return (
    <PanelSection
      title="Effects"
      action={<FilterPickerPopover element={element} project={project} />}
    >
      {filter ? (
        <EffectRow element={element} filter={filter} project={project} />
      ) : isRawRef ? (
        <div className="rounded-md border border-border/60 bg-muted/10 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {filterId} (defs)
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove effect"
              onClick={() => setFilterOnElement(element.id, null)}
              className="size-6 text-muted-foreground hover:text-rose-400"
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            No effects applied. Click <span className="font-medium">+</span> to add a drop shadow, glow, blur, color adjustment, or distortion.
          </p>
        </div>
      )}
    </PanelSection>
  );
}
