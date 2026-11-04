/**
 * components/motion/inspector/controls/asset-picker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The file/model picker for Motion properties. A plain select cannot express
 * "which of these models/audio/images"; this browser filters by asset kind,
 * searches by name, and shows the kind and dimensions where known.
 *
 * It is deliberately read-only: importing is a project-level action that belongs
 * to the panel owning the IPC flow, not to a field renderer.
 */

import { useMemo, useState } from 'react';
import {
  BoxIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  ImageIcon,
  MusicIcon,
  SearchIcon,
  TypeIcon,
  VideoIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { MotionAsset, MotionAssetKind } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

type IconComponent = typeof ImageIcon;

const KIND_ICONS: Record<MotionAssetKind, IconComponent> = {
  image: ImageIcon,
  'image-sequence': ImageIcon,
  video: VideoIcon,
  audio: MusicIcon,
  font: TypeIcon,
  model: BoxIcon,
  environment: GlobeIcon,
};

const KIND_LABELS: Record<MotionAssetKind, string> = {
  image: 'Image',
  'image-sequence': 'Image sequence',
  video: 'Video',
  audio: 'Audio',
  font: 'Font',
  model: '3D model',
  environment: 'Environment',
};

export type AssetPickerProps = {
  id: string;
  label: string;
  value?: string;
  assets: readonly MotionAsset[];
  kind?: MotionAssetKind;
  optional?: boolean;
  disabled?: boolean;
  onChange: (value: string | undefined) => void;
};

export function AssetPicker({
  id,
  label,
  value,
  assets,
  kind,
  optional = false,
  disabled = false,
  onChange,
}: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const compatible = useMemo(
    () => assets.filter((asset) => !kind || asset.kind === kind),
    [assets, kind],
  );
  const selected = compatible.find(
    (asset) => asset.id === value || asset.id === `builtin:${value}`,
  );
  const Icon = selected
    ? KIND_ICONS[selected.kind]
    : kind
      ? KIND_ICONS[kind]
      : BoxIcon;

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return compatible;
    return compatible.filter((asset) => asset.name.toLowerCase().includes(text));
  }, [compatible, query]);

  const triggerLabel = selected?.name
    ?? (value ? 'Current asset unavailable' : compatible.length === 0 ? 'No compatible assets' : `Choose ${label.toLowerCase()}`);

  const select = (next: string | undefined) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            aria-label={label}
            title={triggerLabel}
            disabled={disabled}
            className="h-7 w-full justify-between gap-2 px-2 text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                {triggerLabel}
              </span>
            </span>
            <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label.toLowerCase()}`}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <div
            role="listbox"
            aria-label={`${label} assets`}
            className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
          >
            {optional && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => select(undefined)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent/60',
                  !value && 'bg-accent/40',
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded border border-dashed border-border/70 text-muted-foreground">
                  <UnsetIcon />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">No asset</span>
                {!value && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
              </button>
            )}

            {filtered.map((asset) => {
              const AssetIcon = KIND_ICONS[asset.kind];
              const active = asset.id === selected?.id;
              const dimensions =
                typeof asset.width === 'number' && typeof asset.height === 'number'
                  ? ` · ${asset.width}×${asset.height}`
                  : '';
              return (
                <button
                  key={asset.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => select(asset.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent/60',
                    active && 'bg-accent/40',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/50 text-muted-foreground">
                    <AssetIcon className="size-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[11px]">{asset.name}</span>
                    <span className="truncate text-[9px] text-muted-foreground">
                      {KIND_LABELS[asset.kind]}
                      {dimensions}
                    </span>
                  </span>
                  {active && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}

            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">
                No compatible assets
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function UnsetIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
      <path d="M4 8h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
