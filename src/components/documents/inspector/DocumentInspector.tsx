/**
 * components/documents/inspector/DocumentInspector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Docked visual Style & Property Inspector panel for the Document Studio.
 *
 * Provides:
 *   - Identity & state controls (Name, Lock, Visibility, Delete)
 *   - Context-aware property sections for all micro-primitives:
 *     • Yoga Flexbox Layout (direction, wrap, gap, padding, 9-point alignment)
 *     • Element Sizing (auto/hug, fill, fixed pt, min/max)
 *     • Typography & Font Styling (family, weight, size, line-height, alignment, color)
 *     • Border & Corner Radius (uniform or 4-point breakdown)
 *     • Appearance (fill, opacity, blend modes)
 *     • Specialized fields for Icon, Image, Spacer, and Divider
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  XIcon,
  LockIcon,
  UnlockIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  LayersIcon,
  SlidersIcon,
  TypeIcon,
  LayoutGridIcon,
  SquareIcon,
  PaletteIcon,
  SmileIcon,
  ImageIcon,
  MinusIcon,
  Maximize2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LayoutPanel } from './LayoutPanel';
import { ElementSizePanel } from './ElementSizePanel';
import { TypographyPanel } from './TypographyPanel';
import { BorderRadiusPanel } from './BorderRadiusPanel';
import { AppearancePanel } from './AppearancePanel';
import { TokenDualInput, type TokenItem } from './TokenDualInput';
import type {
  DocNode,
  BoxNode,
  RowNode,
  ColumnNode,
  TextNode,
  IconNode,
  ImageNode,
  SpacerNode,
  DividerNode,
  YogaFlexProps,
  NodeSizing,
  NodeAppearance,
  NodeBorder,
  NodeCornerRadius,
  StyleValue,
} from '@/lib/pdf-studio/primitives-ast';
import { isContainerNode } from '@/lib/pdf-studio/primitives-ast';
import type { DocumentTheme } from '@/lib/pdf-studio/types';

export function buildDocumentTokens(theme?: DocumentTheme): TokenItem[] {
  return [
    { name: 'color-primary', label: 'Primary', value: theme?.primaryColor || '#0284c7' },
    { name: 'color-secondary', label: 'Secondary', value: theme?.secondaryColor || '#475569' },
    { name: 'color-accent', label: 'Accent', value: theme?.accentColor || '#f97316' },
    { name: 'color-background', label: 'Background', value: theme?.backgroundColor || '#ffffff' },
    { name: 'color-surface', label: 'Surface', value: theme?.surfaceColor || '#f8fafc' },
    { name: 'color-text', label: 'Text', value: theme?.textColor || '#0f172a' },
    { name: 'color-muted', label: 'Muted', value: theme?.mutedColor || '#64748b' },
    { name: 'color-border', label: 'Border', value: theme?.borderColor || '#e2e8f0' },
  ];
}

interface DocumentInspectorProps {
  selectedNode: DocNode | null;
  theme?: DocumentTheme;
  onUpdateNode: (nodeId: string, patch: Partial<DocNode>) => void;
  onDeleteNode?: (nodeId: string) => void;
  onClose?: () => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function InspectorSection({ title, icon, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-foreground/90 hover:bg-muted/40 transition-colors cursor-pointer select-none"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </span>
        {open ? (
          <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="p-3 pt-1">{children}</div>}
    </div>
  );
}

export function DocumentInspector({
  selectedNode,
  theme,
  onUpdateNode,
  onDeleteNode,
  onClose,
}: DocumentInspectorProps) {
  const tokens = buildDocumentTokens(theme);

  if (!selectedNode) {
    return (
      <div className="flex h-full w-72 flex-col items-center justify-center p-6 text-center text-muted-foreground bg-card/40 border-l border-border/70 select-none">
        <div className="mb-3 rounded-full border border-border/60 bg-muted/40 p-3">
          <SlidersIcon className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <p className="text-xs font-medium text-foreground">No Element Selected</p>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          Select an element on the canvas or from the Layers tree to inspect and edit its layout and styles.
        </p>
      </div>
    );
  }

  const handleUpdate = (patch: Partial<DocNode>) => {
    onUpdateNode(selectedNode.id, patch);
  };

  const isContainer = isContainerNode(selectedNode);

  return (
    <div className="flex h-full w-80 flex-col border-l border-border/70 bg-card/60 backdrop-blur-xs text-card-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5 bg-muted/20">
        <div className="flex items-center gap-2 truncate">
          <Badge
            variant="outline"
            className="h-5 uppercase tracking-wider text-[10px] font-mono px-1.5 bg-background font-semibold"
          >
            {selectedNode.type}
          </Badge>
          <span className="text-xs font-medium truncate text-foreground">
            {selectedNode.name || `${selectedNode.type}_${selectedNode.id.slice(0, 4)}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Lock / Unlock */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => handleUpdate({ locked: !selectedNode.locked })}
            title={selectedNode.locked ? 'Unlock element' : 'Lock element'}
          >
            {selectedNode.locked ? (
              <LockIcon className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <UnlockIcon className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Visibility */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => handleUpdate({ hidden: !selectedNode.hidden })}
            title={selectedNode.hidden ? 'Show element' : 'Hide element'}
          >
            {selectedNode.hidden ? (
              <EyeOffIcon className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <EyeIcon className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Delete */}
          {onDeleteNode && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
              onClick={() => onDeleteNode(selectedNode.id)}
              title="Delete element"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Close Panel */}
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onClose}
              title="Close inspector"
            >
              <XIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto">
        {/* Identity & Label */}
        <div className="p-3 border-b border-border/50 flex flex-col gap-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">Element Name / Label</Label>
          <Input
            value={selectedNode.name || ''}
            placeholder={`e.g. ${selectedNode.type}_section`}
            onChange={(e) => handleUpdate({ name: e.target.value })}
            className="h-7 text-xs font-mono"
          />
        </div>

        {/* Layout Panel (For Box, Row, Column) */}
        {isContainer && (
          <InspectorSection
            title="Yoga Layout"
            icon={<LayoutGridIcon className="h-3.5 w-3.5" />}
          >
            <LayoutPanel
              layout={(selectedNode as BoxNode | RowNode | ColumnNode).layout}
              onChange={(newLayout: YogaFlexProps) => handleUpdate({ layout: newLayout })}
            />
          </InspectorSection>
        )}

        {/* Element Sizing (Containers, Text, Image) */}
        {selectedNode.type !== 'page-break' && selectedNode.type !== 'divider' && selectedNode.type !== 'spacer' && (
          <InspectorSection
            title="Element Sizing"
            icon={<Maximize2Icon className="h-3.5 w-3.5" />}
          >
            <ElementSizePanel
              sizing={
                isContainer
                  ? (selectedNode as BoxNode).layout?.sizing
                  : (selectedNode as ImageNode).sizing
              }
              onChange={(newSizing: NodeSizing) => {
                if (isContainer) {
                  const currentLayout = (selectedNode as BoxNode).layout || {};
                  handleUpdate({
                    layout: {
                      ...currentLayout,
                      sizing: newSizing,
                    },
                  });
                } else if (selectedNode.type === 'image') {
                  handleUpdate({ sizing: newSizing });
                }
              }}
            />
          </InspectorSection>
        )}

        {/* Typography (For Text nodes) */}
        {selectedNode.type === 'text' && (
          <InspectorSection
            title="Typography"
            icon={<TypeIcon className="h-3.5 w-3.5" />}
          >
            <TypographyPanel
              node={selectedNode as TextNode}
              tokens={tokens}
              onChange={(patch: Partial<TextNode>) => handleUpdate(patch)}
            />
          </InspectorSection>
        )}

        {/* Borders & Radius (Containers, Images) */}
        {(isContainer || selectedNode.type === 'image') && (
          <InspectorSection
            title="Border & Radius"
            icon={<SquareIcon className="h-3.5 w-3.5" />}
          >
            <BorderRadiusPanel
              border={(selectedNode as BoxNode).appearance?.border}
              radius={
                isContainer
                  ? (selectedNode as BoxNode).appearance?.radius
                  : (selectedNode as ImageNode).radius
              }
              tokens={tokens}
              onChangeBorder={(border: NodeBorder) => {
                const currentApp = (selectedNode as BoxNode).appearance || {};
                handleUpdate({
                  appearance: {
                    ...currentApp,
                    border,
                  },
                });
              }}
              onChangeRadius={(radius: NodeCornerRadius) => {
                if (isContainer) {
                  const currentApp = (selectedNode as BoxNode).appearance || {};
                  handleUpdate({
                    appearance: {
                      ...currentApp,
                      radius,
                    },
                  });
                } else if (selectedNode.type === 'image') {
                  handleUpdate({ radius });
                }
              }}
            />
          </InspectorSection>
        )}

        {/* Appearance (Containers) */}
        {isContainer && (
          <InspectorSection
            title="Appearance"
            icon={<PaletteIcon className="h-3.5 w-3.5" />}
          >
            <AppearancePanel
              appearance={(selectedNode as BoxNode).appearance}
              tokens={tokens}
              onChange={(newApp: NodeAppearance) => handleUpdate({ appearance: newApp })}
            />
          </InspectorSection>
        )}

        {/* Icon Primitive Controls */}
        {selectedNode.type === 'icon' && (
          <InspectorSection
            title="Icon Properties"
            icon={<SmileIcon className="h-3.5 w-3.5" />}
          >
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Icon Name</Label>
                <Input
                  value={(selectedNode as IconNode).iconName}
                  placeholder="e.g. check, star, info, alert-circle"
                  onChange={(e) => handleUpdate({ iconName: e.target.value })}
                  className="h-7 text-xs font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">Size</Label>
                <div className="flex w-24 items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 bg-background">
                  <Input
                    type="number"
                    min={8}
                    max={120}
                    value={(selectedNode as IconNode).size ?? 16}
                    onChange={(e) => handleUpdate({ size: Math.max(8, Number(e.target.value)) })}
                    className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground">pt</span>
                </div>
              </div>
              <TokenDualInput
                label="Icon Color"
                value={(selectedNode as IconNode).color}
                tokens={tokens}
                type="color"
                onChange={(val: StyleValue<string>) => handleUpdate({ color: val })}
              />
            </div>
          </InspectorSection>
        )}

        {/* Image Primitive Controls */}
        {selectedNode.type === 'image' && (
          <InspectorSection
            title="Image Properties"
            icon={<ImageIcon className="h-3.5 w-3.5" />}
          >
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Image Source (URL or Path)</Label>
                <Input
                  value={(selectedNode as ImageNode).src}
                  placeholder="https://... or file:///..."
                  onChange={(e) => handleUpdate({ src: e.target.value })}
                  className="h-7 text-xs font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">Fit Mode</Label>
                <Select
                  value={(selectedNode as ImageNode).fit || 'cover'}
                  onValueChange={(val: 'cover' | 'contain' | 'fill') =>
                    handleUpdate({ fit: val })
                  }
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Cover</SelectItem>
                    <SelectItem value="contain">Contain</SelectItem>
                    <SelectItem value="fill">Fill</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </InspectorSection>
        )}

        {/* Spacer Controls */}
        {selectedNode.type === 'spacer' && (
          <InspectorSection
            title="Spacer Properties"
            icon={<MinusIcon className="h-3.5 w-3.5" />}
          >
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">Fixed Size</Label>
                <div className="flex w-24 items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 bg-background">
                  <Input
                    type="number"
                    min={0}
                    value={(selectedNode as SpacerNode).size ?? 16}
                    onChange={(e) => handleUpdate({ size: Math.max(0, Number(e.target.value)) })}
                    className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground">pt</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">Flex Grow</Label>
                <div className="flex w-24 items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 bg-background">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={(selectedNode as SpacerNode).flex ?? 0}
                    onChange={(e) => handleUpdate({ flex: Math.max(0, Number(e.target.value)) })}
                    className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
                  />
                </div>
              </div>
            </div>
          </InspectorSection>
        )}

        {/* Divider Controls */}
        {selectedNode.type === 'divider' && (
          <InspectorSection
            title="Divider Properties"
            icon={<MinusIcon className="h-3.5 w-3.5" />}
          >
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">Orientation</Label>
                <Select
                  value={(selectedNode as DividerNode).orientation || 'horizontal'}
                  onValueChange={(val: 'horizontal' | 'vertical') =>
                    handleUpdate({ orientation: val })
                  }
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="vertical">Vertical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-muted-foreground">Thickness</Label>
                <div className="flex w-24 items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 bg-background">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={(selectedNode as DividerNode).thickness ?? 1}
                    onChange={(e) => handleUpdate({ thickness: Math.max(1, Number(e.target.value)) })}
                    className="h-5 border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground">pt</span>
                </div>
              </div>
              <TokenDualInput
                label="Line Color"
                value={(selectedNode as DividerNode).color}
                tokens={tokens}
                type="color"
                onChange={(val: StyleValue<string>) => handleUpdate({ color: val })}
              />
            </div>
          </InspectorSection>
        )}

        {/* Page Break Info */}
        {selectedNode.type === 'page-break' && (
          <div className="p-3 text-xs text-muted-foreground leading-relaxed">
            <Badge variant="secondary" className="mb-2">Forced Page Break</Badge>
            <p>
              This node breaks the document layout flow, pushing all subsequent sibling nodes onto the next physical page in the PDF compiler.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
