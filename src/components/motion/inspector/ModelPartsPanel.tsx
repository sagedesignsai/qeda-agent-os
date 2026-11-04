/**
 * components/motion/inspector/ModelPartsPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspector section for model.gltf nodes. Shows parsed parts and materials from
 * asset metadata, with inline controls for surface bindings, material overrides,
 * and part overrides (visibility, opacity, transform).
 */

import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, EyeIcon, EyeOffIcon } from 'lucide-react';

import { AssetPicker } from '@/components/motion/inspector/controls/asset-picker';
import { ColorField } from '@/components/motion/inspector/controls/color-field';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { MotionAsset, MotionNode } from '@/lib/motion/types';
import type { GltfAssetMetadata, GltfPart, MaterialOverride, PartOverride, SurfaceBinding } from '@/lib/motion/types';

type ModelPartsPanelProps = {
  node: MotionNode;
  assets: readonly MotionAsset[];
  metadata: GltfAssetMetadata | undefined;
  onUpdateProperty: (property: string, value: unknown) => void;
};

export function ModelPartsPanel({
  node,
  assets,
  metadata,
  onUpdateProperty,
}: ModelPartsPanelProps) {
  const surfaceBindings = (node.props.surfaceBindings as Record<string, SurfaceBinding>) ?? {};
  const materialOverrides = (node.props.materialOverrides as Record<string, MaterialOverride>) ?? {};
  const partOverrides = (node.props.partOverrides as Record<string, PartOverride>) ?? {};

  const [partsOpen, setPartsOpen] = useState(true);
  const [materialsOpen, setMaterialsOpen] = useState(true);

  if (!metadata || metadata.parts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center">
        <p className="text-[11px] font-medium text-muted-foreground">
          No parts detected
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          The model may not have named meshes, or the structure hasn't been parsed yet.
        </p>
      </div>
    );
  }

  const updateSurfaceBinding = (partName: string, field: keyof SurfaceBinding, value: unknown) => {
    const next = { ...surfaceBindings, [partName]: { ...surfaceBindings[partName], [field]: value } };
    onUpdateProperty('surfaceBindings', next);
  };

  const removeSurfaceBinding = (partName: string) => {
    const next = { ...surfaceBindings };
    delete next[partName];
    onUpdateProperty('surfaceBindings', next);
  };

  const updateMaterialOverride = (matName: string, field: keyof MaterialOverride, value: unknown) => {
    const next = { ...materialOverrides, [matName]: { ...materialOverrides[matName], [field]: value } };
    onUpdateProperty('materialOverrides', next);
  };

  const updatePartOverride = (partName: string, field: keyof PartOverride, value: unknown) => {
    const next = { ...partOverrides, [partName]: { ...partOverrides[partName], [field]: value } };
    onUpdateProperty('partOverrides', next);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Parts Section */}
      <Collapsible open={partsOpen} onOpenChange={setPartsOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground">
          {partsOpen ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
          <span>Parts ({metadata.parts.length})</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 flex flex-col gap-2">
            {metadata.parts.map((part) => (
              <PartRow
                key={part.name}
                part={part}
                binding={surfaceBindings[part.name]}
                override={partOverrides[part.name]}
                assets={assets}
                onUpdateBinding={updateSurfaceBinding}
                onRemoveBinding={() => removeSurfaceBinding(part.name)}
                onUpdateOverride={updatePartOverride}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Materials Section */}
      {metadata.materials.length > 0 && (
        <Collapsible open={materialsOpen} onOpenChange={setMaterialsOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground">
            {materialsOpen ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
            <span>Materials ({metadata.materials.length})</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 flex flex-col gap-2">
              {metadata.materials.map((mat) => (
                <MaterialRow
                  key={mat.name}
                  material={mat}
                  override={materialOverrides[mat.name]}
                  onUpdateOverride={updateMaterialOverride}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ── Part Row ─────────────────────────────────────────────────────────────────

function PartRow({
  part,
  binding,
  override,
  assets,
  onUpdateBinding,
  onRemoveBinding,
  onUpdateOverride,
}: {
  part: GltfPart;
  binding?: SurfaceBinding;
  override?: PartOverride;
  assets: readonly MotionAsset[];
  onUpdateBinding: (partName: string, field: keyof SurfaceBinding, value: unknown) => void;
  onRemoveBinding: () => void;
  onUpdateOverride: (partName: string, field: keyof PartOverride, value: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const imageAssets = assets.filter((a) => a.kind === 'image' || a.kind === 'video');

  return (
    <div className="rounded-md border border-border/50 bg-card/50">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={part.name}>
          {part.name}
        </span>
        {part.materialName && (
          <span className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
            {part.materialName}
          </span>
        )}
        <button
          onClick={() => onUpdateOverride(part.name, 'visible', override?.visible === false ? undefined : false)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={override?.visible === false ? 'Show part' : 'Hide part'}
        >
          {override?.visible === false ? (
            <EyeOffIcon className="size-3 text-muted-foreground/50" />
          ) : (
            <EyeIcon className="size-3" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/30 px-3 py-2">
          <FieldGroup className="gap-2">
            {/* Opacity */}
            <Field className="gap-1">
              <FieldLabel className="text-[10px] text-muted-foreground">Opacity</FieldLabel>
              <div className="flex items-center gap-2">
                <Slider
                  value={[override?.opacity ?? 1]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueCommit={([v]) => onUpdateOverride(part.name, 'opacity', v)}
                  className="min-w-0 flex-1"
                />
                <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                  {Math.round((override?.opacity ?? 1) * 100)}%
                </span>
              </div>
            </Field>

            {/* Surface Binding */}
            <div className="flex flex-col gap-1">
              <FieldLabel className="text-[10px] text-muted-foreground">Surface Binding</FieldLabel>
              {!binding ? (
                <AssetPicker
                  id={`binding-${part.name}`}
                  label="Bind surface"
                  value={undefined}
                  assets={imageAssets}
                  kind="image"
                  optional
                  onChange={(assetId) => {
                    if (assetId) {
                      onUpdateBinding(part.name, 'assetId', assetId);
                      onUpdateBinding(part.name, 'mode', 'replace');
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <AssetPicker
                      id={`binding-${part.name}`}
                      label="Surface asset"
                      value={binding.assetId}
                      assets={imageAssets}
                      kind="image"
                      optional
                      onChange={(assetId) => onUpdateBinding(part.name, 'assetId', assetId ?? '')}
                    />
                    <button
                      onClick={onRemoveBinding}
                      className="rounded px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                      title="Remove binding"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <input
                        type="radio"
                        name={`mode-${part.name}`}
                        checked={binding.mode === 'replace'}
                        onChange={() => onUpdateBinding(part.name, 'mode', 'replace')}
                      />
                      Replace
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <input
                        type="radio"
                        name={`mode-${part.name}`}
                        checked={binding.mode === 'decal'}
                        onChange={() => onUpdateBinding(part.name, 'mode', 'decal')}
                      />
                      Decal
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Position */}
            <VectorInput
              label="Position"
              value={override?.position ?? [0, 0, 0]}
              onChange={(v) => onUpdateOverride(part.name, 'position', v)}
            />

            {/* Rotation (degrees) */}
            <VectorInput
              label="Rotation (°)"
              value={
                override?.rotation
                  ? override.rotation.map((r) => (r * 180) / Math.PI)
                  : [0, 0, 0]
              }
              onChange={(v) => {
                const radians = v.map((d) => (d * Math.PI) / 180) as [number, number, number];
                onUpdateOverride(part.name, 'rotation', radians);
              }}
            />

            {/* Scale */}
            <VectorInput
              label="Scale"
              value={
                typeof override?.scale === 'number'
                  ? [override.scale, override.scale, override.scale]
                  : override?.scale ?? [1, 1, 1]
              }
              onChange={(v) => onUpdateOverride(part.name, 'scale', v)}
            />
          </FieldGroup>
        </div>
      )}
    </div>
  );
}

// ── Material Row ─────────────────────────────────────────────────────────────

function MaterialRow({
  material,
  override,
  onUpdateOverride,
}: {
  material: { name: string; type: string };
  override?: MaterialOverride;
  onUpdateOverride: (matName: string, field: keyof MaterialOverride, value: unknown) => void;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-card/50 px-3 py-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={material.name}>
          {material.name}
        </span>
        <span className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
          {material.type}
        </span>
      </div>
      <FieldGroup className="gap-2">
        <ColorField
          id={`mat-color-${material.name}`}
          label="Color"
          value={override?.color ?? '#ffffff'}
          onChange={(v) => onUpdateOverride(material.name, 'color', v)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field className="gap-1">
            <FieldLabel className="text-[10px] text-muted-foreground">Roughness</FieldLabel>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={override?.roughness ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onUpdateOverride(material.name, 'roughness', Math.min(1, Math.max(0, v)));
              }}
              className="h-7 text-xs"
              placeholder="—"
            />
          </Field>
          <Field className="gap-1">
            <FieldLabel className="text-[10px] text-muted-foreground">Metalness</FieldLabel>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={override?.metalness ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onUpdateOverride(material.name, 'metalness', Math.min(1, Math.max(0, v)));
              }}
              className="h-7 text-xs"
              placeholder="—"
            />
          </Field>
        </div>
      </FieldGroup>
    </div>
  );
}

// ── Vector Input ─────────────────────────────────────────────────────────────

function VectorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  onChange: (value: [number, number, number]) => void;
}) {
  const axes = ['X', 'Y', 'Z'];
  return (
    <Field className="gap-1">
      <FieldLabel className="text-[10px] text-muted-foreground">{label}</FieldLabel>
      <div className="flex gap-1">
        {axes.map((axis, i) => (
          <div key={axis} className="flex items-center gap-0.5">
            <span className="w-3 text-[9px] font-medium text-muted-foreground">{axis}</span>
            <Input
              type="number"
              step="0.1"
              value={value[i] || ''}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) {
                  const next = [...value] as [number, number, number];
                  next[i] = v;
                  onChange(next);
                }
              }}
              className="h-6 w-14 px-1 text-right text-[10px] tabular-nums"
            />
          </div>
        ))}
      </div>
    </Field>
  );
}
